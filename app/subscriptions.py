"""Prepaid package balances.

One "занятие" equals one hour, so all arithmetic here is done in whole
minutes and only converted to lessons for display. That keeps the exhaustion
boundary exact: a 2-lesson package with two 60-minute events lands on exactly
0, never on 0.0000001.

Only events that have already ended consume the package. Future bookings are
deliberately not counted (product decision), and neither is an event that is
in progress right now.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .clock import now_local
from .models import Event, Subcategory, Subscription
from .schemas import SubscriptionRead


def used_minutes_map(
    db: Session,
    subscription_ids: list[int] | None = None,
    now=None,
) -> dict[int, int]:
    """Minutes consumed per subscription, counting ended events only.

    `end_at` is a Python property rather than a column, so a pure-SQL SUM
    can't express the filter portably. We narrow in SQL (nothing starting in
    the future can have ended) and apply the precise end_at check in Python,
    the same split `list_events` and `upcoming` already use.
    """
    now = now or now_local()
    stmt = select(Event.subscription_id, Event.start_at, Event.duration_minutes).where(
        Event.subscription_id.is_not(None),
        Event.start_at < now,
    )
    if subscription_ids is not None:
        if not subscription_ids:
            return {}
        stmt = stmt.where(Event.subscription_id.in_(subscription_ids))

    used: dict[int, int] = {}
    for sub_id, start_at, duration in db.execute(stmt).all():
        if start_at + timedelta(minutes=duration) <= now:
            used[sub_id] = used.get(sub_id, 0) + duration
    return used


def subscription_to_schema(s: Subscription, used_minutes: int) -> SubscriptionRead:
    total_minutes = int(round(float(s.lessons_total) * 60))
    remaining_minutes = total_minutes - used_minutes
    sub = s.subcategory
    cat = sub.category
    return SubscriptionRead(
        id=s.id,
        client_id=s.client_id,
        subcategory_id=s.subcategory_id,
        subcategory_name=sub.name,
        category_id=cat.id,
        category_name=cat.name,
        category_color=cat.color,
        price_per_lesson=s.price_per_lesson,
        lessons_total=total_minutes / 60,
        lessons_used=used_minutes / 60,
        lessons_remaining=remaining_minutes / 60,
        remaining_minutes=remaining_minutes,
        is_exhausted=remaining_minutes <= 0,
        created_at=s.created_at,
    )


def _load_subscriptions(db: Session, client_ids: list[int] | None) -> list[Subscription]:
    stmt = (
        select(Subscription)
        .options(selectinload(Subscription.subcategory).selectinload(Subcategory.category))
        .order_by(Subscription.created_at, Subscription.id)
    )
    if client_ids is not None:
        if not client_ids:
            return []
        stmt = stmt.where(Subscription.client_id.in_(client_ids))
    return list(db.execute(stmt).scalars().all())


def client_subscriptions_map(
    db: Session, client_ids: list[int] | None = None
) -> dict[int, list[SubscriptionRead]]:
    """Subscriptions grouped by client, balances included. Two queries total
    regardless of how many clients are asked for, so list endpoints stay
    N+1-free."""
    subs = _load_subscriptions(db, client_ids)
    used = used_minutes_map(db, [s.id for s in subs])
    out: dict[int, list[SubscriptionRead]] = {}
    for s in subs:
        out.setdefault(s.client_id, []).append(subscription_to_schema(s, used.get(s.id, 0)))
    return out


def hydrate_subscription_map(db: Session, events) -> dict[int, SubscriptionRead]:
    """Batch-load the packages referenced by a list of events, keyed by
    subscription id. Mirrors `hydrate_sync_status_map` in serializers.py."""
    ids = sorted({e.subscription_id for e in events if e.subscription_id is not None})
    if not ids:
        return {}
    subs = list(
        db.execute(
            select(Subscription)
            .options(selectinload(Subscription.subcategory).selectinload(Subcategory.category))
            .where(Subscription.id.in_(ids))
        )
        .scalars()
        .all()
    )
    used = used_minutes_map(db, [s.id for s in subs])
    return {s.id: subscription_to_schema(s, used.get(s.id, 0)) for s in subs}
