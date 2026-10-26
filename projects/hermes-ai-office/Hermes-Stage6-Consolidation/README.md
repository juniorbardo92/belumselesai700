# Hermes AI Office — Stage 6 (Konsolidasi akhir)

Tahap 1–5 ditutup dengan bukti. Stage 6 mematikan **hanya** layanan *user systemd* `openclaw-gateway.service` pada **VPS2**. Ini tidak menyentuh `hermes-gateway.service`, aplikasi BaZi, UMKM, OpenClaw VPS4, bot Telegram VPS4, atau Guardian.

## Urutan singkat

Unggah paket yang sama pada VPS4 dan VPS2, ekstrak di masing-masing server:

```bash
unzip -o ~/Hermes-Stage6-Consolidation.zip -d ~/
```

**1 — VPS4:** Pastikan 7 akun Telegram aktif dan jalur Bridge ke VPS2 masih PASS:

```bash
python3 ~/Hermes-Stage6-Consolidation/stage6.py verify-vps4
```

**2 — VPS2:** Hanya setelah pemeriksaan VPS4 PASS, jalankan cutover OpenClaw duplikat:

```bash
python3 ~/Hermes-Stage6-Consolidation/stage6.py retire-vps2 --confirm-target-ready
```

Skrip menolak operasi jika akun Telegram VPS2 belum dinonaktifkan, layanan produksi/timer tidak sehat, unit lain merujuk pada gateway lama, atau terdapat koneksi established ke port 18789. Ia menyimpan status awal ke `~/.local/state/hermes-stage6/retirement.json`, menjalankan `systemctl --user disable --now openclaw-gateway.service`, lalu memeriksa ulang layanan produksi. Rollback otomatis dicoba jika pemeriksaan pascacutover gagal.

**3 — VPS4:** Pastikan bot VPS4 dan Bridge tetap sehat setelah Gateway VPS2 dimatikan:

```bash
python3 ~/Hermes-Stage6-Consolidation/stage6.py verify-vps4
```

**4 — VPS2 (opsional):** Konfirmasi layanan duplikat tetap OFF:

```bash
python3 ~/Hermes-Stage6-Consolidation/stage6.py check-vps2
```

Jika semua lulus, tutup Stage 6. Jangan nonaktifkan `hermes-gateway.service` atau `hermes-guardian-*`: layanan tersebut di luar scope konsolidasi.

## Rollback

Apabila diperlukan, pada VPS2:

```bash
python3 ~/Hermes-Stage6-Consolidation/stage6.py rollback-vps2
```

Rollback **tidak** mengaktifkan Telegram VPS2, sehingga tidak menduplikasi tujuh poller yang sudah pindah.

## Batas kemampuan pemeriksaan

Pemeriksaan ketergantungan didasarkan pada unit systemd dan sesi TCP port 18789 yang sedang established; tidak dapat membuktikan ketiadaan seluruh dependensi tersembunyi dalam kode aplikasi. Karena itu, skrip memeriksa layanan produksi sesudah penghentian, namun regresi aplikasi yang langka mungkin tetap memerlukan rollback manual. Tidak menghapus data/kunci/berkas konfigurasi OpenClaw VPS2; layanan hanya dinonaktifkan.

Berkas `hermes-stage4-transfer-SECRET.json` masih menyimpan token bot dalam format transfer. Setelah konsolidasi terverifikasi dan rollback aman, hapus **salinan transfer sementara** secara manual di kedua VPS. Jangan hapus file konfigurasi aktif dan backup sebelum ada salinan aman.
