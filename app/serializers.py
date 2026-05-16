from datetime import timedelta
from decimal import Decimal

from .models import Event, Subcategory
from .schemas import EventClient, EventRead, EventSubcategory, SubcategoryRead, CategoryRead, SubcategoryPriceRead


def event_to_schema(e: Event) -> EventRead:
    sub = e.subcategory
    cat = sub.category
    return EventRead(
        id=e.id,
        subcategory_id=e.subcategory_id,
        client_id=e.client_id,
        start_at=e.start_at,
        end_at=e.start_at + timedelta(minutes=e.duration_minutes),
        duration_minutes=e.duration_minutes,
        hourly_rate_snapshot=e.hourly_rate_snapshot,
        total_cost=e.total_cost,
        tax=e.tax,
        royalty=e.royalty,
        notes=e.notes,
        subcategory=EventSubcategory(
            id=sub.id,
            name=sub.name,
            category_id=cat.id,
            category_name=cat.name,
            category_color=cat.color,
        ),
        client=EventClient(id=e.client.id, full_name=e.client.full_name) if e.client else None,
    )


def subcategory_to_schema(s: Subcategory) -> SubcategoryRead:
    current = s.prices[0].price_per_hour if s.prices else None
    return SubcategoryRead(
        id=s.id,
        category_id=s.category_id,
        name=s.name,
        icon=s.icon,
        prices=[SubcategoryPriceRead.model_validate(p) for p in s.prices],
        current_price=current,
    )


def category_to_schema(c) -> CategoryRead:
    return CategoryRead(
        id=c.id,
        name=c.name,
        color=c.color,
        icon=c.icon,
        subcategories=[subcategory_to_schema(s) for s in sorted(c.subcategories, key=lambda x: x.name)],
    )
