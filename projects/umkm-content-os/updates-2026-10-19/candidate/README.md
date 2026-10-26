# UMKM — Rekonsiliasi Content API R2 (kandidat, belum deploy)

**Tanggal:** 19 Oktober 2026  
**Baseline produksi:** `/opt/umkm-engine/scripts/reconcile_repliz.py`  
**SHA256 baseline:** `ceaaf52e43df6ec372be6b26e663e32dffd6fa073dd57a0a52a64c945c36cd15` (383 baris) — **cocok** dengan yang ada di VPS2 saat audit.  
**Status paket:** kandidat untuk UAT salinan. **Tidak ada deployment produksi yang dijalankan.**

## Isi

| Path | Isi |
|---|---|
| `code/reconcile_repliz.py` | R2 kandidat (default SHADOW, promosi butuh dua flag eksplisit) |
| `code/schema_preflight_ro.py` | Preflight baca-saja: hash, skema, trigger, integrity, konsumen hilir |
| `tools/verify_thread.py` | Verifikator utas GET-only (root + semua balasan) |
| `tools/collect_content_umkm.py` | Kolektor daftar konten (paginasi `nextToken`, ukur ukuran respons) |
| `tools/h1_recheck_dryrun.py` | Ukur ulang metrik H+1 pada salinan DB (tanpa UPDATE) |
| `tests/` | 36 tes offline, termasuk 2 utas nyata sebagai fixture |
| `evidence/` | Bukti GET 14 utas, bukti publik, negatif, recheck pending, staleness H+1 |
| `docs/` | Matriks status, temuan, hasil tes, runbook, rollback |

## Ringkasan hasil

- **14 utas** (9 yang diklaim + 5 yang tersangkut di `READY`) diverifikasi **8/8**: root + 7 balasan, ID unik, teks identik, akun/owner benar, URL HTTPS Threads, `createdAt` naik, tanpa duplikasi.
- **Sembilan** utas juga diverifikasi publik tanpa login: 8/8 teks terlihat di halaman Threads.
- **Cacat R1 terbukti:** `schedule.postId` dari Repliz adalah **ID balasan pertama**, bukan root. R1 membandingkan teks root dengan teks balasan → `CONTENT_API_TEXT_MISMATCH` untuk **semua 14 utas**. R1 tidak akan pernah merekonsiliasi kasus nyata.
- **Cacat kedua:** reconciler produksi hanya memilih `status='SCHEDULED'`, sehingga **5 utas yang sudah terbit** (sejak 4–17 Okt) tetap `READY` selamanya.
- R2 pada salinan: **14/14 SHADOW PASS**, 5 pending menunggu, **0 alert**, exit 0. Mode promosi pada salinan kedua: **14/14 PUBLISHED**, `repliz_post_id` = ID root, `published_at` = `createdAt` root dengan provenance tercatat, dan **idempoten** saat dijalankan ulang.

## Cara menjalankan (hanya pada salinan)

```bash
# 1. Salin DB produksi (baca-saja) ke salinan kerja
python3 - <<'PY'
import sqlite3
s=sqlite3.connect('file:/opt/umkm-engine/data/system.db?mode=ro',uri=True)
d=sqlite3.connect('/home/ubuntu/uat/system.db'); s.backup(d); d.close(); s.close()
PY

# 2. Preflight baca-saja
python3 code/schema_preflight_ro.py

# 3. SHADOW pada salinan
UMKM_RECONCILE_DB=/home/ubuntu/uat/system.db \
UMKM_RECONCILE_RESPONSES=/home/ubuntu/uat/responses \
REPLIZ_THREADS_OWNER_ID=100000001 \
/opt/umkm-engine/.venv/bin/python code/reconcile_repliz.py
```

Promosi **tidak** dijalankan di produksi. Lihat `docs/04-DEPLOY-RUNBOOK-GUARDED.md`; langkah terakhir sengaja berhenti sebelum menyentuh layanan produksi.

## Batas

- Tidak ada POST, tidak ada perubahan database produksi, tidak ada perubahan kredensial/gateway/Guardian.
- `UMKM_CONTENT_PROOF_PROMOTE=1` wajib disertai `UMKM_CONTENT_PROOF_PUBLISHED_AT=root_createdAt`; tanpa itu promosi ditolak (`PUBLISHED_AT_SOURCE_UNCONTRACTED`).
- Promosi akan membuat baris memenuhi syarat **IG H+1**; timer IG harus dijeda lebih dulu (lihat temuan F5).
