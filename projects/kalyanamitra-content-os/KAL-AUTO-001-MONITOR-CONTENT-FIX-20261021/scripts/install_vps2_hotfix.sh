#!/usr/bin/env bash
set -Eeuo pipefail
TARGET=/opt/kal-auto-001/publication_monitor.py
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/publication_monitor.py"
EXPECTED_OLD=2403bb7ebc0549659b7127f8332d5cd1549ba145706dc066f7151c01de1948d9
EXPECTED_NEW=627e7eb756e95caa3ca9a2c330128823a1c664797da19d7d6b2a4cc9c1508698
EXPECTED_HOST=VM-0-10-ubuntu
[[ "$(id -u)" = 0 ]] || { echo BLOCKED_RUN_AS_ROOT; exit 3; }
[[ "$(hostname -s)" = "$EXPECTED_HOST" ]] || { echo BLOCKED_WRONG_HOST; exit 3; }
[[ -f "$TARGET" && ! -L "$TARGET" && -f "$SRC" ]] || { echo BLOCKED_FILES_MISSING; exit 3; }
[[ "$(sha256sum "$SRC" | awk '{print $1}')" = "$EXPECTED_NEW" ]] || { echo BLOCKED_CANDIDATE_HASH; exit 3; }
CURRENT="$(sha256sum "$TARGET" | awk '{print $1}')"
if [[ "$CURRENT" = "$EXPECTED_NEW" ]]; then
  echo HOTFIX_ALREADY_INSTALLED_NO_ACTION
  exit 0
fi
[[ "$CURRENT" = "$EXPECTED_OLD" ]] || { echo "BLOCKED_LIVE_MODIFIED sha256=$CURRENT"; exit 3; }
SERVICE=kalauto-publication-monitor.service
TIMER=kalauto-publication-monitor.timer
if systemctl is-active --quiet "$SERVICE"; then
  echo BLOCKED_MONITOR_CURRENTLY_RUNNING_RETRY_LATER
  exit 3
fi
ACTIVE=0
if systemctl is-active --quiet "$TIMER"; then ACTIVE=1; fi
if [[ "$ACTIVE" = 1 ]]; then sudo -n systemctl stop "$TIMER"; fi
on_exit() {
  local ec=$?
  if [[ "$ACTIVE" = 1 ]]; then systemctl start "$TIMER" || true; fi
  return "$ec"
}
trap on_exit EXIT
if systemctl is-active --quiet "$SERVICE"; then
  echo BLOCKED_MONITOR_STARTED_CONCURRENTLY_RETRY_LATER
  exit 3
fi
MODE=$(stat -c '%a' "$TARGET")
BACKUP="${TARGET}.backup-content-param-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a -- "$TARGET" "$BACKUP"
chmod 600 "$BACKUP"
TMP=$(mktemp /opt/kal-auto-001/.publication_monitor.fix.XXXXXXXX)
trap 'rm -f "$TMP"; on_exit' EXIT
install -m "$MODE" -o root -g root "$SRC" "$TMP"
[[ "$(sha256sum "$TMP" | awk '{print $1}')" = "$EXPECTED_NEW" ]] || { echo BLOCKED_CANDIDATE_COPY_CHANGED; exit 3; }
mv -f -- "$TMP" "$TARGET"
[[ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$EXPECTED_NEW" ]] || { echo BLOCKED_VERIFY_FAILED; exit 3; }
echo CONTENT_ACCOUNT_ID_FIX_INSTALLED
echo "NEW_SHA256=$EXPECTED_NEW"
echo "BACKUP=$BACKUP"
echo REPLIZ_WRITE_ATTEMPTS=0
