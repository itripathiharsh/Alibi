"""Pydantic schemas for Authentication, Users, and Devices."""

import uuid
from datetime import time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_REGEX = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"


class SetupStatusResponse(BaseModel):
    needs_setup: bool


class SetupRequest(BaseModel):
    email: str = Field(
        ...,
        pattern=EMAIL_REGEX,
        description="Owner email address",
    )
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    display_name: str | None = Field(default=None, max_length=100)


class SignupRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, description="Account email address")
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    display_name: str | None = Field(default=None, max_length=100)


class DeviceInfo(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(default="Web Browser", max_length=100)
    platform: Literal["android", "web"] = "web"
    app_version: str | None = Field(default=None, max_length=50)


class LoginRequest(BaseModel):
    email: str = Field(
        ...,
        pattern=EMAIL_REGEX,
        description="User email address",
    )
    password: str
    device: DeviceInfo = Field(default_factory=DeviceInfo)


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    timezone: str
    settings: dict[str, Any] = Field(default_factory=dict)


class DeviceProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    platform: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"
    user: UserProfile | None = None
    device: DeviceProfile | None = None


class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=50)
    settings: dict[str, Any] | None = None


class WorkingDaySettings(BaseModel):
    enabled: bool
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def end_after_start(self) -> "WorkingDaySettings":
        if self.enabled and time.fromisoformat(self.end) <= time.fromisoformat(self.start):
            raise ValueError("Working hours must end after they start.")
        return self


class UserSettings(BaseModel):
    model_config = ConfigDict(extra="allow")

    working_hours: dict[str, WorkingDaySettings] | None = None
    min_block_min: int | None = Field(default=None, ge=15, le=240)
    max_daily_focus_min: int | None = Field(default=None, ge=30, le=1440)
    reminder_lead_min: int | None = Field(default=None, ge=0, le=10080)

    @field_validator("working_hours")
    @classmethod
    def validate_weekdays(
        cls, value: dict[str, WorkingDaySettings] | None
    ) -> dict[str, WorkingDaySettings] | None:
        if value is None:
            return value
        weekdays = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
        if set(value).difference(weekdays):
            raise ValueError("Working hours must use weekday names.")
        return value


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    platform: str
    app_version: str | None
    last_seen_at: str
    created_at: str
