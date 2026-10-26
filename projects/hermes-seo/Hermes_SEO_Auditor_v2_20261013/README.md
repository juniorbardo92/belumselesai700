# Hermes SEO — Auditor v2, RAW vs DOM (13 Oktober 2026)

**Tujuan**: Memperbaiki KLASIFIKASI hasil audit dari Hermes SEO yang sudah berjalan, tanpa mengubah situs Hostinger, fitur gambar, Meta Pixel, Google Analytics, kredensial GSC, `run_daily.sh`, atau jadwal systemd.

## Konteks temuan

Versi v1 mendeteksi pada 57 URL: 57 `missing_h1`, 57 `missing_canonical`, 57 `duplicate_title` pada HTML awal. Chrome DevTools pengguna membuktikan bahwa H1, canonical dan title spesifik dapat muncul setelah JavaScript dirender. Kesimpulan benar adalah **171 peringatan HTML awal**; jumlah error setelah rendering **belum diketahui** hingga browser diuji. `sitemap_index.xml` adalah probe alternatif, bukan kewajiban jika sitemap utama valid; bila tercantum di `robots.txt` dan rusak, tetap ditandai.

## Isi patch

- `src/seo_audit.py`: pengganti *hanya* auditor lama; tetap mempertahankan GSC read-only.
- `install.sh`: backup auditor lama, validasi SHA256 baseline, 14 tes, pemasangan satu file. Tidak merestart gateway atau timer.
- `setup_renderer.sh`: memasang Playwright dalam venv Hermes SEO dan Chromium khusus jika dibutuhkan; tidak memakai sudo. Membutuhkan internet keluar dari VPS dan ruang disk.
- `rollback.sh`: mengembalikan auditor lama dari backup.
- `tests/`: tes offline yang dapat dijalankan sebelum install.

## Cara instal (jalankan sebagai ubuntu pada VPS 4 GB)

1. Salin ZIP dari PC ke VPS 4 GB:

```powershell
scp "$env:USERPROFILE\Downloads\Hermes_SEO_Auditor_v2_20261013.zip" ubuntu@IP_VPS_4GB:/tmp/
```

2. Di VPS:

```bash
cd ~
mkdir -p /tmp/hermes-seo-v2-install
python3 -m zipfile -e /tmp/Hermes_SEO_Auditor_v2_20261013.zip /tmp/hermes-seo-v2-install
cd /tmp/hermes-seo-v2-install/hermes-seo-auditor-v2
bash install.sh
```

**Jangan gunakan sudo.** Jika muncul `STOP` karena SHA256 berbeda, jangan paksa overwrite; auditor mungkin telah dimodifikasi setelah pemasangan awal.

3. Untuk memeriksa HTML *setelah* JavaScript, pasang Chromium dalam lingkungan agen:

```bash
bash setup_renderer.sh
```

Jika muncul `RENDERER_READY`, siap untuk verifikasi. Jika pemasangan Chromium gagal (paket OS/ruang disk/jaringan), audit tetap akan menyatakan `unavailable`, bukan `PASS`. **Jangan menginstal dependensi OS dengan sudo secara serampangan.**

4. Jalankan verifikasi **semua hingga 60 URL** dengan lingkungan GSC dan script harian yang sudah ada:

```bash
SEO_RENDER_MODE=on SEO_RENDER_LIMIT=60 bash ~/.openclaw/workspace-hermes-seo/scripts/run_daily.sh
```

Ini bisa berjalan beberapa menit (Chromium merender tiap URL), dan menjalankan analisis AI yang sudah ada. Jika tidak ingin menunggu semua URL, gunakan `SEO_RENDER_LIMIT=5` untuk smoke test pertama. Jangan jalankan bersamaan dengan audit timer.

5. Baca hasil (jangan kirim OAuth token):

```bash
python3 - <<'PY'
import json, pathlib
p=pathlib.Path.home()/'.openclaw/workspace-hermes-seo/reports/LATEST.json'
a=json.loads(p.read_text());t=a['technical'];r=t['rendered_html']
print('SCHEMA:',a['schema'])
print('RAW_HTML_WARNING:',len(t['raw_html_warnings']))
print('RAW_COUNTS:',t['raw_html_warning_counts'])
print('RENDERER:',r['status'],r['verified_count'],'/',r['eligible_count'])
print('RENDERED_HTML_ERROR:',r['confirmed_issues'])
print('OTHER_TECHNICAL:',t['issue_counts'])
print('GSC:',a['search_console']['status'])
for page in r['pages']:
 if page.get('status')!='ok':print('RENDER_FAILURE',page['url'],page.get('error'))
PY
```

Jika `RENDERER: unavailable` atau cakupan belum penuh, **jangan** mengklaim semua halaman sudah benar. Default jadwal harian membatasi render ke **10 URL**, agar ringan untuk VPS 4 GB; cek penuh dilakukan manual.

## Rollback

Path backup dicetak oleh installer pada baris `BACKUP=...`.

```bash
cd /tmp/hermes-seo-v2-install/hermes-seo-auditor-v2
bash rollback.sh /home/ubuntu/.local/share/hermes-seo/backups/ID_DARI_INSTALLER
```

Rollback tidak menyentuh credential atau timer; dependency Playwright bersifat terpisah dan boleh dibiarkan (tidak aktif di auditor v1).

## Batasan

- **Tidak mengubah website**. Meningkatkan akurasi diagnosis Hermes SEO saja.
- Chrome Playwright membatalkan pemuatan gambar, media, font, tracker dan permintaan eksternal/non-GET/HEAD **hanya dalam sesi audit browser terisolasi**. Gambar yang dilihat pengguna di Hostinger **tidak disentuh**. Situs React yang memerlukan API eksternal mungkin sulit dirender pada audit; hasil tersebut harus dianggap belum terverifikasi.
- SEO HTML awal yang generik tetap fakta teknis; bukan otomatis diselesaikan oleh patch auditor.
- Data GSC tetap berasal dari read-only API milik user; patch tidak memperpanjang usia refresh token OAuth Testing.
- Tidak ada klaim patch telah dipasang di VPS hingga perintah pengguna berhasil dijalankan.
