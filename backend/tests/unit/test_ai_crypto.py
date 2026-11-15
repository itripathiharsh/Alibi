"""Tests for symmetric encryption of API keys (AC-AI-3)."""

import pytest

from app.core.crypto import decrypt_api_key, encrypt_api_key


def test_encrypt_and_decrypt_api_key() -> None:
    plaintext = "gsk_test1234567890abcdef"
    encrypted_blob, last4 = encrypt_api_key(plaintext)

    # Encrypted blob must not contain the plaintext
    assert isinstance(encrypted_blob, bytes)
    assert plaintext.encode("utf-8") not in encrypted_blob
    assert last4 == "cdef"

    # Decryption must restore exact plaintext
    decrypted = decrypt_api_key(encrypted_blob)
    assert decrypted == plaintext


def test_encrypt_short_key() -> None:
    plaintext = "abc"
    encrypted_blob, last4 = encrypt_api_key(plaintext)
    assert last4 == "abc"
    assert decrypt_api_key(encrypted_blob) == "abc"


def test_encrypt_empty_key_fails() -> None:
    with pytest.raises(ValueError, match="Cannot encrypt an empty key"):
        encrypt_api_key("")
