from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import get_db
from ..models import Event, Subcategory
from ..schemas import CalendarEvent

router = APIRouter(
    prefix="/api/calendar",
    tags=["calendar"],
    dependencies=[Depends(require_auth)],
)


@router.get("/feed", response_model=list[CalendarEvent])
def calendar_feed(
    start: str = Query(...),
    end: str = Query(...),
    client_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
        e = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return []

    stmt = (
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
        )
        .where(and_(Event.start_at >= s, Event.start_at < e))
    )
    if client_id:
        stmt = stmt.where(Event.client_id == client_id)
    events = db.execute(stmt).scalars().all()

    out: list[CalendarEvent] = []
    for ev in events:
        cat = ev.subcategory.category
        client_name = ev.client.full_name if ev.client else ""
        title_parts = [f"{cat.name} | {ev.subcategory.name}"]
        if client_name:
            title_parts.append(client_name)
        out.append(
            CalendarEvent(
                id=ev.id,
                title=" · ".join(title_parts),
                start=ev.start_at.isoformat(),
                end=(ev.start_at + timedelta(minutes=ev.duration_minutes)).isoformat(),
                backgroundColor=cat.color,
                borderColor=cat.color,
                extendedProps={
                    "category": cat.name,
                    "category_icon": cat.icon,
                    "category_color": cat.color,
                    "subcategory": ev.subcategory.name,
                    "subcategory_icon": ev.subcategory.icon,
                    "client": client_name,
                    "cost": float(ev.total_cost),
                    "duration": ev.duration_minutes,
                    "notes": ev.notes or "",
                },
            )
        )
    return out
