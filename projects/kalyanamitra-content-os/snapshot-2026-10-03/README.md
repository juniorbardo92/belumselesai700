# Kalyanamitra Content OS

Ekspor 2026-10-03 | Bridge 1.0.3; Lite recovery; cabang importer v81; paket 450 utas

Sistem pengelolaan konten Ruang Kalyanamitra: sumber Dharma, draft, pemeriksaan editorial, impor batch, dan penghubung Threads/Instagram. Sebagian kode memakai mesin UMKM Content OS yang sama.

## Status ekspor

Kode cabang importer, bridge, bot Lite, bank konten, pemantau IG, dan panduan asli tersedia.

## Isi folder

- bank_konten/
- dokumentasi_asli/
- kode/
- operasional/

## Alur kerja

1. Konten disusun dengan tradisi, sumber, status verifikasi, dan identitas editorial.
2. Bank 450 utas disimpan sebagai draft/content pack dan payload impor manual.
3. Importer atau bridge memilih brand/namespace ruang-kalyanamitra dan akun yang sesuai.
4. Renderer dan pemeriksaan kualitas menyiapkan materi visual.
5. Pipeline publikasi mengikuti konfigurasi versi yang dipakai; monitor IG memeriksa hasil Threads dan jadwal agar tidak duplikat.

## Penggunaan

1. Mulai dari bank_konten dan dokumentasi_asli untuk melihat isi serta panduan yang berlaku pada tiap paket.
2. Bedakan draft content pack, payload Repliz, dan pemantau IG; ketiganya bukan berkas yang saling menggantikan.
3. Pilih akun @ruangkalyanamitra dan namespace ruang-kalyanamitra.
4. Saat pemulihan, gunakan satu batch uji dengan sumber yang diperiksa sebelum membuka antrean berikutnya.

## Komponen teknis

| Komponen | Keterangan |
| --- | --- |
| Mesin bersama | Snapshot cabang umkm-content-os untuk importer v81 |
| Bridge | Plugin OpenClaw 1.0.3; source adapter 1.1.0 |
| Bot alternatif | Worker Kalyanamitra Lite, Telegram, D1, Workers AI |
| Konten | 450 utas; paket 15 content pack dan payload 3.150 post |
| IG | Pemantau PowerShell Cloudflare satu pintu; integrasi Repliz |
| Identitas | namespace ruang-kalyanamitra; brand-ruang-kalyanamitra |

## Pemulihan dan pengembangan

1. Pilih jalur pemulihan yang cocok: mesin Content OS bersama, bridge lama, atau bot Lite. Jangan mengaktifkan ketiganya sekaligus sebagai publisher.
2. Untuk importer, gunakan snapshot_cabang_import_v81 beserta package.json, SQL, dan dokumentasi di snapshot.
3. Untuk bot Lite, gunakan schema.sql dan wrangler.jsonc pada kode/lite; pasang binding DB/AI serta secret Telegram dan dua ID admin.
4. Untuk pemantau IG Windows, baca PETUNJUK_Cloudflare_Satu_Pintu.txt; kredensial tersimpan Windows tidak ikut dipindahkan oleh ZIP.
5. Periksa mode publikasi, namespace, akun, dan ledger sebelum memulihkan penjadwalan.

## Pemeriksaan sesudah pemulihan

- Importer menerima content pack dan menolak identitas brand/akun yang keliru.
- Sumber konten dan status verifikasinya tersimpan.
- Status Threads dan postId nyata dibaca sebelum proses IG.
- Ulangan pekerjaan memakai jurnal/ledger dan melewati pekerjaan yang telah selesai.

## Kelengkapan yang belum tersedia

- Bridge 1.0.3 dan bot Lite adalah arsip draft-only; source UMKM main memiliki pipeline full automation. Mode itu harus dipilih secara eksplisit, bukan disamakan.
- Snapshot importer adalah cabang pengembangan, bukan bukti versi yang sedang berjalan di produksi.
- Secret Telegram/Repliz/R2, credential Windows terenkripsi, D1 aktif, serta seluruh objek R2 tidak termasuk.
- Jadwal pada bank konten adalah jadwal arsip September-Desember 2026; jangan mengimpor ulang batch yang sudah dijadwalkan.
- Status tayang dan metrik akun tidak diperiksa ulang dalam pekerjaan ekspor ini.

## Integritas dan sumber

Jalankan python3 verifikasi_ekspor.py atau py verifikasi_ekspor.py. Program hanya memeriksa SHA256. DAFTAR_BERKAS.csv memuat seluruh isi, ukuran, dan hash. SUMBER_DAN_VERSI.json menjelaskan asal serta versi. Dokumentasi asli merupakan arsip versi, bukan pemeriksaan ulang layanan saat ini.
