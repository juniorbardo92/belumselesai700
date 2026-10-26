# Panglima Affiliate Admin

Ekspor 2026-10-03 | Phase 2J SAFE; rollback Phase 2G STABLE

Klien Android admin untuk login OTP, dashboard mitra, filter riwayat, funnel mitra, dan monitoring komisi/payout. Paket Phase 2J menampilkan ringkasan Earned, Outstanding, Paid, serta pencarian transaksi.

## Status ekspor

APK Phase 2J, source builder/HTML, audit, ikon, dan APK baseline Phase 2G tersedia.

## Isi folder

- aplikasi/
- dokumentasi_asli/
- kode/

## Alur kerja

1. Admin membuka aplikasi dan melakukan login sesuai endpoint backend.
2. Aplikasi membaca snapshot admin_dashboard.
3. Dashboard, funnel, riwayat, serta monitor komisi ditampilkan dengan pencarian/filter.
4. Aksi perubahan status yang dipertahankan adalah APPROVED ONLY sesuai audit Phase 2J.
5. Informasi komisi dibaca; Phase 2J tidak menambahkan endpoint penulisan komisi.

## Penggunaan

1. Pilih APK Phase 2J pada folder aplikasi; aplikasi ini memiliki package terpisah safe2j.
2. Masukkan akses admin yang valid melalui alur login aplikasi.
3. Gunakan tab komisi dan filter ALL/PENDING/APPROVED/PAID untuk meninjau ringkasan.
4. Audit dan README asli menjelaskan batas tindakan serta package/activity yang digunakan.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| APK | Package id.umkmnaikkelas.panglimaadmin.safe2j |
| Aktivitas | Baseline MainActivity dari Phase 2G STABLE |
| Antarmuka | HTML/JavaScript, disematkan sebagai string DEX |
| Build | Builder Python memakai baseline APK, Pillow, cryptography |
| Data | Snapshot admin_dashboard; sesi RAM menurut audit |
| Penandatanganan | Memerlukan key .p12 dan password asli untuk rebuild sejenis |

## Pemulihan dan pengembangan

1. Untuk pemakaian, mulai dari APK Phase 2J yang disertakan; hash cocok dengan audit asli.
2. Untuk mengubah UI, gunakan phase2j_ui.html dan builder di kode/source_phase2j.
3. Builder memiliki path /mnt/data tetap; sesuaikan path pada salinan kerja. Baseline Phase 2G ada di aplikasi/rollback.
4. Signing key, password, dan logo JPEG asli tidak dimasukkan. Ikon PNG tersedia, tetapi input gambar asli builder belum lengkap.
5. Sebelum mengganti instalasi, periksa kesesuaian sertifikat dan endpoint backend; source ini bukan proyek Android Studio/Gradle lengkap.

## Pemeriksaan sesudah pemulihan

- Package dan label membedakan Phase 2J dari baseline rollback.
- Login dan pembacaan dashboard menggunakan akses admin yang sah.
- Filter/funnel/komisi menampilkan data sesuai snapshot backend.
- Aksi APPROVED ONLY tetap sesuai batas audit; monitoring tidak mengubah komisi.

## Kelengkapan yang belum tersedia

- Source Phase 2J berupa empat file builder/UI/README/ikon, bukan source native lengkap.
- Rebuild membutuhkan signing key/password dan penyesuaian path. Ekspor ini tidak membangun atau menandatangani APK baru.
- SHA256 APK cocok dengan audit asli; verifikasi tanda tangan APK secara mandiri dan instalasi HP tidak dijalankan di sini.
- Data backend dan sesi admin produksi tidak termasuk.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
