"""Re-exports from app.database.base for backwards compatibility."""

from app.database.base import Base, SyncableMixin

__all__ = ["Base", "SyncableMixin"]
