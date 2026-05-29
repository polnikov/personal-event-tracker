import itertools

from .helpers import make_category, make_client_record, make_subcategory

_cat_seq = itertools.count(1)


def _seed_event(auth_client, start_at="2026-06-15T10:00:00", client_id=None, cat_name=None):
    cat = make_category(auth_client, name=cat_name or f"Йога {next(_cat_seq)}", color="#10b981")
    sub = make_subcategory(auth_client, cat["id"], name="Хатха", initial_price="100.00")
    payload = {
        "subcategory_id": sub["id"], "start_at": start_at,
        "duration_minutes": 90, "price_per_hour": "100.00",
    }
    if client_id is not None:
        payload["client_id"] = client_id
    r = auth_client.post("/api/events", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_feed_returns_events_in_range(auth_client):
    ev = _seed_event(auth_client, "2026-06-15T10:00:00", cat_name="Йога")
    feed = auth_client.get(
        "/api/calendar/feed", params={"start": "2026-06-01", "end": "2026-07-01"}
    ).json()
    item = next(x for x in feed if x["id"] == ev["id"])
    assert item["title"].startswith("Йога | Хатха")
    assert item["backgroundColor"] == "#10b981"
    assert item["start"] == "2026-06-15T10:00:00"
    assert item["end"] == "2026-06-15T11:30:00"  # +90 min
    assert item["extendedProps"]["duration"] == 90


def test_feed_excludes_events_out_of_range(auth_client):
    _seed_event(auth_client, "2026-06-15T10:00:00")
    feed = auth_client.get(
        "/api/calendar/feed", params={"start": "2026-07-01", "end": "2026-08-01"}
    ).json()
    assert feed == []


def test_feed_client_filter(auth_client):
    client = make_client_record(auth_client)
    with_client = _seed_event(auth_client, "2026-06-10T10:00:00", client_id=client["id"])
    _seed_event(auth_client, "2026-06-11T10:00:00")
    feed = auth_client.get(
        "/api/calendar/feed",
        params={"start": "2026-06-01", "end": "2026-07-01", "client_id": client["id"]},
    ).json()
    assert [x["id"] for x in feed] == [with_client["id"]]


def test_feed_invalid_dates_returns_empty(auth_client):
    assert auth_client.get(
        "/api/calendar/feed", params={"start": "not-a-date", "end": "also-bad"}
    ).json() == []
