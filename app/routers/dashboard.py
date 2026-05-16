from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import get_db
from ..models import Event, Subcategory
from ..schemas import (
    DashboardCategoryStat,
    DashboardChart,
    DashboardClientStat,
    DashboardDailySeries,
    DashboardResponse,
    DashboardSubcategoryStat,
)

router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_auth)],
)


def _month_bounds(d: datetime) -> tuple[datetime, datetime]:
    start = d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _year_bounds(d: datetime) -> tuple[datetime, datetime]:
    start = d.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1)
    return start, end


@router.get("", response_model=DashboardResponse)
def dashboard(
    period: str = Query("all"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    category_id: int | None = Query(None),
    subcategory_id: int | None = Query(None),
    client_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    if period == "all":
        start = datetime(1900, 1, 1)
        end = datetime(2100, 12, 31)
        period_label = "Все события"
    elif period == "year":
        start, end = _year_bounds(now)
        period_label = f"{now.year}"
    elif period == "custom" and date_from and date_to:
        try:
            start = datetime.fromisoformat(date_from)
            end = datetime.fromisoformat(date_to) + timedelta(days=1)
            period_label = f"{date_from} — {date_to}"
        except ValueError:
            start, end = _month_bounds(now)
            period_label = now.strftime("%B %Y")
            period = "month"
    else:
        period = "month"
        start, end = _month_bounds(now)
        period_label = now.strftime("%B %Y")

    stmt = (
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
        )
        .where(and_(Event.start_at >= start, Event.start_at < end))
        .order_by(Event.start_at.desc())
    )
    if subcategory_id:
        stmt = stmt.where(Event.subcategory_id == subcategory_id)
    elif category_id:
        sub_ids = [
            r[0]
            for r in db.execute(
                select(Subcategory.id).where(Subcategory.category_id == category_id)
            ).all()
        ]
        stmt = stmt.where(Event.subcategory_id.in_(sub_ids or [-1]))
    if client_id:
        stmt = stmt.where(Event.client_id == client_id)

    events = db.execute(stmt).scalars().all()

    total_count = len(events)
    total_minutes = sum(e.duration_minutes for e in events)
    total_cost = sum((e.total_cost for e in events), Decimal(0))

    by_cat: dict[str, dict] = {}
    by_sub: dict[str, dict] = {}
    by_client: dict[str, dict] = {}
    for e in events:
        cat = e.subcategory.category
        b = by_cat.setdefault(
            cat.name, {"count": 0, "minutes": 0, "cost": Decimal(0), "color": cat.color}
        )
        b["count"] += 1
        b["minutes"] += e.duration_minutes
        b["cost"] += e.total_cost

        sname = f"{cat.name} | {e.subcategory.name}"
        s = by_sub.setdefault(sname, {"count": 0, "minutes": 0, "cost": Decimal(0)})
        s["count"] += 1
        s["minutes"] += e.duration_minutes
        s["cost"] += e.total_cost

        if e.client:
            cn = e.client.full_name
            cl = by_client.setdefault(cn, {"count": 0, "minutes": 0, "cost": Decimal(0)})
            cl["count"] += 1
            cl["minutes"] += e.duration_minutes
            cl["cost"] += e.total_cost

    daily: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    daily_by_cat: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal(0)))
    cat_colors: dict[str, str] = {}
    for e in events:
        key = e.start_at.strftime("%Y-%m-%d")
        cat = e.subcategory.category
        cat_colors[cat.name] = cat.color
        daily[key] += e.total_cost
        daily_by_cat[key][cat.name] += e.total_cost
    series_labels = sorted(daily.keys())
    series_values = [float(daily[k]) for k in series_labels]

    # Stacked daily series: include all days within the period if range ≤ 62 days,
    # otherwise just days with events (keeps year/all-time charts readable).
    range_days = (end - start).days
    if 0 < range_days <= 62:
        daily_dates: list[str] = []
        cur = start.date()
        end_date = end.date()
        while cur < end_date:
            daily_dates.append(cur.strftime("%Y-%m-%d"))
            cur += timedelta(days=1)
    else:
        daily_dates = sorted(daily_by_cat.keys())

    daily_series = [
        DashboardDailySeries(
            name=cat_name,
            color=color,
            values=[float(daily_by_cat.get(d, {}).get(cat_name, Decimal(0))) for d in daily_dates],
        )
        for cat_name, color in sorted(cat_colors.items(), key=lambda kv: -float(by_cat.get(kv[0], {}).get("cost", Decimal(0))))
    ]

    # Monthly chart: Jan–Dec of the CURRENT year, independent of period filter
    cur_year = now.year
    year_start = datetime(cur_year, 1, 1)
    year_end = datetime(cur_year + 1, 1, 1)
    monthly_rows = (
        db.execute(
            select(Event.start_at, Event.total_cost).where(
                and_(Event.start_at >= year_start, Event.start_at < year_end)
            )
        )
        .all()
    )
    monthly_buckets: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    for start_at, total in monthly_rows:
        key = start_at.strftime("%Y-%m")
        monthly_buckets[key] += total

    monthly_labels: list[str] = [f"{cur_year}-{m:02d}" for m in range(1, 13)]
    monthly_values: list[float] = [
        float(monthly_buckets.get(label, Decimal(0))) for label in monthly_labels
    ]

    by_cat_sorted = sorted(by_cat.items(), key=lambda kv: -kv[1]["cost"])
    by_sub_sorted = sorted(by_sub.items(), key=lambda kv: -kv[1]["cost"])
    by_client_sorted = sorted(by_client.items(), key=lambda kv: -kv[1]["cost"])

    return DashboardResponse(
        period=period,
        period_label=period_label,
        total_count=total_count,
        total_minutes=total_minutes,
        total_cost=total_cost,
        by_category=[
            DashboardCategoryStat(name=n, color=v["color"], count=v["count"], minutes=v["minutes"], cost=v["cost"])
            for n, v in by_cat_sorted
        ],
        by_subcategory=[
            DashboardSubcategoryStat(name=n, count=v["count"], minutes=v["minutes"], cost=v["cost"])
            for n, v in by_sub_sorted
        ],
        by_client=[
            DashboardClientStat(name=n, count=v["count"], minutes=v["minutes"], cost=v["cost"])
            for n, v in by_client_sorted
        ],
        chart=DashboardChart(
            labels=series_labels,
            values=series_values,
            by_cat_labels=[n for n, _ in by_cat_sorted],
            by_cat_values=[float(v["cost"]) for _, v in by_cat_sorted],
            by_cat_colors=[v["color"] for _, v in by_cat_sorted],
            daily_dates=daily_dates,
            daily_series=daily_series,
            monthly_labels=monthly_labels,
            monthly_values=monthly_values,
        ),
    )
