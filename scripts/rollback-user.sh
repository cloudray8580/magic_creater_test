#!/usr/bin/env bash
set -euo pipefail
umask 077
# Must run on the same host. This is a paired code + database rollback, not a schema downgrade.
base="${XDG_DATA_HOME:-$HOME/.local/share}/magic-creater"
config="${XDG_CONFIG_HOME:-$HOME/.config}/magic-creater"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
state=$(realpath "${1:?Pass the saved upgrade-state directory}")
case "$state" in "$base/upgrades/"*) ;; *) printf 'Unexpected upgrade-state location\n' >&2; exit 1;; esac
previous=$(cat "$state/previous-release")
test -f "$previous/dist/server/main.js"
test -f "$state/app.env"
test -f "$state/app.sqlite"
for name in magic-creater.service magic-creater-backup.service magic-creater-backup.timer; do test -f "$state/units/$name"; done
configured_db=$(node --env-file="$state/app.env" -p 'process.env.APP_DATABASE')
test "$configured_db" = "$base/data/app.sqlite"
# Validate the original snapshot before stopping or replacing any current file.
(cd "$previous" && node --input-type=module - "$state/app.sqlite" <<'JS'
import Database from 'better-sqlite3';
const db=new Database(process.argv[2],{readonly:true,fileMustExist:true});
if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw new Error('Rollback snapshot is invalid');
db.close();
JS
)
systemctl --user stop magic-creater-backup.timer magic-creater-backup.service magic-creater.service
# Preserve post-upgrade work for manual recovery; never discard it to restore an old schema.
if [[ -f "$base/data/app.sqlite" ]]; then
  node --env-file="$config/app.env" "$previous/dist/server/backup.js" "$state/displaced-$(date -u +%Y%m%dT%H%M%S%N).sqlite"
fi
cp "$state/app.sqlite" "$base/data/app.sqlite.restore"
rm -f "$base/data/app.sqlite-wal" "$base/data/app.sqlite-shm"
mv "$base/data/app.sqlite.restore" "$base/data/app.sqlite"
cp "$state/app.env" "$config/app.env"
cp "$state/units/"* "$units/"
systemctl --user daemon-reload
systemctl --user start magic-creater.service magic-creater-backup.timer
for attempt in {1..20}; do
 if node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  printf 'Paired rollback ready: %s\n' "$previous"; exit 0
 fi
 sleep 1
done
exit 1
