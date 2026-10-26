# Pekerjaan tersisa

Daftar ini menyatakan status catatan terakhir dan kelengkapan ekspor, bukan hasil audit runtime 24 Oktober.

## UMKM Content OS

Source /opt/umkm-engine terbaru, state antrean, serta rekonsiliasi Threads dan Instagram H+1 masih perlu dicocokkan dengan VPS.

## Kalyanamitra Content OS / KAL-AUTO

Terrekonsiliasi 26 Oktober 2026 melalui pembacaan langsung VPS2 (`VM-0-10-ubuntu`) dan VPS4 (`VM-4-5-ubuntu`), read-only:

- Kandidat sudah terpasang dan berjalan: receiver V4, kalauto/worker V3, monitor hotfix (VPS2); sender V3 + notify V4 + intake + kedua skill + signed bridge (VPS4).
- Timer `kalauto-schedule-worker.timer` dan `kalauto-publication-monitor.timer` aktif.
- Antrean saat pembacaan: 50 `SCHEDULED` + 1 `DRAFT` (2 job diproses 21 Okt, 48 pada 22 Okt). Catatan lama "29 scheduled / 21 ready / 1 draft" sudah kedaluwarsa: 21 job READY telah menjadi SCHEDULED.
- Bukti publikasi: 12 baris proof, 13 alert; beberapa job `CONTENT_CONFIRMED` dengan 7 URL post Threads dan alert Telegram berstatus `SENT`.
- Pembatalan/ubah jadwal/hentikan otomasi belum punya jalur agen (tool hanya `bootstrap`/`submit`/`status`); dilakukan manual di dashboard Repliz atau oleh operator.
- `parent_child` tetap `NOT_VERIFIED`: Repliz Content API tidak mengembalikan field induk (terbukti dari probe field: hanya `createdAt, description, id, medias, owner, title, type, url`). Pemilik memakai Repliz, bukan Meta; status ini batasan permanen, bukan pekerjaan tertunda.
- UAT alur intent pemilik (26 Okt): intake, draft, tolak materi tanpa sumber, tolak target non-Threads, dan cek status = PASS; uji penjadwalan nyata (UAT-5) deferred sampai materi 6–8 bagian dengan sumber terverifikasi siap dijadwalkan.

## UMKM Monetization Engine

Lengkapi pemetaan SKU/produk, bukti transaksi produksi, korelasi GA4, dan telemetry aplikasi. Konfigurasi serta source runtime terbaru belum ditarik.

## Portal Affiliate Panglima UMKM

Perlu mencocokkan snapshot Worker/Apps Script dengan deployment aktif dan menguji referral serta payout. Transaksi, komisi, dan Google Sheets produksi tidak disertakan.

## Panglima Affiliate Admin

Source native lengkap, signing key, baseline APK, dan sebagian input gambar tidak ada dalam ekspor source publik ini. Rebuild dan uji perangkat belum dilakukan.

## Lead Capture / Diagnosis 10 Medan / Waitlist

Pasang konfigurasi Google Sheets dan email milik lingkungan tujuan; verifikasi pencatatan prospek serta follow-up. Data lead dan trigger akun aktif tidak disertakan.

## Panglima UMKM

Source native yang terbukti menghasilkan APK v1.3.15 belum lengkap. APK, modul terenkripsi, signing key, dan dokumen biner tidak dipublikasikan dalam ekspor source ini.

## Website UMKM Naik Kelas

Ini snapshot staging, belum dicocokkan dengan website produksi saat ini. Uji build dan penerapan perbaikan SEO perlu dilakukan pada lingkungan pengembangan.

## Hermes AI Office / Project Advisor / Quality Gate

Perlu menarik konfigurasi runtime yang telah disanitasi dan meninjau checklist operasional terbaru. Komponen khusus MetaSuite tidak diekspor.

## Hermes SEO

Binding @jagoan_seo_bot pernah lulus UAT. Source/config runtime terbaru serta hasil penerapan optimasi website belum dicocokkan dalam ekspor ini.

## Melengkapi dari VPS

Ambil source terbaru dari lokasi aplikasi yang benar, dengan konfigurasi contoh yang telah disanitasi. Cocokkan versi/file terhadap snapshot repository sebelum menggabungkannya. Simpan database produksi, token, password, signing key, dan data pelanggan melalui mekanisme privat terpisah.
