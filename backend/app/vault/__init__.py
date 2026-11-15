"""Knowledge Vault package (doc 08)."""

from app.vault.chunking import chunk_text
from app.vault.embeddings import generate_embedding, generate_embeddings
from app.vault.ingest import VaultIngestionService, compute_content_hash
from app.vault.search import VaultSearchResult, VaultSearchService

__all__ = [
    "chunk_text",
    "generate_embedding",
    "generate_embeddings",
    "compute_content_hash",
    "VaultIngestionService",
    "VaultSearchResult",
    "VaultSearchService",
]
