"""Authentication and Identity endpoints.
Implements FR-AUTH-001..005, AC-M1-2, AC-M1-3, AC-M1-4, AC-M1-5, and AC-SEC-2.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_auth_service, get_current_user
from app.core.config import settings
from app.core.errors import UnauthorizedError
from app.core.security import signup_rate_limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    DeviceResponse,
    LoginRequest,
    RefreshRequest,
    SetupRequest,
    SetupStatusResponse,
    SignupRequest,
    TokenRefreshResponse,
    TokenResponse,
    UpdateMeRequest,
    UserProfile,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/signup",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    summary="Create an isolated ALIBI account",
)
async def signup(
    payload: SignupRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserProfile:
    """Create an individual account with private default data (FR-AUTH-007)."""
    client_ip = request.client.host if request.client else "unknown"
    signup_rate_limiter.check(
        client_ip,
        detail="Too many account creation attempts.",
    )
    signup_rate_limiter.record_failure(client_ip)
    user = await auth_service.signup(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
    )
    return UserProfile.model_validate(user)


@router.get(
    "/setup-status",
    response_model=SetupStatusResponse,
    summary="Check initial setup status",
)
async def check_setup_status(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> SetupStatusResponse:
    """Returns whether the application requires owner initialization."""
    res = await auth_service.get_setup_status()
    return SetupStatusResponse(**res)


@router.post(
    "/setup",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    summary="Bootstrap the first ALIBI account",
)
async def initial_setup(
    payload: SetupRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserProfile:
    """First-time owner creation with default workspace and system categories.

    Fails with 403 Forbidden on subsequent invocations (AC-M1-2).
    """
    user = await auth_service.setup(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
        ip_hash=request.client.host if request.client else None,
    )
    return UserProfile.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and issue token pair",
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Authenticate owner, track client device, and issue JWT/refresh tokens.

    Enforces sliding-window rate limiting (AC-M1-4). Sets HttpOnly cookie on web clients.
    """
    auth_result = await auth_service.login(
        email=payload.email,
        password=payload.password,
        device_id=payload.device.id,
        device_name=payload.device.name,
        platform=payload.device.platform,
        app_version=payload.device.app_version,
        ip_hash=request.client.host if request.client else None,
    )

    # Set Secure HttpOnly cookie for web clients
    if payload.device.platform == "web":
        response.set_cookie(
            key="alibi_refresh_token",
            value=auth_result["refresh_token"],
            httponly=True,
            secure=settings.alibi_mode != "local",
            samesite="strict",
            max_age=settings.refresh_token_ttl_days * 86400,
            path="/api/v1/auth",
        )

    return TokenResponse(**auth_result)


@router.post(
    "/refresh",
    response_model=TokenRefreshResponse,
    summary="Rotate refresh token and issue new access token",
)
async def refresh(
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    payload: RefreshRequest | None = None,
    alibi_refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenRefreshResponse:
    """Rotate refresh token. Detects token reuse and revokes entire family (AC-M1-3, AC-SEC-2)."""
    raw_token = (
        payload.refresh_token if payload and payload.refresh_token else None
    ) or alibi_refresh_token
    if not raw_token:
        raise UnauthorizedError(detail="Missing refresh token.", code="missing_token")

    res = await auth_service.refresh_tokens(
        raw_refresh_token=raw_token,
        ip_hash=request.client.host if request.client else None,
    )

    # Update web cookie
    if alibi_refresh_token:
        response.set_cookie(
            key="alibi_refresh_token",
            value=res["refresh_token"],
            httponly=True,
            secure=settings.alibi_mode != "local",
            samesite="strict",
            max_age=settings.refresh_token_ttl_days * 86400,
            path="/api/v1/auth",
        )

    return TokenRefreshResponse(**res)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke active device session family",
)
async def logout(
    response: Response,
    ctx: Annotated[AuthContext, Depends(get_auth_context)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    payload: RefreshRequest | None = None,
    alibi_refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    """Revoke session tokens and clear authentication cookies."""
    raw_token = (
        payload.refresh_token if payload and payload.refresh_token else None
    ) or alibi_refresh_token
    await auth_service.logout(
        user_id=ctx.user.id,
        device_id=ctx.device_id,
        raw_refresh_token=raw_token,
    )
    response.delete_cookie(key="alibi_refresh_token", path="/api/v1/auth")


@router.get(
    "/me",
    response_model=UserProfile,
    summary="Get current user profile and settings",
)
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
) -> UserProfile:
    """Fetch profile of current authenticated user."""
    return UserProfile.model_validate(user)


@router.patch(
    "/me",
    response_model=UserProfile,
    summary="Update user profile settings",
)
async def update_me(
    payload: UpdateMeRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserProfile:
    """Update profile attributes (display name, timezone, custom settings)."""
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.timezone is not None:
        user.timezone = payload.timezone.strip()
    if payload.settings is not None:
        merged = dict(user.settings)
        merged.update(payload.settings)
        user.settings = merged

    await session.flush()
    return UserProfile.model_validate(user)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change password and revoke all sessions",
)
async def change_password(
    payload: ChangePasswordRequest,
    user: Annotated[User, Depends(get_current_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    """Change account password with policy checks and revoke all session tokens."""
    await auth_service.change_password(
        user_id=user.id,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )


@router.get(
    "/devices",
    response_model=list[DeviceResponse],
    summary="List active client devices",
)
async def list_devices(
    user: Annotated[User, Depends(get_current_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> list[DeviceResponse]:
    """List all registered, non-revoked client devices."""
    devices = await auth_service.list_devices(user.id)
    return [DeviceResponse(**d) for d in devices]


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a client device",
)
async def revoke_device(
    device_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    """Revoke a device and all its active refresh tokens."""
    await auth_service.revoke_device(user.id, device_id)
