# UMKM Content OS

Ekspor 2026-10-03 | GitHub main 23 September 2026; bank 800 utas; patch IG H+1 2 Oktober

Sistem riset, produksi, rendering, penjadwalan, publikasi, dan evaluasi konten UMKM Naik Kelas. Ekspor mencakup mesin Worker, renderer, migrasi D1, bank konten, skrip Windows, serta patch VPS yang tersedia.

## Status ekspor

Snapshot main lengkap 44 file, arsip integrasi, 800 utas/7.200 post, dan 160 visual tersedia.

## Isi folder

- bank_konten/
- dokumentasi_asli/
- operasional/
- source/

## Alur kerja

1. Riset dan generator menghasilkan draft sesuai brand serta topik.
2. Konten masuk antrean render; renderer membuat visual dan menjalankan QA.
3. Media yang lolos disimpan di R2 dan dihubungkan dengan draft.
4. Publication gate memeriksa akun, jadwal, status, dan idempotensi sebelum Repliz.
5. Status dan jurnal dipakai untuk pemantauan serta seleksi Instagram H+1.

## Penggunaan

1. Buka source/github_main/README.md untuk peta komponen mesin.
2. Gunakan bank_konten/800_Utas_REWRITTEN_ALL.zip sebagai bank rewrite; payload final di dalamnya berisi 7.200 post.
3. Panduan importer Windows dan pemantau Hermes berada di operasional; baca versi serta prasyaratnya sebelum dipakai.
4. Patch_IG_H1_Aman_2026-10-02.py adalah patch terbatas pada worker yang telah ada, bukan aplikasi VPS lengkap.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| Worker | TypeScript, Cloudflare Workers, Cron |
| Database | D1; migrasi 0001 sampai 0006 pada snapshot main |
| Media | R2 umkm-content-media; renderer Playwright |
| Distribusi | Repliz Threads/Instagram; jurnal idempotensi |
| Integrasi | Skrip PowerShell, Hermes; adapter OpenClaw lama |
| Bank | 800 utas, 7.200 post, 160 PNG; periode 13 Okt-31 Des 2026 |

## Pemulihan dan pengembangan

1. Mulai dari source/github_main dan lockfile untuk menjaga dependency snapshot.
2. Konfigurasi asli memuat ID resource produksi, cron 5 menit, autopilot aktif, dan history-reset. Sebelum uji pada salinan, nonaktifkan flag autopilot/automation/reset dan gunakan resource uji terpisah.
3. Pulihkan skema database sesuai migrasi pada snapshot; database aktif tidak tersedia dalam paket ini.
4. Pasang secret layanan pada lingkungan yang dipilih, lalu periksa koneksi serta satu pekerjaan uji tanpa membuka seluruh antrean.
5. Untuk melengkapi kode VPS saat ini, jalankan LENGKAPI_EKSPOR_VPS.py di VPS pada /opt/umkm-engine. Script itu menyalin kode dan membuat ZIP tanpa menjalankan pipeline.

## Pemeriksaan sesudah pemulihan

- Konfigurasi uji tidak mengarah ke database/bucket produksi.
- Renderer dan QA berhasil untuk satu draft sesuai brand.
- Publication gate mengunci akun, jadwal, dan konten yang benar.
- Respons tidak pasti masuk rekonsiliasi, bukan pengiriman ulang buta.
- Jurnal Threads/IG dan jadwal sumber cocok sebelum menjalankan H+1.

## Kelengkapan yang belum tersedia

- Folder /opt/umkm-engine yang sedang berjalan di VPS belum diakses; yang tersedia hanya patch IG H+1 serta skrip/paket sebelumnya.
- D1/SQLite aktif, state antrean, systemd, kredensial runtime, dan seluruh objek R2 tidak dicadangkan dari server.
- Main yang diekspor bertanggal 23 September; cabang integrasi lain tidak digabung atau diterbitkan.
- Bank konten dan skrip impor merupakan artefak versi tertentu. Jadwal serta URL media aktif tidak dibuktikan dengan ekspor ini.
- Flag history-reset pada konfigurasi asli dapat memicu reset saat deployment; ekspor ini tidak menjalankan deployment atau reset.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
