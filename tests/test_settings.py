from decimal import Decimal


def test_settings_seed_defaults_on_first_read(auth_client):
    r = auth_client.get("/api/settings")
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(str(body["default_tax"])) == Decimal("6")
    assert Decimal(str(body["default_royalty"])) == Decimal("10")


def test_settings_update_round_trips(auth_client):
    r = auth_client.put(
        "/api/settings",
        json={"default_tax": "7.5", "default_royalty": "12"},
    )
    assert r.status_code == 200, r.text
    assert Decimal(str(r.json()["default_tax"])) == Decimal("7.5")

    again = auth_client.get("/api/settings").json()
    assert Decimal(str(again["default_tax"])) == Decimal("7.5")
    assert Decimal(str(again["default_royalty"])) == Decimal("12")


def test_settings_rejects_out_of_range(auth_client):
    r = auth_client.put(
        "/api/settings",
        json={"default_tax": "101", "default_royalty": "0"},
    )
    assert r.status_code == 422, r.text


def test_settings_requires_auth(client):
    assert client.get("/api/settings").status_code == 401
