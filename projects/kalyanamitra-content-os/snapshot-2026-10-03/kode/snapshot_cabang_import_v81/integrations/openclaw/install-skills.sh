#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skills/umkm"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
TARGET_DIR="$WORKSPACE/skills/umkm"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source skill directory tidak ditemukan: $SOURCE_DIR" >&2
  exit 1
fi

umask 077
install -d -m 700 "$TARGET_DIR"
cp -a "$SOURCE_DIR/." "$TARGET_DIR/"
chmod 700 "$TARGET_DIR/common/umkm-monetization.mjs"
find "$TARGET_DIR" -type f -name 'SKILL.md' -exec chmod 600 {} \;

printf 'OPENCLAW_SKILLS_INSTALLED=%s\n' "$TARGET_DIR"
printf 'NEXT=openclaw skills check\n'
printf 'REQUIRED_ENV=UMKM_OPENCLAW_TOKEN\n'
