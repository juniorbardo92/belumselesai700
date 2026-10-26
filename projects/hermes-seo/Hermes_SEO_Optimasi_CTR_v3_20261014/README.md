# Hermes SEO — CTR Opportunity Report v3 (baca saja)

Paket ini **bukan patch website**. Hanya menambahkan `seo_opportunities.py` ke workspace Hermes SEO di VPS 4GB. Kode auditor v2, semua komponen gambar Hostinger, Google OAuth, timer, bot Telegram, dan agen OpenClaw lain **tidak diubah**.

## Instal

1. Upload ZIP ke `/tmp/` lewat PowerShell menggunakan SCP.
2. Di VPS Ubuntu:

```bash
cd ~
mkdir -p /tmp/hermes-seo-opt-v3
python3 -m zipfile -e /tmp/Hermes_SEO_Optimasi_CTR_v3_20261014.zip /tmp/hermes-seo-opt-v3
cd /tmp/hermes-seo-opt-v3/hermes-seo-opt-v3
bash install.sh
```

## Jalankan laporan pertama

Pakai Python dari venv Hermes SEO (sudah memiliki `google-auth` untuk audit GSC):

```bash
PY="$HOME/.local/share/hermes-seo/venv/bin/python"
"$PY" "$HOME/.openclaw/workspace-hermes-seo/scripts/seo_opportunities.py"
cat "$HOME/.openclaw/workspace-hermes-seo/reports/OPPORTUNITIES-LATEST.md"
```

Jika venv belum ada, gunakan Python yang mampu `import google.oauth2.credentials` dan `google.auth.transport.requests`.

Jika OAuth bermasalah, script tetap membuat laporan *offline* berlandaskan data GSC terbaru di LATEST.json, tetapi query per halaman secara jelas ditandai tidak tersedia:

```bash
python3 "$HOME/.openclaw/workspace-hermes-seo/scripts/seo_opportunities.py" --offline
```

Hasil: `reports/OPPORTUNITIES-LATEST.md` dan `reports/OPPORTUNITIES-LATEST.json`.

Data yang diambil: **Search Analytics** dengan scope `webmasters.readonly`, dimensi `query` yang difilter persis satu `page`, maksimal empat permintaan API per eksekusi (bisa atur `--max-pages 1..8`). Tanggal laporan diambil dari `LATEST.json`; tidak mencampur rentang waktu.

### Interpretasi

- `query_status=ok`: ada query dari API, bukan daftar lengkap seluruh query (Google menyembunyikan sebagian query).
- `no_rows_disclosed`: respons tidak mengungkap query, bukan berarti impresi 0.
- `not_fetched`: tidak tersedia kredensial, hasil offline.
- `error`: API query gagal, periksa kode error tanpa mencetak token.
- Judul usulan **hipotesis untuk ditinjau**, bukan patch kode atau perubahan website. Baru diputuskan setelah query relevan dan intent jelas.

### Rollback

Script ini add-on; menghapusnya tidak memengaruhi auditor atau timer:

```bash
rm "$HOME/.openclaw/workspace-hermes-seo/scripts/seo_opportunities.py"
```

Jika sebelumnya pernah memasang versi file yang sama, salin ulang versi terdahulu dari folder `backup` yang dicetak saat instalasi, bukan langsung menghapusnya.
