#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" -ne 0 ]] || { echo 'Jalankan sebagai ubuntu bukan root.' >&2; exit 1; }
BACK="${1:-}"
if [[ -z "$BACK" || ! -f "$BACK/seo_audit.py" ]]; then
  echo 'Pemakaian: bash rollback.sh /home/ubuntu/.local/share/hermes-seo/backups/<ID>' >&2
  exit 1
fi
BACK="$(realpath -- "$BACK")"
case "$BACK" in "$HOME/.local/share/hermes-seo/backups/"*) ;; *) echo 'Backup harus berada dalam folder backup Hermes SEO.' >&2; exit 1;; esac
DEST="$HOME/.openclaw/workspace-hermes-seo/scripts/seo_audit.py"
if systemctl --user is-active --quiet hermes-seo-audit.service;then
 echo 'Audit sedang berjalan; tunggu sampai selesai.' >&2;exit 1
fi
cp -p "$BACK/seo_audit.py" "$DEST"
python3 -m py_compile "$DEST"
echo 'ROLLBACK_OK: auditor dipulihkan. Timer dan OAuth tidak diubah.'
