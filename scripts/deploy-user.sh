#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run only on the Linux host after verification. Never put the live DB in the checkout.
repo=$(cd "$(dirname "$0")/.." && pwd)
base="${XDG_DATA_HOME:-$HOME/.local/share}/magic-creater"
config="${XDG_CONFIG_HOME:-$HOME/.config}/magic-creater"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
release="$base/releases/$stamp"
state=""
mkdir -p "$release" "$base/data" "$base/backups" "$config" "$units"
cd "$repo"
git diff --quiet HEAD -- src public package.json package-lock.json scripts
if [[ -n $(git ls-files --others --exclude-standard -- src public scripts) ]]; then
  printf 'Commit release files before deployment.\n' >&2; exit 1
fi
test -f dist/server/main.js
test -f dist/web/index.html
cp -a dist node_modules package.json "$release/"
cp scripts/backup-user.sh "$release/"
git rev-parse HEAD > "$release/COMMIT"
services_touched=0
backup_ready=0
recover_failed_upgrade() {
  result=$?
  trap - EXIT HUP INT TERM
  if [[ $result -ne 0 && $services_touched -eq 1 ]]; then
    if [[ $backup_ready -eq 1 ]]; then
      printf 'Upgrade failed; restoring the paired previous release and database.\n' >&2
      bash "$repo/scripts/rollback-user.sh" "$state" || printf 'Automatic rollback failed; inspect the saved upgrade state and service.\n' >&2
    else
      # No application/config mutation has occurred yet; restart the unchanged old units.
      systemctl --user start magic-creater.service magic-creater-backup.timer || printf 'Could not restart the previous service; inspect systemd.\n' >&2
    fi
  fi
  exit "$result"
}
trap recover_failed_upgrade EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
# Upgrade only the conventional local database; do not silently migrate a different configured DB.
if [[ -f "$base/data/app.sqlite" ]]; then
  test -f "$config/app.env"
  configured_db=$(node --env-file="$config/app.env" -p 'process.env.APP_DATABASE')
  test "$configured_db" = "$base/data/app.sqlite"
  old_release=$(systemctl --user show magic-creater.service --property=WorkingDirectory --value)
  test -f "$old_release/dist/server/main.js"
  for name in magic-creater.service magic-creater-backup.service magic-creater-backup.timer; do test -f "$units/$name"; done
  state="$base/upgrades/$stamp"
  mkdir -p "$state/units"
  cp "$config/app.env" "$state/app.env"
  printf '%s\n' "$old_release" > "$state/previous-release"
  cp "$units/magic-creater.service" "$units/magic-creater-backup.service" "$units/magic-creater-backup.timer" "$state/units/"
  services_touched=1
  systemctl --user stop magic-creater-backup.timer magic-creater-backup.service magic-creater.service
  # Capture after stopping writers, so the paired rollback loses no pre-cutover edit.
  node --env-file="$config/app.env" "$old_release/dist/server/backup.js" "$state/app.sqlite"
  backup_ready=1
fi

if [[ ! -f "$config/app.env" ]]; then
  cat > "$config/app.env" <<EOF
APP_DATABASE=$base/data/app.sqlite
APP_ORIGINS=http://127.0.0.1:4173,http://localhost:4173
APP_STATIC_DIR=$release/dist/web
HOST=127.0.0.1
PORT=4173
NODE_ENV=production
EOF
fi
# The new release always serves its own frontend; data/origins remain operator settings.
sed -i "s|^APP_STATIC_DIR=.*|APP_STATIC_DIR=$release/dist/web|" "$config/app.env"
if [[ ! -f "$base/data/app.sqlite" ]]; then
  node --input-type=module - "$config/bootstrap.env" <<'JS'
import {writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
writeFileSync(process.argv[2],'BOOTSTRAP_USERNAME=teacher\nBOOTSTRAP_PASSWORD='+randomBytes(18).toString('base64url')+'\n',{mode:0o600});
JS
  node --env-file="$config/app.env" --env-file="$config/bootstrap.env" "$release/dist/server/admin.js"
fi
nodepath=$(command -v node)
cat > "$units/magic-creater.service" <<EOF
[Unit]
Description=Magic Creater workshop
After=network.target

[Service]
Type=simple
WorkingDirectory=$release
EnvironmentFile=$config/app.env
ExecStart=$nodepath $release/dist/server/main.js
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=default.target
EOF
cat > "$units/magic-creater-backup.service" <<EOF
[Unit]
Description=Back up Magic Creater SQLite
[Service]
Type=oneshot
ExecStart=/bin/bash $release/backup-user.sh
UMask=0077
EOF
cat > "$units/magic-creater-backup.timer" <<EOF
[Unit]
Description=Daily Magic Creater backup
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now magic-creater-backup.timer
systemctl --user enable magic-creater.service
systemctl --user restart magic-creater.service
for attempt in {1..20}; do
  if node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    trap - EXIT HUP INT TERM
    printf 'Release: %s\nRollback state: %s\n' "$release" "${state:-initial-install}"
    printf 'Service ready. Initial teacher credentials, if created: %s/bootstrap.env\n' "$config"
    exit 0
  fi
  sleep 1
done
printf 'Startup failed; inspect journalctl --user -u magic-creater.service\n' >&2
exit 1
