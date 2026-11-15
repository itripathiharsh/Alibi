"""Device repository for client device tracking and session binding."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.device import Device


class DeviceRepository:
    """Repository managing client devices."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, device_id: uuid.UUID) -> Device | None:
        """Fetch device by primary key."""
        stmt = select(Device).where(Device.id == device_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_and_id(self, user_id: uuid.UUID, device_id: uuid.UUID) -> Device | None:
        """Fetch device strictly scoped to user."""
        stmt = select(Device).where(Device.id == device_id, Device.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active_by_user(self, user_id: uuid.UUID) -> Sequence[Device]:
        """List active (non-revoked) devices for user."""
        stmt = (
            select(Device)
            .where(Device.user_id == user_id, Device.revoked_at.is_(None))
            .order_by(Device.last_seen_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, device: Device) -> Device:
        """Register a new device."""
        self.session.add(device)
        await self.session.flush()
        return device

    async def update(self, device: Device) -> Device:
        """Update existing device state."""
        await self.session.flush()
        return device

    async def revoke(self, user_id: uuid.UUID, device_id: uuid.UUID) -> Device | None:
        """Revoke a device."""
        device = await self.get_by_user_and_id(user_id, device_id)
        if device and device.revoked_at is None:
            device.revoked_at = utc_now()
            await self.session.flush()
        return device
