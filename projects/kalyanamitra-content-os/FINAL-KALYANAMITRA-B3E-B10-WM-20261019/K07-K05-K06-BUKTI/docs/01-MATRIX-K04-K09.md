# Matriks status Kalyanamitra — BEFORE / AFTER (19 Oktober 2026)

Legenda: `CLOSED` = bukti lingkup terpenuhi · `PARTIAL` = sebagian · `OPEN` = belum ada bukti · `HOLD` = sengaja tidak dijalankan.

| ID | Pekerjaan | BEFORE | AFTER | Bukti |
|---|---|---|---|---|
| K01 | Fingerprint v1.0.1 & B3e anti-duplikat | CLOSED_SCOPED (klaim 27/27) | **CLOSED_SCOPED dengan koreksi angka** | Hash produksi cocok (`319db006…2d930`, `0121951b…8708e6`); UAT di VPS2 = 25 PASS / 1 PARTIAL / 1 FAIL, bukan 27/27 (F3) |
| K02 | Env scheduler (`safe_env`) | CLOSED_CODE_PATCH | **CLOSED_CODE_PATCH (tak diubah)** | Hash publisher sama dengan yang dipin di `kalyanamitra-threads-auto-v1.py`; patch tidak perlu diulang |
| K03 | Timer Threads | HOLD / OFF | **HOLD / OFF (diverifikasi)** | `systemctl is-active` = `inactive`, `is-enabled` = `disabled` |
| K04 | Eksekusi publisher | PARTIAL | **PARTIAL (tetap)** | Satu run terkontrol pernah menghasilkan `POSTED`; tidak ada pengujian trigger berulang. Tidak ada kode yang diubah |
| K05 | KAL-PILOT-001 pasca-jadwal | PARTIAL (postId `18181149934429102`, tanpa bukti publik) | **CLOSED_SCOPED** | GET Schedule = `success`; root `17937674628128307`; `evidence/kal_pilot_evidence.json` |
| K06 | Root + 7 balasan, tanpa duplikasi | OPEN | **CLOSED_SCOPED** | 7/7 balasan PASS (ID, teks, akun, URL, `createdAt` naik), 0 ID ganda; publik 8/8 tanpa login, 85 tayangan |
| K07 | MCP Repliz GET-only, oversized SSE, `accountIds` | PARTIAL | **CLOSED_TOOLING** | `code/repliz_reader.py` + 14 tes; bukti: `accountIds` polos diabaikan (1425 vs 209 dokumen), `accountIds[0]` dihormati; halaman limit 100 = 381.766 byte → dipersempit adaptif |
| K08 | Inventaris 108 jadwal Desember | CLOSED_SCHEDULE_INVENTORY | **CLOSED_SCHEDULE_INVENTORY** | Bukan bukti terbit; tidak diklaim sebagai publikasi |
| K09 | Carousel Instagram B10 | PARTIAL / HOLD_LIVE | **PARTIAL (maju, tetap HOLD_LIVE)** | 28 tes lulus; preflight PASS; stage 7 slide 1080×1440 deterministik — **watermark RK belum ada** (F4) |
| K10 | Konten Dharma & target pengikut | OPEN | **OPEN** | Tidak ada QA per-draf baru maupun angka follower aktual dalam pekerjaan ini |

## Perubahan pada dunia nyata

Tidak ada. Tidak ada POST, tidak ada jadwal, tidak ada upload media, tidak ada perubahan `.env`, DB, timer, atau akun. Semua pengujian berjalan pada salinan/sandbox dengan server tiruan (`127.0.0.1`).

## Blocker yang tersisa

1. **K09**: watermark RK harus diputuskan (teks/logo, posisi, opasitas) sebelum slide dianggap final.
2. **K05/K06 naik ke `CLOSED` penuh** memerlukan satu penerimaan pemilik atas 8 URL publik (bukti sudah tersedia di paket ini).
3. **K04**: stabilitas trigger berulang hanya bisa dibuktikan dengan satu siklus timer nyata — dan itu **butuh persetujuan pemilik** karena akan menerbitkan konten.
