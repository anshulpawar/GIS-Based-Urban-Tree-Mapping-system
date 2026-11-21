"""
Application Configuration Module.

Loads environment variables using Pydantic Settings, providing strongly-typed
runtime configurations for Supabase PostGIS connection, Google Earth Engine
service credentials, and API server settings.
"""

from functools import lru_cache
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """
    Central application configuration loaded from environment variables and .env file.
    """
    # Application Info
    PROJECT_NAME: str = "GIS Urban Tree Mapping API"
    API_V1_STR: str = "/api"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Supabase PostGIS Configuration
    SUPABASE_URL: str = "https://placeholder-project.supabase.co"
    SUPABASE_KEY: str = "placeholder-key"
    SUPABASE_SECRET_KEY: Optional[str] = None

    # Google Earth Engine (GEE) Service Account Credentials
    GEE_SERVICE_ACCOUNT: Optional[str] = None
    GEE_PRIVATE_KEY_FILE: Optional[str] = "gee-private-key.json"
    GEE_PRIVATE_KEY_PATH: Optional[str] = None
    GEE_PROJECT_ID: Optional[str] = "urban-tree-mapping"

    # Google Gemini AI Configuration
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH) if ENV_FILE_PATH.exists() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Returns a cached singleton instance of the application settings.
    """
    return Settings()

