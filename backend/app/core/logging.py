"""Structured logging with sensitive information redaction."""

import logging
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

SENSITIVE_KEYS = {
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "password",
    "api_key",
    "apikey",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "alibi_secret_key",
    "alibi_encryption_key",
}


def redact_sensitive_data(
    _logger: logging.Logger | None,
    _method_name: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    """Recursively mask sensitive keys in log event dictionaries."""
    return _redact_dict(event_dict)


def _redact_dict(d: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for key, value in list(d.items()):
        lower_key = str(key).lower()
        if lower_key in SENSITIVE_KEYS or any(
            s in lower_key for s in ("password", "secret", "token")
        ):
            d[key] = "[REDACTED]"
        elif isinstance(value, dict):
            d[key] = _redact_dict(value)
        elif isinstance(value, list):
            d[key] = [_redact_item(item) for item in value]
    return d


def _redact_item(item: Any) -> Any:
    if isinstance(item, dict):
        return _redact_dict(item)
    return item


def setup_logging(is_dev: bool = True) -> None:
    """Configure structlog processors and standard library logging routing."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        redact_sensitive_data,
    ]

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = (
        structlog.dev.ConsoleRenderer(colors=True)
        if is_dev
        else structlog.processors.JSONRenderer()
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(structlog.stdlib.ProcessorFormatter(processor=formatter))

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)


logger = structlog.get_logger()
