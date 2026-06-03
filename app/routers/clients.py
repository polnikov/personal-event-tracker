from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..clock import now_local
from ..database import get_db
from ..models import Client, Event, Subcategory
from ..schemas import (
    ClientCreate,
    ClientDetailResponse,
    ClientRead,
    ClientStatsByCategory,
    ClientUpdate,
)
from ..serializers import event_to_schema_with_sync, hydrate_sync_status_map

router = APIRouter(
    prefix="/api/clients",
    tags=["clients"],
    dependencies=[Depends(require_auth)],
)


def _normalize_phone(phone: str | None) -> str | None:
    p = (phone or "").strip()
    return p or None


def _find_duplicate(
    db: Session,
    first_name: str,
    last_name: str,
    phone: str | None,
    exclude_id: int | None = None,
) -> Client | None:
    """Look up a client with the same (first_name, last_name, phone) tuple.
    Comparison is case-insensitive for names; phone is matched exactly after
    normalisation (None matches NULL or empty).

    Names are compared in Python: SQLite's lower() is ASCII-only and would
    never fold Cyrillic, so an SQL ``func.lower`` match silently fails for
    Russian names. We narrow by phone in SQL (cheap, single-user dataset),
    then fold names with Python's Unicode-aware str.lower()."""
    fn = first_name.strip().lower()
    ln = last_name.strip().lower()
    ph = _normalize_phone(phone)
    stmt = select(Client)
    if ph is None:
        stmt = stmt.where((Client.phone.is_(None)) | (Client.phone == ""))
    else:
        stmt = stmt.where(Client.phone == ph)
    if exclude_id is not None:
        stmt = stmt.where(Client.id != exclude_id)
    for c in db.execute(stmt).scalars():
        if (c.first_name or "").strip().lower() == fn and (c.last_name or "").strip().lower() == ln:
            return c
    return None


def _duplicate_message(c: Client) -> str:
    parts = [f"{c.first_name} {c.last_name}".strip()]
    if c.phone:
        parts.append(c.phone)
    return f"Клиент уже существует: {' · '.join(parts)}"


def _aggregate_client_stats(db: Session) -> dict[int, tuple[int, Decimal]]:
    rows = db.execute(
        select(
            Event.client_id,
            func.count(Event.id),
            func.coalesce(func.sum(Event.total_cost), 0),
        )
        .where(Event.client_id.is_not(None))
        .group_by(Event.client_id)
    ).all()
    return {cid: (cnt, Decimal(str(total))) for cid, cnt, total in rows}


@router.get("", response_model=list[ClientRead])
def list_clients(q: str = "", db: Session = Depends(get_db)):
    stmt = select(Client).order_by(Client.first_name, Client.last_name)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            Client.first_name.ilike(like)
            | Client.last_name.ilike(like)
            | Client.phone.ilike(like)
            | Client.telegram.ilike(like)
            | Client.notes.ilike(like)
        )
    clients = db.execute(stmt).scalars().all()
    stats = _aggregate_client_stats(db)
    return [
        ClientRead(
            id=c.id,
            first_name=c.first_name,
            last_name=c.last_name,
            full_name=c.full_name,
            phone=c.phone,
            telegram=c.telegram,
            notes=c.notes,
            created_at=c.created_at,
            events_count=stats.get(c.id, (0, Decimal(0)))[0],
            total_spent=stats.get(c.id, (0, Decimal(0)))[1],
        )
        for c in clients
    ]


@router.post("", response_model=ClientRead, status_code=201)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    dup = _find_duplicate(db, payload.first_name, payload.last_name, payload.phone)
    if dup is not None:
        raise HTTPException(status_code=409, detail=_duplicate_message(dup))
    c = Client(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=_normalize_phone(payload.phone),
        telegram=(payload.telegram or "").strip().lstrip("@") or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return ClientRead(
        id=c.id, first_name=c.first_name, last_name=c.last_name, full_name=c.full_name,
        phone=c.phone, telegram=c.telegram, notes=c.notes, created_at=c.created_at,
    )


def _client_with_stats(c: Client, count: int, total: Decimal) -> ClientRead:
    return ClientRead(
        id=c.id, first_name=c.first_name, last_name=c.last_name, full_name=c.full_name,
        phone=c.phone, telegram=c.telegram, notes=c.notes, created_at=c.created_at,
        events_count=count, total_spent=total,
    )


@router.get("/{client_id}", response_model=ClientDetailResponse)
def client_detail(client_id: int, db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404)

    events = (
        db.execute(
            select(Event)
            .options(
                selectinload(Event.subcategory).selectinload(Subcategory.category),
                selectinload(Event.client),
            )
            .where(Event.client_id == client_id)
            .order_by(Event.start_at.desc())
        )
        .scalars()
        .all()
    )

    total_events = len(events)
    total_minutes = sum(e.duration_minutes for e in events)
    total_cost = sum((e.total_cost for e in events), Decimal(0))

    by_cat: dict[str, dict] = {}
    for e in events:
        cat = e.subcategory.category
        b = by_cat.setdefault(
            cat.name,
            {"count": 0, "minutes": 0, "cost": Decimal(0), "color": cat.color},
        )
        b["count"] += 1
        b["minutes"] += e.duration_minutes
        b["cost"] += e.total_cost

    now = now_local()
    future = sorted([e for e in events if e.start_at >= now], key=lambda e: e.start_at)
    past = [e for e in events if e.start_at < now]

    sync_map = hydrate_sync_status_map(db, events)
    return ClientDetailResponse(
        client=_client_with_stats(client, total_events, total_cost),
        future_events=[event_to_schema_with_sync(e, sync_map) for e in future],
        past_events=[event_to_schema_with_sync(e, sync_map) for e in past],
        total_events=total_events,
        total_minutes=total_minutes,
        total_cost=total_cost,
        by_category=[
            ClientStatsByCategory(name=name, color=b["color"], count=b["count"], minutes=b["minutes"], cost=b["cost"])
            for name, b in by_cat.items()
        ],
    )


@router.get("/{client_id}/monthly")
def client_monthly(
    client_id: int,
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    if not db.get(Client, client_id):
        raise HTTPException(404)
    rows = db.execute(
        select(Event.start_at, Event.total_cost).where(
            and_(
                Event.client_id == client_id,
                Event.start_at >= datetime(year, 1, 1),
                Event.start_at < datetime(year + 1, 1, 1),
            )
        )
    ).all()
    monthly: list[Decimal] = [Decimal(0)] * 12
    # 7×12 event-count matrix (rows: Mon..Sun, cols: Jan..Dec).
    weekday_month: list[list[int]] = [[0] * 12 for _ in range(7)]
    for start_at, total in rows:
        monthly[start_at.month - 1] += total
        weekday_month[start_at.weekday()][start_at.month - 1] += 1

    # Previous-year total for the YoY % delta on the analytics card. Same
    # client filter, just the full preceding calendar year — keeps the
    # comparison apples-to-apples with the current-year chart sum.
    prev_year_total = float(
        db.execute(
            select(func.coalesce(func.sum(Event.total_cost), 0)).where(
                and_(
                    Event.client_id == client_id,
                    Event.start_at >= datetime(year - 1, 1, 1),
                    Event.start_at < datetime(year, 1, 1),
                )
            )
        ).scalar_one()
    )

    return {
        "year": year,
        "values": [float(v) for v in monthly],
        "weekday_month": weekday_month,
        "prev_year_total": prev_year_total,
    }


@router.put("/{client_id}", response_model=ClientRead)
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404)
    dup = _find_duplicate(
        db, payload.first_name, payload.last_name, payload.phone, exclude_id=client_id,
    )
    if dup is not None:
        raise HTTPException(status_code=409, detail=_duplicate_message(dup))
    c.first_name = payload.first_name.strip()
    c.last_name = payload.last_name.strip()
    c.phone = _normalize_phone(payload.phone)
    c.telegram = (payload.telegram or "").strip().lstrip("@") or None
    c.notes = (payload.notes or "").strip() or None
    db.commit()
    db.refresh(c)
    return ClientRead(
        id=c.id, first_name=c.first_name, last_name=c.last_name, full_name=c.full_name,
        phone=c.phone, telegram=c.telegram, notes=c.notes, created_at=c.created_at,
    )


@router.delete("/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404)
    db.delete(c)
    db.commit()
    return {"ok": True}
