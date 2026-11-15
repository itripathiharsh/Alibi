"""Unit tests for Quiet Hours suppression and Notification scheduling (AC-M8-5)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.notifications.service import is_in_quiet_hours


def test_quiet_hours_suppresses_nighttime_notifications() -> None:
    tz = ZoneInfo("Asia/Kolkata")
    # 23:30 IST is during quiet hours (22:00 -> 07:00)
    night_dt = datetime(2026, 11, 16, 23, 30, tzinfo=tz)
    assert is_in_quiet_hours(night_dt) is True

    # 03:00 IST is during quiet hours
    early_am_dt = datetime(2026, 11, 16, 3, 0, tzinfo=tz)
    assert is_in_quiet_hours(early_am_dt) is True

    # 14:00 IST is NOT during quiet hours
    day_dt = datetime(2026, 11, 16, 14, 0, tzinfo=tz)
    assert is_in_quiet_hours(day_dt) is False


def test_quiet_hours_boundary_conditions() -> None:
    tz = ZoneInfo("Asia/Kolkata")
    # Exactly 22:00 -> quiet
    assert is_in_quiet_hours(datetime(2026, 11, 16, 22, 0, tzinfo=tz)) is True
    # 06:59 -> quiet
    assert is_in_quiet_hours(datetime(2026, 11, 16, 6, 59, tzinfo=tz)) is True
    # Exactly 07:00 -> NOT quiet
    assert is_in_quiet_hours(datetime(2026, 11, 16, 7, 0, tzinfo=tz)) is False
    # 21:59 -> NOT quiet
    assert is_in_quiet_hours(datetime(2026, 11, 16, 21, 59, tzinfo=tz)) is False
