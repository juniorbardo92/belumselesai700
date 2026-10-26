# Audit dan perbaikan — UMKM Content Monetization Engine

**Diperiksa:** 23 September 2026  
**Ruang lingkup bisnis:** Paket Panglima UMKM dan tiga Paket Jalur: Agen Asuransi, Agen Properti, MLM/Direct Selling. Transaksi Rp5.000 yang diketahui adalah **testing-only**. Penjualan affiliate pihak ketiga tidak termasuk scope bisnis ini.

## Perbaikan yang sudah diterapkan

1. **Materi dan jadwal Repliz.** Pada JSON referensi dan JSON dalam ZIP impor, tepat 24 balasan CTA komersial diberi URL halaman produk resmi menurut nichenya. Paket tetap berisi 168 utas dan 1.347 post; field lain dari `items`, ID, waktu, media, urutan balasan, serta skrip CMD/PowerShell dan panduan dalam ZIP tidak berubah. Setelah masuk ke Repliz, **22 utas pending** yang cocok dengan isi paket diedit pada balasan CTA terakhir dan disimpan tanpa membuat jadwal baru. Jumlah balasan serta teks lain dibandingkan sebelum tiap simpan; contoh pada 24 Sep, 25 Sep, 26 Sep, dan 5 Okt WIB dibaca ulang di detail jadwal dan memuat URL. Dua utas 23 Sep (`TH-D02-02`, `TH-D02-08`) sudah `Success` dengan CTA lama tanpa URL; tidak di-retry atau ditimpa.
2. **Workbook 16 tab.** Inventaris bisnis memuat Panglima UMKM dan tiga Jalur sebagai `own_product` dengan status **Draft** dan runtime **YELLOW**. Setelah pendaftaran, workbook diisi ID offer/campaign D1 dan harga halaman produk Rp349.000. Empat URL Lynk yang diberikan pada 24 September dicatat di kolom catatan tiap produk sebagai calon checkout; dua screenshot seller memperlihatkan empat nama blok dan harga pratinjau IDR 349K. Kolom tujuan offer tetap halaman resmi. Product UUID tetap kosong karena tidak tampak di screenshot. Baris `Testing` beserta UUID historis dipertahankan; label `Paused` di workbook adalah status yang diusulkan dalam template, **bukan perubahan status offer aktif di D1**. Adapter affiliate eksternal ditandai dormant/N/A pada dokumentasi, tanpa menghapus kode.
3. **Pendaftaran empat draft melalui API.** [Run GitHub Actions berhasil](https://github.com/varashoil108-design/umkm-content-os/actions/runs/35918353906) setelah uji idempotensi/konflik/token (3/3). Empat offer dan empat campaign baru ditulis sebagai `draft` dengan ID deterministik dan tujuan halaman resmi. Pembacaan ulang D1 memastikan keempatnya ada; offer uji aktif Rp5.000 tidak berubah. Tidak ada tracked link, pemetaan product UUID, transaksi, migrasi, deploy Worker, atau perubahan jadwal.
4. **Pemisahan kualitas pendapatan.** Workbook membedakan atribusi teknis transaksi uji dari pendapatan bisnis. Tidak dibuat pembayaran baru atau reprocess ulang. Rumus ringkasan menghitung status dari sel sekarang, bukan angka lama yang ditulis tetap.

## Temuan langsung dari D1 dan [draft PR #7](https://github.com/varashoil108-design/umkm-content-os/pull/7)

| Area | Bukti pada 23 September | Implikasi |
| --- | --- | --- |
| Runtime | PR melaporkan v14 kembali 100% setelah canary kandidat v15; PR masih draft | Jangan menganggap proteksi v15 sudah menjadi runtime tetap |
| Offer D1 | Offer uji `off-lynk-prod-6a866261` tetap aktif Rp5.000. Empat offer bisnis dan empat campaign telah dibuat dalam status `draft` Rp349.000, menuju halaman produk resmi | Identitas SKU checkout dan UUID Lynk belum diverifikasi; draft belum layak diaktifkan |
| Tracked link | Satu slug Instagram `kas-umkm-lynk` mengarah ke produk uji | Jangan pakai slug ini untuk keempat paket |
| Receipt uji Rp5.000 | `rev-8c89beb3-25e4-48e5-85ae-45947ea9f64f` berstatus `confirmed`, `attributed`, model `last_touch` setelah reprocess historis | Keberhasilan atribusi teknis tidak mengubah klasifikasi testing-only menjadi penjualan bisnis |
| Ledger lain | Terdapat dua baris `confirmed` lain: Rp5.000 pada 31 Agustus dan Rp14.000 pada 17 September, keduanya tanpa offer/campaign | Klasifikasi bisnis atau uji belum dapat disimpulkan; jangan gabungkan begitu saja dengan pendapatan terverifikasi |
| Kualitas data | Tabel `monetization_record_quality` ada, tetapi kosong | Tidak ada baris revenue yang telah dinyatakan `production+verified` dengan bukti |
| Kandidat v15 | Kode operasi/learning memakai filter `production+verified` dan melewati learning saat revenue terverifikasi nol | Jalur pemisahan data tersedia pada kandidat; belum menjadi bukti bahwa dashboard produksi v14 menyaring transaksi uji |

| Produk bisnis | Offer ID | Campaign ID | Status |
| --- | --- | --- | --- |
| Paket Panglima UMKM | `off-panglima-umkm-20260923` | `cam-panglima-umkm-20260923` | Draft Rp349.000 |
| Jalur Agen Asuransi | `off-jalur-asuransi-20260923` | `cam-jalur-asuransi-20260923` | Draft Rp349.000 |
| Jalur Agen Properti | `off-jalur-properti-20260923` | `cam-jalur-properti-20260923` | Draft Rp349.000 |
| Jalur MLM/Direct Selling | `off-jalur-mlm-20260923` | `cam-jalur-mlm-20260923` | Draft Rp349.000 |

PR juga mencatat satu proses learning lama menggunakan dua event senilai total Rp10.000 dan menyimpan tiga insight. Karena provenance revenue belum diverifikasi dan Rp5.000 yang diketahui adalah testing-only, insight itu tidak boleh dipakai sebagai rekomendasi bisnis otomatis.

## Verifikasi artefak

| Pemeriksaan | Hasil |
| --- | --- |
| JSON/ZIP | 168 utas, 24 CTA diberi URL, empat rute halaman resmi; field lain pada `items` tetap |
| Repliz | 22 CTA pada utas `Pending` diedit dengan pencocokan lengkap opener/balasan; empat contoh lintas tanggal diverifikasi dari detail. Dua utas `Success` tetap tanpa URL; tidak ada impor ulang |
| ZIP impor | Lima anggota tetap; hanya JSON berubah; skrip CMD, PowerShell, dan README identik secara byte |
| Workbook | 16 tab tetap; empat URL Lynk dan verifikasi harga pratinjau seller dicatat di produk, UUID kosong, tujuan draft tidak berubah; tidak ada error formula |
| Roadmap | 22 GREEN / 9 YELLOW / 1 N/A |
| Acceptance | 30 GREEN / 12 YELLOW / 2 N/A |
| Rumus ekspor | Tidak ada error formula baru |

**ID 24 CTA:** TH-D02-02, TH-D02-08, TH-D03-06, TH-D04-03, TH-D05-07, TH-D06-04, TH-D07-02, TH-D07-08, TH-D09-01, TH-D09-03, TH-D10-05, TH-D10-07, TH-D12-04, TH-D12-06, TH-D13-08, TH-D14-01, TH-D15-05, TH-D16-02, TH-D17-04, TH-D17-06, TH-D19-01, TH-D19-03, TH-D20-05, TH-D20-07.

## Gate yang belum tertutup

1. **Identitas checkout.** Halaman resmi keempat produk yang diperiksa sebelumnya menampilkan Rp349.000. Pada 24 September, empat URL Lynk yang diberikan telah dicocokkan dengan tautan di halaman resmi:

   | Produk | Nama blok di screenshot seller | URL Lynk calon checkout | Harga pratinjau |
   | --- | --- | --- | --- |
   | Panglima UMKM | Paket Panglima UMKM | https://lynk.id/wgunawan168/9rov84wv3grz | IDR 349K |
   | Jalur Agen Asuransi | Strategi Sun Tzu - Jalur Agen Asuransi | https://lynk.id/wgunawan168/13xroeodllel | IDR 349K |
   | Jalur Agen Properti | Strategi Sun Tzu - Jalur Properti | https://lynk.id/wgunawan168/x4wnrp41mz10 | IDR 349K |
   | Jalur MLM/Direct Selling | Strategi Sun Tzu - Jalur Mitra MLM/Direct Selling | https://lynk.id/wgunawan168/zdkx923vk735 | IDR 349K |

   Bukti: screenshot seller `10534910-3035-4744-abcd-e4e655ed753e.png` dan `1efef79b-661e-4e79-b67f-22e38d9aa85c.png`. Nama blok lama yang berbeda untuk tiga Jalur kini dapat dijelaskan sebagai judul di Lynk, tetapi screenshot tidak membuktikan hubungan ID internal antara blok dan keempat URL pendek. Pemeriksaan langsung halaman Lynk terhalang pembatasan akses. Status publik, varian bila ada, total checkout final, dan product UUID/SKU yang dipakai webhook belum tampak. Pengguna tidak melihat opsi ekspor katalog ataupun ID di detail produk, sehingga **pencarian ID manual dihentikan**. Kode v14 memproses `payment.received` sukses, membaca `items[0].uuid`, dan menyimpan ID sebagai `metadata_json.externalProductId` meskipun mapping belum ada. Pemeriksaan D1 pada 24 September menemukan **nol** revenue Lynk baru sejak 23 September. Saat pesanan biasa kelak masuk, cocokkan `transaction_id`/`refId`, nama item di riwayat seller, ID webhook dan nominal. Keempat produk sama-sama IDR 349K, jadi nominal saja tidak cukup untuk mengidentifikasi produk. Setelah satu ID terbukti, buat provider mapping dan tracked link untuk produk itu saja; jangan mengganti offer uji aktif atau membuat transaksi uji baru.
2. **CTA terukur.** Empat halaman publik dapat dibuka. Dua puluh dua CTA pending sudah diberi URL resmi di Repliz, tetapi URL tersebut belum berupa tracked link ke empat offer. Dua CTA yang sudah terbit tidak menyediakan opsi edit di menu jadwal; pertahankan dan ukur mulai konten berikutnya tanpa memicu ulang publikasi. Sebelum mengubah URL yang sudah dijadwalkan menjadi tracked link, verifikasi SKU checkout, provider mapping dan redirect per niche.
3. **Kualitas data.** Tandai Rp5.000 yang diketahui sebagai internal test melalui alur review berkredensial dan histori kualitas saat tersedia. Tinjau dua baris lain dari bukti transaksi asli sebelum memberi label. Pastikan dashboard/learning yang dipakai untuk keputusan bisnis memakai data `production+verified`; lakukan regresi kandidat v15 sebelum rilis.
4. **Bukti konversi nyata.** Tunggu pesanan normal dari empat paket, kemudian cocokkan konten→klik→checkout→receipt→atribusi→analitik→learning→draf. Jangan membuat pembayaran uji lagi. Status final tetap **YELLOW**.

Empat offer/campaign D1 kini tercatat sebagai draft. Empat URL Lynk sudah terpasangkan sebagai calon checkout dalam dokumentasi, dan screenshot seller mengonfirmasi empat nama blok beserta harga pratinjau IDR 349K. URL belum diaktifkan sebagai tujuan offer atau mapping. Jadwal Repliz telah diperbaiki selektif pada 22 CTA pending; dua utas sukses terbit dipertahankan. Product UUID/SKU, status publik dan total checkout belum terbukti. Klasifikasi kualitas dan dashboard produksi belum berubah. ID internal akan diambil dari webhook pesanan biasa yang sah, lalu dicocokkan dengan riwayat seller; tidak perlu mencari ID di dashboard atau membuat pembayaran uji.
