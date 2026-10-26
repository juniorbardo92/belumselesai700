# Kalyanamitra Jalur B — B3e strict raw-text dedup (sandbox only)

**Status:** Kandidat patch diuji offline, **BELUM** lulus 27 tes pada fixture nyata VPS2, **BELUM** dipasang ke produksi. 16 Oktober 2026.

## Keputusan produk yang dipertahankan

- Dua utas dengan tujuh teks **identik secara persis** pada platform sama = duplikat, harus ditolak.
- Dua utas **berbeda hanya karena spasi** = **bukan** duplikat persis; bila teks pembanding tersedia dan semua calon bentrok terbukti berbeda, tidak boleh ditolak karena fingerprint yang sama.
- Fingerprint kanonis **v1.0.1 tidak diubah**, baseline 108 jadwal tidak diubah.
- Jika fingerprint sama tetapi teks lama tidak tersedia atau detail API tidak terpercaya, status = `BLOCKED_VERIFY_DUPLIKAT`, **0 POST**. Tidak diam-diam lolos atau secara salah diberi label duplikat.
- Penautan `source_content_id` yang sama tetap menghalangi lintas platform. Aturan akun, slot, idempotensi, kill switch dan persetujuan tidak diubah.

## Perubahan kode terbatas

1. **publisher_kalyanamitra.py**: fingerprint hanya menyeleksi calon bentrok; referensi bentrok dipertahankan semuanya; teks asli dari daftar jadwal atau detail Repliz `GET /public/schedule/{id}` dibandingkan persis, tanpa mencetaknya; GET gagal/informasi kurang → tahan publikasi; whitespace draft asli dipertahankan saat `baca_konten` (tetap validasi isi tidak kosong dan batas 500 byte).
2. **fake_repliz_api.py**: dukung GET detail; seed daftar tanpa teks dapat menyediakan detail asli hanya untuk ID uji; GET tidak menambah POST.
3. **uat_publisher_sandbox.py**: B3b menguji blokir exact dan fail-closed jika detail absen; B3e menguji 3 varian spasi termasuk kasus hash tetap sama; tidak lagi memaksa PARTIAL; exit code hanya 0 bila semua tes PASS.
4. **provisioning/fingerprint_kalyanamitra.py**: disertakan hanya untuk tes dev dan pemeriksaan SHA256, **bukan target pemasangan**.

Sumber paket asli ZIP SHA256:
`769829def1ff05b45ae4a37d766e068280065e4d570131900ab7ef21f17c7693`

## Batas pengerjaan

Hanya VPS2 `VM-0-10-ubuntu` dan **salinan** `/tmp/kalyanamitra-uat.NMAtlK`. Skrip installer menolak path produksi, hash yang tidak dikenal, fixture berubah, dan konfigurasi kanonis yang tidak cocok. Tidak mengubah `/opt/kalyanamitra`, `/opt/umkm-engine`, SSH, Guardian, gateway, database produksi, timer, kredensial, atau Repliz. Harness UAT memakai API palsu loopback.

## Jalankan di VPS2 (setelah mengunggah ZIP ke /home/ubuntu)

```bash
set -euo pipefail
cd /home/ubuntu
sha256sum Kalyanamitra-B3e-Fix-Sandbox-v1.zip
# Samakan dengan SHA256 yang disediakan di chat, lalu:
test ! -e /home/ubuntu/Kalyanamitra-B3e-Fix-Sandbox-v1 || { echo BLOCKED_DEST_EXISTS; exit 1; }
python3 -m zipfile -e Kalyanamitra-B3e-Fix-Sandbox-v1.zip /home/ubuntu
cd /home/ubuntu/Kalyanamitra-B3e-Fix-Sandbox-v1
sha256sum -c SHA256SUMS
python3 -B tests/test_b3e_dev.py
python3 -B stage_patch_guarded.py preflight
python3 -B stage_patch_guarded.py apply
python3 -B stage_patch_guarded.py verify
python3 -B run_sandbox_27.py
```

`run_sandbox_27.py` mengeluarkan `UAT_ACCEPTANCE=PASS` **hanya** bila total 27, 27 PASS, 0 PARTIAL, 0 FAIL dan exit code harness 0. Jika tidak, `UAT_ACCEPTANCE=NOT_CLOSED` dan bukti NONPASS dicetak tanpa membuka seluruh teks. **Jangan deploy produksi saat hasil bukan PASS.**

**Rollback salinan sandbox (kapan saja jika kode patch belum diubah lagi):**

```bash
cd /home/ubuntu/Kalyanamitra-B3e-Fix-Sandbox-v1
python3 -B stage_patch_guarded.py rollback
# Output wajib: SANDBOX_ROLLBACK_VERIFIED
```

Backup berkas lama tersimpan privat di `/tmp/kalyanamitra-uat.NMAtlK/.b3e-dev-backups/` agar perubahan sandbox dapat dibatalkan. Jika proses terputus saat menulis sebagian, jalankan rollback sebelum mencoba apply lagi. Jangan hapus backup otomatis.

## Bukti tes yang SUDAH diperoleh

- 13 pemeriksaan unit sintetis terhadap publisher/fake GET, termasuk duplikat persis, varian spasi, GET detail, unavailable, lintas platform, penautan eksplisit dan banyak referensi fingerprint: PASS lokal.
- `apply / verify / idempotent apply / rollback` pada salinan sementara: PASS lokal.
- Parsing sintaks seluruh modul yang diubah: PASS lokal.
- **UAT 27 fixture nyata**: BELUM DILAKUKAN pada patch ini. Fixture nyata privat tetap berada di VPS2, tidak dikemas/diekspor.

> Ini penutupan masalah B3e **di salinan UAT** setelah bukti lolos, bukan otorisasi untuk publikasi Threads/Instagram atau migrasi produksi.
