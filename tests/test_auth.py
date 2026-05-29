from .conftest import TEST_PASSWORD, TEST_USERNAME


def test_me_unauthenticated(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json() == {"username": None, "authenticated": False}


def test_protected_endpoint_requires_auth(client):
    r = client.get("/api/categories")
    assert r.status_code == 401


def test_login_success_then_me(client):
    r = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert r.status_code == 200
    assert r.json() == {"username": TEST_USERNAME, "authenticated": True}

    me = client.get("/api/auth/me")
    assert me.json()["authenticated"] is True
    # Session cookie now grants access to protected routes.
    assert client.get("/api/categories").status_code == 200


def test_login_wrong_password(client):
    r = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": "nope"},
    )
    assert r.status_code == 401


def test_logout_clears_session(auth_client):
    assert auth_client.post("/api/auth/logout").status_code == 200
    assert auth_client.get("/api/auth/me").json()["authenticated"] is False
    assert auth_client.get("/api/categories").status_code == 401
