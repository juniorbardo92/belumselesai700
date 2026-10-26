# UMKM Content OS

Command center privat untuk riset, produksi, rendering, distribusi, dan evaluasi konten UMKM Naik Kelas.

## Status

Fase 5 — full automation render → QA → Repliz untuk UMKM Naik Kelas dan Ruang Kalyanamitra:

- Dashboard: https://umkm-content-os.ruang-belajar-mandiri01.workers.dev
- Cloudflare Worker API sudah dideploy
- Enam tabel aplikasi dan satu brand awal tersimpan di Cloudflare D1
- Binding Cloudflare R2 sudah lulus uji baca/tulis
- Content Engine DeepSeek sudah tersedia dalam mode terkunci sampai Cloudflare Access diaktifkan
- Validasi otomatis melalui GitHub Actions

Renderer GitHub Actions merender carousel, menjalankan QA layout/brand/dimensi/duplikasi, lalu mengunggah hasil yang lolos ke R2.

Publisher Repliz berjalan dalam mode **full-automation**. Cron Worker memproses konten yang secara eksplisit membawa `automaticPublish=true`, `humanApprovalRequired=false`, target platform, dan jadwal. Gate otomatis bersifat fail-closed; konten yang gagal tidak dikirim.

Content Command Center juga menjalankan reset satu kali `2026-09-21-clean-slate-v1` sebelum autopilot dilanjutkan. Reset membatalkan draft/jadwal Repliz lama yang terbukti berasal dari Content OS, membersihkan media R2 dan histori operasional D1, serta mempertahankan brand, secret/binding, empat rute akun, dan `publication_ledger` permanen. Jadwal ambigu menghentikan reset secara fail-closed.

Deployment mem-bootstrap reset melalui token acak sekali-pakai. Hanya hash token yang disimpan sementara di D1, token kedaluwarsa setelah 20 menit, dan endpoint tidak dapat menjalankan lebih dari tiga percobaan reset. Cron lima-menit tetap menjadi penggerak autopilot setelah reset terverifikasi selesai.

Panel Analytics hanya membaca tabel D1 yang sudah ada: status konten, render, aset, draft Repliz, dan aktivitas terbaru. Tidak ada migrasi atau penulisan data baru. Views, likes, komentar, dan shares platform belum ditarik sampai ada posting yang benar-benar terbit dan endpoint metrik diuji secara manual.

Panel Research/KOL Audit membaca profil dan konten publik Threads melalui Repliz Research API. Tahap ini hanya tersedia untuk Threads, memerlukan akses Research Gold+, tidak menulis ke D1, dan tidak mengirim like, komentar, DM, atau publikasi. Instagram menunggu API/integrasi yang sesuai; TikTok menunggu akun dibuat.

Panel Topic/Content Pattern Research memakai registry konektor yang dapat diganti per platform. Adapter `repliz_threads` aktif dalam mode read-only untuk mencari konten publik Threads, menormalisasi sinonim Indonesia/Inggris, menyaring kandidat di bawah ambang relevansi, mengelompokkan akun, mengambil snapshot profil, dan menganalisis pola hook/diagnosis. Adapter `x_api` dan `instagram_api` tersedia sebagai placeholder nonaktif agar provider dapat diganti tanpa mengubah mesin riset.

Istilah seperti `omset/omzet`, `cashflow/arus kas`, `jualan/penjualan/sales`, dan `laba/untung/profit` dinormalisasi oleh lapisan ranking. Skor yang tampil bernama **Potensi pola**, bukan skor viral, selama provider belum mengembalikan metrik engagement per posting. Tombol **Audit akun** meneruskan username kandidat ke modul KOL Audit yang tetap read-only. Nama kolom D1 `viral_score`/`virality_score` dipertahankan untuk kompatibilitas skema, tetapi UI dan API baru memakai label `patternScore`.

Kontrak setiap adapter adalah `getStatus(env)` dan `collect(input, env)`, dengan output akun dan posting yang sudah dinormalisasi. Metrik per posting yang tidak dikembalikan provider disimpan sebagai `NULL` dan ditampilkan sebagai N/A, bukan ditebak. Modul riset tidak langsung memanggil Publisher.

## Resource terisolasi

- Worker: `umkm-content-os`
- D1: `umkm-content-os-db`
- R2: `umkm-content-media`

Resource Panglima, affiliate, OTP, peserta, dan webhook tidak digunakan oleh proyek ini.

## Pengembangan lokal

```bash
npm install
npm run types
npm run check
npm run dev
```

Konfigurasi `wrangler.jsonc` sudah menggunakan UUID D1 produksi. Credential berikutnya disimpan sebagai Cloudflare Secrets atau GitHub Secrets dan tidak pernah dimasukkan ke repository.

## Content Engine

`POST /api/content/generate` menerima `topic`, `angle` opsional, dan daftar `platforms`. Endpoint memanggil DeepSeek Chat Completions dengan output JSON, memvalidasi struktur carousel 5–9 slide, lalu menyimpan topik, draft, dan log ke D1.

Endpoint sudah aktif setelah Cloudflare Access melindungi Worker dan `CONTENT_AI_ENABLED=true` dipasang.

## Renderer carousel

Renderer menghasilkan PNG Instagram (1080×1350) dan TikTok (1080×1920) dari struktur `carousel.slides`.

Uji lokal membutuhkan Playwright:

```bash
npm install --no-save playwright@1.52.0
npx playwright install chromium
node renderer/render.mjs renderer/example-content.json renderer/output
```

Workflow `Render carousel preview` dapat dijalankan manual atau dipanggil otomatis oleh Worker dengan input JSON draft. Hasilnya disimpan sebagai artifact preview selama satu hari; jalur autopilot selalu meminta upload R2 dan gagal tertutup bila credential upload belum tersedia.

Untuk mengaktifkan opsi upload R2 pada workflow, tambahkan GitHub Secrets berikut dari token R2 yang dibatasi ke bucket `umkm-content-media`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, dan `R2_PUBLIC_BASE_URL`. Jalankan workflow dengan `upload_to_r2=true` hanya setelah semua secret tersedia.

## Publisher full automation

Credential Repliz disimpan sebagai Cloudflare Worker Secrets berikut, bukan di repository:

- `REPLIZ_ACCESS_KEY`
- `REPLIZ_SECRET_KEY`

Setelah secrets tersedia, autopilot mencocokkan brand, platform, username, dan account ID dengan registry tetap; membaca slot remote; lalu membuat schedule Repliz dengan `additionalInfo.isDraft=false`. Threads dikirim sebagai opener plus replies berurutan. Respons tanpa schedule ID masuk `reconcile_required` dan tidak diulang secara buta.

Rute tetap:

- UMKM Instagram `6a8e2fac62caae1e04063415`; Threads `6a8e2fc362caae1e04063419`.
- Ruang Kalyanamitra Instagram `6a8d2c6762caae1e04053962`; Threads `6a8d2c7862caae1e0405397a`.

Kalyanamitra wajib membawa namespace yang tepat, sumber berstatus `verified` atau `machine-verified`, sedikitnya satu sumber, dan tidak boleh memiliki risk flag yang belum selesai.

## Automation layer: n8n dan OpenClaw

Lapisan webhook riset tetap terpisah. Autopilot publikasi memakai Cloudflare Cron setiap lima menit dan tidak memerlukan approval manusia.

Endpoint yang tersedia:

- GET /api/automation/status — status konektor tanpa membuka credential.
- POST /api/automation/trigger — menjalankan workflow read-only topic_research melalui n8n atau OpenClaw.
- POST /api/automation/events — menerima event callback untuk audit workflow.
- GET /api/automation/runs — membaca riwayat run dan event.

Request trigger wajib memakai dua header:

- X-Content-OS-Timestamp: Unix timestamp 10 digit.
- X-Content-OS-Signature: sha256=HMAC_SHA256(N8N_WEBHOOK_SECRET, timestamp + "." + rawBody).

Contoh body:

~~~json
{
  "workflow": "topic_research",
  "idempotencyKey": "n8n-trend-2026-08-26-001",
  "payload": {
    "topic": "omzet ramai tetapi kas kosong",
    "platform": "threads",
    "lookbackDays": 7,
    "keywords": ["cashflow UMKM"]
  }
}
~~~

Aktivasi konektor webhook memerlukan secret berikut; flag aktif disimpan sebagai Worker variable:

~~~bash
wrangler secret put N8N_WEBHOOK_SECRET
~~~

Workflow webhook yang diizinkan tetap `topic_research`. Pipeline render dan Publisher dijalankan Cron Worker, memakai D1 sebagai ledger idempotensi dan R2 sebagai sumber media.
