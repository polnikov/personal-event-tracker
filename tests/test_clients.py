from decimal import Decimal

from .helpers import make_category, make_subcategory


def _create_client(auth_client, **kw):
    payload = {"first_name": "Иван", "last_name": "Петров", **kw}
    return auth_client.post("/api/clients", json=payload)


def test_create_and_duplicate_detection(auth_client):
    assert _create_client(auth_client, phone="+7 999 111").status_code == 201
    dup = _create_client(auth_client, phone="+7 999 111")
    assert dup.status_code == 409
    # Same name, different phone is allowed.
    assert _create_client(auth_client, phone="+7 999 222").status_code == 201


def test_duplicate_detection_is_case_insensitive_for_cyrillic(auth_client):
    assert _create_client(auth_client, first_name="Иван", last_name="Петров", phone="500").status_code == 201
    # Different case of the same Cyrillic name must still collide.
    dup = _create_client(auth_client, first_name="иван", last_name="ПЕТРОВ", phone="500")
    assert dup.status_code == 409


def test_telegram_at_is_stripped(auth_client):
    r = _create_client(auth_client, last_name="Сидоров", telegram="@ivan")
    assert r.status_code == 201
    assert r.json()["telegram"] == "ivan"


def test_list_and_search(auth_client):
    _create_client(auth_client, first_name="Анна", last_name="Смирнова")
    _create_client(auth_client, first_name="Борис", last_name="Кузнецов")
    all_clients = auth_client.get("/api/clients").json()
    assert len(all_clients) >= 2
    found = auth_client.get("/api/clients", params={"q": "Смирн"}).json()
    assert [c["last_name"] for c in found] == ["Смирнова"]


def test_detail_stats(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    client = _create_client(auth_client, last_name="Клиент").json()
    # past + future events for this client
    for start in ("2020-01-01T10:00:00", "2099-01-01T10:00:00"):
        auth_client.post("/api/events", json={
            "subcategory_id": sub["id"], "client_id": client["id"],
            "start_at": start, "duration_minutes": 60, "price_per_hour": "100.00",
        })
    detail = auth_client.get(f"/api/clients/{client['id']}").json()
    assert detail["total_events"] == 2
    assert detail["total_minutes"] == 120
    assert Decimal(str(detail["total_cost"])) == Decimal("200.00")
    assert len(detail["future_events"]) == 1
    assert len(detail["past_events"]) == 1
    assert detail["client"]["events_count"] == 2


def test_monthly(auth_client):
    cat = make_category(auth_client)
    sub = make_subcategory(auth_client, cat["id"], initial_price="100.00")
    client = _create_client(auth_client, last_name="Месяц").json()
    auth_client.post("/api/events", json={
        "subcategory_id": sub["id"], "client_id": client["id"],
        "start_at": "2026-03-10T10:00:00", "duration_minutes": 120, "price_per_hour": "100.00",
    })
    body = auth_client.get(f"/api/clients/{client['id']}/monthly", params={"year": 2026}).json()
    assert body["year"] == 2026
    assert body["values"][2] == 200.0  # March (index 2): 100/h * 120min
    assert sum(sum(row) for row in body["weekday_month"]) == 1


def test_update_and_duplicate_on_update(auth_client):
    a = _create_client(auth_client, first_name="Один", last_name="А", phone="111").json()
    _create_client(auth_client, first_name="Два", last_name="Б", phone="222")
    # rename "Один А" to collide with "Два Б"
    r = auth_client.put(f"/api/clients/{a['id']}", json={
        "first_name": "Два", "last_name": "Б", "phone": "222",
    })
    assert r.status_code == 409
    # a non-colliding update succeeds
    ok = auth_client.put(f"/api/clients/{a['id']}", json={
        "first_name": "Один", "last_name": "Альфа", "phone": "111",
    })
    assert ok.status_code == 200
    assert ok.json()["last_name"] == "Альфа"


def test_delete(auth_client):
    c = _create_client(auth_client, last_name="Удалить").json()
    assert auth_client.delete(f"/api/clients/{c['id']}").status_code == 200
    assert auth_client.get(f"/api/clients/{c['id']}").status_code == 404
