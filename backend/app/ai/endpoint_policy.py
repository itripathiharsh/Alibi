"""Which provider addresses the server may call (logic audit 2026-11-24, finding B1).

A user can save their own base URL next to their own API key. In hosted mode the server
makes that request from inside its own network, so the address must be a public https
endpoint: never localhost, a private or link-local range, or an internal host name.
Local mode runs on the user's own computer, where a local Ollama is the whole point, so
any http(s) address is allowed there.

Host names are resolved when an address is saved, tested and used, so a public-looking
name that points at a private address is refused too. A name that changes its answer
between the check and the call (DNS rebinding) is not covered: see KI-049.
"""

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

from app.core.config import settings

_INTERNAL_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan")


class UnsafeProviderURLError(ValueError):
    """The base URL may not be called from this server."""


def _hosted() -> bool:
    return settings.alibi_mode == "hosted"


def _is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    return address.is_global and not address.is_multicast


def check_provider_base_url(url: str, *, hosted: bool | None = None) -> str:
    """Return the cleaned address, or raise UnsafeProviderURLError saying why not."""
    hosted = _hosted() if hosted is None else hosted
    cleaned = url.strip().rstrip("/")
    try:
        parts = urlsplit(cleaned)
        host = (parts.hostname or "").lower().rstrip(".")
        _ = parts.port  # raises ValueError for a malformed port
    except ValueError as exc:
        raise UnsafeProviderURLError("That address is not a valid URL.") from exc
    if parts.scheme not in ("http", "https") or not host:
        raise UnsafeProviderURLError("Use a full address, like https://api.example.com/v1.")
    if parts.username or parts.password:
        raise UnsafeProviderURLError("Put the key in the key field, not in the address.")
    if not hosted:
        return cleaned
    if parts.scheme != "https":
        raise UnsafeProviderURLError("The hosted server only calls https addresses.")
    try:
        ipaddress.ip_address(host.split("%", 1)[0])
        is_ip = True
    except ValueError:
        is_ip = False
    if is_ip:
        if not _is_public_ip(host):
            raise UnsafeProviderURLError("The hosted server cannot call private addresses.")
        return cleaned
    if host == "localhost" or host.endswith(_INTERNAL_SUFFIXES) or "." not in host:
        raise UnsafeProviderURLError("The hosted server cannot call internal host names.")
    return cleaned


async def _resolve(host: str, port: int) -> list[str]:
    """Every address a host name resolves to (tests replace this; no network there)."""
    loop = asyncio.get_running_loop()
    infos = await asyncio.wait_for(
        loop.getaddrinfo(host, port, type=socket.SOCK_STREAM), timeout=3.0
    )
    return [str(info[4][0]) for info in infos]


async def ensure_public_provider_url(url: str, *, hosted: bool | None = None) -> str:
    """check_provider_base_url, plus (in hosted mode) every resolved address is public."""
    hosted = _hosted() if hosted is None else hosted
    cleaned = check_provider_base_url(url, hosted=hosted)
    if not hosted:
        return cleaned
    parts = urlsplit(cleaned)
    host = parts.hostname or ""
    try:
        ipaddress.ip_address(host.split("%", 1)[0])
        return cleaned  # an IP literal was already checked above
    except ValueError:
        pass
    try:
        addresses = await _resolve(host, parts.port or 443)
    except (OSError, TimeoutError) as exc:
        raise UnsafeProviderURLError("Could not find that address.") from exc
    if not addresses or not all(_is_public_ip(address) for address in addresses):
        raise UnsafeProviderURLError("That address points to a private network.")
    return cleaned
