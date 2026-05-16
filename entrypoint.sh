#!/usr/bin/env sh
set -e

# Make sure the data directory (mounted as a bind volume in compose) exists
mkdir -p /app/data

# Apply DB migrations. Idempotent — safe to run on every start.
alembic upgrade head

exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --proxy-headers \
    --forwarded-allow-ips="*"
