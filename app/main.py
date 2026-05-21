import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import settings
from .google_sync_worker import run_sync_worker
from .routers.auth_router import router as auth_router, limiter as auth_limiter
from .routers.categories import router as categories_router
from .routers.clients import router as clients_router
from .routers.events import router as events_router
from .routers.dashboard import router as dashboard_router
from .routers.calendar import router as calendar_router
from .routers.google import router as google_router
from .routers.reports import router as reports_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(run_sync_worker())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="Трекер событий API", debug=settings.DEBUG, lifespan=lifespan)

app.state.limiter = auth_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — Vite dev server + production frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.APP_SECRET_KEY,
    session_cookie="event_tracker_session",
    https_only=settings.COOKIE_SECURE,
    same_site="lax",
    max_age=60 * 60 * 24 * 30,
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(calendar_router)
app.include_router(categories_router)
app.include_router(clients_router)
app.include_router(events_router)
app.include_router(reports_router)
app.include_router(google_router)


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"ok": True}


# Serve the built SPA from web/dist when present (production / docker image).
# In dev the directory doesn't exist — Vite serves the frontend on :5173 and
# proxies /api/* here, so we silently skip mounting.
WEB_DIST = settings.BASE_DIR / "web" / "dist"
if WEB_DIST.is_dir():
    INDEX_HTML = WEB_DIST / "index.html"

    app.mount(
        "/assets",
        StaticFiles(directory=WEB_DIST / "assets"),
        name="spa-assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request):
        # Reserve API and health namespaces for the routers above
        if full_path.startswith(("api/", "healthz")):
            raise HTTPException(status_code=404)
        # Serve real files from web/dist when they exist (favicon, manifest,
        # service-worker, icons, etc.); otherwise fall back to index.html so
        # client-side routing handles deep links.
        candidate = WEB_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(INDEX_HTML)
