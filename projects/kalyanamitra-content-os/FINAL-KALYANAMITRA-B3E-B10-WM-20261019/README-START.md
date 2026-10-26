# KALYANAMITRA — FINALISASI KANDIDAT B3e & B10 watermark RK

Tanggal 19 Oktober 2026. Status **B10 CLOSED_DEV / B3e CLOSED_SCOPED**, **NOT DEPLOYED**.

## Yang diperbaiki
- B10 renderer sekarang menggambar monogram RK di footer setiap slide (1080×1440).
- Manifest mencatat watermark; gerbang upload menolak stage lama / watermark kosong.
- 31/31 tes B10 PASS; empat dokumen tersanitasi lolos render 28 slide (tes unit).
- Preview tujuh slide KAL-PILOT-001 dengan watermark disertakan (sanitized ONLY, jangan kirim ke Repliz).
- `B3E-KANDIDAT-UAT-27.zip` berisi patch asli anti-duplikat (publisher/fake API/UAT harness), 13/13 tes sintetis PASS, POST_TO_FAKE=0.
- Bukti K05/K06/K07 historis dari developer tersedia di ZIP bukti; bukan audit live baru.

## Pengujian aman pada komputer/developer

```bash
cd B10-WATERMARK-CANDIDATE
python3 -B kalyanamitra_ig_b10.py selftest
python3 -B test_ig_b10.py
python3 -B kalyanamitra_b10_pilot.py selftest
```

`preview` menggunakan konten tersanitasi: source asli wajib diverifikasi sebelum stage produksi.
Bila `/home/ubuntu/kalyanamitra-ig-b10-stage/<content_id>` sudah ada, media lama
WAJIB dibekukan/ditinjau dulu. Jangan overwrite/delete otomatis; watermark gate
akan menolak media tanpa RK. Tidak ada POST/PUT/upload/publish pada tes di atas.

## UAT publisher 27 kasus di VPS2

UAT sebelumnya **25 PASS, 1 PARTIAL, 1 FAIL**, penyebab:
- B3b berkas baseline cuma punya fingerprint, bukan teks lengkap -> harus GET detail;
  jika detail tak ada: `BLOCKED_VERIFY_DUPLIKAT`, 0 POST.
- B3e varian spasi: bila teks mentah berbeda, bukan duplikat persis; fingerprint
  kanonis v1.0.1 tidak boleh diubah.

Patch di `B3E-KANDIDAT-UAT-27.zip` mengandung UAT 27 versi revisi; **belum diuji
melawan fixture 108 jadwal di VPS2**. Jalankan hanya pada `/tmp/kalyanamitra-uat.NMAtlK`
dengan `stage_patch_guarded.py preflight`, lanjut apply/verify dan `run_sandbox_27.py`
HANYA bila checksum fixture, hash publisher, dan keamanan staging cocok.
Kalau preflight BLOCKED, jangan paksa patch. Harap kirim hasilnya untuk diagnosis.

Timer Kalyanamitra harus tetap OFF; jangan ada restart publisher, POST schedule,
media upload, publikasi IG, atau perubahan .env/DB produksi tanpa persetujuan tersendiri.
