"""Unit tests for UTC and timezone conversion utilities."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.core.time import format_iso, to_user_timezone, to_utc, utc_now


def test_utc_now_is_timezone_aware() -> None:
    now = utc_now()
    assert now.tzinfo is not None
    assert now.tzinfo == UTC


def test_to_utc_conversion() -> None:
    naive = datetime(2026, 11, 15, 12, 0, 0)
    utc_dt = to_utc(naive)
    assert utc_dt.tzinfo == UTC
    assert utc_dt.hour == 12

    ist = ZoneInfo("Asia/Kolkata")
    ist_dt = datetime(2026, 11, 15, 17, 30, 0, tzinfo=ist)
    converted = to_utc(ist_dt)
    assert converted.tzinfo == UTC
    assert converted.hour == 12  # 17:30 IST is 12:00 UTC


def test_to_user_timezone() -> None:
    utc_dt = datetime(2026, 11, 15, 12, 0, 0, tzinfo=UTC)
    ist_dt = to_user_timezone(utc_dt, "Asia/Kolkata")
    assert ist_dt.hour == 17
    assert ist_dt.minute == 30


def test_format_iso() -> None:
    iso = format_iso()
    assert "T" in iso
    parsed = datetime.fromisoformat(iso)
    assert parsed.tzinfo is not None
