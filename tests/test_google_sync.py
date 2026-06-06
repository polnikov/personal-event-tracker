from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from app.config import settings
from app.google_sync import (
    _backoff_seconds,
    _to_local_iso,
    enqueue_for_event,
    event_to_google_body,
    get_event_sync_statuses,
)
from app.models import Category, Client, Event, GoogleSyncOutbox, Subcategory


def _make_event(
    db,
    *,
    category_gcal=None,
    google_event_id=None,
    google_calendar_id=None,
    with_client=False,
    notes=None,
    cat_name="C",
):
    cat = Category(name=cat_name, color="#fff", google_calendar_id=category_gcal)
    db.add(cat)
    db.flush()
    sub = Subcategory(category_id=cat.id, name="S")
    db.add(sub)
    db.flush()
    client_id = None
    if with_client:
        cl = Client(first_name="Иван", last_name="Петров")
        db.add(cl)
        db.flush()
        client_id = cl.id
    ev = Event(
        subcategory_id=sub.id,
        client_id=client_id,
        start_at=datetime(2026, 6, 15, 10, 0),
        duration_minutes=60,
        hourly_rate_snapshot=Decimal("100"),
        total_cost=Decimal("100"),
        tax=Decimal("0"),
        royalty=Decimal("0"),
        notes=notes,
        google_event_id=google_event_id,
        google_calendar_id=google_calendar_id,
    )
    db.add(ev)
    db.flush()
    return ev


def _rows(db):
    return db.execute(select(GoogleSyncOutbox).order_by(GoogleSyncOutbox.id)).scalars().all()


# ───────────── enqueue_for_event branches ─────────────


def test_create_without_target_calendar_enqueues_nothing(db_session):
    ev = _make_event(db_session)  # category has no google_calendar_id
    enqueue_for_event(db_session, ev, op_hint="create")
    assert _rows(db_session) == []


def test_create_with_target_calendar_enqueues_create(db_session):
    ev = _make_event(db_session, category_gcal="cal-A")
    enqueue_for_event(db_session, ev, op_hint="create")
    rows = _rows(db_session)
    assert len(rows) == 1
    assert rows[0].op == "create"
    assert rows[0].calendar_id == "cal-A"
    assert rows[0].event_id == ev.id


def test_update_in_place_enqueues_update(db_session):
    ev = _make_event(
        db_session, category_gcal="cal-A", google_event_id="g1", google_calendar_id="cal-A"
    )
    enqueue_for_event(db_session, ev, op_hint="update")
    rows = _rows(db_session)
    assert len(rows) == 1
    assert rows[0].op == "update"
    assert rows[0].google_event_id == "g1"
    assert rows[0].calendar_id == "cal-A"


def test_delete_hint_enqueues_delete(db_session):
    ev = _make_event(
        db_session, category_gcal="cal-A", google_event_id="g1", google_calendar_id="cal-A"
    )
    enqueue_for_event(db_session, ev, op_hint="delete")
    rows = _rows(db_session)
    assert len(rows) == 1
    assert rows[0].op == "delete"
    assert rows[0].google_event_id == "g1"


def test_target_removed_enqueues_delete_and_clears_snapshot(db_session):
    # Previously synced, but the category no longer targets a calendar.
    ev = _make_event(
        db_session, category_gcal=None, google_event_id="g1", google_calendar_id="cal-A"
    )
    enqueue_for_event(db_session, ev, op_hint="update")
    rows = _rows(db_session)
    assert [r.op for r in rows] == ["delete"]
    assert ev.google_event_id is None and ev.google_calendar_id is None


def test_calendar_moved_enqueues_delete_then_create(db_session):
    ev = _make_event(
        db_session, category_gcal="cal-B", google_event_id="g1", google_calendar_id="cal-A"
    )
    enqueue_for_event(db_session, ev, op_hint="update")
    rows = _rows(db_session)
    ops = [(r.op, r.calendar_id) for r in rows]
    assert ("delete", "cal-A") in ops
    assert ("create", "cal-B") in ops
    assert ev.google_event_id is None  # snapshot cleared for the fresh create


# ───────────── mapping helpers ─────────────


def test_to_local_iso_adds_moscow_offset(db_session):
    iso = _to_local_iso(datetime(2026, 6, 15, 10, 0))
    assert iso.startswith("2026-06-15T10:00:00")
    assert iso.endswith("+03:00")


def test_event_to_google_body(db_session):
    ev = _make_event(db_session, with_client=True, notes="заметка")
    body = event_to_google_body(ev)
    # Title uses "Категория | Фамилия Имя" order.
    assert body["summary"] == "C | Петров Иван"
    assert body["description"] == "заметка"
    # No club on this event → empty location (cleared on patch).
    assert body["location"] == ""
    assert body["start"]["timeZone"] == settings.TIMEZONE
    assert body["start"]["dateTime"].endswith("+03:00")
    assert body["end"]["dateTime"].endswith("+03:00")
    assert body["attendees"] == []
    assert body["extendedProperties"]["private"]["app_event_id"] == str(ev.id)


def test_event_to_google_body_without_client(db_session):
    ev = _make_event(db_session, with_client=False)
    assert event_to_google_body(ev)["summary"] == "C"


def test_event_to_google_body_location_from_club(db_session):
    from app.models import Club

    ev = _make_event(db_session, with_client=False)
    # With name + address → "Name, Address".
    club = Club(name="Корт №1", address="Москва, ул. Ленина, 1")
    db_session.add(club)
    db_session.flush()
    ev.club_id = club.id
    db_session.flush()
    assert event_to_google_body(ev)["location"] == "Корт №1, Москва, ул. Ленина, 1"
    # Name only → just the name.
    club.address = None
    db_session.flush()
    assert event_to_google_body(ev)["location"] == "Корт №1"


# ───────────── backoff ─────────────


def test_backoff_doubles_and_caps():
    assert _backoff_seconds(0) == 30
    assert _backoff_seconds(1) == 30
    assert _backoff_seconds(2) == 60
    assert _backoff_seconds(3) == 120
    assert _backoff_seconds(4) == 240
    assert _backoff_seconds(100) == 3600  # capped at 1h


# ───────────── sync-status hydration ─────────────


def test_get_event_sync_statuses(db_session):
    pending = _make_event(db_session, cat_name="C-pending")
    failed = _make_event(db_session, cat_name="C-failed")
    completed = _make_event(db_session, cat_name="C-completed")
    clean = _make_event(db_session, cat_name="C-clean")
    threshold = settings.GOOGLE_SYNC_FAIL_THRESHOLD

    db_session.add_all([
        GoogleSyncOutbox(event_id=pending.id, op="create", calendar_id="c", attempts=0),
        GoogleSyncOutbox(event_id=failed.id, op="create", calendar_id="c", attempts=threshold),
        GoogleSyncOutbox(
            event_id=completed.id, op="create", calendar_id="c",
            attempts=0, completed_at=datetime(2026, 1, 1),
        ),
    ])
    db_session.commit()

    statuses = get_event_sync_statuses(
        db_session, [pending.id, failed.id, completed.id, clean.id]
    )
    assert statuses.get(pending.id) == "pending"
    assert statuses.get(failed.id) == "failed"
    # completed (no open rows) and clean (no rows) are not reported as problems
    assert completed.id not in statuses
    assert clean.id not in statuses
