"""Single source of truth for "now" in the app's configured timezone.

Event ``start_at`` is stored as naive local (Moscow) wall-clock — the
frontend sends ``yyyy-MM-ddTHH:mm:00`` with no offset. So every "now" used
for comparisons, ordering or timestamp columns must be the same naive local
time, NOT UTC. SQLite's ``func.now()`` (CURRENT_TIMESTAMP) and
``datetime.utcnow()`` both return UTC, which lagged ~3h behind Moscow.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from .config import settings


def _tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.TIMEZONE)
    except Exception:
        return ZoneInfo("UTC")


def now_local() -> datetime:
    """Current wall-clock time in ``settings.TIMEZONE`` as a naive datetime,
    matching how event ``start_at`` is stored."""
    return datetime.now(_tz()).replace(tzinfo=None)
