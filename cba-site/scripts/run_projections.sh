#!/bin/bash
# Weekly fantasy baseball projection refresh
# Runs every Monday at 3am via crontab

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/proj_env/bin/python3"
LOG="$SCRIPT_DIR/projections_cron.log"

echo "=== $(date) ===" >> "$LOG"

if [ ! -f "$VENV" ]; then
  echo "ERROR: Virtual env not found at $VENV" >> "$LOG"
  exit 1
fi

cd "$SCRIPT_DIR" && "$VENV" generate_projections.py >> "$LOG" 2>&1
echo "Exit code: $?" >> "$LOG"
