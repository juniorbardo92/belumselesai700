# UMKM Content OS — OpenClaw Connector v1.4.0

Plugin ini mempertahankan seluruh tool v1.3.0 dan menambahkan auto-reply terjaga melalui API resmi Meta Threads.

## Tool

### Tetap dari v1.2.0

- `umkm_topic_research`
- `umkm_account_audit`
- `umkm_viral_analyzer`

Ketiganya tetap menggunakan endpoint produksi UMKM Content OS melalui n8n.

### Dari v1.3.0

- `umkm_threads_own_insights` — membaca insight resmi satu post milik akun terhubung.
- `umkm_threads_read_replies` — membaca reply satu post milik akun terhubung.
- `umkm_threads_publish` — menerbitkan satu post teks setelah persetujuan eksplisit; opsional membagikannya ke Instagram Story.
- `umkm_threads_reply` — menerbitkan satu reply setelah persetujuan eksplisit.

### Baru di v1.4.0

- `umkm_threads_recent_posts` — membaca maksimal lima posting terbaru milik akun terhubung.
- `umkm_threads_auto_reply_batch` — menjalankan keputusan auto-reply yang dibatasi dan disimpan secara persisten.

## Batas keamanan

- Semua schema menolak properti tambahan.
- Token tidak pernah diterima sebagai argumen tool atau dikembalikan dalam respons.
- Endpoint Meta dikunci ke `https://graph.threads.net` dan redirect ditolak.
- Read operation maksimal satu request dan tidak mengubah data.
- Publish/reply memakai dua request yang diwajibkan Meta: create container lalu publish.
- Tidak ada retry otomatis.
- Write operation wajib membawa approval literal dan idempotency key.
- Idempotency mencegah duplikasi selama proses Gateway yang sama.
- Publish hanya mendukung post teks.
- Cross-share hanya ke Instagram Story dari akun Instagram yang tertaut.
- Plugin tidak menjalankan shell, membuka filesystem, mengirim DM, atau mengubah konfigurasi Gateway.

## Auto-Reply Policy v1

Kebijakan `UMKM_SAFE_AUTO_REPLY_V1`:

- dijalankan setiap 10 menit oleh OpenClaw Automations;
- memeriksa maksimal tiga posting terbaru;
- maksimal tiga reply publik per siklus;
- hanya menjawab pertanyaan relevan tentang UMKM;
- komentar milik akun sendiri tidak dibalas;
- transaksi, keluhan, data pribadi, spam, politik, agama, kesehatan, hukum, ancaman, dan konten sensitif dieskalasikan;
- setiap keputusan disimpan di `~/.openclaw/state/umkm-content-os/auto-reply-v1.json`;
- reply yang sudah diproses tidak diproses ulang setelah restart;
- kegagalan provider tidak di-retry;
- bila tidak ada komentar baru, automation harus mengembalikan `NO_REPLY` agar Telegram tidak dibanjiri laporan kosong.

## Environment

Variable lama:

```text
UMKM_CONTENT_OS_TOKEN
```

Variable baru:

```text
META_THREADS_ACCESS_TOKEN=<token baru; jangan gunakan token yang pernah bocor>
META_THREADS_USER_ID=<ID numerik akun Threads>
META_THREADS_API_VERSION=v1.0
```

`META_THREADS_API_VERSION` opsional; default `v1.0`.

Gunakan token baru dari app `UMKM Content OS Threads`. Jangan memasukkan token ke prompt, parameter tool, README, atau riwayat terminal.

## Build dan verifikasi

```powershell
npm install
npm run verify
```

Test memakai mock HTTP. Test tidak memanggil Meta, tidak membuat container, tidak membalas, dan tidak memublikasikan konten.

## Instalasi rollback-safe

Simpan paket v1.3.0 sebagai rollback. Dari direktori paket v1.4.0:

```powershell
npm install --omit=dev
openclaw.cmd plugins install .
openclaw.cmd plugins enable umkm-content-os
openclaw.cmd config validate
openclaw.cmd gateway restart
openclaw.cmd plugins inspect umkm-content-os --runtime
```

Aktifkan tool baru pada allowlist efektif hanya setelah runtime inspection menunjukkan versi `1.4.0` dan sembilan kontrak tool.

## Penggunaan write tool

Tool publish hanya boleh dipanggil setelah pengguna menyetujui teks final pada percakapan aktif:

```json
{
  "text": "Teks final yang sudah disetujui",
  "shareToInstagramStory": true,
  "approval": "APPROVE_PUBLISH",
  "idempotencyKey": "publish-unik-20260828-001"
}
```

Tool reply juga membutuhkan teks final, target reply, approval, dan idempotency key:

```json
{
  "replyToId": "18000000000000000",
  "text": "Balasan final yang sudah disetujui",
  "approval": "APPROVE_REPLY",
  "idempotencyKey": "reply-unik-20260828-001"
}
```

## Scheduler

Gunakan OpenClaw Automations dengan sesi `isolated`, agent `main`, interval 10 menit, dan delivery eksplisit ke Telegram owner. Prompt scheduler wajib memakai urutan berikut:

1. Panggil `umkm_threads_recent_posts` satu kali dengan limit 3.
2. Untuk setiap post, panggil `umkm_threads_read_replies` satu kali dengan limit 25.
3. Abaikan reply milik akun sendiri dan reply yang tidak relevan.
4. Susun keputusan untuk seluruh reply baru; maksimal tiga beraksi `reply`.
5. Panggil `umkm_threads_auto_reply_batch` satu kali dengan `APPROVE_AUTO_REPLY_POLICY_V1`.
6. Jangan retry tool apa pun.
7. Laporkan hanya reply yang terkirim atau komentar yang dieskalasikan; bila tidak ada, jawab `NO_REPLY`.
