"""UUID compatibility module re-exporting from app.core.ids."""

from app.core.ids import generate_uuid7, generate_uuidv7, is_valid_uuid, parse_uuid

__all__ = ["generate_uuid7", "generate_uuidv7", "is_valid_uuid", "parse_uuid"]

