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

    # Google Calendar sync (per-category, app → Google only).
    # When CLIENT_ID/SECRET/REDIRECT_URI are unset, the integration UI
    # is exposed but no OAuth flow can complete — keeps the app usable
    # without Google.
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None
    GOOGLE_SCOPES: list[str] = [
        "https://www.googleapis.com/auth/calendar",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
    ]
    GOOGLE_SYNC_POLL_SECONDS: int = 5
    # An outbox row needs >= this many failed attempts before its event
    # is marked sync_status=failed (otherwise it shows as pending).
    GOOGLE_SYNC_FAIL_THRESHOLD: int = 5

    BASE_DIR: Path = Path(__file__).resolve().parent.parent


settings = Settings()
