"""User repository for authentication and owner profile operations."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    """Repository managing User entity persistence."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        """Fetch user by primary key."""
        stmt = select(User).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        """Fetch user by case-insensitive email."""
        stmt = select(User).where(User.email == email.strip().lower())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def count(self) -> int:
        """Count total registered users (used for setup gating)."""
        stmt = select(func.count(User.id))
        result = await self.session.execute(stmt)
        count_val = result.scalar()
        return count_val if count_val is not None else 0

    async def create(self, user: User) -> User:
        """Persist a new user account."""
        self.session.add(user)
        await self.session.flush()
        return user

    async def update(self, user: User) -> User:
        """Update an existing user account."""
        await self.session.flush()
        return user
