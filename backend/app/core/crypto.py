"""Symmetric encryption utilities for sensitive secrets (API keys, tokens).

Implements doc 12 §4, ADR-018, and AC-AI-3 using Fernet authenticated encryption.
"""

import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet() -> Fernet:
    """Derive a URL-safe 32-byte Fernet key from settings.alibi_encryption_key."""
    raw_key = settings.alibi_encryption_key.encode("utf-8")
    # Use SHA-256 to ensure exact 32-byte key material, then URL-safe base64 encode
    digest = hashlib.sha256(raw_key).digest()
    b64_key = base64.urlsafe_b64encode(digest)
    return Fernet(b64_key)


def encrypt_api_key(plaintext_key: str) -> tuple[bytes, str]:
    """Encrypt a plaintext API key and extract the last 4 characters for safe display.

    Returns:
        tuple[bytes, str]: (encrypted_blob, key_last4)
    """
    clean_key = plaintext_key.strip()
    if not clean_key:
        raise ValueError("Cannot encrypt an empty key")

    f = _get_fernet()
    encrypted = f.encrypt(clean_key.encode("utf-8"))
    last4 = clean_key[-4:] if len(clean_key) >= 4 else clean_key
    return encrypted, last4


def decrypt_api_key(encrypted_blob: bytes) -> str:
    """Decrypt an encrypted API key back to plaintext for outgoing provider requests."""
    f = _get_fernet()
    decrypted = f.decrypt(encrypted_blob)
    return decrypted.decode("utf-8")
