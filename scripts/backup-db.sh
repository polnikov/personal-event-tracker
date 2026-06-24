#!/usr/bin/env bash
# Online backup of the SQLite database.
# Schedule: every 3 days via systemd timer (see event-tracker-backup.timer).
# Retention: 30 days.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/docker/pet}"
DB_PATH="${APP_DIR}/data/events.db"
BACKUP_DIR="${APP_DIR}/backups"
LOG_FILE="${BACKUP_DIR}/backup.log"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y%m%d-%H%M%S)
out="${BACKUP_DIR}/events-${stamp}.db"

log() { printf '[%s] %s\n' "$(date -Is)" "$*" >> "$LOG_FILE"; }

if [ ! -f "$DB_PATH" ]; then
    log "ERROR: database file not found: $DB_PATH"
    exit 1
fi

log "Starting backup of $DB_PATH"

# Use SQLite's online .backup — safe while the app is running and writing.
sqlite3 "$DB_PATH" ".backup '$out'"
gzip -9 "$out"

# Retention sweep.
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -name 'events-*.db.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)

log "Wrote ${out}.gz; pruned ${deleted} backups older than ${RETENTION_DAYS} days"
