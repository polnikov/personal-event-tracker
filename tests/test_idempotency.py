import uuid
from datetime import timedelta

from app.clock import now_local
from app.idempotency import purge_idempotency_log
from app.models import IdempotencyLog

from .helpers import make_category, make_subcategory


def _key() -> str:
    return uuid.uuid4().hex


def _event_payload(sub_id, start_at, **kw):
    return {
        "subcategory_id": sub_id,
        "start_at": start_at,
        "duration_minutes": 60,
        "price_per_hour": "100.00",
        **kw,
    }


def test_replay_same_key_returns_same_response(auth_client):
    key = _key()
    payload = {"name": "Категория", "color": "#3b82f6"}
    r1 = auth_client.post("/api/categories", json=payload, headers={"Idempotency-Key": key})
    assert r1.status_code == 201
    body1 = r1.json()
    r2 = auth_client.post("/api/categories", json=payload, headers={"Idempotency-Key": key})
    assert r2.status_code == 201
    assert r2.json() == body1
    # Single row in DB despite two POSTs.
    assert len(auth_client.get("/api/categories").json()) == 1


def test_different_keys_create_distinct_rows(auth_client):
    r1 = auth_client.post(
        "/api/categories", json={"name": "Кат A", "color": "#fff"}, headers={"Idempotency-Key": _key()}
    )
    r2 = auth_client.post(
        "/api/categories", json={"name": "Кат B", "color": "#fff"}, headers={"Idempotency-Key": _key()}
    )
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] != r2.json()["id"]


def test_no_header_means_no_replay(auth_client):
    cat = make_category(auth_client, name="Кат-noh")
    sub = make_subcategory(auth_client, cat["id"])
    # Without an idempotency key the second POST is dedup'd by the events router (409).
    auth_client.post("/api/events", json=_event_payload(sub["id"], "2026-07-01T10:00:00"))
    r = auth_client.post("/api/events", json=_event_payload(sub["id"], "2026-07-01T10:00:00"))
    assert r.status_code == 409


def test_event_replay_with_same_key_returns_same_201(auth_client):
    cat = make_category(auth_client, name="Кат-repl")
    sub = make_subcategory(auth_client, cat["id"])
    key = _key()
    payload = _event_payload(sub["id"], "2026-07-10T10:00:00")
    r1 = auth_client.post("/api/events", json=payload, headers={"Idempotency-Key": key})
    assert r1.status_code == 201
    r2 = auth_client.post("/api/events", json=payload, headers={"Idempotency-Key": key})
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


def test_existing_dedup_still_triggers_with_different_key(auth_client):
    cat = make_category(auth_client, name="Кат-dedup")
    sub = make_subcategory(auth_client, cat["id"])
    payload = _event_payload(sub["id"], "2026-07-11T10:00:00")
    r1 = auth_client.post("/api/events", json=payload, headers={"Idempotency-Key": _key()})
    assert r1.status_code == 201
    # Different key → router runs and the (subcategory, client, start_at) dedup
    # short-circuits with 409.
    r2 = auth_client.post("/api/events", json=payload, headers={"Idempotency-Key": _key()})
    assert r2.status_code == 409


def test_delete_replay_returns_cached_response(auth_client):
    cat = make_category(auth_client, name="Кат-del")
    sub = make_subcategory(auth_client, cat["id"])
    ev = auth_client.post(
        "/api/events",
        json=_event_payload(sub["id"], "2026-07-12T10:00:00"),
        headers={"Idempotency-Key": _key()},
    ).json()
    key = _key()
    r1 = auth_client.delete(f"/api/events/{ev['id']}", headers={"Idempotency-Key": key})
    assert r1.status_code == 200
    body1 = r1.json()
    # Even though the event is already gone, the cached 200 is returned.
    r2 = auth_client.delete(f"/api/events/{ev['id']}", headers={"Idempotency-Key": key})
    assert r2.status_code == 200
    assert r2.json() == body1


def test_auth_path_is_skipped(auth_client):
    # /api/auth/* is in SKIP_PREFIXES — header is ignored, no replay behavior.
    key = _key()
    assert auth_client.post("/api/auth/logout", headers={"Idempotency-Key": key}).status_code == 200
    assert auth_client.get("/api/auth/me").json()["authenticated"] is False


def test_purge_idempotency_log(db_session):
    db_session.add_all(
        [
            IdempotencyLog(
                key="old", method="POST", path="/api/x", status=201,
                response_json="null", created_at=now_local() - timedelta(hours=48),
            ),
            IdempotencyLog(
                key="recent", method="POST", path="/api/x", status=201,
                response_json="null", created_at=now_local(),
            ),
        ]
    )
    db_session.commit()
    n = purge_idempotency_log(db_session, ttl_hours=24)
    assert n == 1
    keys = {r.key for r in db_session.query(IdempotencyLog).all()}
    assert keys == {"recent"}
