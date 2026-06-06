from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..clock import now_local
from ..database import get_db
from ..google_sync import enqueue_for_event
from ..google_sync_worker import kick_worker
from ..models import Event, Subcategory
from ..pricing import calc_total, get_price_at
from ..schemas import (
    EventCreate,
    EventListResponse,
    EventRead,
    EventUpdate,
    UpcomingEvent,
)
from ..serializers import event_to_schema, event_to_schema_with_sync, hydrate_sync_status_map

router = APIRouter(
    prefix="/api/events",
    tags=["events"],
    dependencies=[Depends(require_auth)],
)


DUPLICATE_MSG = (
    "Уже есть событие с этим клиентом, датой/временем и подкатегорией"
)


def _find_duplicate_event(
    db: Session,
    *,
    subcategory_id: int,
    client_id: int | None,
    start_at: datetime,
    exclude_id: int | None = None,
) -> Event | None:
    """Returns an existing event whose (client, subcategory, start_at) tuple
    matches the proposed payload. NULL client is treated as a real value so
    two anonymous events at the same slot still collide. Used to enforce the
    uniqueness rule on both POST and PUT."""
    stmt = select(Event).where(
        Event.subcategory_id == subcategory_id,
        Event.start_at == start_at,
    )
    if client_id is None:
        stmt = stmt.where(Event.client_id.is_(None))
    else:
        stmt = stmt.where(Event.client_id == client_id)
    if exclude_id is not None:
        stmt = stmt.where(Event.id != exclude_id)
    return db.execute(stmt).scalar_one_or_none()


@router.get("", response_model=EventListResponse)
def list_events(
    category_id: int | None = Query(None),
    subcategory_id: int | None = Query(None),
    client_id: int | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
            selectinload(Event.club),
        )
        .order_by(Event.start_at.desc())
    )
    conds = []
    if subcategory_id:
        conds.append(Event.subcategory_id == subcategory_id)
    elif category_id:
        sub_ids = [
            r[0]
            for r in db.execute(
                select(Subcategory.id).where(Subcategory.category_id == category_id)
            ).all()
        ]
        conds.append(Event.subcategory_id.in_(sub_ids or [-1]))
    if client_id:
        conds.append(Event.client_id == client_id)
    if date_from:
        try:
            conds.append(Event.start_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            conds.append(Event.start_at < datetime.fromisoformat(date_to) + timedelta(days=1))
        except ValueError:
            pass
    if conds:
        stmt = stmt.where(and_(*conds))

    events = db.execute(stmt).scalars().all()
    now = now_local()
    # An event becomes "past" only after its end_at (start + duration), so an
    # in-progress slot (e.g. 14:00–15:00 at 14:30) stays in `future` until it
    # actually finishes. Event has no end_at column — derive it from
    # start_at + duration_minutes.
    def _has_ended(e: Event) -> bool:
        return e.start_at + timedelta(minutes=e.duration_minutes) <= now

    future = sorted([e for e in events if not _has_ended(e)], key=lambda e: e.start_at)
    past = [e for e in events if _has_ended(e)]

    sync_map = hydrate_sync_status_map(db, events)
    return EventListResponse(
        future=[event_to_schema_with_sync(e, sync_map) for e in future],
        past=[event_to_schema_with_sync(e, sync_map) for e in past],
    )


@router.get("/upcoming", response_model=list[UpcomingEvent])
def upcoming(limit: int = 10, db: Session = Depends(get_db)):
    now = now_local()
    # Want "still upcoming or in progress" — end_at > now. End is derived
    # from start_at + duration; can't filter on it in SQL portably, so
    # pre-filter with a generous SQL window (events almost never run >24h)
    # and apply the precise end_at check in Python.
    candidates = (
        db.execute(
            select(Event)
            .options(
                selectinload(Event.subcategory).selectinload(Subcategory.category),
                selectinload(Event.client),
            )
            .where(Event.start_at >= now - timedelta(days=1))
            .order_by(Event.start_at)
        )
        .scalars()
        .all()
    )
    rows = [
        e
        for e in candidates
        if e.start_at + timedelta(minutes=e.duration_minutes) > now
    ][:limit]
    return [
        UpcomingEvent(
            id=e.id,
            start_at=e.start_at,
            category_name=e.subcategory.category.name,
            subcategory_name=e.subcategory.name,
            client_name=e.client.full_name if e.client else None,
        )
        for e in rows
    ]


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: int, db: Session = Depends(get_db)):
    e = db.execute(
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
            selectinload(Event.club),
        )
        .where(Event.id == event_id)
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(404)
    return event_to_schema(e)


@router.post("", response_model=EventRead, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    sub = db.get(Subcategory, payload.subcategory_id)
    if not sub:
        raise HTTPException(400, "Подкатегория не найдена")
    if _find_duplicate_event(
        db,
        subcategory_id=payload.subcategory_id,
        client_id=payload.client_id,
        start_at=payload.start_at,
    ):
        raise HTTPException(409, DUPLICATE_MSG)
    if payload.price_per_hour is not None:
        rate = payload.price_per_hour
    else:
        rate = get_price_at(db, payload.subcategory_id, payload.start_at)
        if rate is None:
            raise HTTPException(400, "Для этой подкатегории не задана цена на момент начала события")
    total = calc_total(rate, payload.duration_minutes)

    e = Event(
        subcategory_id=payload.subcategory_id,
        client_id=payload.client_id,
        club_id=payload.club_id,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
        hourly_rate_snapshot=rate,
        total_cost=total,
        tax=payload.tax,
        royalty=payload.royalty,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    e = db.execute(
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
            selectinload(Event.club),
        )
        .where(Event.id == e.id)
    ).scalar_one()
    enqueue_for_event(db, e, op_hint="create")
    db.commit()
    kick_worker()
    return event_to_schema(e)


@router.put("/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)):
    e = db.get(Event, event_id)
    if not e:
        raise HTTPException(404)
    if _find_duplicate_event(
        db,
        subcategory_id=payload.subcategory_id,
        client_id=payload.client_id,
        start_at=payload.start_at,
        exclude_id=event_id,
    ):
        raise HTTPException(409, DUPLICATE_MSG)

    subcategory_changed = payload.subcategory_id != e.subcategory_id
    e.subcategory_id = payload.subcategory_id
    e.client_id = payload.client_id
    e.club_id = payload.club_id
    e.start_at = payload.start_at
    e.duration_minutes = payload.duration_minutes
    e.notes = (payload.notes or "").strip() or None
    e.tax = payload.tax
    e.royalty = payload.royalty

    if payload.price_per_hour is not None:
        e.hourly_rate_snapshot = payload.price_per_hour
    elif payload.recalculate_price or subcategory_changed:
        rate = get_price_at(db, payload.subcategory_id, payload.start_at)
        if rate is None:
            raise HTTPException(400, "Для подкатегории нет цены на момент события")
        e.hourly_rate_snapshot = rate
    e.total_cost = calc_total(e.hourly_rate_snapshot, payload.duration_minutes)

    db.commit()
    e = db.execute(
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
            selectinload(Event.club),
        )
        .where(Event.id == event_id)
    ).scalar_one()
    enqueue_for_event(db, e, op_hint="update")
    db.commit()
    kick_worker()
    return event_to_schema(e)


@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    e = db.execute(
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
            selectinload(Event.club),
        )
        .where(Event.id == event_id)
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(404)
    # Enqueue the Google delete BEFORE removing the row, so the snapshot
    # of (calendar_id, google_event_id) is captured for the worker.
    enqueue_for_event(db, e, op_hint="delete")
    db.delete(e)
    db.commit()
    kick_worker()
    return {"ok": True}
