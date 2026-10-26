# Runbook deployment bertahap — UMKM R2 (BERHENTI sebelum produksi)

**Aturan:** setiap langkah harus lulus sebelum langkah berikutnya. Langkah 8 **tidak dijalankan** dalam pekerjaan ini dan menunggu persetujuan pemilik tertulis.

## Prasyarat

1. Persetujuan pemilik untuk kontrak `published_at` (F5): R2 mengisi `published_at` dengan `createdAt` root dan menulis provenance di `note`.
2. Keputusan tentang **IG H+1**: jeda `umkm-ig-h1.timer` (`systemctl stop umkm-ig-h1.timer`) atau terima bahwa 14 baris akan segera masuk pipeline IG.
3. Jendela waktu: hentikan `umkm-reconcile.timer` sementara agar tidak ada dua proses menulis.

## Langkah

1. **Snapshot bukti awal**
   ```bash
   sqlite3 /opt/umkm-engine/data/system.db ".backup '/opt/umkm-engine/backup/pre-r2-$(date +%Y%m%d-%H%M%S).db'"
   sha256sum /opt/umkm-engine/scripts/reconcile_repliz.py
   ```
2. **Preflight baca-saja** — harus `BLOCKERS: NONE`
   ```bash
   python3 /home/ubuntu/r2/schema_preflight_ro.py
   ```
3. **Salinan + UAT SHADOW** (wajib 0 alert, 14 proof ready)
   ```bash
   UMKM_RECONCILE_DB=/home/ubuntu/uat/system.db \
   UMKM_RECONCILE_RESPONSES=/home/ubuntu/uat/responses \
   REPLIZ_THREADS_OWNER_ID=100000001 \
   /opt/umkm-engine/.venv/bin/python /home/ubuntu/r2/reconcile_repliz.py
   ```
4. **Salinan + UAT PROMOTE** (idempoten; jalankan dua kali, run kedua harus `PROMOTED=0`)
5. **Hentikan timer** (bukan menonaktifkan permanen)
   ```bash
   sudo systemctl stop umkm-reconcile.timer
   ```
6. **Pasang berkas secara atomik** dan simpan salinan asli
   ```bash
   sudo install -o ubuntu -g ubuntu -m 644 \
     /home/ubuntu/r2/reconcile_repliz.py /opt/umkm-engine/scripts/reconcile_repliz.py.new
   sudo mv /opt/umkm-engine/scripts/reconcile_repliz.py.new \
           /opt/umkm-engine/scripts/reconcile_repliz.py
   sha256sum /opt/umkm-engine/scripts/reconcile_repliz.py   # catat hash baru
   ```
7. **Tambahkan konfigurasi yang belum ada** di `/opt/umkm-engine/.env.publisher`:
   ```
   REPLIZ_THREADS_OWNER_ID=100000001
   REPLIZ_THREADS_USERNAME=umkmnaikkelas.id
   ```
   R2 gagal tertutup (`RECONCILE_OWNER_ID_NOT_CONFIGURED`) bila owner id tidak ada.

8. **BERHENTI.** Jalankan satu siklus SHADOW manual, periksa `*-content-proof.json`, lalu minta persetujuan untuk:
   ```bash
   sudo systemctl start umkm-reconcile.timer
   # promosi (hanya setelah persetujuan):
   UMKM_CONTENT_PROOF_PROMOTE=1 UMKM_CONTENT_PROOF_PUBLISHED_AT=root_createdAt ...
   ```

## Kriteria gagal (batalkan)

- Preflight menemukan `TRIGGERS_ON_QUEUE` atau `BASELINE_HASH_DRIFT`.
- UAT SHADOW menghasilkan `RECONCILE_ALERT_COUNT > 0`.
- Ada baris `PUBLISHED` dengan `published_at` NULL.
- `repliz_post_id` hasil promosi sama dengan `schedule.postId` (berarti ID balasan, bukan root).

## Setelah deploy (pemantauan)

- `journalctl -u umkm-reconcile.service -n 50` setiap siklus; tidak boleh ada `CONTENT_PROOF_BLOCKED`.
- `SELECT count(*) FROM umkm_content_queue WHERE status='PUBLISHED' AND published_at IS NULL;` harus 0.
- `umkm_h1_metrics`: jalankan `tools/h1_recheck_dryrun.py` untuk melihat apakah metrik perlu diukur ulang.
