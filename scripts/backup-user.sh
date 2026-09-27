#!/usr/bin/env bash
set -euo pipefail
umask 077
base="${XDG_DATA_HOME:-$HOME/.local/share}/magic-creater"
config="${XDG_CONFIG_HOME:-$HOME/.config}/magic-creater"
release=$(systemctl --user show magic-creater.service --property=WorkingDirectory --value)
test -n "$release"
mkdir -p "$base/backups"
# A timer and a manual verification can run within the same second.
destination="$base/backups/magic-$(date -u +%Y%m%dT%H%M%S%NZ).sqlite"
node --env-file="$config/app.env" "$release/dist/server/backup.js" "$destination"
find "$base/backups" -maxdepth 1 -type f -name 'magic-*.sqlite' -mtime +14 -delete
