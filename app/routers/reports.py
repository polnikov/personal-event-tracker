from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import get_db
from ..models import Event, Subcategory
from ..schemas import (
    ReportMonthly,
    ReportResponse,
    ReportSubcatStat,
)
from ..serializers import event_to_schema, event_to_schema_with_sync, hydrate_sync_status_map

router = APIRouter(
    prefix="/api/reports",
    tags=["reports"],
    dependencies=[Depends(require_auth)],
)


def _subcat_ids_for_category(db: Session, category_id: int) -> list[int]:
    return [
        r[0]
        for r in db.execute(
            select(Subcategory.id).where(Subcategory.category_id == category_id)
        ).all()
    ]


def _query_events(
    db: Session,
    start: datetime,
    end: datetime,
    category_id: int | None,
) -> list[Event]:
    stmt = (
        select(Event)
        .options(
            selectinload(Event.subcategory).selectinload(Subcategory.category),
            selectinload(Event.client),
        )
        .where(and_(Event.start_at >= start, Event.start_at < end))
    )
    if category_id:
        sub_ids = _subcat_ids_for_category(db, category_id)
        stmt = stmt.where(Event.subcategory_id.in_(sub_ids or [-1]))
    return db.execute(stmt).scalars().all()


@router.get("/years")
def years_with_events(db: Session = Depends(get_db)):
    rows = db.execute(
        select(func.strftime("%Y", Event.start_at)).distinct()
    ).all()
    years = sorted({int(r[0]) for r in rows if r[0]}, reverse=True)
    return {"years": years}


@router.get("", response_model=ReportResponse)
def report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    category_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    period_start = datetime(year, month, 1)
    if month == 12:
        period_end = datetime(year + 1, 1, 1)
    else:
        period_end = datetime(year, month + 1, 1)

    year_start = datetime(year, 1, 1)
    year_end = datetime(year + 1, 1, 1)

    period_events = _query_events(db, period_start, period_end, category_id)
    year_events = _query_events(db, year_start, year_end, category_id)

    # By-subcategory aggregation (period filtered)
    by_sub: dict[int, dict] = {}
    for e in period_events:
        sub = e.subcategory
        cat = sub.category
        b = by_sub.setdefault(
            sub.id,
            {
                "name": sub.name,
                "category_name": cat.name,
                "category_color": cat.color,
                "minutes": 0,
                "net": Decimal(0),
            },
        )
        b["minutes"] += e.duration_minutes
        b["net"] += e.total_cost * (Decimal(1) - e.tax / Decimal(100) - e.royalty / Decimal(100))

    by_subcategory = [
        ReportSubcatStat(
            subcategory_id=sub_id,
            name=v["name"],
            category_name=v["category_name"],
            category_color=v["category_color"],
            hours=round(v["minutes"] / 60, 2),
            net=float(v["net"]),
        )
        for sub_id, v in by_sub.items()
    ]
    by_subcategory.sort(key=lambda x: -x.net)

    # Monthly aggregation (whole year, filtered by category if any)
    monthly_buckets: dict[int, dict] = {
        m: {"net": Decimal(0), "tax": Decimal(0)} for m in range(1, 13)
    }
    for e in year_events:
        m = e.start_at.month
        net = e.total_cost * (Decimal(1) - e.tax / Decimal(100) - e.royalty / Decimal(100))
        tax_amt = e.total_cost * e.tax / Decimal(100)
        monthly_buckets[m]["net"] += net
        monthly_buckets[m]["tax"] += tax_amt

    monthly = [
        ReportMonthly(
            month=m,
            net=float(monthly_buckets[m]["net"]),
            tax_amount=float(monthly_buckets[m]["tax"]),
        )
        for m in range(1, 13)
    ]

    # Weekday × month heatmaps (whole year, filtered by category if any).
    # Rows: Mon=0..Sun=6; Cols: Jan=0..Dec=11.
    # weekday_month = event counts; weekday_month_net = net income.
    weekday_month = [[0 for _ in range(12)] for _ in range(7)]
    weekday_month_net_dec = [[Decimal(0) for _ in range(12)] for _ in range(7)]
    for e in year_events:
        w = e.start_at.weekday()
        m = e.start_at.month - 1
        weekday_month[w][m] += 1
        weekday_month_net_dec[w][m] += e.total_cost * (
            Decimal(1) - e.tax / Decimal(100) - e.royalty / Decimal(100)
        )
    weekday_month_net = [[float(v) for v in row] for row in weekday_month_net_dec]

    # Events with royalty (period)
    royalty_events = [e for e in period_events if e.royalty > 0]
    royalty_events.sort(key=lambda e: e.start_at, reverse=True)

    sync_map = hydrate_sync_status_map(db, royalty_events)
    return ReportResponse(
        by_subcategory=by_subcategory,
        monthly=monthly,
        weekday_month=weekday_month,
        weekday_month_net=weekday_month_net,
        events_with_royalty=[event_to_schema_with_sync(e, sync_map) for e in royalty_events],
    )
