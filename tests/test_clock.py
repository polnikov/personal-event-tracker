from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.clock import now_local


def test_now_local_is_naive():
    assert now_local().tzinfo is None


def test_now_local_matches_moscow_walltime():
    expected = datetime.now(ZoneInfo("Europe/Moscow")).replace(tzinfo=None)
    assert abs((now_local() - expected).total_seconds()) < 5


def test_now_local_is_utc_plus_3():
    utc = datetime.now(timezone.utc).replace(tzinfo=None)
    diff_hours = round((now_local() - utc).total_seconds() / 3600)
    assert diff_hours == 3
