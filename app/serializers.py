from datetime import timedelta
from typing import Iterable

from sqlalchemy.orm import Session

from .models import Event, Subcategory
from .schemas import (
    EventClient,
    EventClub,
    EventRead,
    EventSubcategory,
    SubcategoryRead,
    SubscriptionRead,
    CategoryRead,
    SubcategoryPriceRead,
)


def event_to_schema(
    e: Event,
    *,
    sync_status: str = "ok",
    subscription: SubscriptionRead | None = None,
) -> EventRead:
    sub = e.subcategory
    cat = sub.category
    return EventRead(
        id=e.id,
        subcategory_id=e.subcategory_id,
        client_id=e.client_id,
        club_id=e.club_id,
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
        club=EventClub(id=e.club.id, name=e.club.name, address=e.club.address) if e.club else None,
        subscription=subscription,
        sync_status=sync_status,
    )


def hydrate_sync_status_map(db: Session, events: Iterable[Event]) -> dict[int, str]:
    """Batch-load sync statuses for a list of events in a single query so
    list endpoints stay O(1) extra queries instead of N+1."""
    from .google_sync import get_event_sync_statuses
    ids = [e.id for e in events]
    return get_event_sync_statuses(db, ids)


def hydrate_subscription_map(db: Session, events: Iterable[Event]):
    """Batch-load the prepaid packages referenced by these events, keyed by
    subscription id. Same O(1)-queries contract as hydrate_sync_status_map."""
    from .subscriptions import hydrate_subscription_map as _impl
    return _impl(db, list(events))


def event_to_schema_with_sync(
    e: Event,
    sync_map: dict[int, str],
    sub_map: dict[int, SubscriptionRead] | None = None,
) -> EventRead:
    return event_to_schema(
        e,
        sync_status=sync_map.get(e.id, "ok"),
        subscription=(sub_map or {}).get(e.subscription_id) if e.subscription_id else None,
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
        google_calendar_id=c.google_calendar_id,
        default_club_id=c.default_club_id,
        subcategories=[subcategory_to_schema(s) for s in sorted(c.subcategories, key=lambda x: x.name)],
    )
