from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import AppSettings
from ..schemas import SettingsRead, SettingsUpdate

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)

# Seeded on first read, so an install that predates the table needs no data
# migration. Kept in sync with the column server_defaults.
DEFAULT_TAX = Decimal("6")
DEFAULT_ROYALTY = Decimal("10")


def get_or_create_settings(db: Session) -> AppSettings:
    s = db.execute(select(AppSettings).order_by(AppSettings.id)).scalars().first()
    if s is None:
        s = AppSettings(default_tax=DEFAULT_TAX, default_royalty=DEFAULT_ROYALTY)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=SettingsRead)
def read_settings(db: Session = Depends(get_db)):
    return SettingsRead.model_validate(get_or_create_settings(db))


@router.put("", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    s = get_or_create_settings(db)
    s.default_tax = payload.default_tax
    s.default_royalty = payload.default_royalty
    db.commit()
    db.refresh(s)
    return SettingsRead.model_validate(s)
