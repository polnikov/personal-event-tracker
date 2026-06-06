from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from ..auth import require_auth
from ..database import get_db
from ..models import Club
from ..schemas import ClubCreate, ClubRead, ClubUpdate
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/api/clubs",
    tags=["clubs"],
    dependencies=[Depends(require_auth)],
)


@router.get("", response_model=list[ClubRead])
def list_clubs(q: str | None = Query(None), db: Session = Depends(get_db)):
    stmt = select(Club).order_by(Club.name)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Club.name.ilike(like) | Club.address.ilike(like))
    return [ClubRead.model_validate(c) for c in db.execute(stmt).scalars().all()]


@router.post("", response_model=ClubRead, status_code=201)
def create_club(payload: ClubCreate, db: Session = Depends(get_db)):
    c = Club(
        name=payload.name.strip(),
        address=(payload.address or "").strip() or None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return ClubRead.model_validate(c)


@router.put("/{club_id}", response_model=ClubRead)
def update_club(club_id: int, payload: ClubUpdate, db: Session = Depends(get_db)):
    c = db.get(Club, club_id)
    if not c:
        raise HTTPException(404)
    c.name = payload.name.strip()
    c.address = (payload.address or "").strip() or None
    db.commit()
    db.refresh(c)
    return ClubRead.model_validate(c)


@router.delete("/{club_id}")
def delete_club(club_id: int, db: Session = Depends(get_db)):
    c = db.get(Club, club_id)
    if not c:
        raise HTTPException(404)
    # FK columns (events.club_id, categories.default_club_id) are ON DELETE SET
    # NULL at the model level; SQLite won't cascade them itself, so null the
    # references explicitly to avoid dangling ids.
    from ..models import Category, Event

    db.execute(
        Event.__table__.update().where(Event.club_id == club_id).values(club_id=None)
    )
    db.execute(
        Category.__table__.update()
        .where(Category.default_club_id == club_id)
        .values(default_club_id=None)
    )
    db.delete(c)
    db.commit()
    return {"ok": True}
