"""Google Calendar OAuth + outbox introspection endpoints."""
from __future__ import annotations

import logging
import secrets
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..clock import now_local
from ..config import settings
from ..database import get_db
from ..google_health import get_health, record_health
from ..google_sync import (
    build_credentials,
    build_service,
    check_calendar_health,
    fetch_userinfo_email,
    get_account,
    list_calendars,
)
from ..google_sync_worker import kick_worker
from ..models import Event, GoogleAccount, GoogleSyncOutbox
from ..schemas import GoogleCalendarOption, GoogleOutboxRow, GoogleStatus

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/google",
    tags=["google"],
    dependencies=[Depends(require_auth)],
)

# Callback is a top-level navigation FROM Google, not an API call from
# the SPA. Even when the user's session is fine, we don't want the
# auth dependency to short-circuit before we can return a clean
# RedirectResponse with status/reason — state validation handles
# CSRF on this endpoint.
callback_router = APIRouter(prefix="/api/google", tags=["google"])


# ───────────────────────── helpers ─────────────────────────


def _flow() -> Flow:
    if not (
        settings.GOOGLE_CLIENT_ID
        and settings.GOOGLE_CLIENT_SECRET
        and settings.GOOGLE_REDIRECT_URI
    ):
        raise HTTPException(500, "Google OAuth env vars are not configured")
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=settings.GOOGLE_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )


# ───────────────────────── status ─────────────────────────


@router.get("/status", response_model=GoogleStatus)
def status(db: Session = Depends(get_db)):
    acc = get_account(db)
    # Counters use the same threshold as serializer.get_event_sync_statuses
    # so the badge in nav matches "failed" in event rows.
    threshold = settings.GOOGLE_SYNC_FAIL_THRESHOLD
    pending = db.execute(
        select(func.count())
        .select_from(GoogleSyncOutbox)
        .where(GoogleSyncOutbox.completed_at.is_(None))
        .where(GoogleSyncOutbox.attempts < threshold)
    ).scalar_one()
    failed = db.execute(
        select(func.count())
        .select_from(GoogleSyncOutbox)
        .where(GoogleSyncOutbox.completed_at.is_(None))
        .where(GoogleSyncOutbox.attempts >= threshold)
    ).scalar_one()
    # Reflect the real credential state. Use the cached health when available
    # (kept fresh by the worker / sync attempts) and validate once inline after
    # a restart so the very first poll is honest.
    health = get_health()
    if health.checked_at is None:
        health = check_calendar_health(db)
    return GoogleStatus(
        connected=acc is not None,
        email=acc.connected_email if acc else None,
        pending=pending,
        failed=failed,
        credentials_valid=health.ok if health.ok is not None else True,
        reason=health.reason,
    )


# ───────────────────────── oauth flow ─────────────────────────


@router.get("/oauth/start")
def oauth_start(request: Request):
    flow = _flow()
    state = secrets.token_urlsafe(24)
    request.session["google_oauth_state"] = state
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return RedirectResponse(auth_url, status_code=302)


@callback_router.get("/oauth/callback")
def oauth_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    expected_state = request.session.pop("google_oauth_state", None)
    if error:
        return RedirectResponse(f"/settings/google?status=error&reason={error}", status_code=302)
    if not code or not state or state != expected_state:
        return RedirectResponse("/settings/google?status=error&reason=state_mismatch", status_code=302)

    flow = _flow()
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.exception("OAuth token exchange failed")
        return RedirectResponse(f"/settings/google?status=error&reason={type(e).__name__}", status_code=302)

    creds = flow.credentials
    if not creds.refresh_token:
        # Google only emits refresh_token once per user unless prompt=consent.
        # We always pass prompt=consent so this should be rare, but if hit
        # we keep any existing refresh_token from the prior connection.
        existing = get_account(db)
        if not existing or not existing.refresh_token:
            return RedirectResponse(
                "/settings/google?status=error&reason=no_refresh_token", status_code=302
            )

    email = fetch_userinfo_email(creds)

    acc = get_account(db)
    if acc is None:
        acc = GoogleAccount(refresh_token=creds.refresh_token or "")
        db.add(acc)
    else:
        if creds.refresh_token:
            acc.refresh_token = creds.refresh_token
    acc.access_token = creds.token
    acc.token_expiry = creds.expiry
    acc.scopes = " ".join(creds.scopes or settings.GOOGLE_SCOPES)
    acc.connected_email = email
    db.commit()
    record_health(True, None)
    kick_worker()
    return RedirectResponse("/settings/google?status=ok", status_code=302)


class ManualConnectPayload(BaseModel):
    refresh_token: str
    email: str | None = None
    scopes: list[str] | None = None


@router.post("/manual-connect")
def manual_connect(payload: ManualConnectPayload, db: Session = Depends(get_db)):
    """Accept a pre-obtained refresh_token (e.g. produced by
    scripts/google_oauth_local.py running on the user's dev machine).
    Validates it by exchanging for an access_token, then saves.

    Useful when the browser OAuth round-trip through the public Funnel
    URL loses the session cookie — the user can run the local script
    and paste the resulting token here without dealing with redirects."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth env vars are not configured")
    token = payload.refresh_token.strip()
    if not token:
        raise HTTPException(400, "refresh_token is empty")
    scopes = payload.scopes or settings.GOOGLE_SCOPES
    creds = Credentials(
        token=None,
        refresh_token=token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=scopes,
    )
    try:
        creds.refresh(GoogleRequest())
    except Exception as e:
        logger.exception("Manual refresh_token validation failed")
        raise HTTPException(400, f"Token is invalid: {type(e).__name__}: {e}")

    email = payload.email or fetch_userinfo_email(creds)

    acc = get_account(db)
    if acc is None:
        acc = GoogleAccount(refresh_token=token)
        db.add(acc)
    else:
        acc.refresh_token = token
    acc.access_token = creds.token
    acc.token_expiry = creds.expiry
    acc.scopes = " ".join(creds.scopes or scopes)
    acc.connected_email = email
    db.commit()
    record_health(True, None)
    kick_worker()
    return {"ok": True, "email": email}


@router.post("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    acc = get_account(db)
    if not acc:
        return {"ok": True}
    # Best-effort revoke.
    try:
        token = acc.access_token or acc.refresh_token
        if token:
            httpx.post(
                "https://oauth2.googleapis.com/revoke",
                params={"token": token},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
    except Exception:
        logger.exception("Token revoke failed (ignored)")
    db.delete(acc)
    db.commit()
    record_health(True, None)  # nothing connected → no problem to flag
    return {"ok": True}


# ───────────────────────── calendars list ─────────────────────────


@router.get("/calendars", response_model=list[GoogleCalendarOption])
def calendars(db: Session = Depends(get_db)):
    creds = build_credentials(db)
    if creds is None:
        raise HTTPException(409, "Google account is not connected")
    service = build_service(creds)
    try:
        items = list_calendars(service)
    except Exception as e:
        logger.exception("Failed to list calendars")
        raise HTTPException(502, f"Failed to list calendars: {e}")
    return [GoogleCalendarOption(**c) for c in items]


# ───────────────────────── outbox introspection ─────────────────────────


@router.get("/outbox", response_model=list[GoogleOutboxRow])
def outbox(
    status: Literal["all", "pending", "failed"] = Query("all"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    threshold = settings.GOOGLE_SYNC_FAIL_THRESHOLD
    stmt = select(GoogleSyncOutbox, Event).outerjoin(Event, Event.id == GoogleSyncOutbox.event_id)
    if status == "pending":
        stmt = stmt.where(GoogleSyncOutbox.completed_at.is_(None)).where(
            GoogleSyncOutbox.attempts < threshold
        )
    elif status == "failed":
        stmt = stmt.where(GoogleSyncOutbox.completed_at.is_(None)).where(
            GoogleSyncOutbox.attempts >= threshold
        )
    stmt = stmt.order_by(GoogleSyncOutbox.created_at.desc()).limit(limit).offset(offset)
    rows = db.execute(stmt).all()
    out: list[GoogleOutboxRow] = []
    for row, event in rows:
        # Prefer the snapshot captured at enqueue time so deleted events still
        # show a meaningful title. Fall back to the live join (legacy rows
        # written before the snapshot column existed have summary = NULL).
        summary = row.summary
        client_name = None
        subcategory_label = None
        event_start_at = None
        if event is not None and event.subcategory is not None:
            cat = event.subcategory.category
            subcategory_label = f"{cat.name} · {event.subcategory.name}"
            if event.client is not None:
                client_name = event.client.full_name
            event_start_at = event.start_at
            if not summary:
                summary = f"{cat.name} | {event.subcategory.name}"
                if client_name:
                    summary += f" · {client_name}"
        out.append(
            GoogleOutboxRow(
                id=row.id,
                op=row.op,
                calendar_id=row.calendar_id,
                event_id=row.event_id,
                event_summary=summary,
                client_name=client_name,
                subcategory_label=subcategory_label,
                event_start_at=event_start_at,
                google_event_id=row.google_event_id,
                attempts=row.attempts,
                last_error=row.last_error,
                created_at=row.created_at,
                completed_at=row.completed_at,
                next_attempt_at=row.next_attempt_at,
            )
        )
    return out


@router.post("/outbox/{row_id}/retry")
def retry_outbox(row_id: int, db: Session = Depends(get_db)):
    row = db.get(GoogleSyncOutbox, row_id)
    if not row:
        raise HTTPException(404)
    row.attempts = 0
    row.next_attempt_at = now_local()
    row.last_error = None
    row.completed_at = None
    db.commit()
    kick_worker()
    return {"ok": True}


@router.post("/outbox/{row_id}/dismiss")
def dismiss_outbox(row_id: int, db: Session = Depends(get_db)):
    row = db.get(GoogleSyncOutbox, row_id)
    if not row:
        raise HTTPException(404)
    row.completed_at = now_local()
    row.last_error = (row.last_error or "") + " | dismissed by user"
    db.commit()
    return {"ok": True}
