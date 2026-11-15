"""ALIBI Configuration Settings."""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

RuntimeMode = Literal["local", "hosted"]
Environment = Literal["local", "cloud", "test"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core runtime modes
    alibi_mode: RuntimeMode = Field(default="local", alias="ALIBI_MODE")
    alibi_env: Environment = Field(default="local", alias="ALIBI_ENV")
    alibi_timezone: str = Field(default="Asia/Kolkata", alias="ALIBI_TIMEZONE")
    alibi_base_url: str = Field(default="http://localhost:8000", alias="ALIBI_BASE_URL")
    alibi_web_origin: str = Field(default="http://localhost:3000", alias="ALIBI_WEB_ORIGIN")

    # Server binding
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")

    # Security
    alibi_secret_key: str = Field(
        default="change-me-secret-key-32-bytes-min!!", alias="ALIBI_SECRET_KEY"
    )
    alibi_encryption_key: str = Field(default="change-me", alias="ALIBI_ENCRYPTION_KEY")
    access_token_ttl_min: int = Field(default=15, alias="ACCESS_TOKEN_TTL_MIN")
    refresh_token_ttl_days: int = Field(default=30, alias="REFRESH_TOKEN_TTL_DAYS")

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://alibi:change-me@localhost:5433/alibi",
        alias="DATABASE_URL",
    )

    # AI & Privacy Gating (Privacy by default: False)
    ai_external_enabled: bool = Field(default=False, alias="AI_EXTERNAL_ENABLED")

    # App Info
    app_name: str = "ALIBI"
    app_version: str = "0.1.0"


settings = Settings()
