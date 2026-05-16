from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_SECRET_KEY: str = "dev-secret-change-me-please-32chars-min"
    APP_USERNAME: str = "admin"
    APP_PASSWORD_HASH: str = ""
    DATABASE_URL: str = "sqlite:///./data/events.db"
    TIMEZONE: str = "Europe/Moscow"
    DEBUG: bool = True
    COOKIE_SECURE: bool = False

    BASE_DIR: Path = Path(__file__).resolve().parent.parent


settings = Settings()
