from datetime import datetime
from decimal import Decimal

import pytest

from app.routers import dashboard as dash_mod
from app.routers.dashboard import _mtd_windows

from .helpers import make_category, make_subcategory


def _seed(auth_client):
    cat = make_category(auth_client, name="Тренировки")
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    cat2 = make_category(auth_client, name="Консультации")
    sub2 = make_subcategory(auth_client, cat2["id"], initial_price="200.00")
    # 2 events in cat, 1 in cat2
    auth_client.post("/api/events", json={
        "subcategory_id": sub["id"], "start_at": "2026-02-01T10:00:00",
        "duration_minutes": 60, "price_per_hour": "100.00"})
    auth_client.post("/api/events", json={
        "subcategory_id": sub["id"], "start_at": "2026-02-02T10:00:00",
        "duration_minutes": 120, "price_per_hour": "100.00"})
    auth_client.post("/api/events", json={
        "subcategory_id": sub2["id"], "start_at": "2026-02-03T10:00:00",
        "duration_minutes": 60, "price_per_hour": "200.00"})
    return cat, sub, cat2, sub2


def test_dashboard_totals_all_period(auth_client):
    _seed(auth_client)
    body = auth_client.get("/api/dashboard", params={"period": "all"}).json()
    assert body["total_count"] == 3
    assert body["total_minutes"] == 60 + 120 + 60
    # 100 + 200 + 200 = 500
    assert Decimal(str(body["total_cost"])) == Decimal("500.00")

    by_cat = {c["name"]: c for c in body["by_category"]}
    assert by_cat["Тренировки"]["count"] == 2
    assert Decimal(str(by_cat["Тренировки"]["cost"])) == Decimal("300.00")
    assert Decimal(str(by_cat["Консультации"]["cost"])) == Decimal("200.00")
    # sorted by cost desc
    assert body["by_category"][0]["name"] == "Тренировки"


def test_dashboard_category_filter(auth_client):
    cat, sub, cat2, sub2 = _seed(auth_client)
    body = auth_client.get(
        "/api/dashboard", params={"period": "all", "category_id": cat2["id"]}
    ).json()
    assert body["total_count"] == 1
    assert Decimal(str(body["total_cost"])) == Decimal("200.00")
    assert [c["name"] for c in body["by_category"]] == ["Консультации"]


def test_dashboard_requires_auth(client):
    assert client.get("/api/dashboard", params={"period": "all"}).status_code == 401


def _event(auth_client, sub, start_at: str, price: str):
    r = auth_client.post("/api/events", json={
        "subcategory_id": sub["id"], "start_at": start_at,
        "duration_minutes": 60, "price_per_hour": price})
    assert r.status_code == 201, r.text


@pytest.mark.parametrize(
    "now, exp_mtd_end, exp_prev_start, exp_prev_end, exp_days",
    [
        # Plain case: 1-20 May vs 1-20 April.
        (
            datetime(2026, 5, 20, 15, 30),
            datetime(2026, 5, 21), datetime(2026, 4, 1), datetime(2026, 4, 21), 20,
        ),
        # 31-day month against a 30-day one: April simply ends on the 30th.
        (
            datetime(2026, 5, 31, 23, 59),
            datetime(2026, 6, 1), datetime(2026, 4, 1), datetime(2026, 5, 1), 30,
        ),
        # The other way round: May's 31st is left out of the comparison.
        (
            datetime(2026, 6, 30, 0, 0),
            datetime(2026, 7, 1), datetime(2026, 5, 1), datetime(2026, 5, 31), 30,
        ),
        # Year boundary: January compares against December.
        (
            datetime(2026, 1, 5, 9, 0),
            datetime(2026, 1, 6), datetime(2025, 12, 1), datetime(2025, 12, 6), 5,
        ),
    ],
)
def test_mtd_windows(now, exp_mtd_end, exp_prev_start, exp_prev_end, exp_days):
    mtd_end, prev_start, prev_end, prev_days = _mtd_windows(now)
    assert mtd_end == exp_mtd_end
    assert prev_start == exp_prev_start
    assert prev_end == exp_prev_end
    assert prev_days == exp_days


def test_dashboard_month_delta_is_month_to_date(auth_client, monkeypatch):
    """The %-delta pill compares 1-today of this month against the same days
    of the previous one, while total_cost stays the whole month."""
    monkeypatch.setattr(dash_mod, "now_local", lambda: datetime(2026, 5, 20, 12, 0))
    cat = make_category(auth_client, name="Тренировки")
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")

    _event(auth_client, sub, "2026-04-10T10:00:00", "100.00")   # prev, counts
    _event(auth_client, sub, "2026-04-25T10:00:00", "200.00")   # prev, past day 20
    _event(auth_client, sub, "2026-05-05T10:00:00", "300.00")   # current, counts
    _event(auth_client, sub, "2026-05-20T23:00:00", "400.00")   # today, counts
    _event(auth_client, sub, "2026-05-28T10:00:00", "500.00")   # current, future

    body = auth_client.get("/api/dashboard", params={"period": "month"}).json()
    assert Decimal(str(body["total_cost"])) == Decimal("1200.00")
    assert Decimal(str(body["mtd_total_cost"])) == Decimal("700.00")
    assert Decimal(str(body["prev_total_cost"])) == Decimal("100.00")
    assert body["mtd_prev_days"] == 20


def test_dashboard_mtd_fields_absent_outside_month(auth_client):
    _seed(auth_client)
    body = auth_client.get("/api/dashboard", params={"period": "all"}).json()
    assert body["mtd_total_cost"] is None
    assert body["mtd_prev_days"] is None
    assert body["prev_total_cost"] is None


def test_income_history_fills_empty_days(auth_client):
    cat = make_category(auth_client, name="Тренировки")
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    _event(auth_client, sub, "2026-03-01T10:00:00", "100.00")
    _event(auth_client, sub, "2026-03-01T14:00:00", "150.00")  # same day, adds up
    _event(auth_client, sub, "2026-03-04T10:00:00", "200.00")

    body = auth_client.get("/api/dashboard/income-history").json()
    assert body["dates"] == [
        "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04",
    ]
    assert body["values"] == [250.0, 0.0, 0.0, 200.0]


def test_income_history_empty(auth_client):
    body = auth_client.get("/api/dashboard/income-history").json()
    assert body == {"dates": [], "values": []}


def test_income_history_requires_auth(client):
    assert client.get("/api/dashboard/income-history").status_code == 401
