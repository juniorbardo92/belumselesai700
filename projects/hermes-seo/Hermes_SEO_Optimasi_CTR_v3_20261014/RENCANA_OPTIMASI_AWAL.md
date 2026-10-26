# Rencana optimasi CTR awal — umkmnaikkelas.id

**Status:** editorial draft, belum dipublikasikan ke Hostinger.

**Basis:** Laporan Hermes SEO v2 periode 13 Sep–10 Okt 2026 yang dikirim pengguna (14 klik, 791 impresi, CTR 1,77%), ditambah metadata source Horizons yang pernah diunggah. Angka per artikel merujuk periode yang sama. Source ekspor bisa berbeda dari produksi, sehingga judul final **harus dibandingkan dengan laporan DOM v2**.

| Urutan | URL artikel | Impresi | Klik | Posisi | Judul di source ekspor | Hipotesis judul lebih ringkas untuk diuji |
|---|---|---:|---:|---:|---|---|
| 1 | `/artikel/negosiasi-diskon-klien-umkm` | 76 | 0 | 5,6 | Cara Negosiasi Diskon dengan Klien tanpa Merusak Margin | Klien Minta Diskon? Negosiasi Tanpa Merusak Margin |
| 2 | `/artikel/stok-tidak-merata-umkm` | 52 | 0 | 8,8 | Stok Tidak Merata? Cara Atur Stok UMKM per Lokasi | Stok Tidak Merata? Cara Atur Stok dan Transfer Antarlokasi |
| 3 | `/artikel/leadership-leader-mlm-direct-selling` | 38 | 0 | 5,8 | Leadership Leader MLM/Direct Selling: Bangun Tim yang Mandiri, Bukan Bergantung | Leadership MLM: Cara Bangun Tim Mandiri lewat Coaching |
| 4 | `/artikel/mengatasi-perang-harga-ecommerce-umkm` | 61 | 1 | 7,1 | Terjebak Perang Harga di E-Commerce? Ini Cara UMKM Menang Tanpa Banting Harga | Perang Harga Marketplace? Cara Menjaga Margin UMKM |

## Kriteria sebelum memilih judul

1. Gunakan hasil Search Analytics `query` + filter `page` untuk mengetahui query yang memang menghasilkan impresi. Data query GSC bisa disembunyikan atau tidak lengkap.
2. Periksa kesesuaian query utama dengan isi artikel dan H1; jangan mengubah judul hanya demi CTR atau menambahkan klaim yang tak ada dalam artikel.
3. Periksa title/snippet yang benar-benar muncul pada pencarian Google; Google dapat menyesuaikannya secara otomatis.
4. Jangan memodifikasi featured image, Open Graph image, JPEG/WebP/AVIF, srcSet, zoom buku, slug, CTA, canonical, dan sitemap.
5. Lakukan perubahan editorial satu/dua halaman dahulu hanya setelah disetujui dan didukung jalur editing Hostinger yang aman; simpan baseline, kemudian bandingkan 28 hari yang sebanding (peringkat, impresi dan query dapat berubah).

## Pengujian keberhasilan

- Metadata DOM tetap valid (title unik, H1, canonical yang benar; tanpa noindex).
- File gambar tetap terpasang; preview desktop/mobile serta featured images sama seperti sebelum perubahan.
- Tidak ada error indexing baru atau kehilangan URL.
- Lihat klik dan CTR untuk query yang sama setelah sampel memadai; hasil tidak dijamin meningkat.

**Batasan:** Rencana ini belum memiliki daftar query per artikel. Berkas tersebut baru tersedia setelah `seo_opportunities.py` berhasil membaca Search Analytics API dari VPS.
