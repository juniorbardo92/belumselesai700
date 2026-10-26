# Kalyanamitra Lite

Worker Telegram private-only untuk Ruang Kalyanamitra. Worker ini berdiri sendiri dan tidak mengubah `umkm-content-os`.

## Identitas tetap

- Agent/account: `kalyanamitra`
- Namespace: `ruang-kalyanamitra`
- Brand: `brand-ruang-kalyanamitra`
- `automaticPublish=false`
- `publisherMode=draft-only`
- Risk flag: `do-not-publish`

## Arsitektur

`Telegram webhook → kalyanamitra-lite Worker → Workers AI → D1 → Telegram`

Model default adalah `@cf/zai-org/glm-4.7-flash`, yang tersedia pada Workers Free. Jika alokasi AI gratis harian habis, permintaan AI berhenti dan tidak berubah menjadi tagihan otomatis.
Worker menonaktifkan mode thinking model agar jatah output dipakai untuk
jawaban final yang dikirim ke Telegram.

## Secret wajib

- `TELEGRAM_BOT_TOKEN`: token BotFather. Masukkan langsung di Cloudflare, jangan simpan di file.
- `TELEGRAM_WEBHOOK_SECRET`: dibuat ketika deployment.
- `ADMIN_API_TOKEN`: dibuat ketika deployment.
- `ADMIN_TELEGRAM_IDS`: tepat dua ID Telegram numerik, dipisahkan koma.

Tanpa tepat dua `ADMIN_TELEGRAM_IDS`, bot tetap fail-closed. Perintah `/whoami` tetap dapat dipakai untuk mengetahui ID masing-masing calon admin.

## Perintah bot

- `/whoami`
- `/help`
- `/status`
- `/reset`
- `/draft <brief>`

`/reset` tidak menghapus histori. Ia hanya membuat batas konteks baru dan mempertahankan ledger append-only.

## Endpoint

- `GET /health`: status nonrahasia.
- `POST /telegram/webhook`: hanya menerima request yang memiliki secret header Telegram.
- `GET /admin/status`: membutuhkan Bearer `ADMIN_API_TOKEN`.
- `POST /admin/bootstrap-telegram`: mendaftarkan webhook dan command bot setelah token Telegram tersedia.

## Pemulihan

Konfigurasi yang tersimpan di paket ini menunjuk ke D1 khusus
`kalyanamitra-lite-db`. Untuk memulihkan instalasi yang sama:

1. Jalankan `schema.sql` pada D1 jika tabel belum tersedia.
2. Deploy Worker dengan binding `DB` dan `AI` dari `wrangler.jsonc`.
3. Masukkan keempat secret; jangan menaruh nilainya di file atau Git.
4. Panggil `/admin/bootstrap-telegram`.
5. Verifikasi `/health`, `/admin/status`, `/whoami`, dan allowlist dua admin.

Jika membuat instalasi baru, buat D1 terpisah lalu ganti `database_id` pada
`wrangler.jsonc`. Jangan gunakan database milik `umkm-content-os`.

Tidak ada endpoint publish, Repliz, engagement, exec, atau perubahan akun sosial dalam paket ini.
