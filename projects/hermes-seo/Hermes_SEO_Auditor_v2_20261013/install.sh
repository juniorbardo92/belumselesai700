#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BASE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.openclaw/workspace-hermes-seo/scripts/seo_audit.py"
BACKBASE="$HOME/.local/share/hermes-seo/backups"
V1='01867b217ff8ed04d4f9aa26b0eb7554cdc6fc3aadd5b02c35dc298a42b74138'
V2='952a4d3e0c6002f1f9dd621c5e2d14f81b179618198a5221b76c6454099097c6'
[[ "$(id -u)" -ne 0 ]] || { echo 'ERROR: Jangan jalankan dengan sudo/root.' >&2; exit 1; }
[[ -f "$DEST" && ! -L "$DEST" ]] || { echo "ERROR: Auditor tidak ditemukan / merupakan symlink: $DEST" >&2; exit 1; }
[[ -f "$HOME/.config/hermes-seo/seo.env" ]] || { echo 'ERROR: Konfigurasi Hermes SEO tidak ditemukan; instalasi dibatalkan.' >&2; exit 1; }
if systemctl --user is-active --quiet hermes-seo-audit.service; then
  echo 'ERROR: Audit sedang berjalan. Tunggu sampai selesai, lalu ulangi.' >&2
  exit 1
fi
CURRENT="$(sha256sum "$DEST" | awk '{print $1}')"
if [[ "$CURRENT" != "$V1" && "$CURRENT" != "$V2" ]]; then
  echo "STOP: Auditor telah berbeda dari versi dasar yang diuji. SHA256=$CURRENT" >&2
  echo 'Tidak menimpa modifikasi lain. Minta review manual.' >&2
  exit 1
fi
python3 -m unittest discover -s "$BASE/tests" -v
python3 -m py_compile "$BASE/src/seo_audit.py"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
BACK="$BACKBASE/$STAMP"
mkdir -p "$BACK"
chmod 700 "$BACK"
cp -p "$DEST" "$BACK/seo_audit.py"
if [[ "$CURRENT" == "$V2" ]]; then
  echo 'SUDAH_V2: Auditor sama dengan versi patch; tidak diperlukan perubahan.'
  echo "BACKUP=$BACK"
  exit 0
fi
TMP="$(mktemp "$(dirname "$DEST")/.seo_audit_v2.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
cp "$BASE/src/seo_audit.py" "$TMP"
chmod 700 "$TMP"
if ! python3 -m py_compile "$TMP"; then
  echo 'ERROR: Sintaks tidak valid; auditor lama tidak diubah.' >&2
  exit 1
fi
mv -f "$TMP" "$DEST"
trap - EXIT
[[ "$(sha256sum "$DEST" | awk '{print $1}')" == "$V2" ]] || {
  cp -p "$BACK/seo_audit.py" "$DEST"
  echo 'ERROR: SHA256 target tidak cocok, rollback otomatis.' >&2
  exit 1
}
echo "PATCH_OK version=2 source=seo_audit.py backup=$BACK"
echo 'Tidak mengubah website Hostinger, gambar, konfigurasi OpenClaw, timer, maupun kredensial GSC.'
echo 'Langkah berikutnya: bash ./setup_renderer.sh (opsional tetapi diperlukan untuk verifikasi DOM).'
