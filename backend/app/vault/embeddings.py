"""Embedding service for Knowledge Vault chunks (doc 03 §3.5, doc 08 §1).

Produces 384-dimensional embeddings (matching BAAI/bge-small-en-v1.5).
Supports fastembed when available; falls back gracefully to a deterministic
normalized term-hash embedding when offline or in test environments.
"""

import hashlib
import math
from collections.abc import Sequence
from typing import Any

# Embedding dimension matching BAAI/bge-small-en-v1.5
EMBEDDING_DIM = 384
DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"

_fastembed_model: Any = None
_fastembed_checked: bool = False


def _get_fastembed_model() -> Any:
    global _fastembed_model, _fastembed_checked
    if _fastembed_checked:
        return _fastembed_model
    _fastembed_checked = True
    try:
        from fastembed import TextEmbedding  # type: ignore[import-not-found]

        _fastembed_model = TextEmbedding(model_name=DEFAULT_MODEL)
    except Exception:
        _fastembed_model = None
    return _fastembed_model


def _deterministic_hash_vector(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """Generate a deterministic 384-dim normalized unit vector from text."""
    vec = [0.0] * dim
    words = text.lower().split()
    if not words:
        vec[0] = 1.0
        return vec

    for word in words:
        h = hashlib.sha256(word.encode("utf-8")).digest()
        # Extract multiple floats from hash
        idx = int.from_bytes(h[:4], "big") % dim
        val = (int.from_bytes(h[4:6], "big") - 32768) / 32768.0
        vec[idx] += val

        # Character bigrams
        for j in range(len(word) - 1):
            bg = word[j : j + 2]
            bh = hashlib.md5(bg.encode("utf-8")).digest()
            b_idx = int.from_bytes(bh[:4], "big") % dim
            vec[b_idx] += 0.5

    # Compute Euclidean norm and normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-9:
        vec[0] = 1.0
        return vec
    return [x / norm for x in vec]


def generate_embedding(text: str) -> list[float]:
    """Generate a 384-dimensional vector embedding for a single text."""
    model = _get_fastembed_model()
    if model is not None:
        try:
            embeddings = list(model.embed([text]))
            return [float(x) for x in embeddings[0]]
        except Exception:
            pass
    return _deterministic_hash_vector(text, EMBEDDING_DIM)


def generate_embeddings(texts: Sequence[str]) -> list[list[float]]:
    """Generate 384-dimensional vector embeddings for a batch of texts."""
    model = _get_fastembed_model()
    if model is not None:
        try:
            embeddings = list(model.embed(list(texts)))
            return [[float(x) for x in emb] for emb in embeddings]
        except Exception:
            pass
    return [_deterministic_hash_vector(t, EMBEDDING_DIM) for t in texts]
