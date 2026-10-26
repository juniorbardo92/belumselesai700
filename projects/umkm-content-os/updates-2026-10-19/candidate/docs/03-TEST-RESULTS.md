# Hasil tes UMKM (aktual, 19 Oktober 2026)

## T1 — Tes offline R2

```
python3 -m unittest discover -s tests -v
Ran 36 tests
OK
```

Cakupan positif dan negatif:

| Kelompok | Tes |
|---|---|
| Bukti utas | 14 kasus: utas nyata 8/8; root tidak ditemukan; root ganda; owner salah; 5 varian URL tidak sah; `createdAt` masa depan; `createdAt` tanpa zona waktu; di luar jendela jadwal |
| Balasan | teks diubah; `postId` kosong; ID ganda; balasan hilang di provider (404); `replies` kosong; owner balasan salah |
| HTTP | 429 lalu sukses; 5xx habis → `HttpFailure`; 404 tidak diulang; error jaringan diulang |
| Paginasi | ikut `nextToken`; batas halaman → error eksplisit; kegagalan daftar → `CONTENT_INDEX_INCOMPLETE` |
| DB/main | SHADOW tidak mengubah status; promosi tanpa kontrak ditolak; promosi dengan kontrak benar; baris READY ikut; READY dilewati bila dimatikan; akun salah; `pending` bukan alert; `failed` alert; 5xx jadwal → alert; jalur lama `publishedAt`; trigger skema memblokir promosi; tidak ada `POST` |
| Higiene bukti | berkas bukti tidak memuat kredensial/URL CDN |

## T1b — Tes offline `repliz_reader.py` (U05)

```
python3 -m unittest discover -s tests
Ran 50 tests
OK
```
(36 tes reconciler + 14 tes reader; dijalankan dari akar paket.)

## T2 — UAT pada salinan database produksi

Salinan: `sqlite3 .backup` dari sumber `mode=ro`. 96 baris.

```
UMKM-AUTO-20261016-01..04, 20261017-01..05     -> CONTENT_PROOF_PASS_SHADOW root=… replies=7
UMKM-AUTO-20261003-03, 20261010-05,
20261014-02/04, 20261016-05                    -> CONTENT_PROOF_PASS_SHADOW root=… replies=7
UMKM-AUTO-20261018-01..05                      -> WAITING state=pending
RECONCILE_MODE=SHADOW
RECONCILE_PROOF_READY=14
RECONCILE_PROMOTED=0
RECONCILE_ALERT_COUNT=0         (exit 0)
```

Status baris setelah run: `SCHEDULED` tetap `SCHEDULED`, `READY` tetap `READY`, `repliz_post_id`/`published_at` tetap NULL, `reconcile_error` NULL.

## T3 — UAT promosi pada salinan kedua

```
RECONCILE_MODE=PROMOTE
RECONCILE_PROMOTED=14
RECONCILE_ALERT_COUNT=0         (exit 0)
```

- `status/PUBLISHED 90 · READY 1 · SCHEDULED 5` (5 = jatuh tempo hari ini).
- Contoh baris: `UMKM-AUTO-20261017-01` → `published_at=2026-10-18T08:00:16.000Z`, `repliz_post_id=18124730495580235` (**root**, bukan `18074291591735283` yang merupakan balasan), `note` memuat `source=root_createdAt`.
- `SELECT count(*) … status='PUBLISHED' AND published_at IS NULL` → **0**.
- `PRAGMA integrity_check` → `ok`.
- Dijalankan ulang: `RECONCILE_PROMOTED=0` (idempoten, tidak ada update ganda).

## T4 — Tes negatif terhadap API nyata (GET-only)

| Kasus | Hasil |
|---|---|
| Teks balasan diubah | `BLOCKED` · `REPLY_PROOF_INCOMPLETE` · baris `TEXT_MATCH` |
| Teks root diubah | `BLOCKED` · `ROOT_TEXT_NOT_FOUND` |
| `scheduleAt` digeser 1 bulan | `BLOCKED` · `ROOT_SCHEDULE_TIME_WINDOW` |
| Owner id salah | `BLOCKED` · `ROOT_OWNER_ID_MATCH` |
| Cacat R1 (teks root vs balasan) | `r1_text_match=False` → `CONTENT_API_TEXT_MISMATCH` |

`NEGATIVE_SUITE PASS` (`evidence/negative_live.json`).

## T5 — Backup dan restore (salinan)

| Langkah | Hasil |
|---|---|
| Backup `.backup` salinan | 237.568 byte, SHA256 `f4b9d307…e8142f` |
| Hash kanonis baris (8 kolom kunci) | sumber = backup = hasil restore = `586fe04c…973beb` (96 baris) |
| Restore ke direktori baru | `integrity_check=ok`, 96 baris, hash kanonis sama |

## T6 — Produksi tidak tersentuh

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| `status` count | 76 PUBLISHED / 6 READY / 14 SCHEDULED | sama |
| Berkas `*-content-proof.json` di respons produksi | 0 | 0 |
| Hash `reconcile_repliz.py` | `ceaaf52e…36cd15` | sama |
| `umkm-reconcile.timer` | aktif, gagal | tetap (tidak diubah) |

## T7 — H+1 recheck (dry-run pada salinan)

25 baris `INCOMPLETE` diukur ulang: **14 akan menjadi COMPLETE**, 11 tetap. Tidak ada UPDATE; angka tersimpan di `evidence/h1_recheck.json`.
