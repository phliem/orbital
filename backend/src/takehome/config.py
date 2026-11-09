from __future__ import annotations

from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://orbital:orbital@db:5432/orbital_takehome"
    llm_provider: Literal["anthropic", "openai"] = "anthropic"
    anthropic_api_key: SecretStr = SecretStr("")
    openai_api_key: SecretStr = SecretStr("")
    upload_dir: str = "uploads"
    max_upload_size: int = 25 * 1024 * 1024  # 25MB

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
