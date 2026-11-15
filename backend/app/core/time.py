"""Timezone and UTC utilities."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    """Return the current time in UTC with timezone awareness."""
    return datetime.now(UTC)


def to_utc(dt: datetime) -> datetime:
    """Convert an arbitrary datetime to UTC. If naive, assume UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def to_user_timezone(dt: datetime, tz_name: str = "Asia/Kolkata") -> datetime:
    """Convert a UTC or timezone-aware datetime to the user's local timezone."""
    tz = ZoneInfo(tz_name)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(tz)


def format_iso(dt: datetime | None = None) -> str:
    """Format a datetime object as ISO 8601 string. If None, formats current UTC time."""
    target = dt if dt is not None else utc_now()
    return target.isoformat()
