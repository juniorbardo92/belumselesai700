# Batch 337 — audit ledger 46 pekerjaan (READ ONLY)

Paket ini berisi snapshot `final-report.csv` dari laporan yang diberikan pemilik (27 SCHEDULED, 19 READY pada saat file dibuat), serta skrip pemeriksaan kondisi ledger VPS2 yang aktual.

Jalankan pada VPS2 setelah ZIP diekstrak:

```bash
cd ~/KAL-AUTO-BATCH-337-VERIFY
sudo python3 -B verify_batch337.py --report /home/ubuntu/batch-337-actual.csv
```

Output `BATCH_337_IN_PROGRESS` berarti sebagian job batch masih READY. `BATCH_337_LEDGER_COMPLETE` hanya jika **46 job** yang tercantum telah `SCHEDULED` + ID jadwal unik + slot cocok. `BATCH_337_ATTENTION_REQUIRED` menunjukkan anomali yang perlu GET Repliz / peninjauan, **bukan izin untuk mengulang submit atau POST**.

Exit code: `0` complete, `2` incomplete, `3` abnormal/config error.

**Tidak mengubah DB produksi, systemd, publisher, Repliz, maupun Gateway.** File output CSV adalah report lokal saja. Pemeriksaan Schedule ID pada ledger **bukan** verifikasi independen API Repliz; pemeriksaan read-only Repliz harus dilakukan terpisah sebelum klaim menyeluruh.
