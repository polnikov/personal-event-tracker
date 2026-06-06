import itertools
from datetime import timedelta

from app.clock import now_local

from .helpers import make_category, make_client_record, make_subcategory

_cat_seq = itertools.count(1)


def _subcategory(auth_client, effective_from="2020-01-01T00:00:00", price="100.00"):
    cat = make_category(auth_client, name=f"Категория {next(_cat_seq)}")
    sub = make_subcategory(auth_client, cat["id"], initial_price=price, effective_from=effective_from)
    sub["category_id"] = cat["id"]
    return sub


def _create(auth_client, subcategory_id, start_at, **kw):
    payload = {
        "subcategory_id": subcategory_id,
        "start_at": start_at,
        "duration_minutes": 60,
        "price_per_hour": "100.00",
        **kw,
    }
    r = auth_client.post("/api/events", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_future_past_split(auth_client):
    sub = _subcategory(auth_client)
    past = _create(auth_client, sub["id"], "2020-05-01T10:00:00")
    future = _create(auth_client, sub["id"], "2099-05-01T10:00:00")

    body = auth_client.get("/api/events").json()
    assert future["id"] in {e["id"] for e in body["future"]}
    assert past["id"] in {e["id"] for e in body["past"]}
    assert past["id"] not in {e["id"] for e in body["future"]}


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def test_in_progress_event_counts_as_future(auth_client):
    # Started 10 min ago, runs 60 min → end_at is still ~50 min ahead, so the
    # split (by end_at, not start_at) must keep it in `future`.
    sub = _subcategory(auth_client)
    now = now_local()
    ev = _create(auth_client, sub["id"], _iso(now - timedelta(minutes=10)))
    body = auth_client.get("/api/events").json()
    assert ev["id"] in {e["id"] for e in body["future"]}
    assert ev["id"] not in {e["id"] for e in body["past"]}


def test_finished_event_counts_as_past(auth_client):
    # Ended an hour ago (start -120m, duration 60m) → past.
    sub = _subcategory(auth_client)
    now = now_local()
    ev = _create(auth_client, sub["id"], _iso(now - timedelta(minutes=120)))
    body = auth_client.get("/api/events").json()
    assert ev["id"] in {e["id"] for e in body["past"]}
    assert ev["id"] not in {e["id"] for e in body["future"]}


def test_upcoming_includes_in_progress(auth_client):
    # The upcoming feed filters on end_at > now, so an in-progress slot shows.
    sub = _subcategory(auth_client)
    now = now_local()
    ev = _create(auth_client, sub["id"], _iso(now - timedelta(minutes=5)))
    rows = auth_client.get("/api/events/upcoming").json()
    assert ev["id"] in {r["id"] for r in rows}


def test_future_events_sorted_ascending(auth_client):
    sub = _subcategory(auth_client)
    later = _create(auth_client, sub["id"], "2099-12-01T10:00:00")
    sooner = _create(auth_client, sub["id"], "2099-01-01T10:00:00")
    future = auth_client.get("/api/events").json()["future"]
    ids = [e["id"] for e in future]
    assert ids.index(sooner["id"]) < ids.index(later["id"])


def test_filter_by_subcategory_category_client(auth_client):
    sub1 = _subcategory(auth_client)
    sub2 = _subcategory(auth_client)
    client = make_client_record(auth_client)
    e1 = _create(auth_client, sub1["id"], "2099-01-01T10:00:00", client_id=client["id"])
    _create(auth_client, sub2["id"], "2099-01-02T10:00:00")

    def ids(params):
        b = auth_client.get("/api/events", params=params).json()
        return {e["id"] for e in b["future"] + b["past"]}

    assert ids({"subcategory_id": sub1["id"]}) == {e1["id"]}
    assert ids({"category_id": sub1["category_id"]}) == {e1["id"]}
    assert ids({"client_id": client["id"]}) == {e1["id"]}


def test_filter_by_date_range(auth_client):
    sub = _subcategory(auth_client)
    inside = _create(auth_client, sub["id"], "2099-06-15T10:00:00")
    _create(auth_client, sub["id"], "2099-08-01T10:00:00")
    b = auth_client.get(
        "/api/events", params={"date_from": "2099-06-01", "date_to": "2099-06-30"}
    ).json()
    ids = {e["id"] for e in b["future"] + b["past"]}
    assert ids == {inside["id"]}


def test_upcoming_returns_future_sorted_and_limited(auth_client):
    sub = _subcategory(auth_client)
    _create(auth_client, sub["id"], "2099-03-01T10:00:00")
    _create(auth_client, sub["id"], "2099-01-01T10:00:00")
    _create(auth_client, sub["id"], "2099-02-01T10:00:00")
    rows = auth_client.get("/api/events/upcoming", params={"limit": 2}).json()
    assert len(rows) == 2
    starts = [r["start_at"] for r in rows]
    assert starts == sorted(starts)


def test_missing_price_returns_400(auth_client):
    cat = make_category(auth_client)
    # price only becomes effective in the far future
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00", effective_from="2099-01-01T00:00:00")
    r = auth_client.post(
        "/api/events",
        json={"subcategory_id": sub["id"], "start_at": "2026-01-01T10:00:00", "duration_minutes": 60},
    )
    assert r.status_code == 400
