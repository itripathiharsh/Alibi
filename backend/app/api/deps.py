"""FastAPI dependency injection utilities."""

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.services.auth_service import AuthService
from app.services.category_service import CategoryService

__all__ = [
    "AuthContext",
    "get_auth_context",
    "get_auth_service",
    "get_category_service",
    "get_current_user",
    "get_db",
    "security_scheme",
]

security_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(session: Annotated[AsyncSession, Depends(get_db)]) -> AuthService:
    """Dependency providing an AuthService instance."""
    return AuthService(session)


async def get_category_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CategoryService:
    """Dependency providing a CategoryService instance."""
    return CategoryService(session)


class AuthContext:
    """Container holding authenticated user and active device."""

    def __init__(self, user: User, device_id: uuid.UUID) -> None:
        self.user = user
        self.device_id = device_id

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Validate Bearer JWT access token and return current User."""
    if not credentials or not credentials.credentials:
        raise UnauthorizedError(detail="Missing authorization credentials.", code="missing_token")

    token = credentials.credentials
    payload = decode_access_token(token)

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedError(detail="Token missing subject claim.", code="invalid_token")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError as err:
        raise UnauthorizedError(
            detail="Invalid user ID format in token.", code="invalid_token"
        ) from err

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(user_uuid)
    if not user:
        raise UnauthorizedError(detail="User no longer exists.", code="user_not_found")

    return user


async def get_auth_context(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthContext:
    """Validate token and return AuthContext with User and verified device_id."""
    if not credentials or not credentials.credentials:
        raise UnauthorizedError(detail="Missing authorization credentials.", code="missing_token")

    payload = decode_access_token(credentials.credentials)
    user_id_str = payload.get("sub")
    device_id_str = payload.get("device_id")

    if not user_id_str or not device_id_str:
        raise UnauthorizedError(detail="Incomplete claims in token.", code="invalid_token")

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(uuid.UUID(user_id_str))
    if not user:
        raise UnauthorizedError(detail="User no longer exists.", code="user_not_found")

    dev_uuid = uuid.UUID(device_id_str)
    return AuthContext(user=user, device_id=dev_uuid)
