# Patch SEO aman bagi fitur gambar — umkmnaikkelas.id

**Status: patch sumber siap diuji, BUKAN izin untuk langsung overwrite website produksi.**

## Temuan dari arsip 13 Oktober 2026

- Source menggunakan **Hostinger Horizons + Vite + React SPA**.
- `index.html` memuat judul generik; `<Helmet>` mengatur title, canonical, dan H1 tersedia dalam DOM React setelah JavaScript dijalankan.
- Data artikel terdiri dari **47 artikel** pada `apps/web/src/data/site.js`.
- `apps/web/public/sitemap.xml` dalam arsip memiliki **26 URL**, sementara audit website aktif sebelumnya melaporkan **57 URL**. Versi produksi dan arsip harus dicocokkan terlebih dahulu.
- Ada gambar AVIF/WebP/base64 di banyak komponen, responsif `srcSet` dan zoom buku, yang **tidak dimodifikasi** oleh patch ini.

## Apa yang diubah

Hanya dua aspek: file baru `apps/web/tools/generate-static-seo.mjs` dan menambahkan `&& node tools/generate-static-seo.mjs` pada akhir perintah `build` di `apps/web/package.json`.

Skrip Node tanpa dependensi tambahan ini berjalan **setelah** Vite build. Ia membangkitkan HTML wrapper untuk route statis yang ada di source, dengan `<title>`, description dan canonical unik dalam **HTML awal**. Tidak mengubah komponen React, kode gambar, pixel, Analytics, sumber gambar, upload, lazy loading, zoom, `srcSet`, atau pengaturan asset.

**Batasan:** Patch ini **belum membuat H1/konten sebagai HTML awal** karena SSR/hydration penuh berpotensi merusak interaktivitas dan gambar jika dilakukan tanpa pengujian browser menyeluruh. Google tetap dapat merender H1 lewat JavaScript. Jadi 57 temuan missing H1 pada auditor raw-HTML mungkin masih ada. Jangan mengklaim 172 temuan sudah hilang.

## Integrasi ke source TERBARU, bukan overwrite source produksi

1. Backup source produksi saat ini, ekspor dan simpan.
2. Salin isi folder patch ini ke komputer atau staging; pada direktori source terbaru jalankan `python /path/ke/Hermes_SEO_Patch_ImageSafe/apply_patch.py /path/ke/source-terbaru`.
3. Pastikan file `apps/web/src/` (termasuk semua gambar) tidak berubah. Terapkan `npm ci && npm run build` bila Node/npm tersedia.
4. Di dist (`dist/apps/web`), periksa `index.html`, `artikel/<slug>/index.html` dan `seo-route-manifest.json`; route-HTML hanya memuat metadata statis, app tetap SPA normal.
5. Deploy **ke staging** dengan konfigurasi hosting yang melayani `/artikel/<slug>` menggunakan HTML route yang sesuai. Periksa status HTTP, redirect, canonical, dan image URLs. Beberapa server mengalihkan folder ke alamat berakhiran `/` yang bisa tidak cocok dengan canonical; jangan publish bila itu terjadi.
6. Bandingkan Chrome Developer Tools (gambar, `srcSet`, click zoom, responsive, desktop/mobile), link/CTA/form, serta file image. Pastikan contoh artikel di `/artikel/meningkatkan-konversi-penjualan-umkm` menampilkan gambar yang sama seperti sebelum patch.
7. Publish hanya setelah staging lulus dan backup/rollback telah tersedia. Setelah publish, jalankan Hermes SEO lagi untuk perbandingan.

**Tidak perlu mengunggah atau mengganti seluruh arsip Horizons lama ke produksi.** Pindahkan hanya file patch dan integrasikan dengan source produksi **terbaru**.

## Rollback

Hapus penambahan `&& node tools/generate-static-seo.mjs` dari script build `apps/web/package.json` atau pulihkan `package.json.bak-seo-*`. Build ulang dan deploy versi sebelumnya. File baru `apps/web/tools/generate-static-seo.mjs` boleh dibiarkan atau dihapus. Simpan backup deployment lama sampai semua uji berhasil.

## Pengujian yang dilakukan sebelum distribusi

- Sintaks JS `node --check`: lulus.
- Pengujian pembangkitan SEO dari HTML contoh: **61 route (14 halaman utama + 47 artikel)**, 1 title dan 1 canonical setiap route, berulang tanpa konflik.
- Seluruh file di `apps/web/src/` dalam export asli tidak berubah (SHA256 sama).
- Fitur React/gambar **belum diuji secara end-to-end** karena penginstalan dependency Vite tidak selesai di lingkungan pengujian. Tidak mengklaim gambar sudah diuji live.
- Belum ada perubahan pada website live.
