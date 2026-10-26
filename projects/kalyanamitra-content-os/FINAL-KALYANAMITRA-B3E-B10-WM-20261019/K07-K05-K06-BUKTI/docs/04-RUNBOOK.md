# Runbook Kalyanamitra — perubahan minimal, timer tetap OFF

## Prinsip

Paket ini **tidak mengubah** kode produksi, `.env`, DB, atau timer. Yang ditambahkan hanya alat baca (`repliz_reader.py`) dan bukti. Karena itu tidak ada langkah deploy yang diperlukan untuk menutup K05/K06.

## Bila pembaca akan dipakai di server (opsional, tanpa efek terbit)

```bash
install -o ubuntu -g ubuntu -m 755 repliz_reader.py /opt/kalyanamitra/scripts/repliz_reader.py
/opt/kalyanamitra/.venv/bin/python /opt/kalyanamitra/scripts/repliz_reader.py \
  --env /opt/kalyanamitra/.env \
  --account-id 6a8d2c7862caae1e0405397a --kind schedule
```

Alat ini hanya `GET`. Tidak ada jalur kode yang memanggil `POST`.

## Verifikasi ulang K05/K06 (kapan saja, GET only)

```bash
python3 tools/verify_thread.py --env /opt/kalyanamitra/.env \
  --account-id 6a8d2c7862caae1e0405397a \
  --owner-id 28137012079294786 --username ruangkalyanamitra \
  --schedule-id 6ad35c0f83496b501f49814f --out /tmp/kal-pilot.json
```

Harus menghasilkan `"result": "PASS"`, `replies_pass: 7`.

## Bila kelak timer diaktifkan (TIDAK dilakukan sekarang)

Prasyarat yang harus dipenuhi lebih dulu:

1. Persetujuan pemilik tertulis, dengan tanggal dan jumlah konten yang diizinkan.
2. `ENGINE_MODE=publish`, `PUBLISH_ENABLED=true`, `REPLIZ_ENABLED=true` diset lewat `activation_guard.py apply` — bukan edit manual.
3. Bukti `n_baseline_legacy_fingerprint_teks` dan `108/108` masih selaras setelah fixture dirapikan (lihat F3).
4. Satu siklus manual dengan `systemctl start --no-block` dan pemantauan log; timer baru diaktifkan setelah siklus itu bersih.
5. Keputusan untuk UAT-B3b: berkas baseline harus memuat teks, atau jalur duplikat harus diakui sebagai `BLOCKED_VERIFY_DUPLIKAT` (fail-closed) dan bukan `DUPLIKAT_BASELINE`.

## Larangan yang tetap berlaku

- Jangan menjalankan `activation_guard.py apply` atau `deploy_guarded.py apply` tanpa persetujuan baru.
- Jangan menjalankan `upload-one` / `publish-one` Instagram; K09 masih `HOLD_LIVE`.
- Jangan mengaktifkan `kalyanamitra-threads-auto-v1.timer` sebagai efek samping pekerjaan lain.
