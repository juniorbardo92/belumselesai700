#!/usr/bin/env bash
# Install the browser dependency without apt, sudo, gateway restart or touching site.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" -ne 0 ]] || { echo 'ERROR: jalankan sebagai ubuntu (tanpa sudo).' >&2; exit 1; }
VENV="$HOME/.local/share/hermes-seo/venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  echo 'Virtualenv Hermes SEO belum ada; membuat venv termasuk dependensi GSC.'
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install --disable-pip-version-check google-auth requests
fi
"$VENV/bin/python" -m pip install --disable-pip-version-check playwright
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1; then
  echo 'Chromium sistem tidak tersedia: mengunduh browser khusus Playwright (ke HOME).'
  "$VENV/bin/python" -m playwright install chromium
fi
"$VENV/bin/python" - <<'PY'
from playwright.sync_api import sync_playwright
import shutil
with sync_playwright() as p:
    try:
        b=p.chromium.launch(headless=True)
    except Exception as e:
        local=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
        if not local or "Executable doesn't exist" not in str(e):
            raise
        b=p.chromium.launch(headless=True, executable_path=local)
    t=b.new_page()
    t.set_content('<div id="root"><h1>UJI LOKAL</h1></div>')
    assert t.locator('h1').text_content()=='UJI LOKAL'
    b.close()
print('RENDERER_READY browser_test=PASS')
PY
