#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo 'ERROR: Jalankan sebagai user ubuntu (tanpa sudo).' >&2; exit 2; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HOME/.openclaw/workspace-hermes-seo"
SCRIPTS="$ROOT/scripts"
REPORTS="$ROOT/reports"
SRC="$HERE/seo_opportunities.py"
DEST="$SCRIPTS/seo_opportunities.py"
[[ -f "$SCRIPTS/seo_audit.py" && -f "$REPORTS/LATEST.json" ]] || { echo 'ERROR: Auditor Hermes SEO v2 atau LATEST.json tidak ditemukan.' >&2; exit 2; }
python3 - "$SRC" <<'PYTEST'
from pathlib import Path
import sys
p = Path(sys.argv[1])
compile(p.read_text(encoding="utf-8"), str(p), "exec")
PYTEST
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$HERE/tests" -v
B="$HOME/.local/share/hermes-seo/backups/$(date +%Y%m%d-%H%M%S)-opt"
mkdir -p "$B" "$SCRIPTS"
if [[ -f "$DEST" ]]; then cp -p "$DEST" "$B/seo_opportunities.py"; fi
# atomic copy; do not edit audit scripts, systemd, OAuth, OpenClaw, website.
TMP="$(mktemp "$SCRIPTS/.seo_opportunities.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
cp "$SRC" "$TMP"
chmod 700 "$TMP"
mv -f "$TMP" "$DEST"
printf 'INSTALL_OK mode=read_only script=%s backup=%s\n' "$DEST" "$B"
printf 'Run: %s "%s" --output "%s"\n' "$HOME/.local/share/hermes-seo/venv/bin/python" "$DEST" "$REPORTS"
