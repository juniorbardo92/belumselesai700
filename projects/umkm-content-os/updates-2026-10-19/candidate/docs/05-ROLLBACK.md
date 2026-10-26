# Rollback UMKM R2

## Kode

R2 tidak mengubah skema dan tidak menambah kolom. Rollback kode cukup mengembalikan satu berkas:

```bash
sudo systemctl stop umkm-reconcile.timer
sudo install -o ubuntu -g ubuntu -m 644 \
  /home/ubuntu/r2/fixtures/reconcile_repliz.original.py \
  /opt/umkm-engine/scripts/reconcile_repliz.py
sha256sum /opt/umkm-engine/scripts/reconcile_repliz.py
# harus: ceaaf52e43df6ec372be6b26e663e32dffd6fa073dd57a0a52a64c945c36cd15
sudo systemctl start umkm-reconcile.timer
```

Berkas asli tersedia di paket ini (`fixtures/reconcile_repliz.original.py`) dan salinan produksi sebelum perubahan (langkah 1 runbook).

## Database

- **Bila hanya SHADOW dijalankan:** tidak perlu memulihkan DB. R2 hanya memperbarui `reconcile_attempts`, `last_reconciled_at`, `reconcile_error`, `platform_status` — sama seperti perilaku produksi lama.
- **Bila promosi sudah dijalankan:** rollback kode tidak mengembalikan status. Pulihkan tabel dari backup:
  ```bash
  sqlite3 /opt/umkm-engine/data/system.db ".restore '/opt/umkm-engine/backup/pre-r2-YYYYmmdd-HHMMSS.db'"
  ```
  atau, lebih selektif, perbaiki baris yang salah:
  ```sql
  UPDATE umkm_content_queue
     SET status='SCHEDULED', publish_status='SCHEDULED',
         published_at=NULL, repliz_post_id=NULL,
         reconcile_error='ROLLBACK_R2'
   WHERE content_id IN ('UMKM-AUTO-20261003-03', …);
  ```
  Catat setiap `content_id` yang dikembalikan; jangan mengembalikan baris yang sudah `PUBLISHED` sebelum R2.

## Bukti yang harus disimpan sebelum rollback

- `data/content/publisher/responses/*-content-proof.json` (bukti root + balasan).
- `SELECT content_id,status,published_at,repliz_post_id,note FROM umkm_content_queue WHERE status='PUBLISHED';`
- Log `journalctl -u umkm-reconcile.service --since '…' > rollback-evidence.log`.

## Yang tidak boleh dilakukan saat rollback

- Menghapus `*-content-proof.json` (itu bukti, bukan cache).
- Menyetel `published_at` menjadi `createdAt` secara massal di luar jalur R2 — tanpa provenance, data menjadi tidak dapat diaudit.
