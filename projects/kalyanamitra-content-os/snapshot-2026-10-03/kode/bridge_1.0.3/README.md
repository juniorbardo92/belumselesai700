# Kalyanamitra Content OS Bridge 1.0.3

Plugin OpenClaw terisolasi untuk menghubungkan **Asisten Kalyanamitra** dengan Content OS tanpa memberikan akses langsung ke tool UMKM atau Threads Publisher.

## Batas arsitektur

- Agent Telegram tetap `kalyanamitra` dengan binding `telegram:kalyanamitra`.
- Namespace editorial selalu `ruang-kalyanamitra`.
- Metadata wajib menyimpan tradisi, sumber, status verifikasi, approval manusia, dan policy `draft-only`.
- Record tanpa namespace atau milik UMKM ditolak sebelum dibaca atau diproses.
- Worker produksi tidak mengembalikan field `metadata`, sehingga bridge menyimpan ledger namespace append-only di state OpenClaw, di luar workspace model. UUID yang tidak ada di ledger selalu ditolak.
- Workflow hanya memiliki `render`, `qa`, `approve`, dan `repliz_draft`.
- Tidak ada endpoint/tool publish, reply, engagement, auto-reply, atau retry otomatis.
- Account ID Repliz dikunci terpisah untuk Instagram dan Threads oleh operator, bukan input model.
- Aksi `repliz_draft` wajib menyebut platform; bridge memilih account ID dari konfigurasi dan tidak menerima account ID dari model.
- Konten Vajrayana membutuhkan konfirmasi review garis transmisi sebelum approval/Repliz.

## Sumber yang disarankan

Urutan sumber: teks kanonik/terjemahan, pustaka tepercaya, situs resmi guru/garis transmisi, lalu sumber sekunder yang diperiksa silang. Contoh: SuttaCentral, 84000, BDK America, Lotsawa House, Tergar, Samye Mandala, dan Kagyu Office.

## Urutan instalasi aman

1. Ekstrak paket ke folder baru. Jangan menyalin isinya ke plugin UMKM yang aktif.
2. Jalankan `scripts\01_preflight_readonly.ps1` dan periksa bahwa agent/binding sehat.
3. Jalankan `scripts\02_install_canary.ps1`. Tahap ini hanya membuka tool create/get.
4. Buat satu draft uji Kalyanamitra dan baca kembali UUID-nya. Pastikan `namespaceVerified: true`, `automaticPublish: false`, dan `publisherMode: draft-only`.
5. Jangan menjalankan script tahap 03 sampai canary diperiksa dan akun Instagram serta Threads Repliz `@ruangkalyanamitra` telah diidentifikasi secara read-only.
6. Jika bridge 1.0.2 sudah aktif, jalankan `scripts\05_upgrade_multi_repliz.ps1`. Tahap ini mengganti runtime bridge saja dan tidak membuka workflow.
7. Setelah persetujuan operator, jalankan tahap 03 dengan kedua account ID serta username yang tepat.

## Akun Repliz yang dikunci

- Instagram: `6a8d2c6762caae1e04053962` — `@ruangkalyanamitra`.
- Threads: `6a8d2c7862caae1e0405397a` — `@ruangkalyanamitra`.

Kedua ID berasal dari pemeriksaan endpoint akun dengan metode GET. Bridge menolak ID yang tertukar antar-platform dan tidak meneruskan field kredensial akun ke model.

## Prompt canary Telegram

```text
Buat satu draft canary Content OS untuk Ruang Kalyanamitra tentang arti kalyanamitra.
Gunakan display ID RK-CANARY-001, tradisi umum, 5 slide, satu CTA di akhir,
dan minimal satu sumber HTTPS yang sudah diverifikasi. Jangan render, approve,
kirim ke Repliz, atau publish. Setelah dibuat, baca ulang UUID dan laporkan namespace,
status, automaticPublish, serta publisherMode.
```

## Rollback cepat

Jalankan `scripts\99_disable_bridge.ps1`. Script hanya menonaktifkan bridge baru. Plugin `umkm-content-os`, `umkm-content-registry`, konfigurasi Cloudflare, n8n rollback, dan Publisher stabil tidak diubah.

## Catatan isolasi

Isolasi ini diberlakukan secara fail-closed pada permukaan tool OpenClaw. Worker dan tabel D1 tetap memakai endpoint registry yang sudah ada karena Worker produksi sengaja tidak diubah. Isolasi tenant tingkat database memerlukan endpoint/migrasi Worker terpisah dan berada di luar paket ini.
