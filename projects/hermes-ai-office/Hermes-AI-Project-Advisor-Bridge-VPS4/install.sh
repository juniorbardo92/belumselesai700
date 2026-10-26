#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skill"
DEST="$HOME/.hermes/skills/project-advisor-openclaw"
PARENT="$HOME/.hermes/skills"

command -v python3 >/dev/null || { echo 'STOP: python3 missing'; exit 2; }
command -v hermes >/dev/null || { echo 'STOP: Hermes CLI not in PATH'; exit 2; }
command -v openclaw >/dev/null || { echo 'STOP: OpenClaw CLI not in PATH'; exit 2; }
[[ -f "$SOURCE/SKILL.md" && -f "$SOURCE/scripts/bridge.py" ]] || { echo 'STOP: incomplete source package'; exit 2; }
[[ -L "$HOME/.openclaw/workspace/ObsidianVault" || -d "$HOME/.openclaw/workspace/ObsidianVault" ]] || { echo 'STOP: expected ObsidianVault path absent'; exit 2; }

python3 -m py_compile "$SOURCE/scripts/bridge.py"
if [[ -e "$DEST" || -L "$DEST" ]]; then
  echo "STOP: destination already exists, left untouched: $DEST"
  exit 3
fi

umask 077
mkdir -p "$PARENT"
TMP="$(mktemp -d "$PARENT/.project-advisor-openclaw.XXXXXXXX")"
trap '[[ ! -d "$TMP" ]] || rm -rf -- "$TMP"' EXIT
cp -R "$SOURCE/." "$TMP/"
chmod -R go-rwx "$TMP"
mv -- "$TMP" "$DEST"
trap - EXIT
printf 'HERMES_SKILL_INSTALLED=%s\n' "$DEST"
printf 'OPENCLAW_CONFIG_UNCHANGED=TRUE\nHERMES_GATEWAY_RESTARTED=FALSE\n'
printf 'NEXT: hermes skills list | grep project-advisor-openclaw\n'
