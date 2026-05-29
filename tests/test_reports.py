from decimal import Decimal

import pytest

from app.pricing import calc_total

from .helpers import make_category, make_subcategory


def _net(total: Decimal, tax: Decimal, royalty: Decimal) -> Decimal:
    return total * (Decimal(1) - tax / Decimal(100) - royalty / Decimal(100))


def test_calc_total_unit():
    # 100/h for 90 min = 150.00; rounding to cents.
    assert calc_total(Decimal("100"), 90) == Decimal("150.00")
    assert calc_total(Decimal("250"), 60) == Decimal("250.00")
    assert calc_total(Decimal("100"), 50) == Decimal("83.33")


def _month(report, m):
    return next(x for x in report["monthly"] if x["month"] == m)


def test_report_period_aggregates_net_and_tax(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    sid = sub["id"]

    # June event: 200/h * 60min = 200.00, tax 10%, royalty 5% -> net 170, tax 20
    auth_client.post("/api/events", json={
        "subcategory_id": sid, "start_at": "2026-06-10T10:00:00",
        "duration_minutes": 60, "price_per_hour": "200.00", "tax": 10, "royalty": 5,
    })
    # June event: 100/h * 90min = 150.00, no tax/royalty -> net 150, tax 0
    auth_client.post("/api/events", json={
        "subcategory_id": sid, "start_at": "2026-06-11T10:00:00",
        "duration_minutes": 90, "price_per_hour": "100.00",
    })
    # July event must NOT count toward June's bucket.
    auth_client.post("/api/events", json={
        "subcategory_id": sid, "start_at": "2026-07-05T10:00:00",
        "duration_minutes": 60, "price_per_hour": "999.00",
    })

    report = auth_client.get("/api/reports", params={"year": 2026, "month": 6}).json()

    # by_subcategory net = 170 + 150 = 320 (period = June)
    sub_stat = next(s for s in report["by_subcategory"] if s["subcategory_id"] == sid)
    assert sub_stat["net"] == pytest.approx(320.0)
    assert sub_stat["hours"] == pytest.approx((60 + 90) / 60)

    june = _month(report, 6)
    assert june["net"] == pytest.approx(320.0)
    assert june["tax_amount"] == pytest.approx(20.0)

    # The yearly monthly series still sees July separately.
    july = _month(report, 7)
    assert july["net"] == pytest.approx(999.0)


def test_report_royalty_events_listed(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"])
    sid = sub["id"]
    auth_client.post("/api/events", json={
        "subcategory_id": sid, "start_at": "2026-06-10T10:00:00",
        "duration_minutes": 60, "price_per_hour": "100.00", "royalty": 20,
    })
    auth_client.post("/api/events", json={
        "subcategory_id": sid, "start_at": "2026-06-12T10:00:00",
        "duration_minutes": 60, "price_per_hour": "100.00",
    })
    report = auth_client.get("/api/reports", params={"year": 2026, "month": 6}).json()
    royalty = report["events_with_royalty"]
    assert len(royalty) == 1
    assert Decimal(str(royalty[0]["royalty"])) == Decimal("20")


def test_report_requires_auth(client):
    assert client.get("/api/reports", params={"year": 2026, "month": 6}).status_code == 401
