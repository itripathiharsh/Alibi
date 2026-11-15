"""Security, Cryptography, and Authentication utilities.
Implements Argon2id, JWT (HS256), SHA-256 refresh tokens, password policy, and rate limiting.
Adheres to doc 12 §2, doc 04 §4.2, and ADR-004.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import argon2
import jwt
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings
from app.core.errors import AppException, RateLimitError, UnauthorizedError
from app.core.time import utc_now
from app.core.uuid import generate_uuid7

# 1. Argon2id Password Hasher (doc 12 §2: time_cost=3, memory_cost=64 MiB, parallelism=2)
_password_hasher = argon2.PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=2,
    hash_len=32,
    type=argon2.Type.ID,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return _password_hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    try:
        return _password_hasher.verify(hashed, password)
    except (VerifyMismatchError, Exception):
        return False


# 2. Password Strength & Policy Validator (doc 04 §4.2: >= 12 chars, top common blacklist)
COMMON_PASSWORDS_BLACKLIST = {
    "password1234",
    "password12345",
    "123456789012",
    "1234567890123",
    "qwertyuiop12",
    "administrator1",
    "welcome123456",
    "changeme1234",
    "iloveyou1234",
    "alibipassword",
    "letmein123456",
    "correcthorsebatterystaple",
}


def validate_password_strength(password: str) -> None:
    """Validate password against policy requirements."""
    if len(password) < 12:
        raise AppException(
            title="Validation Failed",
            status_code=422,
            code="password_too_short",
            detail="Password must be at least 12 characters long.",
        )
    if password.lower() in COMMON_PASSWORDS_BLACKLIST:
        raise AppException(
            title="Validation Failed",
            status_code=422,
            code="password_too_common",
            detail="Password is too common and easily guessable.",
        )


# 3. JWT Access Tokens (HS256 with ALIBI_SECRET_KEY, 15 min TTL)
def create_access_token(
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    ttl_minutes: int | None = None,
) -> str:
    """Create a signed HS256 JWT access token."""
    ttl = ttl_minutes or settings.access_token_ttl_min
    now = utc_now()
    exp = now + timedelta(minutes=ttl)
    payload = {
        "sub": str(user_id),
        "device_id": str(device_id),
        "jti": str(generate_uuid7()),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.alibi_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a signed HS256 JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.alibi_secret_key,
            algorithms=["HS256"],
            options={"require": ["sub", "device_id", "exp", "iat"]},
        )
        return payload
    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedError(detail="Access token has expired", code="token_expired") from e
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError(detail="Invalid access token", code="invalid_token") from e


# 4. Refresh Tokens (256-bit entropy, SHA-256 hashed in database)
def generate_refresh_token() -> tuple[str, bytes]:
    """Generate an opaque 256-bit URL-safe refresh token and its SHA-256 binary hash."""
    raw_token = secrets.token_urlsafe(32)  # 32 bytes -> 43 chars base64url (~256 bits)
    token_hash = hash_refresh_token(raw_token)
    return raw_token, token_hash


def hash_refresh_token(token: str) -> bytes:
    """Compute SHA-256 binary digest of a refresh token."""
    return hashlib.sha256(token.encode("utf-8")).digest()


# 5. Sliding-Window Rate Limiting (AC-M1-4: 6th failed login within 15 min -> 429)
class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 900) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._history: dict[str, list[datetime]] = {}

    def _prune(self, key: str, now: datetime) -> None:
        cutoff = now - timedelta(seconds=self.window_seconds)
        if key in self._history:
            self._history[key] = [ts for ts in self._history[key] if ts > cutoff]
            if not self._history[key]:
                del self._history[key]

    def check(self, key: str) -> None:
        """Check if key has exceeded the allowed attempts. Raises RateLimitError if exceeded."""
        now = datetime.now(UTC)
        self._prune(key, now)
        attempts = self._history.get(key, [])
        if len(attempts) >= self.max_attempts:
            # 6th attempt inside 15 minutes is rejected
            raise RateLimitError(
                detail=f"Too many failed login attempts. Please try again in {self.window_seconds // 60} minutes.",
                retry_after=self.window_seconds,
            )

    def record_failure(self, key: str) -> None:
        """Record a failed attempt for the key."""
        now = datetime.now(UTC)
        self._prune(key, now)
        if key not in self._history:
            self._history[key] = []
        self._history[key].append(now)

    def reset(self, key: str) -> None:
        """Reset failed attempts for key upon successful login."""
        self._history.pop(key, None)


login_rate_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=900)
