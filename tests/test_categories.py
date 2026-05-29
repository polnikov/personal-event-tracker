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
