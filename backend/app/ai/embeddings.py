"""Embedding service for semantic search (doc 06 §4, doc 08).

Uses fastembed with BAAI/bge-small-en-v1.5 (384-dim) in local mode.
Gracefully degrades in hosted mode if fastembed is not installed (ADR-020).
"""

import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger("alibi.ai.embeddings")


class EmbeddingService:
    """In-process embedding generator."""

    MODEL_NAME = "BAAI/bge-small-en-v1.5"
    DIMENSION = 384

    def __init__(self) -> None:
        self._model: Any = None
        self._initialized = False

    def _load_model(self) -> None:
        if self._initialized:
            return
        if settings.alibi_mode == "hosted":
            # Hosted mode defers heavy embeddings per ADR-020
            self._initialized = True
            return

        try:
            from fastembed import TextEmbedding  # type: ignore[import-not-found]

            self._model = TextEmbedding(model_name=self.MODEL_NAME)
            logger.info("Fastembed %s initialized successfully", self.MODEL_NAME)
        except Exception as e:
            logger.warning("Could not initialize fastembed: %s. Degraded mode active.", e)
        self._initialized = True

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate 384-dim embeddings for a batch of strings."""
        self._load_model()
        if not texts:
            return []

        if self._model is not None:
            try:
                embeddings = list(self._model.embed(texts))
                return [emb.tolist() for emb in embeddings]
            except Exception as e:
                logger.error("Embedding generation failed: %s", e)

        # Fallback / deterministic zero/hash vectors for test & degraded mode
        return [[0.0] * self.DIMENSION for _ in texts]

    def embed_query(self, query: str) -> list[float]:
        """Embed a single search query."""
        results = self.embed_texts([query])
        return results[0] if results else [0.0] * self.DIMENSION
