"""UUIDv7 Identifier utilities per RFC 9562."""

import uuid

import uuid6


def generate_uuid7() -> uuid.UUID:
    """Generate a time-ordered UUIDv7 as a UUID object."""
    return uuid6.uuid7()


def generate_uuidv7() -> str:
    """Generate a time-ordered UUIDv7 as a string."""
    return str(uuid6.uuid7())


def is_valid_uuid(val: str | uuid.UUID) -> bool:
    """Validate whether a value is a valid UUID."""
    try:
        if isinstance(val, uuid.UUID):
            return True
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def parse_uuid(val: str | uuid.UUID) -> uuid.UUID:
    """Parse a string into a UUID object, raising ValueError if invalid."""
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))
