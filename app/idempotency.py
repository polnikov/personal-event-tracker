"""Server-side idempotency for /api mutations.

Clients send an `Idempotency-Key` header (uuid) on every POST/PUT/PATCH/
DELETE. The middleware caches the route's response keyed by that header;
a replay of the same key returns the previously stored response without
re-executing the route. Lets the offline outbox retry safely on flaky
networks without producing duplicate rows.

Skips /api/auth/* and /api/google/* — those flows handle their own
state (OAuth callbacks, session cookies) and don't benefit from replay.
"""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .clock import now_local
from .database import get_db
from .models import IdempotencyLog

logger = logging.getLogger(__name__)

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SKIP_PREFIXES = ("/api/auth", "/api/google")
DEFAULT_TTL_HOURS = 24


@contextmanager
def _open_db(request: Request):
    """Yield a Session through the app's get_db dependency (honours any test
    override so the middleware uses the same engine the routers do)."""
    factory = request.app.dependency_overrides.get(get_db, get_db)
    gen = factory()
    db: Session = next(gen)
    try:
        yield db
    finally:
        try:
            next(gen, None)
        except StopIteration:
            pass


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            request.method not in MUTATING_METHODS
            or not path.startswith("/api/")
            or any(path.startswith(p) for p in SKIP_PREFIXES)
        ):
            return await call_next(request)
        key = request.headers.get("Idempotency-Key") or request.headers.get(
            "idempotency-key"
        )
        if not key:
            return await call_next(request)

        # Replay path: return the stored response when we've seen this key.
        with _open_db(request) as db:
            existing = db.execute(
                select(IdempotencyLog).where(IdempotencyLog.key == key)
            ).scalar_one_or_none()
        if existing is not None:
            payload = json.loads(existing.response_json)
            if payload is None:
                return Response(status_code=existing.status)
            return JSONResponse(content=payload, status_code=existing.status)

        # Run the route, drain its body, then persist + rebuild the response.
        response = await call_next(request)
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        content_type = response.headers.get("content-type", "")
        if response.status_code == 204 or not body:
            payload = None
        elif "application/json" in content_type:
            try:
                payload = json.loads(body)
            except Exception:
                payload = None
        else:
            payload = None

        # Only cache 2xx/4xx outcomes (5xx may be transient — let it retry).
        cacheable = 200 <= response.status_code < 500
        if cacheable:
            with _open_db(request) as db:
                try:
                    db.add(
                        IdempotencyLog(
                            key=key,
                            method=request.method,
                            path=path,
                            status=response.status_code,
                            response_json=json.dumps(
                                payload, ensure_ascii=False, default=str
                            ),
                        )
                    )
                    db.commit()
                except IntegrityError:
                    # Concurrent replay already wrote the same key — fine.
                    db.rollback()
                except Exception:
                    logger.exception("Failed to persist idempotency log entry")
                    db.rollback()

        headers = dict(response.headers)
        headers.pop("content-length", None)
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
        )


def purge_idempotency_log(db: Session, ttl_hours: int = DEFAULT_TTL_HOURS) -> int:
    """Drop entries older than the TTL. Returns the number of rows removed."""
    cutoff = now_local() - timedelta(hours=ttl_hours)
    result = db.execute(delete(IdempotencyLog).where(IdempotencyLog.created_at < cutoff))
    db.commit()
    return result.rowcount or 0
