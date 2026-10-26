# Kalyanamitra Content Pack Import

Adapter privat untuk `@AsistenKalyanamitraBot`. Adapter ini bukan skill dan tidak menghasilkan konten. Ia hanya membaca satu file staging lokal, meneruskan JSON mentah ke importer Content OS, menampilkan dry-run, lalu menunggu konfirmasi admin terpisah.

Kontrak runtime dikunci ke OpenClaw `2026.8.1`. Pembacaan file memakai dependensi langsung `@openclaw/fs-safe` `0.6.0`, termasuk perbaikan identitas file Windows pada rilis tersebut. Hanya subpath SDK publik OpenClaw yang dipakai.

## Pengaman

- hanya Telegram private chat pada account dan agent `kalyanamitra`;
- tepat dua sender ID numerik yang sudah aktif pada allowlist efektif; importer tidak menambah admin baru;
- `message_received` hanya menyimpan observasi sinkron yang dibatasi; `before_dispatch` adalah satu-satunya hook yang mengklaim perintah dan melakukan I/O;
- semua `/importdraft` dan `/confirmdraft` yang dikenali diklaim secara fail-closed, sehingga file/perintah tidak diteruskan ke model;
- korelasi account, channel, sender, private conversation, session, message, dan agent harus cocok di kedua hook;
- hanya satu `*.content-pack.json` UTF-8, maksimal 1,5 MB;
- path absolut file harus berada dalam root media lokal agent yang diberikan OpenClaw;
- pembacaan memakai `@openclaw/fs-safe/root` dengan symlink dan hardlink ditolak serta batas 1,5 MB;
- Idea Inbox dan Viral Research Pack ditolak;
- dry-run tidak digandakan saat pesan yang sama dikirim ulang;
- `/confirmdraft` memakai token sekali pakai yang disimpan di memori paling lama 15 menit, single-flight, dan dapat merekonsiliasi respons Worker `confirmation-already-consumed` yang sudah committed;
- request jaringan diputus oleh `AbortSignal` lokal setelah 45 detik;
- tidak ada tool atau endpoint publish, schedule, renderer, maupun Repliz.

## Konfigurasi Windows

Tambahkan ke environment global OpenClaw, lalu restart Gateway:

```dotenv
KALYANAMITRA_CONTENT_OS_TOKEN=ganti-dengan-secret-minimal-24-karakter
KALYANAMITRA_IMPORT_ADMIN_IDS=<ID_ADMIN_YANG_SUDAH_ADA_1>,<ID_ADMIN_YANG_SUDAH_ADA_2>
```

Jangan membuat ID admin baru. Ambil secara read-only dua ID numerik yang sudah dipakai allowlist efektif Telegram account `kalyanamitra`; `/whoami` dapat dipakai oleh masing-masing admin untuk mencocokkan ID miliknya. Salin pasangan yang sama, tanpa prefiks `telegram:` dan tanpa menaruh nilainya di Git, ke Gateway dan Cloudflare Worker.

Secret yang sama juga harus disimpan sebagai `KALYANAMITRA_CONTENT_OS_TOKEN` pada Cloudflare Worker. Adapter dan Worker memvalidasi pasangan admin yang sama secara terpisah.

Gabungkan entry berikut ke `C:\Users\wguna\.openclaw\openclaw.json` tanpa menimpa konfigurasi lain:

```json
{
  "plugins": {
    "entries": {
      "kalyanamitra-content-pack-import": {
        "enabled": true,
        "config": {
          "contentOsUrl": "https://umkm-content-os.ruang-belajar-mandiri01.workers.dev",
          "agentId": "kalyanamitra",
          "accountId": "kalyanamitra"
        }
      }
    }
  }
}
```

Jangan menambahkan override timeout untuk `before_dispatch`. Adapter memiliki timeout jaringan 45 detik sendiri; timeout hook yang dipaksakan host dapat membuat dispatch dilanjutkan setelah hook gagal atau habis waktu.

Install dependensi exact-lock terlebih dahulu, baru link plugin:

```powershell
Set-Location "C:\path\to\openclaw-kalyanamitra-import"
npm ci --include=optional --ignore-scripts
openclaw plugins install --link . --force
openclaw plugins enable kalyanamitra-content-pack-import
openclaw gateway restart
openclaw plugins inspect kalyanamitra-content-pack-import --runtime --json
```

Jika `npm ci` gagal, jangan link atau aktifkan plugin. Lazy import `fs-safe` menjaga hook tetap dapat didaftarkan dan menolak perintah secara aman, tetapi operasi impor sengaja tidak dapat berjalan tanpa dependensi tersebut.

## Pemakaian

1. Kirim tepat satu file `*.content-pack.json` ke bot dengan caption `/importdraft`.
2. Periksa ringkasan dry-run.
3. Kirim `/confirmdraft <import-id>` dari admin yang sama dalam 15 menit.
4. Periksa Content OS; semua item baru harus berstatus `draft`.

Jika Gateway restart di antara dry-run dan konfirmasi, token memori hilang. Jalankan dry-run ulang; Content OS melakukan preflight idempotensi.

Rujukan: [OpenClaw plugin hooks](https://docs.openclaw.ai/plugins/hooks), [OpenClaw SDK subpaths](https://docs.openclaw.ai/plugins/sdk-subpaths), dan [`@openclaw/fs-safe` 0.6.0](https://github.com/openclaw/fs-safe/releases/tag/v0.6.0).
