"""Background asyncio task that drains the google_sync_outbox table.

Runs inside the FastAPI process via lifespan(). Each tick opens its own
SessionLocal, processes due rows, sleeps for GOOGLE_SYNC_POLL_SECONDS.
"""
from __future__ import annotations

import asyncio
import logging
import time

from .config import settings
from .database import SessionLocal
from .google_sync import check_calendar_health, process_due_outbox_rows
from .idempotency import purge_idempotency_log

logger = logging.getLogger(__name__)

# Validate the Google connection at most this often, independent of whether
# there are outbox rows to process — so a silently-revoked token is noticed
# (and surfaced in /status) even when nothing is being synced.
_HEALTH_CHECK_INTERVAL_SECONDS = 600
_last_health_check: float | None = None

# Module-level event allows enqueue paths to wake the worker immediately
# instead of waiting for the next poll interval. Routers can import
# `kick_worker()` if they want low-latency sync after a mutation.
_wakeup: asyncio.Event | None = None


def kick_worker() -> None:
    if _wakeup is not None:
        try:
            _wakeup.set()
        except RuntimeError:
            pass


def _tick_once() -> None:
    global _last_health_check
    db = SessionLocal()
    try:
        process_due_outbox_rows(db)
        now = time.monotonic()
        if _last_health_check is None or now - _last_health_check >= _HEALTH_CHECK_INTERVAL_SECONDS:
            _last_health_check = now
            try:
                check_calendar_health(db)
            except Exception:
                logger.exception("calendar health check failed")
            try:
                purge_idempotency_log(db)
            except Exception:
                logger.exception("idempotency log purge failed")
    finally:
        db.close()


async def run_sync_worker() -> None:
    global _wakeup
    _wakeup = asyncio.Event()
    logger.info("google sync worker started (poll=%ss)", settings.GOOGLE_SYNC_POLL_SECONDS)
    try:
        while True:
            try:
                await asyncio.to_thread(_tick_once)
            except Exception:
                logger.exception("google sync worker tick failed")
            # Sleep until either the timeout elapses or a router kicks us.
            try:
                await asyncio.wait_for(_wakeup.wait(), timeout=settings.GOOGLE_SYNC_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass
            _wakeup.clear()
    except asyncio.CancelledError:
        logger.info("google sync worker stopped")
        raise
