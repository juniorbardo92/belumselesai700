# Panglima Certificate Service

Layanan terpisah untuk menerima bukti penyelesaian dari APK, mencatat `tanggal_selesai` berdasarkan waktu server Asia/Jakarta, dan menunggu verifikasi mentor sebelum mengirim baris ke tab `Live` yang dipantau Certifier.

Layanan ini tidak mengubah atau memanggil sistem affiliate, referral, approval penjualan, komisi, maupun webhook Lynk.

## Aturan kelayakan

- Diagnosis wajib `40/40`.
- Minimal aksi wajib `24/30` (80%).
- Identitas dan email dibaca dari database PRE-TEST.
- Perangkat harus sama dengan lisensi APK yang sudah terkunci.
- Tanggal penyelesaian ditetapkan satu kali saat kelayakan pertama diterima.
- Certifier hanya memantau tab `Live`, bukan PRE-TEST dan bukan tab `Input`.

## Secret dan konfigurasi akhir

Setelah Apps Script dipasang sebagai Web App, tambahkan ke Worker:

```bash
npx wrangler secret put CERTIFICATE_WEBHOOK_URL
npx wrangler secret put CERTIFICATE_WEBHOOK_SECRET
npx wrangler secret put CERTIFIER_API_TOKEN
```

Gunakan nilai secret yang sama ketika menjalankan `configureCertificateWebhook(spreadsheetId, webhookSecret)` di Apps Script.

`CERTIFIER_API_TOKEN` hanya disimpan sebagai secret Cloudflare. APK tidak menerima token tersebut. Endpoint `/v1/certificate` mencocokkan peserta berdasarkan sesi, perangkat, email PRE-TEST, template Panglima, tanggal penyelesaian, dan status `issued`, lalu mengembalikan URL PDF permanen dari Certifier.

## Pemetaan Certifier

Pilih trigger Google Sheets `New row added` pada worksheet `Live`, lalu map:

- Recipient Name → `Nama Lengkap`
- Recipient Email → `Email`
- Issue Date → `Tanggal Selesai`

Kolom tanggal menggunakan format `YYYY-MM-DD`.

## Verifikasi publik tanpa upgrade Certifier

Unggah QR statis yang mengarah ke halaman `/verifikasi` pada desain sertifikat, lalu tampilkan atribut bawaan Certifier `[certificate.uuid]` sebagai `Credential ID` di dekat QR.

Halaman verifikasi menerima hanya UUID yang valid dan membuka halaman resmi `https://credsverse.com/credentials/<uuid>`. Halaman ini tidak membaca data peserta, mengakses database, mengirim webhook, atau mengubah sistem affiliate.
