from app.google_sync import (
    REASON_NO_CLIENT_CONFIG,
    REASON_NOT_CONNECTED,
    build_credentials_with_reason,
    check_calendar_health,
)
from app.models import GoogleAccount


def test_reason_not_connected(db_session):
    creds, reason = build_credentials_with_reason(db_session)
    assert creds is None
    assert reason == REASON_NOT_CONNECTED


def test_reason_no_client_config(db_session):
    # An account row exists but the server has no GOOGLE_CLIENT_ID/SECRET.
    db_session.add(GoogleAccount(refresh_token="x"))
    db_session.commit()
    creds, reason = build_credentials_with_reason(db_session)
    assert creds is None
    assert reason == REASON_NO_CLIENT_CONFIG


def test_health_neutral_when_not_connected(db_session):
    h = check_calendar_health(db_session)
    assert h.ok is True  # nothing connected → not a problem
    assert h.reason is None
    assert h.checked_at is not None


def test_health_unhealthy_when_account_broken(db_session):
    db_session.add(GoogleAccount(refresh_token="x"))
    db_session.commit()
    h = check_calendar_health(db_session)
    assert h.ok is False
    assert h.reason == REASON_NO_CLIENT_CONFIG


def test_status_not_connected_is_valid(auth_client):
    s = auth_client.get("/api/google/status").json()
    assert s["connected"] is False
    assert s["credentials_valid"] is True
    assert s["reason"] is None


def test_status_connected_but_invalid(auth_client, db_session):
    db_session.add(GoogleAccount(refresh_token="x", connected_email="a@b.com"))
    db_session.commit()
    s = auth_client.get("/api/google/status").json()
    assert s["connected"] is True
    assert s["credentials_valid"] is False
    assert s["reason"] == REASON_NO_CLIENT_CONFIG
