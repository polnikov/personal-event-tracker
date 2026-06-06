"""HTTP-level tests for the /api/google router (outbox + disconnect).

The credential/health paths are covered in test_google_health.py; here we
exercise the outbox list/filter and the retry/dismiss/disconnect mutations
without touching the real Google API.
"""
from app.models import GoogleAccount, GoogleSyncOutbox


def _row(db, *, op="create", calendar_id="cal-A", attempts=0, summary="row",
         last_error=None, completed=False):
    from app.clock import now_local

    r = GoogleSyncOutbox(
        op=op,
        calendar_id=calendar_id,
        attempts=attempts,
        summary=summary,
        last_error=last_error,
        completed_at=now_local() if completed else None,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def test_outbox_requires_auth(client):
    assert client.get("/api/google/outbox").status_code in (401, 403)


def test_outbox_lists_and_filters(auth_client, db_session):
    pending = _row(db_session, attempts=0, summary="Pending row")
    failed = _row(db_session, attempts=5, summary="Failed row", last_error="boom")
    done = _row(db_session, attempts=0, summary="Done row", completed=True)

    all_ids = {r["id"] for r in auth_client.get("/api/google/outbox").json()}
    assert {pending.id, failed.id, done.id} <= all_ids

    pending_ids = {
        r["id"] for r in auth_client.get("/api/google/outbox", params={"status": "pending"}).json()
    }
    assert pending.id in pending_ids
    assert failed.id not in pending_ids  # attempts ≥ threshold
    assert done.id not in pending_ids    # already completed

    failed_ids = {
        r["id"] for r in auth_client.get("/api/google/outbox", params={"status": "failed"}).json()
    }
    assert failed_ids == {failed.id} or failed.id in failed_ids
    assert pending.id not in failed_ids


def test_outbox_retry_resets_row(auth_client, db_session):
    row = _row(db_session, attempts=5, summary="Failed", last_error="boom", completed=True)
    assert auth_client.post(f"/api/google/outbox/{row.id}/retry").status_code == 200
    db_session.expire_all()
    fresh = db_session.get(GoogleSyncOutbox, row.id)
    assert fresh.attempts == 0
    assert fresh.completed_at is None
    assert fresh.last_error is None


def test_outbox_dismiss_completes_row(auth_client, db_session):
    row = _row(db_session, attempts=0, summary="Pending")
    assert auth_client.post(f"/api/google/outbox/{row.id}/dismiss").status_code == 200
    db_session.expire_all()
    fresh = db_session.get(GoogleSyncOutbox, row.id)
    assert fresh.completed_at is not None
    assert "dismissed" in (fresh.last_error or "")


def test_outbox_retry_and_dismiss_404(auth_client):
    assert auth_client.post("/api/google/outbox/99999/retry").status_code == 404
    assert auth_client.post("/api/google/outbox/99999/dismiss").status_code == 404


def test_disconnect_removes_account(auth_client, db_session, monkeypatch):
    # Stub the network revoke call so the test stays offline.
    monkeypatch.setattr("app.routers.google.httpx.post", lambda *a, **k: None)
    db_session.add(GoogleAccount(refresh_token="x", connected_email="a@b.com"))
    db_session.commit()

    assert auth_client.get("/api/google/status").json()["connected"] is True
    assert auth_client.post("/api/google/disconnect").status_code == 200
    assert auth_client.get("/api/google/status").json()["connected"] is False
