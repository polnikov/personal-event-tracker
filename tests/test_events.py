from decimal import Decimal

from .helpers import make_category, make_client_record, make_subcategory


def _setup_subcategory(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    return sub


def _all_events(auth_client):
    body = auth_client.get("/api/events").json()
    return body["future"] + body["past"]


def test_create_event_auto_prices_and_total_cost(auth_client):
    sub = _setup_subcategory(auth_client)
    r = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "client_id": None,
            "start_at": "2026-06-15T10:00:00",
            "duration_minutes": 90,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    # rate snapshot pulled from the effective price; 100/h * 90min = 150.00
    assert Decimal(str(body["hourly_rate_snapshot"])) == Decimal("100.00")
    assert Decimal(str(body["total_cost"])) == Decimal("150.00")


def test_create_event_explicit_price(auth_client):
    sub = _setup_subcategory(auth_client)
    r = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "start_at": "2026-06-15T12:00:00",
            "duration_minutes": 60,
            "price_per_hour": "250.00",
        },
    )
    assert r.status_code == 201, r.text
    assert Decimal(str(r.json()["total_cost"])) == Decimal("250.00")


def test_duplicate_event_detection(auth_client):
    sub = _setup_subcategory(auth_client)
    payload = {
        "subcategory_id": sub["id"],
        "client_id": None,
        "start_at": "2026-07-01T09:00:00",
        "duration_minutes": 60,
    }
    assert auth_client.post("/api/events", json=payload).status_code == 201
    dup = auth_client.post("/api/events", json=payload)
    assert dup.status_code == 409, dup.text


def test_duplicate_detection_is_client_scoped(auth_client):
    sub = _setup_subcategory(auth_client)
    c1 = make_client_record(auth_client, "Анна")
    c2 = make_client_record(auth_client, "Борис")
    base = {
        "subcategory_id": sub["id"],
        "start_at": "2026-07-02T09:00:00",
        "duration_minutes": 60,
    }
    assert auth_client.post("/api/events", json={**base, "client_id": c1["id"]}).status_code == 201
    # Same slot/subcategory but a different client is NOT a duplicate.
    assert auth_client.post("/api/events", json={**base, "client_id": c2["id"]}).status_code == 201
    # Re-posting the first client's slot collides.
    assert auth_client.post("/api/events", json={**base, "client_id": c1["id"]}).status_code == 409


def test_event_update_and_delete(auth_client):
    sub = _setup_subcategory(auth_client)
    created = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "start_at": "2026-08-10T08:00:00",
            "duration_minutes": 60,
            "price_per_hour": "100.00",
        },
    ).json()
    eid = created["id"]

    upd = auth_client.put(
        f"/api/events/{eid}",
        json={
            "subcategory_id": sub["id"],
            "start_at": "2026-08-10T08:00:00",
            "duration_minutes": 120,
            "recalculate_price": False,
            "price_per_hour": "100.00",
        },
    )
    assert upd.status_code == 200, upd.text
    assert Decimal(str(upd.json()["total_cost"])) == Decimal("200.00")

    assert auth_client.delete(f"/api/events/{eid}").status_code == 200
    assert auth_client.get(f"/api/events/{eid}").status_code == 404
    assert all(e["id"] != eid for e in _all_events(auth_client))


def test_event_requires_auth(client):
    r = client.post("/api/events", json={"subcategory_id": 1, "start_at": "2026-01-01T00:00:00", "duration_minutes": 60})
    assert r.status_code == 401
