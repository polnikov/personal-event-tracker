"""Prepaid packages: CRUD, balance arithmetic and event pricing.

Balances are expressed in lessons where 1 lesson == 1 hour, so a 90-minute
event consumes 1.5. Only ended events consume anything, which is why the
fixtures use a far-past (2020) and a far-future (2099) date instead of mocking
the clock.
"""
from datetime import timedelta
from decimal import Decimal

from .helpers import make_category, make_client_record, make_subcategory


def _setup(auth_client, *, lessons="10", price="500.00", initial_price="100.00"):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price=initial_price)
    cl = make_client_record(auth_client)
    r = auth_client.post(
        f"/api/clients/{cl['id']}/subscriptions",
        json={
            "subcategory_id": sub["id"],
            "lessons_total": lessons,
            "price_per_lesson": price,
        },
    )
    assert r.status_code == 201, r.text
    return sub, cl, r.json()


def _event(auth_client, sub, cl, *, start, minutes=60, subscription_id=None, **kw):
    payload = {
        "subcategory_id": sub["id"],
        "client_id": cl["id"],
        "start_at": start,
        "duration_minutes": minutes,
        **kw,
    }
    if subscription_id is not None:
        payload["subscription_id"] = subscription_id
    return auth_client.post("/api/events", json=payload)


def _fetch(auth_client, client_id, sub_id):
    detail = auth_client.get(f"/api/clients/{client_id}").json()
    return next(s for s in detail["client"]["subscriptions"] if s["id"] == sub_id)


# ---------- CRUD ----------


def test_create_returns_full_balance(auth_client):
    sub, cl, package = _setup(auth_client)
    assert package["subcategory_id"] == sub["id"]
    assert package["subcategory_name"] == sub["name"]
    assert package["lessons_total"] == 10
    assert package["lessons_used"] == 0
    assert package["lessons_remaining"] == 10
    assert package["remaining_minutes"] == 600
    assert package["is_exhausted"] is False
    assert Decimal(str(package["price_per_lesson"])) == Decimal("500.00")


def test_create_on_missing_client_is_404(auth_client):
    sub = make_subcategory(auth_client, make_category(auth_client)["id"])
    r = auth_client.post(
        "/api/clients/9999/subscriptions",
        json={"subcategory_id": sub["id"], "lessons_total": "10", "price_per_lesson": "500"},
    )
    assert r.status_code == 404


def test_create_with_unknown_subcategory_is_400(auth_client):
    cl = make_client_record(auth_client)
    r = auth_client.post(
        f"/api/clients/{cl['id']}/subscriptions",
        json={"subcategory_id": 9999, "lessons_total": "10", "price_per_lesson": "500"},
    )
    assert r.status_code == 400


def test_update_and_delete(auth_client):
    sub, cl, package = _setup(auth_client)
    r = auth_client.put(
        f"/api/clients/subscriptions/{package['id']}",
        json={"subcategory_id": sub["id"], "lessons_total": "8", "price_per_lesson": "600"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["lessons_total"] == 8
    assert Decimal(str(r.json()["price_per_lesson"])) == Decimal("600.00")

    assert auth_client.delete(f"/api/clients/subscriptions/{package['id']}").status_code == 200
    assert auth_client.get(f"/api/clients/{cl['id']}").json()["client"]["subscriptions"] == []


# ---------- Balance arithmetic ----------


def test_fractional_consumption(auth_client):
    sub, cl, package = _setup(auth_client)
    assert _event(
        auth_client, sub, cl,
        start="2020-01-01T10:00:00", minutes=90, subscription_id=package["id"],
    ).status_code == 201
    state = _fetch(auth_client, cl["id"], package["id"])
    assert state["lessons_used"] == 1.5
    assert state["lessons_remaining"] == 8.5
    assert state["is_exhausted"] is False


def test_exhaustion_boundary_is_exact(auth_client):
    sub, cl, package = _setup(auth_client, lessons="2")
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", minutes=60, subscription_id=package["id"])
    _event(auth_client, sub, cl, start="2020-01-02T10:00:00", minutes=30, subscription_id=package["id"])
    half = _fetch(auth_client, cl["id"], package["id"])
    assert half["remaining_minutes"] == 30
    assert half["lessons_remaining"] == 0.5
    assert half["is_exhausted"] is False

    _event(auth_client, sub, cl, start="2020-01-03T10:00:00", minutes=30, subscription_id=package["id"])
    done = _fetch(auth_client, cl["id"], package["id"])
    assert done["remaining_minutes"] == 0
    assert done["is_exhausted"] is True


def test_only_past_events_consume(auth_client):
    sub, cl, package = _setup(auth_client)
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", subscription_id=package["id"])
    _event(auth_client, sub, cl, start="2099-01-01T10:00:00", subscription_id=package["id"])
    state = _fetch(auth_client, cl["id"], package["id"])
    assert state["lessons_used"] == 1
    assert state["lessons_remaining"] == 9


def test_in_progress_event_does_not_consume(auth_client, monkeypatch):
    """An event that started but hasn't ended yet is not consumed. Mirrors the
    end_at-based past/future split used by the events list."""
    import app.subscriptions as subs_mod

    sub, cl, package = _setup(auth_client)
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", minutes=60, subscription_id=package["id"])

    from datetime import datetime
    mid = datetime(2020, 1, 1, 10, 30)
    monkeypatch.setattr(subs_mod, "now_local", lambda: mid)
    state = _fetch(auth_client, cl["id"], package["id"])
    assert state["lessons_used"] == 0

    monkeypatch.setattr(subs_mod, "now_local", lambda: mid + timedelta(hours=1))
    ended = _fetch(auth_client, cl["id"], package["id"])
    assert ended["lessons_used"] == 1


def test_overconsumption_is_allowed(auth_client):
    """No 409 on an exhausted package — hiding it is a UI rule only."""
    sub, cl, package = _setup(auth_client, lessons="1")
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", subscription_id=package["id"])
    r = _event(auth_client, sub, cl, start="2020-01-02T10:00:00", subscription_id=package["id"])
    assert r.status_code == 201
    state = _fetch(auth_client, cl["id"], package["id"])
    assert state["remaining_minutes"] == -60
    assert state["is_exhausted"] is True


# ---------- Event pricing + validation ----------


def test_event_priced_from_package(auth_client):
    sub, cl, package = _setup(auth_client, price="500.00", initial_price="100.00")
    r = _event(
        auth_client, sub, cl,
        start="2020-01-01T10:00:00", minutes=90, subscription_id=package["id"],
        # A conflicting client-side price must lose: the server is
        # authoritative on what a package lesson costs.
        price_per_hour="1.00",
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert Decimal(str(body["hourly_rate_snapshot"])) == Decimal("500.00")
    assert Decimal(str(body["total_cost"])) == Decimal("750.00")
    assert body["subscription"]["id"] == package["id"]


def test_event_rejects_mismatched_subcategory_and_client(auth_client):
    sub, cl, package = _setup(auth_client)
    other_sub = make_subcategory(auth_client, sub["category_id"], name="Групповая")
    other_client = make_client_record(auth_client, first_name="Пётр", last_name="Сидоров")

    r = _event(
        auth_client, other_sub, cl,
        start="2021-01-01T10:00:00", subscription_id=package["id"],
    )
    assert r.status_code == 400
    assert "подкатегории" in r.json()["detail"]

    r = _event(
        auth_client, sub, other_client,
        start="2021-01-02T10:00:00", subscription_id=package["id"],
    )
    assert r.status_code == 400
    assert "другому клиенту" in r.json()["detail"]

    r = _event(auth_client, sub, cl, start="2021-01-03T10:00:00", subscription_id=9999)
    assert r.status_code == 400


def test_update_unlinks_and_reprices_from_tariff(auth_client):
    sub, cl, package = _setup(auth_client, price="500.00", initial_price="100.00")
    ev = _event(
        auth_client, sub, cl,
        start="2020-01-01T10:00:00", minutes=60, subscription_id=package["id"],
    ).json()

    r = auth_client.put(f"/api/events/{ev['id']}", json={
        "subcategory_id": sub["id"],
        "client_id": cl["id"],
        "subscription_id": None,
        "start_at": "2020-01-01T10:00:00",
        "duration_minutes": 60,
        "recalculate_price": True,
    })
    assert r.status_code == 200, r.text
    assert r.json()["subscription"] is None
    assert Decimal(str(r.json()["total_cost"])) == Decimal("100.00")
    assert _fetch(auth_client, cl["id"], package["id"])["lessons_used"] == 0


# ---------- Deletion side effects ----------


def test_deleting_package_keeps_events_and_money(auth_client):
    sub, cl, package = _setup(auth_client, price="500.00")
    ev = _event(
        auth_client, sub, cl,
        start="2020-01-01T10:00:00", minutes=60, subscription_id=package["id"],
    ).json()
    auth_client.delete(f"/api/clients/subscriptions/{package['id']}")

    got = auth_client.get(f"/api/events/{ev['id']}").json()
    assert got["subscription"] is None
    assert Decimal(str(got["total_cost"])) == Decimal("500.00")


def test_deleting_client_removes_packages_without_dangling_ids(auth_client, db_session):
    from app.models import Event

    sub, cl, package = _setup(auth_client)
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", subscription_id=package["id"])
    assert auth_client.delete(f"/api/clients/{cl['id']}").status_code == 200

    rows = db_session.query(Event).all()
    assert rows and all(e.subscription_id is None for e in rows)


def test_client_list_includes_balances(auth_client):
    sub, cl, package = _setup(auth_client)
    _event(auth_client, sub, cl, start="2020-01-01T10:00:00", minutes=30, subscription_id=package["id"])
    row = next(c for c in auth_client.get("/api/clients").json() if c["id"] == cl["id"])
    assert row["subscriptions"][0]["lessons_remaining"] == 9.5
