"""Shared pytest fixtures.

Each test gets a fresh in-memory SQLite database built by running the real
Alembic migrations (not ``Base.metadata.create_all``), so the schema under
test matches production. A ``StaticPool`` keeps the single in-memory
connection alive for the engine's lifetime; the migration run, the app's
``get_db`` override and direct ``db_session`` access all share it.
"""
from __future__ import annotations

import os
from pathlib import Path

# Environment must be set BEFORE app.config (and thus settings) is imported.
BASE_DIR = Path(__file__).resolve().parents[1]

from argon2 import PasswordHasher  # noqa: E402  (cheap, no app import)

TEST_USERNAME = "admin"
TEST_PASSWORD = "test-password-123"

os.environ["APP_USERNAME"] = TEST_USERNAME
os.environ["APP_PASSWORD_HASH"] = PasswordHasher().hash(TEST_PASSWORD)
os.environ["APP_SECRET_KEY"] = "test-secret-key-that-is-at-least-32-characters"
os.environ["DATABASE_URL"] = "sqlite://"  # overridden by the injected engine
# Leave Google OAuth unset so the sync worker stays dormant.

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.auth_router import limiter as auth_limiter  # noqa: E402


@pytest.fixture()
def engine():
    """Fresh in-memory DB migrated to head via Alembic."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "migrations"))
    cfg.attributes["connection"] = eng
    command.upgrade(cfg, "head")
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture()
def Session(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def db_session(Session):
    """Direct ORM session for unit-style tests (e.g. outbox prune)."""
    s = Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def client(engine, Session):
    """TestClient with get_db pointed at the in-memory DB and login rate
    limiting disabled. Instantiated without a context manager so the FastAPI
    lifespan (and its background Google-sync worker) does not start."""
    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    prev_enabled = auth_limiter.enabled
    auth_limiter.enabled = False
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        auth_limiter.enabled = prev_enabled


@pytest.fixture()
def auth_client(client):
    """Logged-in TestClient (session cookie set)."""
    r = client.post(
        "/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return client


@pytest.fixture(autouse=True)
def _reset_google_health():
    """Google connection health is process-global; reset it between tests so
    one test's recorded state can't leak into another."""
    from app import google_health

    google_health._health.ok = None
    google_health._health.reason = None
    google_health._health.checked_at = None
    yield
