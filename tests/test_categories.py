from decimal import Decimal

from .helpers import make_category, make_subcategory


def test_category_crud(auth_client):
    cat = make_category(auth_client, name="Йога", color="#10b981")
    assert cat["name"] == "Йога"

    listing = auth_client.get("/api/categories").json()
    assert any(c["id"] == cat["id"] for c in listing)

    upd = auth_client.put(
        f"/api/categories/{cat['id']}",
        json={"name": "Йога+", "color": "#059669", "icon": None, "google_calendar_id": None},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Йога+"

    assert auth_client.delete(f"/api/categories/{cat['id']}").status_code == 200
    listing = auth_client.get("/api/categories").json()
    assert all(c["id"] != cat["id"] for c in listing)


def test_hidden_flag_defaults_off_and_round_trips(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"])
    assert cat["hidden"] is False
    assert sub["hidden"] is False

    upd = auth_client.put(
        f"/api/categories/{cat['id']}",
        json={"name": cat["name"], "color": cat["color"], "hidden": True},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["hidden"] is True

    upd = auth_client.put(
        f"/api/categories/subcategories/{sub['id']}",
        json={"name": sub["name"], "hidden": True},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["hidden"] is True

    # Hiding is a picker-side concern only: the listing still carries both, so
    # events already booked under them keep rendering their name and colour.
    listing = auth_client.get("/api/categories").json()
    shown = next(c for c in listing if c["id"] == cat["id"])
    assert shown["hidden"] is True
    assert [s["hidden"] for s in shown["subcategories"]] == [True]


def test_hidden_subcategory_still_accepts_events(auth_client):
    """The flag is never retroactive — the API keeps booking against it."""
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"])
    auth_client.put(
        f"/api/categories/subcategories/{sub['id']}",
        json={"name": sub["name"], "hidden": True},
    )
    r = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "start_at": "2026-03-01T10:00:00",
            "duration_minutes": 60,
        },
    )
    assert r.status_code == 201, r.text


def test_subcategory_with_initial_price(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], name="Сплит", initial_price="150.00")
    assert sub["name"] == "Сплит"
    assert Decimal(str(sub["current_price"])) == Decimal("150.00")
    assert len(sub["prices"]) == 1


def test_price_history_crud(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    sid = sub["id"]

    added = auth_client.post(
        f"/api/categories/subcategories/{sid}/prices",
        json={"price_per_hour": "120.00", "effective_from": "2026-01-01T00:00:00"},
    )
    assert added.status_code == 201, added.text
    price_id = added.json()["id"]

    # current_price reflects the most recent effective_from.
    sub_after = next(
        s for c in auth_client.get("/api/categories").json() for s in c["subcategories"] if s["id"] == sid
    )
    assert Decimal(str(sub_after["current_price"])) == Decimal("120.00")
    assert len(sub_after["prices"]) == 2

    upd = auth_client.put(
        f"/api/categories/prices/{price_id}",
        json={"price_per_hour": "130.00", "effective_from": "2026-01-01T00:00:00"},
    )
    assert upd.status_code == 200
    assert Decimal(str(upd.json()["price_per_hour"])) == Decimal("130.00")

    assert auth_client.delete(f"/api/categories/prices/{price_id}").status_code == 200


def test_subcategory_delete(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"])
    assert auth_client.delete(f"/api/categories/subcategories/{sub['id']}").status_code == 200
    cats = auth_client.get("/api/categories").json()
    subs = [s for c in cats for s in c["subcategories"]]
    assert all(s["id"] != sub["id"] for s in subs)


def test_subcategory_on_missing_category_404(auth_client):
    r = auth_client.post(
        "/api/categories/999999/subcategories",
        json={"name": "x", "initial_price": "10.00", "effective_from": "2026-01-01T00:00:00"},
    )
    assert r.status_code == 404
