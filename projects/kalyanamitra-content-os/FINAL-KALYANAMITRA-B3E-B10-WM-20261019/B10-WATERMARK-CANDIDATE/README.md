# Kalyanamitra Instagram — B10 Pilot Guarded v1

**Scope: jalur carousel IG terpisah, tanpa merusak Threads B3e dan tanpa aktivasi Instagram otomatis**.

## Bukti lokal

- Empat draf tersanitasi yang diberikan owner, `APPROVED` dan sumber diverifikasi pada audit sebelumnya; versi tersanitasi **bukan pengganti sumber asli**.
- 28 PNG preview: tujuh slide 1080×1440 untuk masing-masing empat draf. Post 1–7 ditampilkan secara verbatim pada slide; teks post 8 disimpan utuh sebagai caption bersama tautan sumber. Teks tidak dipotong.
- Tes offline meliputi validator asli, penolakan `do_not_publish`, identitas akun, penolakan media tak sah, idempotensi, slot IG terpakai, respons Repliz tanpa ID, dan rekonsiliasi publikasi. **Tes tidak membuktikan bahwa API Repliz akan menerima format album di produksi.**

## Pilot VPS2 — baru pratinjau, TANPA POST

Unggah ZIP ke `/home/ubuntu/`, verifikasi hash dari chat dan isi `SHA256SUMS`, ekstrak lalu:

```bash
python3 -B kalyanamitra_ig_b10.py selftest
python3 -B kalyanamitra_b10_pilot.py selftest
python3 -B test_ig_b10.py
sudo -n python3 -B kalyanamitra_b10_pilot.py preflight
sudo -n python3 -B kalyanamitra_b10_pilot.py stage --content-id KAL-PILOT-001
```

Berkas media hasil stage berada di `/home/ubuntu/kalyanamitra-ig-b10-stage/KAL-PILOT-001/`, termasuk caption dan manifest SHA256. Stage **tidak** menyentuh DB Threads, Repliz, timer, akun, atau .env. Stage mengharuskan sumber *native* dari `content_queue.output_path` lolos `validate_dharma_json.py` asli, tidak sekadar dokumen tersanitasi.

`preflight` hanya GET identitas Repliz. Target yang dipin adalah Instagram `ruangkalyanamitra`, account `6a8d2c6762caae1e04053962`. Flag Instagram masih wajib `false`; `REPLIZ_TARGET_AKUN=threads` tidak berubah.

## HANYA sesudah pilot disetujui dan output stage diperiksa

Upload media adalah aksi nyata pada penyimpanan Repliz (belum membuat jadwal). Jalankan paling banyak satu draf:

```bash
sudo -n python3 -B kalyanamitra_b10_pilot.py upload-one --content-id KAL-PILOT-001
```

Sesudah URL media tervalidasi dan hari Instagram terbukti kosong, satu penjadwalan nyata dapat dilakukan HANYA atas keputusan operator:

```bash
sudo -n python3 -B kalyanamitra_b10_pilot.py publish-one --content-id KAL-PILOT-001 --at '2026-10-20T15:00:00+07:00' --confirm I_AUTHORIZE_ONE_IG_SCHEDULE
```

**Tanggal di atas contoh saja, jangan copy tanpa menyesuaikan waktu masa depan.** Penjadwalan tidak diulangi otomatis. Setelah jadwal dibuat, pantau:

```bash
sudo -n python3 -B kalyanamitra_b10_pilot.py reconcile --content-id KAL-PILOT-001
```

Ledger terpisah: `/opt/kalyanamitra/data/kalyanamitra-instagram-b10.sqlite`. Status `UPLOAD_RECONCILE` atau `RECONCILE` memblokir POST kedua dan memerlukan pemeriksaan manual. Tidak menyalin data status ke `content_queue.repliz_schedule_id` yang milik Threads. `SCHEDULED_IN_REPLIZ` ≠ posting aktual. Bukti `published` perlu status Repliz, ID post, dan waktu terbit terverifikasi. Tidak ada scheduler IG otomatis dalam paket.

## Batas

- Repliz storage init/PUT/complete dan bentuk `type=album` diambil dari kode H+1 UMKM yang sudah ada; validasi terhadap Repliz Kalyanamitra **belum terjadi**.
- Media 1080×1440 (3:4) perlu diverifikasi diterima oleh Repliz/Instagram; bila ditolak jangan diam-diam mengubah aspek tanpa kesepakatan.
- Menutup B10/CLOSED memerlukan satu pilot nyata dengan ID Repliz dan bukti posting platform, tanpa duplikasi, lalu aktivasi otomatis tersendiri setelah acceptance.
- Tidak ada token, kunci, atau DB produksi dalam ZIP ini.
