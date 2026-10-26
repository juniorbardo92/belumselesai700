# Matriks status UMKM — BEFORE / AFTER (per 19 Oktober 2026, 11:40 WIB)

Legenda: `CLOSED` = bukti lingkup terpenuhi · `PARTIAL` = bukti/implementasi sebagian · `OPEN` = belum ada bukti · `HOLD` = sengaja tidak dijalankan.

| ID | Pekerjaan | BEFORE | AFTER | Bukti |
|---|---|---|---|---|
| U02a | Audit seluruh balasan 14 utas | PARTIAL ("semua reply belum diverifikasi") | **CLOSED_AUDIT_THREADS** | `evidence/umkm/*.json` (14 berkas): root + 7 balasan per utas, 112 post; ID unik, teks identik, `owner.id`, URL, `createdAt` naik |
| U02b | Rekonsiliasi provider→platform | PARTIAL (9 `success` tidak lolos; R1 kandidat) | **PARTIAL_IMPLEMENTED** (kode R2 lulus UAT salinan; belum deploy) | 14/14 SHADOW PASS pada salinan; 14/14 PUBLISHED pada salinan kedua; idempoten |
| U02c | R1 Content API fallback | PARTIAL / CANDIDATE | **SUPERSEDED_BY_R2** | R1 terbukti gagal pada data nyata: `postId` = balasan pertama → `CONTENT_API_TEXT_MISMATCH` (lihat `docs/02-FINDINGS.md` F1) |
| U02d | Lima konten "pending" | OPEN_RECHECK | **CLOSED_RECHECK** | GET 19 Okt: kelimanya `success` di Repliz dengan postId; DB tetap `READY` karena filter reconciler (F2). Bukti: `evidence/recheck_pending.json` |
| U02e | Utas hari ini (`20261018-01..05`) | belum diperiksa | **WAITING (normal)** | Repliz `pending`, jadwal 15:00–17:00 WIB hari ini; belum jatuh tempo saat audit (11:0x WIB) |
| U03 | Instagram H+1 — upstream metrik | OPEN | **PARTIAL_AUDIT** (temuan kuantitatif, tanpa POST) | 59/76 baris `INCOMPLETE`; 14/25 baris yang diukur ulang kini `views>0` (`evidence/h1_recheck.json`, `h1_staleness.json`) |
| U04 | Instagram H+1 — E2E (retry, idempotensi, ledger, bukti URL) | OPEN | **PARTIAL** | Idempotensi ada (klaim atomik + guard hari terpakai); **tidak ada retry/backoff**; `umkm_instagram_queue` **0 baris**; tidak ada kolom bukti URL publik |
| U05 | Repliz MCP pagination / oversized / account routing | PARTIAL | **CLOSED_TOOLING** (alat bounded + bukti live) | `code/repliz_reader.py`, 14 tes; halaman `/schedule` limit 100 = **381.766 byte**; `accountIds=<id>` **diabaikan** (1425 vs 209 dokumen), `accountIds[0]=<id>` dihormati |

## Yang berubah di dunia nyata selama audit

Tidak ada. Database produksi tetap: `PUBLISHED 76 · READY 6 · SCHEDULED 14`. Tidak ada berkas `*-content-proof.json` di direktori respons produksi. Timer `umkm-reconcile.timer` tetap berjalan dan tetap gagal (`RECONCILE_ALERT_COUNT=9`) — kegagalan itu **nyata** dan tidak boleh dihilangkan dengan melonggarkan syarat bukti.

## Yang masih harus diputuskan pemilik sebelum CLOSED

1. **Kontrak `published_at`**: R2 mengisi `published_at` dengan `createdAt` root (waktu terbit yang diamati platform), bukan `publishedAt` dari Schedule API (yang tidak ada). Ini harus disetujui eksplisit; IG H+1 membutuhkan kolom itu tidak NULL.
2. **Timer IG H+1**: promosi 14 baris membuat konten memenuhi syarat IG. Timer harus dijeda atau IG dijalankan dry-run lebih dulu.
3. **Lima baris READY**: setelah R2 deploy, kelimanya akan naik ke `PUBLISHED`. Ini benar secara data, tetapi mengubah populasi IG H+1.
