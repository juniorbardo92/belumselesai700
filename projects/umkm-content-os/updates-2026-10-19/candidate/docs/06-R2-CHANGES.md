# R2 — apa yang berubah dari baseline produksi

Baseline: 383 baris, SHA256 `ceaaf52e…36cd15`. Kandidat: 547 → ~560 baris.

## 1. Root di-resolve dari daftar konten, bukan dari `schedule.postId`

`ContentIndex` memaginasi `GET /public/content?accountId=…&nextToken=…`, lalu mencocokkan **teks root** secara persis (NFKC + normalisasi spasi). Syarat lulus:

- tepat **satu** dokumen dengan teks itu (nol atau dua → `BLOCKED`);
- `owner.id` sama dengan `REPLIZ_THREADS_OWNER_ID` (identitas stabil, bukan nama tampilan);
- URL `https`, host `threads.com`/`www.threads.com`, path `/@<username>/post/<id>`, tanpa query/fragmen/port/userinfo;
- `createdAt` berzona waktu dan tidak di masa depan;
- `|createdAt − scheduleAt| ≤ 6 jam` (mencegah kecocokan dengan post lama yang teksnya identik).

## 2. Semua balasan diverifikasi, bukan diasumsikan

Untuk setiap `replies[]`: `GET /public/content/{postId}?accountId=…`, lalu periksa ID, teks, owner, URL, `createdAt`, status `success`, ID unik, dan urutan waktu tidak menurun. Satu kegagalan → seluruh utas `BLOCKED` (fail-closed).

## 3. `READY` ikut direkonsiliasi

Seleksi memakai `status IN ('SCHEDULED','READY')` selama `publish_status='SCHEDULED'`. Ini menutup lima utas yang tidak pernah terlihat (temuan F2). Dapat dimatikan: `UMKM_RECONCILE_INCLUDE_READY=0`.

## 4. Retry/backoff

`http_get()` mengulang 429/5xx dan gangguan jaringan (maks. 3, backoff eksponensial + jitter, menghormati `Retry-After` ≤ 30 detik). 4xx lain tidak diulang. Kegagalan akhir dicatat sebagai alert dan tidak pernah dipromosikan.

## 5. Dua gerbang sebelum promosi

```
UMKM_CONTENT_PROOF_PROMOTE=1
UMKM_CONTENT_PROOF_PUBLISHED_AT=root_createdAt
```

Tanpa keduanya: `SHADOW_MODE` (tidak mengubah status; alert tidak diciptakan) atau `PUBLISHED_AT_SOURCE_UNCONTRACTED` (alert, exit 2). Gerbang tambahan: tidak boleh ada trigger pada `umkm_content_queue`, kolom `published_at`/`note`/`platform_status` harus ada.

## 6. `post_id` yang disimpan adalah root

`repliz_post_id` diisi ID root hasil bukti, bukan `schedule.postId` (yang merupakan ID balasan pertama). Kolom `reconcile_error` dikosongkan hanya setelah promosi berhasil.

## 7. Yang **tidak** berubah

- Jalur lama `published`/`posted` + `publishedAt` valid tetap dipertahankan (dipakai lebih dulu).
- Skema DB tidak diubah; tidak ada migrasi.
- Tidak ada POST ke Repliz; tidak ada pembuatan jadwal.
- Exit code: 0 tanpa alert, 2 ada alert — sama seperti baseline.

## 8. Perbedaan perilaku yang disengaja

| Keadaan | Baseline | R2 SHADOW |
|---|---|---|
| `success`, bukti lengkap | alert `PUBLISHED_PROOF_INCOMPLETE`, exit 2 | `CONTENT_PROOF_PASS_SHADOW`, `reconcile_error=NULL`, exit 0 |
| `success`, bukti gagal | alert, exit 2 | alert `CONTENT_PROOF_<alasan>`, exit 2 |
| `pending` | `platform_status='pending'`, tanpa alert | sama |
| `failed/error/rejected/cancelled` | alert | sama |

Perubahan baris pertama **bukan** pelonggaran syarat: bukti yang diminta justru lebih banyak (root + 7 balasan + jendela waktu). Alert dihapus hanya ketika seluruh syarat terpenuhi; promosi tetap terkunci sampai pemilik menyetujui kontrak `published_at`.
