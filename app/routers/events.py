from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import get_db
from ..models import Event, Subcategory
from ..pricing import calc_total, get_price_at
from ..schemas import (
    EventCreate,
    EventListResponse,
    EventRead,
    EventUpdate,
    UpcomingEvent,
)
from ..serializers import event_to_schema

router = APIRouter(
    prefix="/api/events",
    tags=["events"],
    dependencies=[Depends(require_auth)],
)


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
    now = datetime.now()
    future = sorted([e for e in events if e.start_at >= now], key=lambda e: e.start_at)
    past = [e for e in events if e.start_at < now]

    return EventListResponse(
        future=[event_to_schema(e) for e in future],
        past=[event_to_schema(e) for e in past],
    )


@router.get("/upcoming", response_model=list[UpcomingEvent])
def upcoming(limit: int = 10, db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(Event)
            .options(
                selectinload(Event.subcategory).selectinload(Subcategory.category),
                selectinload(Event.client),
            )
            .where(Event.start_at >= datetime.now())
            .order_by(Event.start_at)
            .limit(limit)
        )
        .scalars()
        .all()
    )
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
        )
        .where(Event.id == e.id)
    ).scalar_one()
    return event_to_schema(e)


@router.put("/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)):
    e = db.get(Event, event_id)
    if not e:
        raise HTTPException(404)

    subcategory_changed = payload.subcategory_id != e.subcategory_id
    e.subcategory_id = payload.subcategory_id
    e.client_id = payload.client_id
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
        )
        .where(Event.id == event_id)
    ).scalar_one()
    return event_to_schema(e)


@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    e = db.get(Event, event_id)
    if not e:
        raise HTTPException(404)
    db.delete(e)
    db.commit()
    return {"ok": True}
