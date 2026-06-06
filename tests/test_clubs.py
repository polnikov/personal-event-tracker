from .helpers import make_category, make_subcategory


def _make_club(auth_client, name="Корт №1", address="Москва, ул. Ленина, 1"):
    r = auth_client.post("/api/clubs", json={"name": name, "address": address})
    assert r.status_code == 201, r.text
    return r.json()


def test_list_empty(auth_client):
    assert auth_client.get("/api/clubs").json() == []


def test_create_and_list(auth_client):
    club = _make_club(auth_client)
    assert club["name"] == "Корт №1"
    assert club["address"] == "Москва, ул. Ленина, 1"
    listed = auth_client.get("/api/clubs").json()
    assert [c["id"] for c in listed] == [club["id"]]


def test_create_blank_address_becomes_null(auth_client):
    club = _make_club(auth_client, address="   ")
    assert club["address"] is None


def test_search_by_name_and_address(auth_client):
    _make_club(auth_client, name="Корт №1", address="ул. Ленина")
    _make_club(auth_client, name="Зал Б", address="пр. Мира")
    by_name = auth_client.get("/api/clubs", params={"q": "зал"}).json()
    assert [c["name"] for c in by_name] == ["Зал Б"]
    by_addr = auth_client.get("/api/clubs", params={"q": "ленина"}).json()
    assert [c["name"] for c in by_addr] == ["Корт №1"]


def test_update_club(auth_client):
    club = _make_club(auth_client)
    r = auth_client.put(
        f"/api/clubs/{club['id']}",
        json={"name": "Корт №2", "address": None},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Корт №2"
    assert body["address"] is None


def test_update_missing_returns_404(auth_client):
    assert auth_client.put("/api/clubs/999", json={"name": "X", "address": None}).status_code == 404


def test_delete_missing_returns_404(auth_client):
    assert auth_client.delete("/api/clubs/999").status_code == 404


def test_event_carries_club_on_create_and_update(auth_client):
    club = _make_club(auth_client)
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")

    created = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "club_id": club["id"],
            "start_at": "2026-06-15T10:00:00",
            "duration_minutes": 60,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["club_id"] == club["id"]
    assert body["club"]["name"] == "Корт №1"

    # Clearing the club on update nulls it out.
    updated = auth_client.put(
        f"/api/events/{body['id']}",
        json={
            "subcategory_id": sub["id"],
            "club_id": None,
            "start_at": "2026-06-15T10:00:00",
            "duration_minutes": 60,
            "recalculate_price": False,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["club_id"] is None
    assert updated.json()["club"] is None


def test_category_default_club_persists(auth_client):
    club = _make_club(auth_client)
    created = auth_client.post(
        "/api/categories",
        json={"name": "Падел", "color": "#3b82f6", "default_club_id": club["id"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["default_club_id"] == club["id"]

    cat_id = created.json()["id"]
    updated = auth_client.put(
        f"/api/categories/{cat_id}",
        json={"name": "Падел", "color": "#3b82f6", "default_club_id": None},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["default_club_id"] is None


def test_delete_club_nulls_references(auth_client):
    club = _make_club(auth_client)
    # Category points its default at the club…
    cat = auth_client.post(
        "/api/categories",
        json={"name": "Падел", "color": "#3b82f6", "default_club_id": club["id"]},
    ).json()
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    # …and an event references it too.
    ev = auth_client.post(
        "/api/events",
        json={
            "subcategory_id": sub["id"],
            "club_id": club["id"],
            "start_at": "2026-06-15T10:00:00",
            "duration_minutes": 60,
        },
    ).json()

    assert auth_client.delete(f"/api/clubs/{club['id']}").status_code == 200

    # Both references are set to NULL, not left dangling.
    ev_after = auth_client.get(f"/api/events/{ev['id']}").json()
    assert ev_after["club_id"] is None
    assert ev_after["club"] is None
    cats_after = auth_client.get("/api/categories").json()
    cat_after = next(c for c in cats_after if c["id"] == cat["id"])
    assert cat_after["default_club_id"] is None
    # Club is gone from the list.
    assert auth_client.get("/api/clubs").json() == []
