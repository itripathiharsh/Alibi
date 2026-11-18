"""Authentication & Identity Service.
Implements FR-AUTH-001..005, AC-M1-2, AC-M1-3, AC-M1-4, AC-M1-5, and AC-SEC-2.
"""

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    login_rate_limiter,
    validate_password_strength,
    verify_password,
)
from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.models.category import Category
from app.models.device import Device
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.workspace import Workspace
from app.repositories.audit_log_repo import AuditLogRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.refresh_token_repo import RefreshTokenRepository
from app.repositories.user_repo import UserRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.scheduling.config import DEFAULT_WORKING_HOURS


class AuthService:
    """Service handling user registration, authentication, tokens, and device management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.device_repo = DeviceRepository(session)
        self.token_repo = RefreshTokenRepository(session)
        self.workspace_repo = WorkspaceRepository(session)
        self.audit_repo = AuditLogRepository(session)

    async def get_setup_status(self) -> dict[str, bool]:
        """Check if application needs initial owner setup."""
        count = await self.user_repo.count()
        return {"needs_setup": count == 0}

    async def setup(
        self,
        email: str,
        password: str,
        display_name: str | None = None,
        ip_hash: str | None = None,
    ) -> User:
        """First-time system bootstrap (FR-AUTH-001, AC-M1-2, AC-M1-9)."""
        count = await self.user_repo.count()
        if count > 0:
            raise ForbiddenError(
                detail="Initial setup has already been completed. Use public sign-up to create another account.",
                code="setup_already_completed",
            )

        return await self._create_account(
            email=email,
            password=password,
            display_name=display_name,
            audit_action="user_setup",
            ip_hash=ip_hash,
        )

    async def signup(
        self,
        email: str,
        password: str,
        display_name: str | None = None,
    ) -> User:
        """Create one isolated self-service account (FR-AUTH-007)."""
        return await self._create_account(
            email=email,
            password=password,
            display_name=display_name,
            audit_action="user_signup",
            ip_hash=None,
        )

    async def _create_account(
        self,
        email: str,
        password: str,
        display_name: str | None,
        audit_action: str,
        ip_hash: str | None,
    ) -> User:
        normalized_email = email.strip().lower()
        if await self.user_repo.get_by_email(normalized_email):
            raise ConflictError(
                detail="An account with that email already exists. Sign in or use another email.",
                code="email_already_registered",
            )

        validate_password_strength(password)
        pw_hash = hash_password(password)

        user = User(
            email=normalized_email,
            password_hash=pw_hash,
            display_name=display_name.strip() if display_name else None,
            timezone=settings.alibi_timezone,
            settings={"working_hours": DEFAULT_WORKING_HOURS},
        )
        try:
            async with self.session.begin_nested():
                await self.user_repo.create(user)
        except IntegrityError as err:
            # The unique CITEXT email constraint also protects concurrent sign-ups.
            raise ConflictError(
                detail="An account with that email already exists. Sign in or use another email.",
                code="email_already_registered",
            ) from err

        # 1. Create default workspace
        workspace = Workspace(
            user_id=user.id,
            name="Default",
            is_default=True,
        )
        await self.workspace_repo.create(workspace)

        # 2. Seed 4 mandatory system categories (AC-M1-9, doc 03 §3.2)
        system_categories = [
            Category(
                user_id=user.id,
                workspace_id=workspace.id,
                name="Professional",
                slug="professional",
                is_system=True,
                sharing_class="professional",
                external_ai_allowed=True,
                color="#3B82F6",
                position=1,
            ),
            Category(
                user_id=user.id,
                workspace_id=workspace.id,
                name="Academic",
                slug="academic",
                is_system=True,
                sharing_class="academic",
                external_ai_allowed=True,
                color="#10B981",
                position=2,
            ),
            Category(
                user_id=user.id,
                workspace_id=workspace.id,
                name="Personal",
                slug="personal",
                is_system=True,
                sharing_class="personal",
                external_ai_allowed=False,
                color="#8B5CF6",
                position=3,
            ),
            Category(
                user_id=user.id,
                workspace_id=workspace.id,
                name="Learning",
                slug="learning",
                is_system=True,
                sharing_class="learning",
                external_ai_allowed=True,
                color="#F59E0B",
                position=4,
            ),
        ]
        for cat in system_categories:
            self.session.add(cat)
        await self.session.flush()

        # 3. Log audit event
        await self.audit_repo.record(
            action=audit_action,
            user_id=user.id,
            ip_hash=ip_hash,
            detail={"email": user.email},
        )

        return user

    async def login(
        self,
        email: str,
        password: str,
        device_id: uuid.UUID | None = None,
        device_name: str = "Web Browser",
        platform: str = "web",
        app_version: str | None = None,
        ip_hash: str | None = None,
    ) -> dict[str, Any]:
        """Authenticate user, rotate/issue session tokens, and track client device."""
        normalized_email = email.strip().lower()

        # AC-M1-4: Check rate limit before evaluating password
        login_rate_limiter.check(normalized_email)

        user = await self.user_repo.get_by_email(normalized_email)
        if not user or not verify_password(password, user.password_hash):
            login_rate_limiter.record_failure(normalized_email)
            await self.audit_repo.record(
                action="login_failed",
                user_id=user.id if user else None,
                ip_hash=ip_hash,
                detail={"email": normalized_email},
            )
            raise UnauthorizedError(
                detail="Invalid email or password.",
                code="invalid_credentials",
            )

        # Successful credentials: reset rate limiting
        login_rate_limiter.reset(normalized_email)

        # Resolve or create device
        dev: Device | None = None
        if device_id:
            dev = await self.device_repo.get_by_user_and_id(user.id, device_id)
            if dev:
                dev.last_seen_at = utc_now()
                dev.name = device_name
                dev.platform = platform
                dev.app_version = app_version
                dev.revoked_at = None
                await self.device_repo.update(dev)

        if not dev:
            dev = Device(
                id=device_id or generate_uuid7(),
                user_id=user.id,
                name=device_name,
                platform=platform,
                app_version=app_version,
                last_seen_at=utc_now(),
                last_pull_seq=0,
            )
            await self.device_repo.create(dev)

        # Generate refresh token and token family
        family_id = generate_uuid7()
        raw_refresh, token_hash = generate_refresh_token()
        refresh_expires = utc_now() + timedelta(days=settings.refresh_token_ttl_days)

        token_record = RefreshToken(
            user_id=user.id,
            device_id=dev.id,
            family_id=family_id,
            token_hash=token_hash,
            expires_at=refresh_expires,
        )
        await self.token_repo.create(token_record)

        # Issue access token
        access_token = create_access_token(user_id=user.id, device_id=dev.id)

        # Record successful login audit log
        await self.audit_repo.record(
            action="login_ok",
            user_id=user.id,
            ip_hash=ip_hash,
            detail={"device_id": str(dev.id), "platform": dev.platform},
        )

        return {
            "access_token": access_token,
            "refresh_token": raw_refresh,
            "expires_in": settings.access_token_ttl_min * 60,
            "token_type": "Bearer",
            "user": {
                "id": str(user.id),
                "email": user.email,
                "display_name": user.display_name,
                "timezone": user.timezone,
            },
            "device": {
                "id": str(dev.id),
                "name": dev.name,
                "platform": dev.platform,
            },
        }

    async def refresh_tokens(
        self,
        raw_refresh_token: str,
        ip_hash: str | None = None,
    ) -> dict[str, Any]:
        """Rotate refresh token and issue new access token (AC-M1-3, AC-SEC-2 reuse detection)."""
        token_hash = hash_refresh_token(raw_refresh_token)
        token_record = await self.token_repo.get_by_hash(token_hash)

        if not token_record:
            raise UnauthorizedError(
                detail="Invalid refresh token.",
                code="invalid_token",
            )

        # AC-M1-3 / AC-SEC-2: Token reuse or revocation check
        if token_record.used_at is not None or token_record.revoked_at is not None:
            # Immediate mitigation: revoke the ENTIRE token family
            await self.token_repo.revoke_family(token_record.family_id)
            await self.audit_repo.record(
                action="auth_token_reused",
                user_id=token_record.user_id,
                ip_hash=ip_hash,
                detail={
                    "family_id": str(token_record.family_id),
                    "device_id": str(token_record.device_id),
                },
            )
            raise UnauthorizedError(
                detail="Refresh token reuse detected. All sessions in this family have been revoked.",
                code="token_reused",
            )

        # Expiry check
        if token_record.expires_at < utc_now():
            raise UnauthorizedError(
                detail="Refresh token has expired.",
                code="token_expired",
            )

        # Mark current token as used
        token_record.used_at = utc_now()
        await self.token_repo.update(token_record)

        # Rotate: issue new refresh token with the SAME family_id
        new_raw_refresh, new_token_hash = generate_refresh_token()
        new_expires = utc_now() + timedelta(days=settings.refresh_token_ttl_days)

        new_token_record = RefreshToken(
            user_id=token_record.user_id,
            device_id=token_record.device_id,
            family_id=token_record.family_id,
            token_hash=new_token_hash,
            expires_at=new_expires,
        )
        await self.token_repo.create(new_token_record)

        # Issue new access token
        new_access_token = create_access_token(
            user_id=token_record.user_id,
            device_id=token_record.device_id,
        )

        return {
            "access_token": new_access_token,
            "refresh_token": new_raw_refresh,
            "expires_in": settings.access_token_ttl_min * 60,
            "token_type": "Bearer",
        }

    async def logout(
        self,
        user_id: uuid.UUID,
        device_id: uuid.UUID,
        raw_refresh_token: str | None = None,
        ip_hash: str | None = None,
    ) -> None:
        """Revoke active tokens for device family on logout."""
        if raw_refresh_token:
            token_hash = hash_refresh_token(raw_refresh_token)
            token = await self.token_repo.get_by_hash(token_hash)
            if token:
                await self.token_repo.revoke_family(token.family_id)
        else:
            await self.token_repo.revoke_all_for_device(device_id)

        await self.audit_repo.record(
            action="logout",
            user_id=user_id,
            ip_hash=ip_hash,
            detail={"device_id": str(device_id)},
        )

    async def change_password(
        self,
        user_id: uuid.UUID,
        current_password: str,
        new_password: str,
        ip_hash: str | None = None,
    ) -> None:
        """Change user password, validate policy, and revoke all sessions."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(detail="User not found.")

        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedError(
                detail="Current password is incorrect.",
                code="invalid_credentials",
            )

        validate_password_strength(new_password)
        user.password_hash = hash_password(new_password)
        user.password_changed_at = utc_now()
        await self.user_repo.update(user)

        # Revoke all token families across all devices
        await self.token_repo.revoke_all_for_user(user.id)

        await self.audit_repo.record(
            action="password_changed",
            user_id=user.id,
            ip_hash=ip_hash,
            detail={},
        )

    async def list_devices(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        """List active client devices for user."""
        devices = await self.device_repo.list_active_by_user(user_id)
        return [
            {
                "id": str(d.id),
                "name": d.name,
                "platform": d.platform,
                "app_version": d.app_version,
                "last_seen_at": d.last_seen_at.isoformat(),
                "created_at": d.created_at.isoformat(),
            }
            for d in devices
        ]

    async def revoke_device(
        self,
        user_id: uuid.UUID,
        device_id: uuid.UUID,
        ip_hash: str | None = None,
    ) -> None:
        """Revoke a client device and all its active sessions."""
        device = await self.device_repo.revoke(user_id, device_id)
        if not device:
            raise NotFoundError(detail="Device not found.")

        await self.token_repo.revoke_all_for_device(device_id)

        await self.audit_repo.record(
            action="device_revoked",
            user_id=user_id,
            ip_hash=ip_hash,
            detail={"device_id": str(device_id)},
        )
