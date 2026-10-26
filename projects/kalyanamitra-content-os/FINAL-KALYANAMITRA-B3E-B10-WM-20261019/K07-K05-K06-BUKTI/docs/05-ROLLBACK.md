# Rollback Kalyanamitra

## Yang diubah paket ini: tidak ada produksi

- Tidak ada berkas di `/opt/kalyanamitra` yang ditulis.
- Tidak ada perubahan `.env`, DB, unit systemd, akun Repliz, atau jadwal.
- Timer tetap `inactive/disabled`.

Karena itu rollback **tidak diperlukan** untuk keadaan saat ini.

## Bila `repliz_reader.py` dipasang di server

Hapus satu berkas:

```bash
sudo rm -f /opt/kalyanamitra/scripts/repliz_reader.py
```

Tidak ada yang bergantung padanya; tidak ada unit systemd yang memanggilnya.

## Bila kelak ada perubahan produksi (di luar paket ini)

Urutan pemulihan yang benar:

1. Hentikan timer: `sudo systemctl stop kalyanamitra-threads-auto-v1.timer`.
2. Kembalikan `publisher_kalyanamitra.py` dari backup hash-pin:
   `0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6`.
3. Kembalikan `.env` dari `.env.before-kalyanamitra-threads-auto-v1.bak`, lalu verifikasi
   `ENGINE_MODE=draft_only`, `PUBLISH_ENABLED=false`, `REPLIZ_ENABLED=false`.
4. Pulihkan DB dari `/opt/kalyanamitra/backup/kalyanamitra.db.pre-jalurb-20261014-125714.bak`
   hanya jika ada penulisan status yang salah.
5. Jangan menghapus bukti (log, JSON jadwal, manifes) saat rollback.

## Bukti yang harus disimpan

- `kal_pilot_evidence.json` (root + 7 balasan).
- `public_kal_pilot.json` (tampilan publik).
- `uat-terakhir.json` (27 entri UAT sandbox).
- `b10-render-manifest.json` + hash slide.
