# Lead Capture, Diagnosis 10 Medan, dan Waitlist

Ekspor 2026-10-03 | SAFE 9; frontend revisi September 2026

Alur calon peserta: diagnosis/checklist, formulir kebutuhan pendampingan, pencatatan prospek, segmentasi, serta antrean follow-up. Kode frontend dan backend, PDF checklist, serta panduan deployment asli disertakan.

## Status ekspor

Source frontend/backend dan panduan SAFE 9 tersedia; daftar prospek aktif belum diambil.

## Isi folder

- dokumentasi_asli/
- kode/

## Alur kerja

1. Pengunjung mengakses checklist/diagnosis dan mengisi email atau formulir waitlist.
2. Form waitlist mencatat tiga medan terendah, masalah utama, dan target 30 hari.
3. Backend menulis data ke tab Sheets dan mengelompokkan prospek.
4. Antrean follow-up dibuat setelah form waitlist diterima.
5. Trigger memproses follow-up pada jendela 15.00-17.00 WIB; naskah WA tersedia untuk penggunaan manual.

## Penggunaan

1. Baca dokumentasi_asli/SAFE_9_DEPLOYMENT_GUIDE.txt sebelum menghubungkan website dan backend.
2. Gunakan PDF checklist yang sesuai; versi WAITLIST dan versi 12PT disimpan sebagai arsip terpisah.
3. Pilih frontend WaitlistPage serta router yang sesuai dengan website induk.
4. Periksa dashboard lead dan status follow-up untuk melihat catatan, bukan mengasumsikan email sudah diterima.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| Frontend | React: HomePage, WaitlistPage, dan App/router |
| Backend | Google Apps Script doGet/doPost |
| Tab Sheets | Lead Magnet Email; Waitlist Pendampingan; Events Lead Magnet |
| Antrean | Follow-up 5 Hari; Dashboard Lead Magnet |
| Email | GmailApp dengan MailApp fallback |
| Jadwal | Trigger per jam; jendela 15.00-17.00 WIB |

## Pemulihan dan pengembangan

1. Gunakan kode/frontend bersama baseline proyek website dan cocokkan URL Apps Script di komponen yang dipilih.
2. Buka source Code_SAFE_9_WAITLIST_FOLLOWUP.gs; pasang SPREADSHEET_ID dan alamat admin milik lingkungan pemulihan.
3. Periksa tab serta header yang diperlukan; data lead aktif tidak dibawa dalam paket.
4. Ikuti panduan deployment SAFE 9 pada salinan. Aktifkan installFollowUpTrigger() satu kali setelah transport email telah diuji.
5. Uji satu form dan urutan follow-up pada penerima uji yang ditentukan; periksa baris status sebelum membuka antrean penuh.

## Pemeriksaan sesudah pemulihan

- Form menyimpan tiga medan terendah, masalah, dan target.
- Waitlist membuat antrean; unduhan PDF saja tidak memicu rangkaian follow-up SAFE 9.
- Label prospek mengikuti classifyProspect_ pada snapshot backend.
- Status email dan error tercatat; penerimaan inbox memerlukan pemeriksaan penerima.
- Waktu eksekusi memakai WIB dan tidak membuat trigger ganda.

## Kelengkapan yang belum tersedia

- Google Sheets aktif, calon peserta, trigger terpasang, serta konfigurasi deployment tidak diekspor dari akun Google.
- Snapshot memiliki alamat admin, ID spreadsheet, dan URL lama; nilainya harus ditinjau untuk lingkungan tujuan.
- Pengiriman email pernah memerlukan pemeriksaan transport. Ekspor ini tidak membuktikan email otomatis bekerja saat ini.
- PDF checklist eksternal dapat berbeda dengan PDF base64 yang tertanam di backend; keduanya dipertahankan sesuai sumber.
- Frontend merupakan bagian website induk dan tidak diklaim sebagai aplikasi standalone yang dapat langsung dijalankan.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
