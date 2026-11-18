"""Unit tests for security, cryptography, and rate limiting (AC-M1-4, AC-M1-5)."""

import time
import uuid

import pytest

from app.core.errors import AppException, RateLimitError, UnauthorizedError
from app.core.security import (
    COMMON_PASSWORDS_BLACKLIST,
    SlidingWindowRateLimiter,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    validate_password_strength,
    verify_password,
)


def test_argon2id_hashing_and_timing() -> None:
    """Verify Argon2id hash generation, verification, and latency (AC-M1-5)."""
    password = "SuperSecurePassword123!"

    start = time.perf_counter()
    hashed = hash_password(password)
    duration = time.perf_counter() - start

    assert hashed.startswith("$argon2id$")
    assert verify_password(password, hashed)
    assert not verify_password("WrongPassword123!", hashed)

    # AC-M1-5: p95 latency check under 400 ms on modern CPU
    assert duration < 0.40, f"Argon2id hashing took {duration:.3f}s, expected < 0.400s"


# req: FR-AUTH-002
def test_password_policy_validation() -> None:
    """Verify the 6-character minimum and blacklist checks (FR-AUTH-002, doc 04 §4.2)."""
    # Too short (< 6)
    with pytest.raises(AppException) as exc_info:
        validate_password_strength("abc12")
    assert exc_info.value.code == "password_too_short"

    validate_password_strength("abc123")

    # Common password in blacklist
    common = next(iter(COMMON_PASSWORDS_BLACKLIST))
    with pytest.raises(AppException) as exc_info:
        validate_password_strength(common)
    assert exc_info.value.code == "password_too_common"

    # Valid password
    validate_password_strength("ValidLongPassword2026!")


def test_jwt_access_tokens() -> None:
    """Verify JWT access token creation, claims, and signature verification."""
    user_id = uuid.uuid4()
    device_id = uuid.uuid4()

    token = create_access_token(user_id=user_id, device_id=device_id, ttl_minutes=15)
    payload = decode_access_token(token)

    assert payload["sub"] == str(user_id)
    assert payload["device_id"] == str(device_id)
    assert "jti" in payload
    assert payload["exp"] > payload["iat"]

    # Invalid token tampering
    with pytest.raises(UnauthorizedError):
        decode_access_token(token + "tampered")


def test_refresh_token_generation_and_hashing() -> None:
    """Verify refresh token 256-bit entropy and SHA-256 hash computation."""
    raw_token, token_hash = generate_refresh_token()

    assert len(raw_token) >= 40
    assert len(token_hash) == 32  # 256 bits

    computed_hash = hash_refresh_token(raw_token)
    assert computed_hash == token_hash


def test_sliding_window_rate_limiter() -> None:
    """Verify AC-M1-4: 6th failed login within 15 min -> 429 RateLimitError."""
    limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=900)
    key = "attacker@example.com"

    # First 5 attempts allowed
    for _ in range(5):
        limiter.check(key)
        limiter.record_failure(key)

    # 6th attempt must trigger RateLimitError (AC-M1-4)
    with pytest.raises(RateLimitError) as exc_info:
        limiter.check(key)
    assert exc_info.value.status_code == 429
    assert exc_info.value.code == "rate_limited"

    # Reset clears history
    limiter.reset(key)
    limiter.check(key)  # Should not raise
