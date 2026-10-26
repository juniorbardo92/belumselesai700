# UMKM R2.1 — FINALISASI DEV / SHADOW UAT

Tanggal 19 Oktober 2026. Status **CLOSED_DEV**, **NOT DEPLOYED**.

- `candidate/code/reconcile_repliz.py`: kandidat R2.1; SHA256 `24332b34ff5f207fc1b6edf47e30b8f45e586b71c07a25b5e249bd7521405410`.
- `candidate/tools/uat_clone_shadow_vps2.py`: penguji GET-only dan clone DB, menggunakan hostname guard. Tidak menulis database produksi.
- `TESTLOGS/`: tes 52/52 PASS dari pengujian lokal.

**UAT clone VPS2 dengan GET Content API** (bukan deployment):

```bash
cd /home/ubuntu/FINAL-UMKM-R2_1-SHADOW-UAT-20261019
sha256sum -c SHA256SUMS.txt
/opt/umkm-engine/.venv/bin/python -B -m unittest discover -s candidate/tests -q
/opt/umkm-engine/.venv/bin/python -B candidate/tools/uat_clone_shadow_vps2.py
```

UAT memerlukan akses GET Repliz, kode produksi tetap orisinal, `.env.publisher` tetap rahasia.
Terdapat account/owner guard, clone SQLite via `backup()`, PROMOTE=0 paksa,
`published_at`, `repliz_post_id`, `status`, `publish_status` wajib identik sebelum dan sesudah.
Jika run menghasilkan `SHADOW_SAFE_BUT_RECONCILE_ALERTS_OPEN`, integritas lolos tetapi kasus
publikasi belum CLOSED. Log berisi status ringkas, jangan unggah token/kredensial.

**JANGAN** memakai `UMKM_CONTENT_PROOF_PROMOTE=1` pada produksi. Persetujuan pemilik
mengenai `published_at` dan dampak antrean Instagram H+1 belum ada. Backup/restore
serta uji konsumen hilir VPS2 tetap diperlukan sebelum deploy.
