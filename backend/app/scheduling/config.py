"""Defaults and validation helpers for user-owned schedule preferences."""

from typing import Any

DEFAULT_WORKING_HOURS: dict[str, dict[str, Any]] = {
    "monday": {"enabled": True, "start": "09:00", "end": "17:00"},
    "tuesday": {"enabled": True, "start": "09:00", "end": "17:00"},
    "wednesday": {"enabled": True, "start": "09:00", "end": "17:00"},
    "thursday": {"enabled": True, "start": "09:00", "end": "17:00"},
    "friday": {"enabled": True, "start": "09:00", "end": "17:00"},
    "saturday": {"enabled": False, "start": "09:00", "end": "17:00"},
    "sunday": {"enabled": False, "start": "09:00", "end": "17:00"},
}
DEFAULT_SESSION_BLOCK_MIN = 60


def normalized_working_hours(value: Any) -> dict[str, dict[str, Any]]:
    """Merge partial user settings with defaults without losing weekday preferences."""
    result = {day: dict(hours) for day, hours in DEFAULT_WORKING_HOURS.items()}
    if not isinstance(value, dict):
        return result
    for day, hours in value.items():
        if day in result and isinstance(hours, dict):
            result[day].update(hours)
    return result
