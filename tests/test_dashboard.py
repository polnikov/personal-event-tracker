from decimal import Decimal

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
