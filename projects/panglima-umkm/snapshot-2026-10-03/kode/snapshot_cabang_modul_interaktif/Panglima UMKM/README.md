# Panglima UMKM - APK Pendamping dan Modul Spesialis

Aplikasi Android resmi Panglima UMKM. Paket dasar tetap memuat Diagnosis 10
Medan, workbook, pendamping baca, misi 30 hari, toolkit, konsultasi AI, dan
sertifikat. Versi 1.3.0 menambahkan satu modul spesialis sesuai produk jalur
yang dibeli di Lynk.id:

- Agen Properti (`property`)
- Agen Asuransi (`insurance`)
- Mitra MLM / Direct Selling (`mlm`)

## Alur tiga produk jalur

1. Pembeli memilih satu dari tiga produk fisik terpisah: `Jalur Agen Properti`,
   `Jalur Mitra MLM`, atau `Jalur Agen Asuransi`.
2. Webhook yang sudah ada tetap menulis transaksi dan `Items JSON` ke sumber
   transaksi; kolom serta perhitungan komisi tidak diubah.
3. Otomasi PRE-TEST mencocokkan judul produk secara tepat dan mengirim kode
   modul kanonis saat menerbitkan token. Alur varian lama tetap didukung untuk
   kompatibilitas.
4. Worker onboarding menyimpan entitlement pada tabel terpisah
   `panglima_module_entitlements`.
5. Saat token diaktifkan, Worker perangkat mengembalikan hanya modul milik
   peserta tersebut.
6. APK langsung membuka modul yang sesuai. Kunci PDF hanya diberikan jika sesi,
   perangkat, dan entitlement semuanya cocok.

Pembelian lama tanpa modul spesialis tetap memperoleh aplikasi Panglima dasar. Data
peserta, fulfillment, perangkat, dan progres lokal lama tidak dimigrasikan atau
ditulis ulang.

Pemetaan produk produksi:

| Produk Lynk.id | Modul | Tautan |
| --- | --- | --- |
| Jalur Agen Properti | `property` | `http://lynk.id/wgunawan168/x4wnrp41mz10` |
| Jalur Mitra MLM | `mlm` | `http://lynk.id/wgunawan168/zdkx923vk735` |
| Jalur Agen Asuransi | `insurance` | `http://lynk.id/wgunawan168/13xroeodllel` |

Tombol `Isi PRE-TEST terlebih dahulu` di APK membuka URL responden berikut:
`https://docs.google.com/forms/d/e/1FAIpQLSfU-jJ7ZfOeA_x2GQXIKdxS9fm4dM7aFoRKsN0Hu-97f62jJg/viewform`.
Endpoint `/formResponse` hanya dipakai Google Forms saat jawaban dikirim dan
tidak dibuka langsung oleh aplikasi.

Secara umum, `Testing Only` tidak termasuk produk yang berhak. Satu transaksi
uji yang disetujui (`7e65afdbfae16dae880b61d5ef3db654`) menjadi pengecualian
khusus untuk modul `insurance`; resolver mewajibkan Transaction ID dan judul
produk cocok persis, sehingga transaksi `Testing Only` lain tetap ditolak.

## Keamanan modul

Ketiga PDF disimpan sebagai aset `PGLM1` terenkripsi AES-256-GCM. PDF polos dan
kunci dekripsi tidak berada di repository. Kunci disimpan sebagai Worker secret:

```text
PANGLIMA_MODULE_KEY_PROPERTY
PANGLIMA_MODULE_KEY_INSURANCE
PANGLIMA_MODULE_KEY_MLM
```

Pembaca menggunakan `PdfRenderer` Android dan merender satu halaman pada satu
waktu. Hasil dekripsi berada sementara di cache privat aplikasi dan dihapus saat
pembaca ditutup.

Untuk mengenkripsi ulang aset:

```bash
python tools/encrypt_module.py input.pdf \
  app/src/main/assets/modules/property.pmod \
  --key-env PANGLIMA_MODULE_KEY_PROPERTY
```

## Kompatibilitas pembaruan

- Package ID tetap `id.umkmnaikkelas.panglima`.
- Storage key WebView tetap `panglima-umkm-safe-v1`.
- Build release memakai signing key produksi yang sama dari GitHub Secrets.
- Version code 6; version name `1.3.0-modul`.
- `localStorage`, workbook, diagnosis, misi, dan catatan pengguna lama tetap
  dipertahankan saat APK diperbarui.

## Migrasi D1

Jalankan SQL idempoten pada `panglima-apk-db`:

```text
onboarding-worker/schema-token-requests.sql
```

Worker perangkat memerlukan binding berikut:

```text
PANGLIMA_CORE      -> panglima-apk-api
PANGLIMA_DEVICE_DB -> panglima-device-db
PANGLIMA_APP_DB    -> panglima-apk-db
```

## Build dan pengujian

GitHub Actions menjalankan seluruh pengujian Node, membangun APK release dengan
Java 17, Gradle 8.9, dan Android SDK 35, lalu memverifikasi sertifikat tanda
tangan. Artifact hasil build:

```text
Panglima-UMKM-APK-MODUL/
└── Panglima-UMKM-v1.3.0-MODUL.apk
```

Pengujian lokal yang tidak memerlukan Android SDK:

```bash
node --test \
  tests/app.test.js \
  tests/device-worker.test.js \
  onboarding-worker/tests/token-request-worker.test.mjs \
  onboarding-worker/tests/token-request-addon.test.js \
  onboarding-worker/tests/pretest-variant.test.js
```

Fixture `onboarding-worker/tests/fixtures/lynk-testing-only-payment.json`
berasal dari bentuk payload transaksi Testing Only yang berhasil diterima pada
17 September 2026; data personalnya sudah disamarkan. Pengujian menggandakan
fixture itu secara lokal untuk ketiga judul produk, sehingga tidak memerlukan
tiga pembelian dengan harga asli. Fixture dengan Transaction ID transaksi uji
yang disetujui harus membuka `insurance`; Transaction ID lain dengan judul
`Testing Only` yang sama tetap ditolak oleh resolver produksi.

## Struktur komponen

```text
app/
  src/main/assets/modules/*.pmod
  src/main/java/id/umkmnaikkelas/panglima/ModuleActivity.java
onboarding-worker/
  worker.mjs
  schema-token-requests.sql
  google-apps-script/Panglima_PRETEST_Automation.gs
security-worker/
  worker.js
  wrangler.jsonc
tools/encrypt_module.py
```
