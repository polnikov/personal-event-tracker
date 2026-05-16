from datetime import datetime
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import SubcategoryPrice


def get_price_at(db: Session, subcategory_id: int, at: datetime) -> Decimal | None:
    """Return the hourly price for a subcategory effective at the given moment.

    Looks up the most recent price row where effective_from <= at.
    Returns None if no price has been set on or before that moment.
    """
    stmt = (
        select(SubcategoryPrice.price_per_hour)
        .where(
            SubcategoryPrice.subcategory_id == subcategory_id,
            SubcategoryPrice.effective_from <= at,
        )
        .order_by(SubcategoryPrice.effective_from.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def calc_total(hourly_rate: Decimal, duration_minutes: int) -> Decimal:
    return (hourly_rate * Decimal(duration_minutes) / Decimal(60)).quantize(Decimal("0.01"))
