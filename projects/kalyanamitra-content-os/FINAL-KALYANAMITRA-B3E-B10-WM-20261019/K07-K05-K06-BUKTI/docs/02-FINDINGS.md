# Temuan Kalyanamitra

## F1 — `schedule.postId` adalah balasan pertama, bukan root

KAL-PILOT-001: `postId = 18181149934429102`, `createdAt = 2026-10-18T08:00:31Z`, teksnya "Latar ceritanya sederhana…" = `replies[0]`.
Root sebenarnya: `17937674628128307`, `createdAt = 2026-10-18T08:00:17Z`, teksnya "Seorang murid hidup sangat dekat dengan gurunya…" = `description`.

Pola ini identik dengan 14 utas UMKM. Setiap logika yang menganggap `schedule.postId` sebagai post utama akan salah memetakan teks maupun URL.

## F2 — Bukti publik lengkap dan bisa diulang

Root + 7 balasan tampil tanpa login di `https://www.threads.com/@ruangkalyanamitra/post/DeoNCWLCVPN`, 85 tayangan pada saat pemeriksaan. Ketujuh balasan punya URL sendiri dan teks identik dengan jadwal.

## F3 — Klaim "UAT B3e 27/27" tidak tereproduksi

Dijalankan pada salinan baru dengan:
- `publisher_kalyanamitra.py` SHA256 `0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6` (= `PUB_SHA` yang dipin),
- `fingerprint_kalyanamitra.py` SHA256 `319db006…2d930` (= `CANON_SHA`),
- fixture `baseline-kalyanamitra-des2026.json` + `jadwal-nyata-3.json` + `kalyanamitra-db-snapshot.sql`,
- server tiruan lokal, kredensial palsu.

Hasil: **25 PASS, 1 PARTIAL, 1 FAIL**.

| Kasus | Hasil | Sebab |
|---|---|---|
| UAT-B3b duplikat via berkas baseline | **FAIL** | Berkas baseline menyatakan `fingerprint_version: 1.0.0` dan `"teks penuh TIDAK disimpan di berkas ini"`; publisher kemudian mengembalikan `BLOCKED_VERIFY_DUPLIKAT` / `FINGERPRINT_SAMA_DETAIL_TIDAK_LENGKAP_ATAU_GET_GAGAL`. **0 POST** — aman, tetapi jalur "tolak duplikat lewat berkas baseline" tidak terbukti |
| UAT-B3e variasi spasi saja | **PARTIAL** | Fungsi kanonis menormalkan spasi, sehingga variasi spasi dianggap konten sama. Ini konsekuensi desain yang menjaga keselarasan 108 sidik jari; perlu keputusan produk |

Kesimpulan: klaim angka harus dikoreksi. Klaim **keamanan** tetap berdiri: tidak ada POST nyata (`api.repliz.com = 0`, semua POST ke loopback).

## F4 — Tidak ada watermark RK pada carousel B10

Renderer (`kalyanamitra_ig_b10.py`) menggambar header "RUANG KALYANAMITRA", nomor slide `n / 7`, dan potongan `content_id` di footer. **Tidak ada watermark "RK"** dalam bentuk apa pun. Kebutuhan K09 menyebut watermark RK; ini belum terpenuhi.

## F5 — `accountIds` dan ukuran respons (K07)

| Permintaan | Dokumen | Akun dalam hasil | Ukuran |
|---|---|---|---|
| tanpa filter | 1425 | bercampur | 10.294 B |
| `accountIds=<id>` | **1425** | **bercampur** | 10.294 B |
| `accountIds[0]=<id>` | **209** | hanya akun target | 10.309 B |
| `accountIds[0]=<id>&limit=100` | 100 | hanya akun target | **381.766 B** |

`accountIds` tanpa indeks **diabaikan tanpa error** — ini sumber "ketidakandalan filter" dan berbahaya bila hasil dipakai untuk keputusan terbit. Halaman 381 KB (karena tiap jadwal membawa seluruh balasan) menjelaskan `SSE_LINE_TOO_LARGE` pada satu baris `data:`.

Mitigasi yang diuji: `repliz_reader.py` selalu memakai bentuk berindeks, memverifikasi `accountId` tiap item, memotong deskripsi, dan **memperkecil `limit`** ketika satu halaman melebihi batas byte (100 → 50 → 20) alih-alih melonggarkan batas.

## F6 — Timer tetap OFF (diverifikasi)

`kalyanamitra-threads-auto-v1.timer`: `inactive`, `disabled`. Tidak ada perubahan pada unit, `.env`, atau jadwal.
