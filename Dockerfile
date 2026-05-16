# syntax=docker/dockerfile:1.7

# ─── Stage 1: build the React/Vite frontend ────────────────────────────────
FROM node:20-alpine AS web-build
WORKDIR /web

# Install deps with cache-friendly layer order
COPY web/package.json web/package-lock.json* ./
RUN npm ci

# Build
COPY web/ ./
RUN npm run build


# ─── Stage 2: Python runtime ───────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# sqlite3 client is needed for the host-side backup script and useful for
# debugging; tini gives us a clean init for PID 1 signals
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Backend code + migrations
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY alembic.ini ./

# Pre-built static frontend
COPY --from=web-build /web/dist ./web/dist

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
