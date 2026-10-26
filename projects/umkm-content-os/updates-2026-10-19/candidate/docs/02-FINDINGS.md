# Temuan UMKM — terverifikasi dengan GET, bukan pembacaan kode saja

Semua angka di bawah berasal dari panggilan `GET` ke Repliz pada 19 Oktober 2026 dan dari pembacaan database produksi mode baca-saja.

## F1 — `schedule.postId` Repliz adalah balasan pertama, bukan root (BLOKIR R1)

Untuk `UMKM-AUTO-20261017-01`:

| Objek | ID | Waktu | Teks |
|---|---|---|---|
| `schedule.postId` | `18074291591735283` | `2026-10-18T08:00:31Z` | "Ada dua angka yang dipakai layanan kirim…" (= `replies[0]`) |
| Root sebenarnya | `18124730495580235` | `2026-10-18T08:00:16Z` | "Pembeli dari luar kota bertanya…" (= `schedule.description`) |

Konsekuensi: kandidat R1 memakai `obj["postId"]` sebagai root, lalu membandingkan `schedule.description` dengan `doc.description`. Hasil nyata: `r1_text_match = False` → `CONTENT_API_TEXT_MISMATCH`. **Untuk kesembilan (dan keempat belas) utas, R1 akan memblokir semuanya.** Tes 14/14 R1 lulus karena fixture-nya mensimulasikan `postId` = root — asumsi yang tidak berlaku di API nyata.

Bukti: `evidence/negative_live.json` → `r1_defect`.

## F2 — Reconciler produksi tidak pernah melihat baris `READY` (5 utas "hilang")

Query produksi mensyaratkan `status='SCHEDULED' AND publish_status='SCHEDULED'`. Lima baris punya `status='READY'` tetapi `publish_status='SCHEDULED'` dan sudah terbit:

| content_id | Repliz | postId | Terbit |
|---|---|---|---|
| UMKM-AUTO-20261003-03 | success | 18131235319674629 | 2026-10-04T09:04Z |
| UMKM-AUTO-20261010-05 | success | 18131193850755664 | 2026-10-11T10:04Z |
| UMKM-AUTO-20261014-02 | success | 18136215919729166 | 2026-10-15T08:34Z |
| UMKM-AUTO-20261014-04 | success | 18104902796252050 | 2026-10-15T09:34Z |
| UMKM-AUTO-20261016-05 | success | 17907441900578365 | 2026-10-17T10:04Z |

R2 menambahkan `READY` ke seleksi (dapat dimatikan dengan `UMKM_RECONCILE_INCLUDE_READY=0`).

## F3 — 112 post nyata, bukan 9

14 utas × (1 root + 7 balasan) semuanya ada, dengan teks identik terhadap jadwal, ID unik, `owner.id = 28108610098795775`, URL `https://www.threads.com/@umkmnaikkelas.id/post/…`, dan `createdAt` naik. Sembilan di antaranya juga diverifikasi **publik tanpa login**: 8/8 teks terlihat.

## F4 — Metrik H+1 diukur sekali dan tidak pernah diulang

- 76 baris metrik: **17 COMPLETE, 59 INCOMPLETE**.
- Alasan dominan: `MISSING:views_zero` (views = 0 pada saat ukur ±24 jam).
- Diukur ulang 19 Okt: **14 dari 25** baris `INCOMPLETE` sekarang punya `views > 0` (2–8 views) → seharusnya `COMPLETE`.
- Artinya: nilai nol bukan fakta permanen, melainkan sampel terlalu awal / gagal, dan tidak ada mekanisme ukur ulang. Ambang engagement dihitung dari data yang salah.

Bukti: `evidence/h1_recheck.json`, `evidence/h1_staleness.json`.

## F5 — Promosi akan memicu IG H+1 (efek samping, bukan sekadar status DB)

`run_umkm_ig_h1_once.py` memilih sumber dengan `status='PUBLISHED' AND publish_status='PUBLISHED' AND published_at IS NOT NULL`, lalu menyamakan `ig.source_published_at = q.published_at`. Karena itu:

- promosi dengan `published_at=NULL` akan **membuat baris tidak pernah masuk IG** (tidak terlihat, bukan gagal keras);
- promosi dengan `published_at` terisi akan **membuat timer IG mulai membuat pekerjaan IG**.

`umkm_instagram_queue` saat ini **0 baris**, jadi belum pernah ada satu pun siklus IG. Timer IG aktif (`umkm-ig-h1.timer`, tiap 30 menit).

## F6 — Tidak ada retry/backoff di jalur IG H+1

`publish_one` melakukan satu `requests.post` tanpa percobaan ulang; kegagalan jaringan langsung menjadi error. Idempotensi relatif baik (klaim atomik `BEGIN IMMEDIATE`, `rowcount==1`, guard hari IG terpakai), tetapi pemulihan setelah gangguan sesaat tidak ada. Kegagalan 5xx membiarkan baris di `SUBMITTING`/`RECONCILE` untuk diperiksa manual — aman, tetapi menuntut operator.

## F7 — Filter `accountIds` tidak andal; `limit` diabaikan

`GET /public/schedule` dengan `accountIds=<id>` mengembalikan **1425** dokumen (akun bercampur). Dengan `accountIds[0]=<id>`: **209** dokumen, semuanya akun target. `limit=100` menghasilkan satu respons **381.766 byte** — satu baris SSE raksasa, persis penyebab `SSE_LINE_TOO_LARGE`.

Bukti: `../kalya.../evidence/filter_evidence.json` (salinan: `evidence/filter_evidence.json` di paket Kalyanamitra) dan `repliz_reader.py`.
