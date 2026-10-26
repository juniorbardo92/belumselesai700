# Portal Affiliate Panglima UMKM

Ekspor 2026-10-03 | Worker snapshot 24 Agustus; frontend/patch sampai 21 September 2026

Portal mitra dan administrasi referral: pendaftaran, OTP, dashboard, penjualan, komisi, serta penerusan webhook Lynk. Frontend merupakan bagian dari website; UI admin juga tersimpan dalam source Worker.

## Status ekspor

Source Worker, backend Apps Script, komponen portal, patch website, dan baseline frontend tersedia.

## Isi folder

- dokumentasi_asli/
- kode/

## Alur kerja

1. Mitra mendaftar dan melewati verifikasi yang ditetapkan sistem.
2. Worker menerima permintaan portal dan meneruskannya ke backend Apps Script.
3. OTP/sesi mengatur akses ke dashboard mitra atau admin.
4. Webhook pembayaran dicocokkan dengan transaksi/referral untuk pencatatan komisi.
5. Admin meninjau status mitra, transaksi, dan pembayaran sesuai akses.

## Penggunaan

1. Gunakan dokumentasi_asli untuk membedakan frontend mitra dan UI admin Worker.
2. Kode frontend berkas tunggal memerlukan proyek website induk; baseline Hostinger disertakan sebagai acuan.
3. Dashboard dan komisi bergantung pada backend serta data Sheets yang tepat.
4. Simpan fungsi pendaftaran, webhook, dan perhitungan yang stabil saat menyiapkan salinan uji.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| Frontend | React/JSX pada website Hostinger; HTML admin dalam Worker |
| Proxy/API | Cloudflare Worker /portal dan penerus webhook |
| Backend | Google Apps Script + Google Sheets |
| Akses | OTP, sesi, allowlist/CORS, rate limit |
| Transaksi | Lynk payment webhook dan catatan komisi |

## Pemulihan dan pengembangan

1. Pilih snapshot Worker dan Apps Script yang kompatibel; arsip tahap lama dipisahkan dari patch frontend terbaru.
2. Hubungkan salinan website/Worker ke deployment Apps Script serta spreadsheet uji, bukan ke data produksi.
3. Pasang kembali secret webhook, Worker-to-GAS, email, dan akses admin pada lingkungan masing-masing.
4. Pulihkan struktur tab Sheets dari fungsi setup milik snapshot yang dipilih; isi transaksi/komisi nyata tidak ada dalam ekspor.
5. Uji login dan pembacaan dashboard, lalu satu fixture transaksi pada lingkungan uji sebelum melanjutkan.

## Pemeriksaan sesudah pemulihan

- OTP dan sesi membedakan mitra serta admin.
- Kode referral dan identitas transaksi tercatat sesuai sumber.
- Pengiriman ulang event tidak menggandakan transaksi atau komisi.
- Dashboard dapat dibaca tanpa membuka hak admin yang tidak sesuai.

## Kelengkapan yang belum tersedia

- Export source tidak mengambil konfigurasi Worker dan deployment Apps Script yang aktif saat ini.
- Database/Sheets produksi, saldo komisi, transaksi, serta nilai secret tidak termasuk.
- Baseline frontend berasal dari 20 September; patch 21 September disertakan terpisah dan tidak diterapkan otomatis.
- Berkas salin-tempel Apps Script dapat berisi beberapa lapisan fungsi/patch. Pilih satu baseline dan tinjau urutan fungsi sebelum pemulihan.
- Tidak ada pembayaran, persetujuan mitra, email, atau perubahan sistem produksi yang dilakukan dalam ekspor ini.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
