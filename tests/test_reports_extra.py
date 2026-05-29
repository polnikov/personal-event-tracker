from datetime import datetime

from .helpers import make_category, make_subcategory


def _sub(auth_client, name="Сплит", cat_name="Тренировки"):
    cat = make_category(auth_client, name=cat_name)
    sub = make_subcategory(auth_client, cat["id"], name=name, initial_price="100.00")
    sub["category_id"] = cat["id"]
    return sub


def _event(auth_client, sub_id, start_at, **kw):
    auth_client.post("/api/events", json={
        "subcategory_id": sub_id, "start_at": start_at,
        "duration_minutes": 60, "price_per_hour": "100.00", **kw,
    })


def test_years_with_events(auth_client):
    sub = _sub(auth_client)
    _event(auth_client, sub["id"], "2024-04-01T10:00:00")
    _event(auth_client, sub["id"], "2026-04-01T10:00:00")
    years = auth_client.get("/api/reports/years").json()["years"]
    assert years == [2026, 2024]


def test_report_category_filter(auth_client):
    sub1 = _sub(auth_client, name="A", cat_name="Кат1")
    sub2 = _sub(auth_client, name="B", cat_name="Кат2")
    _event(auth_client, sub1["id"], "2026-06-01T10:00:00")
    _event(auth_client, sub2["id"], "2026-06-02T10:00:00")

    report = auth_client.get(
        "/api/reports", params={"year": 2026, "month": 6, "category_id": sub1["category_id"]}
    ).json()
    sub_ids = {s["subcategory_id"] for s in report["by_subcategory"]}
    assert sub_ids == {sub1["id"]}


def test_weekday_month_matrix_counts(auth_client):
    sub = _sub(auth_client)
    dates = ["2026-06-15T10:00:00", "2026-06-16T10:00:00", "2026-07-20T10:00:00"]
    for d in dates:
        _event(auth_client, sub["id"], d)

    report = auth_client.get("/api/reports", params={"year": 2026, "month": 6}).json()
    matrix = report["weekday_month"]
    assert len(matrix) == 7 and all(len(row) == 12 for row in matrix)
    # all three events fall in the requested year
    assert sum(sum(row) for row in matrix) == 3
    # a specific event lands in its (weekday, month) cell
    dt = datetime.fromisoformat("2026-06-15T10:00:00")
    assert matrix[dt.weekday()][dt.month - 1] >= 1


def test_weekday_hour_matrix(auth_client):
    sub = _sub(auth_client)
    _event(auth_client, sub["id"], "2026-06-15T09:00:00")  # Monday 09:00
    _event(auth_client, sub["id"], "2026-06-15T09:30:00")  # Monday 09:00 bucket
    _event(auth_client, sub["id"], "2026-06-16T23:00:00")  # Tuesday 23:00

    wh = auth_client.get("/api/reports", params={"year": 2026, "month": 6}).json()["weekday_hour"]
    assert len(wh) == 7 and all(len(row) == 24 for row in wh)
    mon = datetime.fromisoformat("2026-06-15T09:00:00")
    tue = datetime.fromisoformat("2026-06-16T23:00:00")
    assert wh[mon.weekday()][9] == 2
    assert wh[tue.weekday()][23] == 1
    assert sum(sum(row) for row in wh) == 3


def test_monthly_by_category_series(auth_client):
    sub = _sub(auth_client, cat_name="ЕдинственнаяКат")
    _event(auth_client, sub["id"], "2026-06-10T10:00:00")
    report = auth_client.get("/api/reports", params={"year": 2026, "month": 6}).json()
    series = {c["name"]: c for c in report["monthly_by_category"]}
    assert "ЕдинственнаяКат" in series
    net = series["ЕдинственнаяКат"]["net"]
    assert len(net) == 12
    assert net[5] == 100.0  # June, 100/h * 60min, no tax
