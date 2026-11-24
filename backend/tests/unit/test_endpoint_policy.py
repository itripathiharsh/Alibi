"""Provider base URLs the server may call (logic audit 2026-11-24, finding B1).

Host name lookups are replaced with a stub; nothing here touches the network.
"""

import pytest

from app.ai import endpoint_policy
from app.ai.endpoint_policy import (
    UnsafeProviderURLError,
    check_provider_base_url,
    ensure_public_provider_url,
)


@pytest.mark.req("FR-AI-001")
@pytest.mark.parametrize(
    "url",
    [
        "http://api.example.com/v1",  # hosted mode calls https only
        "https://localhost/v1",
        "https://127.0.0.1/v1",
        "https://10.0.0.5/v1",
        "https://192.168.1.10:8443/v1",
        "https://169.254.169.254/latest",  # cloud metadata
        "https://[::1]/v1",
        "https://[fd00::1]/v1",
        "https://metadata/v1",  # bare internal name
        "https://metadata.google.internal/v1",
        "https://printer.local/v1",
        "https://user:pass@api.example.com/v1",
        "ftp://api.example.com/v1",
        "not a url",
        "https://api.example.com:99999/v1",
    ],
)
def test_hosted_mode_refuses_unsafe_addresses(url: str) -> None:
    with pytest.raises(UnsafeProviderURLError):
        check_provider_base_url(url, hosted=True)


@pytest.mark.req("FR-AI-001")
def test_hosted_mode_keeps_public_https_addresses() -> None:
    assert (
        check_provider_base_url(" https://api.groq.com/openai/v1/ ", hosted=True)
        == "https://api.groq.com/openai/v1"
    )
    assert check_provider_base_url("https://8.8.8.8/v1", hosted=True) == "https://8.8.8.8/v1"


@pytest.mark.req("FR-AI-001")
def test_local_mode_allows_a_local_ollama() -> None:
    assert (
        check_provider_base_url("http://localhost:11434/v1", hosted=False)
        == "http://localhost:11434/v1"
    )
    with pytest.raises(UnsafeProviderURLError):
        check_provider_base_url("localhost:11434", hosted=False)


@pytest.mark.req("FR-AI-001")
@pytest.mark.asyncio
async def test_host_names_that_resolve_to_private_addresses_are_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    answers = {"api.example.com": ["93.184.216.34"], "sneaky.example.com": ["10.1.2.3"]}

    async def fake_resolve(host: str, _port: int) -> list[str]:
        if host not in answers:
            raise OSError("no such host")
        return answers[host]

    monkeypatch.setattr(endpoint_policy, "_resolve", fake_resolve)
    assert (
        await ensure_public_provider_url("https://api.example.com/v1", hosted=True)
        == "https://api.example.com/v1"
    )
    with pytest.raises(UnsafeProviderURLError, match="private"):
        await ensure_public_provider_url("https://sneaky.example.com/v1", hosted=True)
    with pytest.raises(UnsafeProviderURLError, match="find"):
        await ensure_public_provider_url("https://missing.example.com/v1", hosted=True)
    # Local mode never looks names up.
    assert (
        await ensure_public_provider_url("http://sneaky.example.com/v1", hosted=False)
        == "http://sneaky.example.com/v1"
    )
