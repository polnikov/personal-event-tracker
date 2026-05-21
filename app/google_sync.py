"""Google Calendar sync — credentials, event mapping, outbox enqueue.

The worker module imports `process_due_outbox_rows` from here and runs it
on a tick (`google_sync_worker.py`). Routers import `enqueue_for_event`
and call it inside their existing DB transactions.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .config import settings
from .models import Event, GoogleAccount, GoogleSyncOutbox, Subcategory

logger = logging.getLogger(__name__)

OpHint = Literal["create", "update", "delete"]

TOKEN_URI = "https://oauth2.googleapis.com/token"


# ───────────────────────── credentials ─────────────────────────


def get_account(db: Session) -> GoogleAccount | None:
    return db.execute(select(GoogleAccount).limit(1)).scalar_one_or_none()


def build_credentials(db: Session) -> Credentials | None:
    """Hydrate a Credentials object from the saved GoogleAccount row.
    Refreshes the access_token if expired and persists the new value."""
    acc = get_account(db)
    if not acc or not acc.refresh_token:
        return None
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        logger.warning("Google client_id/secret not configured")
        return None
    creds = Credentials(
        token=acc.access_token,
        refresh_token=acc.refresh_token,
        token_uri=TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=(acc.scopes or "").split() or settings.GOOGLE_SCOPES,
    )
    if acc.token_expiry:
        creds.expiry = acc.token_expiry
    if not creds.valid:
        try:
            creds.refresh(GoogleRequest())
        except Exception as e:
            logger.exception("Failed to refresh Google credentials: %s", e)
            return None
        acc.access_token = creds.token
        acc.token_expiry = creds.expiry
        db.commit()
    return creds


def build_service(creds: Credentials):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


# ───────────────────────── mapping ─────────────────────────


def _tz():
    try:
        return ZoneInfo(settings.TIMEZONE)
    except Exception:
        return ZoneInfo("UTC")


def _to_local_iso(dt: datetime) -> str:
    """Convert a naive datetime (stored in SQLite as local wall time) to an
    ISO string with timezone offset for Google's `start.dateTime` field."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz())
    return dt.isoformat()


def event_to_google_body(event: Event) -> dict:
    sub = event.subcategory
    cat = sub.category
    end_at = event.start_at + timedelta(minutes=event.duration_minutes)
    body: dict = {
        "summary": f"{cat.name} | {sub.name}",
        "start": {"dateTime": _to_local_iso(event.start_at), "timeZone": settings.TIMEZONE},
        "end": {"dateTime": _to_local_iso(end_at), "timeZone": settings.TIMEZONE},
        "extendedProperties": {"private": {"app_event_id": str(event.id)}},
    }
    if event.notes:
        body["description"] = event.notes
    if event.client:
        body["summary"] += f" · {event.client.full_name}"
    return body


# ───────────────────────── outbox enqueue ─────────────────────────


def enqueue_for_event(db: Session, event: Event, *, op_hint: OpHint) -> None:
    """Append the right outbox rows for a just-mutated event.

    Must be called BEFORE the commit so the new rows land in the same
    transaction as the mutation. Reads `event.subcategory.category` for
    the desired calendar and compares against the snapshot on the event
    itself (google_calendar_id / google_event_id)."""
    desired_cal = event.subcategory.category.google_calendar_id if event.subcategory else None
    actual_cal = event.google_calendar_id
    actual_gid = event.google_event_id

    if op_hint == "delete":
        if actual_cal and actual_gid:
            db.add(GoogleSyncOutbox(
                op="delete",
                calendar_id=actual_cal,
                google_event_id=actual_gid,
                payload_json="{}",
            ))
        return

    body = event_to_google_body(event)
    payload = json.dumps(body, default=str)

    # New event without prior sync.
    if not actual_gid:
        if desired_cal:
            db.add(GoogleSyncOutbox(
                event_id=event.id,
                op="create",
                calendar_id=desired_cal,
                payload_json=payload,
            ))
        return

    # Had a sync, target calendar unchanged → patch in place.
    if actual_cal == desired_cal and desired_cal:
        db.add(GoogleSyncOutbox(
            event_id=event.id,
            op="update",
            calendar_id=desired_cal,
            google_event_id=actual_gid,
            payload_json=payload,
        ))
        return

    # Had a sync, target removed → delete the remote event.
    if not desired_cal:
        db.add(GoogleSyncOutbox(
            op="delete",
            calendar_id=actual_cal,
            google_event_id=actual_gid,
            payload_json="{}",
        ))
        # Clear the snapshot so a future re-enable creates fresh.
        event.google_event_id = None
        event.google_calendar_id = None
        return

    # Calendar moved → delete from old, create in new.
    if actual_cal != desired_cal:
        db.add(GoogleSyncOutbox(
            op="delete",
            calendar_id=actual_cal,
            google_event_id=actual_gid,
            payload_json="{}",
        ))
        db.add(GoogleSyncOutbox(
            event_id=event.id,
            op="create",
            calendar_id=desired_cal,
            payload_json=payload,
        ))
        event.google_event_id = None
        event.google_calendar_id = None


# ───────────────────────── worker tick ─────────────────────────


def _backoff_seconds(attempts: int) -> int:
    # 30s, 60s, 120s, 240s, 480s, … capped at 1h.
    return min(30 * (2 ** max(attempts - 1, 0)), 3600)


def _apply_op(service, row: GoogleSyncOutbox, db: Session) -> tuple[bool, str | None]:
    """Returns (ok, error_message). On success may mutate the event row
    to write back google_event_id/google_calendar_id."""
    try:
        body = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        body = {}

    try:
        if row.op == "create":
            res = service.events().insert(calendarId=row.calendar_id, body=body).execute()
            gid = res.get("id")
            if gid and row.event_id is not None:
                ev = db.get(Event, row.event_id)
                if ev is not None:
                    ev.google_event_id = gid
                    ev.google_calendar_id = row.calendar_id
            return True, None

        if row.op == "update":
            if not row.google_event_id:
                return False, "update row missing google_event_id"
            service.events().patch(
                calendarId=row.calendar_id,
                eventId=row.google_event_id,
                body=body,
            ).execute()
            # Snapshot fields stay in sync via creation row; here calendar_id is unchanged.
            return True, None

        if row.op == "delete":
            if not row.google_event_id:
                return False, "delete row missing google_event_id"
            try:
                service.events().delete(
                    calendarId=row.calendar_id,
                    eventId=row.google_event_id,
                ).execute()
            except HttpError as e:
                if e.resp.status in (404, 410):
                    return True, None
                raise
            return True, None

        return False, f"unknown op: {row.op}"
    except HttpError as e:
        return False, f"google api error {e.resp.status}: {e._get_reason() if hasattr(e, '_get_reason') else str(e)}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def process_due_outbox_rows(db: Session, batch_size: int = 20) -> int:
    """Process up to `batch_size` due outbox rows. Returns the number of
    rows processed (success or failure)."""
    now = datetime.utcnow()
    rows = (
        db.execute(
            select(GoogleSyncOutbox)
            .where(GoogleSyncOutbox.completed_at.is_(None))
            .where(GoogleSyncOutbox.next_attempt_at <= now)
            .order_by(GoogleSyncOutbox.created_at)
            .limit(batch_size)
        )
        .scalars()
        .all()
    )
    if not rows:
        return 0

    creds = build_credentials(db)
    if creds is None:
        # Not connected: mark last_error but don't bump attempts so the
        # rows fire immediately once the user connects.
        for r in rows:
            r.last_error = "Google account is not connected"
            r.next_attempt_at = now + timedelta(seconds=settings.GOOGLE_SYNC_POLL_SECONDS * 6)
        db.commit()
        return len(rows)

    service = build_service(creds)
    processed = 0
    for row in rows:
        ok, err = _apply_op(service, row, db)
        if ok:
            row.completed_at = datetime.utcnow()
            row.last_error = None
        else:
            row.attempts += 1
            row.last_error = err
            row.next_attempt_at = datetime.utcnow() + timedelta(seconds=_backoff_seconds(row.attempts))
        db.commit()
        processed += 1
    return processed


# ───────────────────────── sync-status helper ─────────────────────────


def get_event_sync_statuses(db: Session, event_ids: list[int]) -> dict[int, str]:
    """Map event_id → "ok" | "pending" | "failed" based on open outbox
    rows. Events without open rows map to "ok". Threshold from settings."""
    if not event_ids:
        return {}
    from sqlalchemy import func, case
    threshold = settings.GOOGLE_SYNC_FAIL_THRESHOLD
    rows = db.execute(
        select(
            GoogleSyncOutbox.event_id,
            func.max(GoogleSyncOutbox.attempts).label("max_attempts"),
        )
        .where(GoogleSyncOutbox.completed_at.is_(None))
        .where(GoogleSyncOutbox.event_id.in_(event_ids))
        .group_by(GoogleSyncOutbox.event_id)
    ).all()
    out: dict[int, str] = {}
    for event_id, max_attempts in rows:
        if event_id is None:
            continue
        out[event_id] = "failed" if (max_attempts or 0) >= threshold else "pending"
    return out


# ───────────────────────── calendars list ─────────────────────────


def list_calendars(service) -> list[dict]:
    cals: list[dict] = []
    page_token = None
    while True:
        res = service.calendarList().list(pageToken=page_token, maxResults=250).execute()
        for item in res.get("items", []):
            access = item.get("accessRole")
            if access not in {"owner", "writer"}:
                continue
            cals.append({
                "id": item["id"],
                "summary": item.get("summaryOverride") or item.get("summary") or item["id"],
                "primary": bool(item.get("primary", False)),
                "access_role": access,
            })
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    cals.sort(key=lambda c: (not c["primary"], c["summary"].lower()))
    return cals


def fetch_userinfo_email(creds: Credentials) -> str | None:
    """Resolve the connected account's email via the OpenID userinfo
    endpoint. Returns None on any failure (best-effort)."""
    try:
        import httpx
        headers = {"Authorization": f"Bearer {creds.token}"}
        r = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", headers=headers, timeout=10)
        if r.status_code == 200:
            return r.json().get("email")
    except Exception:
        logger.exception("Failed to fetch userinfo email")
    return None
