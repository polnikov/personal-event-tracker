from datetime import timedelta

from sqlalchemy import func, select

from app.clock import now_local
from app.google_sync import (
    OUTBOX_MAX_AGE_DAYS,
    OUTBOX_MAX_ROWS,
    _prune_outbox,
)
from app.models import GoogleSyncOutbox


def _add_row(db, *, created_at, op="create", calendar_id="cal-1"):
    row = GoogleSyncOutbox(
        op=op,
        calendar_id=calendar_id,
        payload_json="{}",
        created_at=created_at,
        next_attempt_at=created_at,
    )
    db.add(row)
    return row


def _count(db) -> int:
    return db.execute(select(func.count()).select_from(GoogleSyncOutbox)).scalar()


def _ids(db) -> set[int]:
    return set(db.execute(select(GoogleSyncOutbox.id)).scalars().all())


def test_prune_is_idempotent(db_session):
    now = now_local()
    for i in range(10):
        _add_row(db_session, created_at=now - timedelta(minutes=i))
    db_session.commit()

    _prune_outbox(db_session)
    db_session.commit()
    first_count = _count(db_session)
    first_ids = _ids(db_session)
    assert first_count == 10

    # Running again changes nothing (the set is already within limits).
    _prune_outbox(db_session)
    db_session.commit()
    assert _count(db_session) == first_count
    assert _ids(db_session) == first_ids


def test_prune_drops_rows_past_retention(db_session):
    now = now_local()
    recent_ids = set()
    for i in range(5):
        r = _add_row(db_session, created_at=now - timedelta(days=i))
        db_session.flush()
        recent_ids.add(r.id)
    # Older than the retention window.
    for i in range(5):
        _add_row(db_session, created_at=now - timedelta(days=OUTBOX_MAX_AGE_DAYS + 1 + i))
    db_session.commit()

    _prune_outbox(db_session)
    db_session.commit()

    assert _ids(db_session) == recent_ids


def test_prune_caps_to_max_rows(db_session):
    now = now_local()
    total = OUTBOX_MAX_ROWS + 10
    rows = []
    for i in range(total):
        # increasing created_at -> higher i is newer
        rows.append(_add_row(db_session, created_at=now - timedelta(seconds=total - i)))
    db_session.commit()

    newest_ids = {r.id for r in rows[-OUTBOX_MAX_ROWS:]}

    _prune_outbox(db_session)
    db_session.commit()

    assert _count(db_session) == OUTBOX_MAX_ROWS
    assert _ids(db_session) == newest_ids
