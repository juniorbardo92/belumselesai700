# Hasil tes Kalyanamitra (aktual, 19 Oktober 2026)

## T1 — Pembaca Repliz (K07)

```
python3 -m unittest discover -s tests
Ran 14 tests
OK
```

| Kelompok | Tes |
|---|---|
| Filter akun | mengirim `accountIds[0]`; item akun lain dibuang; item tanpa akun → `BLOCKED` |
| Paginasi | mengikuti `totalPages`; `totalPages` hilang → blokir; batas halaman → blokir; `nextToken` untuk konten |
| Ukuran | penjaga byte per halaman; **penyempitan limit adaptif** 40 → lebih kecil; proyeksi memotong deskripsi dan membuang URL CDN |
| Kegagalan | HTTP 404 → blokir; URL rusak tidak membuat proses gagal |

Live (GET only):

| Akun | Jenis | Item | Ukuran payload | Halaman terbesar | Halaman ditolak | Limit efektif |
|---|---|---|---|---|---|---|
| Kalyanamitra threads | content | 322 | 128.269 B | 53.679 B | 0 | – |
| Kalyanamitra threads | schedule | 209 | 111.765 B | 77.793 B | 0 | 20 |
| UMKM threads | content | 514 | 220.469 B | 68.521 B | 0 | – |
| UMKM threads | schedule | 1124 | 602.065 B | 110.647 B | 0 | 20 |

## T2 — Bukti publikasi KAL-PILOT-001 (K05/K06)

`tools/verify_thread.py` (GET only): root `PASS`, balasan 7/7 `PASS`, ID ganda `[]`, `post_id_field_role = REPLY`.

Pemeriksaan publik (tanpa login, browser): `root_visible = true`, `replies_visible = 7 / 7`, `page_len = 5091`.

## T3 — UAT publisher (sandbox, tanpa POST nyata)

```
RINGKASAN 25 PASS, 1 PARTIAL, 1 FAIL dari 27
POST ke api.repliz.com = 0 (semua POST ke 127.0.0.1)
```

Rincian PASS penting: migrasi idempoten 2×, rollback skema, fungsi kanonis tunggal, jalur `draft_only` → 0 POST, target IG tanpa media ditolak, penautan eksplisit lintas platform diblokir, pergeseran slot jam malam.

Lihat `evidence/uat-terakhir.json` untuk 27 entri lengkap.

## T4 — Carousel B10 (K09, staging)

| Langkah | Hasil |
|---|---|
| `test_ig_b10.py` | 28 tes, `OK` |
| `kalyanamitra_b10_pilot.py preflight` | `B10_READONLY_PREFLIGHT_PASS`, IG OFF, Threads UNCHANGED, `publication = NOT_ATTEMPTED` |
| `stage --content-id KAL-PILOT-001` | `B10_STAGE_RENDER_PASS`, 7 slide |
| Dimensi | 7/7 `1080 × 1440` (rasio 0,75), RGB |
| Determinisme | render ulang menghasilkan SHA256 identik untuk ketujuh slide |
| Caption | 798 byte, memuat post ke-8 utuh + sumber |
| Manifest | 7 hash slide + hash caption + `native_original_sha256` |
| Watermark RK | **tidak ada** (F4) |
| POST/unggah | tidak ada |

## T5 — Status timer

`systemctl is-active kalyanamitra-threads-auto-v1.timer` → `inactive`  
`systemctl is-enabled …` → `disabled`

Tidak diubah selama pengujian.
