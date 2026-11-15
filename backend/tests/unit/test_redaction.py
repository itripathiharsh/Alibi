"""Unit tests for structlog sensitive header and credential redaction (AC-M0-6)."""

from app.core.logging import redact_sensitive_data


def test_redact_sensitive_headers() -> None:
    event = {
        "event": "http_request",
        "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret",
        "cookie": "session=sensitive_cookie_value",
        "password": "super-secret-password",
        "nested": {
            "api_key": "groq-test-key-1234",
            "token": "secret-token",
            "public_info": "safe_to_log",
        },
        "user_id": "0193309a-0000-7000-8000-000000000001",
    }

    result = redact_sensitive_data(None, "info", event)

    assert result["authorization"] == "[REDACTED]"
    assert result["cookie"] == "[REDACTED]"
    assert result["password"] == "[REDACTED]"
    assert result["nested"]["api_key"] == "[REDACTED]"
    assert result["nested"]["token"] == "[REDACTED]"
    assert result["nested"]["public_info"] == "safe_to_log"
    assert result["user_id"] == "0193309a-0000-7000-8000-000000000001"
