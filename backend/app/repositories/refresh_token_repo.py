"""Refresh token repository managing session token lifecycle, rotation, and reuse detection."""

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.refresh_token import RefreshToken


class RefreshTokenRepository:
    """Repository managing cryptographically hashed refresh tokens."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_hash(self, token_hash: bytes) -> RefreshToken | None:
        """Fetch token by its SHA-256 binary hash."""
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, token: RefreshToken) -> RefreshToken:
        """Persist a new refresh token."""
        self.session.add(token)
        await self.session.flush()
        return token

    async def update(self, token: RefreshToken) -> RefreshToken:
        """Update token record."""
        await self.session.flush()
        return token

    async def revoke_family(self, family_id: uuid.UUID) -> int:
        """Revoke all tokens sharing the specified family_id (AC-SEC-2 reuse mitigation)."""
        now = utc_now()
        stmt = (
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(getattr(result, "rowcount", 0))

    async def revoke_all_for_user(
        self, user_id: uuid.UUID, except_family_id: uuid.UUID | None = None
    ) -> int:
        """Revoke all active tokens for user, optionally preserving one family."""
        now = utc_now()
        stmt = update(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        if except_family_id:
            stmt = stmt.where(RefreshToken.family_id != except_family_id)
        stmt = stmt.values(revoked_at=now)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(getattr(result, "rowcount", 0))

    async def revoke_all_for_device(self, device_id: uuid.UUID) -> int:
        """Revoke all active tokens associated with a device."""
        now = utc_now()
        stmt = (
            update(RefreshToken)
            .where(RefreshToken.device_id == device_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(getattr(result, "rowcount", 0))
