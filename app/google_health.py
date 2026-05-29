"""In-memory health state for the Google Calendar connection.

A periodic worker check (and every real sync attempt) validates the stored
credentials and records the outcome here. The /status endpoint reads it so
the UI can show an honest "token invalid" warning instead of a misleading
"connected" based only on a DB row. State is process-local and re-derived
after a restart on the first /status call."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from .clock import now_local

logger = logging.getLogger(__name__)


@dataclass
class CalendarHealth:
    # None = not checked yet this process; True = no problem (connected & valid,
    # or simply not connected); False = an account exists but credentials fail.
    ok: bool | None = None
    reason: str | None = None
    checked_at: datetime | None = None


_health = CalendarHealth()


def get_health() -> CalendarHealth:
    return _health


def record_health(ok: bool, reason: str | None) -> None:
    """Update the cached health, logging the transition into/out of failure
    so server logs carry a notification when the connection breaks."""
    if not ok and _health.ok is not False:
        logger.warning("Google Calendar connection unhealthy: %s", reason)
    elif ok and _health.ok is False:
        logger.info("Google Calendar connection recovered")
    _health.ok = ok
    _health.reason = reason
    _health.checked_at = now_local()
