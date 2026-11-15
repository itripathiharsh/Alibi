"""Unit tests for UUIDv7 identifier generation and validation."""

import time
import uuid

from app.core.ids import generate_uuidv7, is_valid_uuid, parse_uuid


def test_generate_uuidv7_format() -> None:
    raw_id = generate_uuidv7()
    assert isinstance(raw_id, str)
    parsed = uuid.UUID(raw_id)
    assert parsed.version == 7
    assert is_valid_uuid(raw_id)


def test_generate_uuidv7_monotonic_order() -> None:
    ids = []
    for _ in range(10):
        ids.append(generate_uuidv7())
        time.sleep(0.002)

    # Monotonic lexicographical and timestamp ordering
    for i in range(len(ids) - 1):
        assert ids[i] < ids[i + 1]


def test_parse_uuid_valid_and_invalid() -> None:
    valid_id = generate_uuidv7()
    parsed = parse_uuid(valid_id)
    assert str(parsed) == valid_id
    assert is_valid_uuid("not-a-uuid") is False
