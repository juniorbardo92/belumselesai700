# Panglima UMKM

Ekspor 2026-10-03 | APK v1.3.15-MODUL

Aplikasi pendamping peserta: diagnosis 10 medan, workbook, aksi 30 hari, progres, toolkit, dan konsultasi. Modul spesialis mencakup Agen Asuransi, Agen Properti, serta Mitra MLM/Direct Selling.

## Status ekspor

APK terbaru tersedia. Aset APK diekspor persis; kode native dan backend tersedia dalam snapshot versi berbeda.

## Isi folder

- aplikasi/
- dokumentasi_asli/
- kode/

## Alur kerja

1. Peserta mengisi PRE-TEST dan memperoleh hak akses sesuai produk/jalur.
2. Layanan onboarding dan perangkat memeriksa token, profil, serta hak modul.
3. Peserta membuka diagnosis, workbook, dan rencana aksi.
4. Jawaban dan progres disimpan oleh aplikasi; layanan online dipakai untuk fungsi yang memerlukannya.
5. Sertifikat memakai layanan terpisah sesuai konfigurasi aplikasi.

## Penggunaan

1. Gunakan APK dalam folder aplikasi untuk instalasi; simpan instalasi dan data lama sebelum uji pembaruan.
2. Buka modul sesuai hak peserta dan isi satu latihan sebagai pemeriksaan awal.
3. Tutup lalu buka kembali aplikasi untuk memeriksa penyimpanan jawaban.
4. Periksa navigasi modul, progres, konsultasi, dan PRE-TEST pada perangkat uji.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| Klien | Android Java/WebView, HTML, CSS, JavaScript |
| Layanan | Worker perangkat, onboarding, security, dan certificate |
| Penyimpanan | Data lokal aplikasi serta skema D1 pada source backend |
| Konfigurasi | assets/config.js di APK v1.3.15; Gradle dan workflow pada snapshot |
| Kredensial | Signing key, secret modul, token layanan: nilai tidak diekspor |

## Pemulihan dan pengembangan

1. Untuk memakai aplikasi, mulai dari APK v1.3.15; source GitHub main bukan pengganti source versi ini.
2. Untuk pengembangan, pilih satu snapshot source dan baca README serta build.gradle.kts milik snapshot itu.
3. Aset pada kode/aset_apk_v1.3.15 berasal dari APK tersebut. Jangan mencampur otomatis dengan Java/backend dari snapshot lain.
4. Bangun pada lingkungan terpisah dengan JDK/Gradle/Android SDK sesuai workflow yang dipilih; signing produksi perlu dipasang kembali.
5. Pulihkan layanan onboarding/perangkat/sertifikat beserta binding dan skema yang cocok, kemudian uji satu peserta sebelum distribusi.

## Pemeriksaan sesudah pemulihan

- Instalasi dan pembaruan mempertahankan data peserta.
- Token dan hak jalur membuka modul yang sesuai.
- Jawaban latihan tersimpan setelah aplikasi dibuka ulang.
- PRE-TEST, konsultasi, dan sertifikat memakai endpoint yang benar.

## Kelengkapan yang belum tersedia

- Source native lengkap yang terbukti menghasilkan APK v1.3.15 belum ditemukan; APK dan seluruh 10 asetnya tersedia.
- Cabang modul interaktif diekspor sebagai kode tanpa 88 bagian modul terenkripsi lama (63.951.373 byte). Daftar pengecualian disertakan; snapshot ini tidak diklaim sebagai build lengkap.
- GitHub main terakhir yang diakses bertanggal 28 Agustus 2026; arsip produksi 22 September dan cabang modul disimpan terpisah.
- Data pengguna di HP, database produksi, secret modul, dan signing key tidak termasuk ekspor ini.
- Instalasi HP, proses pembelian, pengiriman email, dan pemulihan produksi belum diuji dalam pekerjaan ekspor ini.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
