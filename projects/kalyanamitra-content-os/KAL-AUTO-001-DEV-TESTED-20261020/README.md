# KAL-AUTO-001 — owner-intent publisher adapter, candidate

Status: **DEV TESTED / NOT DEPLOYED** (20 Oktober 2026).

Isi:
- `src/kalauto.py`: HMAC-verified intake, owner ID + account allowlist, slot WIB, QA/ref guard, owner-intent ledger SQLite, no duplicate, publisher VPS2 adapter dengan hash pin, mock mode, status dan status unknown yang tidak auto retry.
- `src/bridge_vps4.py`: outbound-only client via SSH forced-command (butuh konfigurasi & akses operator nyata).
- `tests/test_kalauto.py`: 31 tes dari mock/staging, termasuk 1 simulated publisher di SQLite clone.
- `tests/fixtures/fingerprint_kalyanamitra.py`: **fixture pengujian** fingerprint kanonis v1.0.1; jangan deploy sebagai duplikat fungsi produksi.
- `docs/AGENT-SKILL-KAL-AUTO-001.md`: spesifikasi tindakan agen, bukan modifikasi otomatis skill live.
- `docs/DEPLOY-ROLLOUT.md`: staging, setup real, owner security, preflight, rollback.
- `evidence/test-results.log`, `evidence/manifest-sha256.txt`: bukti testing dan integritas paket.

## Contoh operasional (sandbox mock, BUKAN produksi)

Set key privat lokal serta env `KAL_AUTO_OWNER_ID`, `KAL_AUTO_HMAC_FILE`, `KAL_AUTO_DATA_DIR` untuk signer/receiver yang sama. Buat JSON materi sesuai dokumen skill dan gunakan `python src/kalauto.py sign < payload.json | python src/kalauto.py ingest`. Perintah ini menghasilkan `ACCEPTED_NO_PUBLISH`. Untuk simulasi, set `KAL_AUTO_BACKEND=mock` lalu `python src/kalauto.py dispatch <job_id>`; output `MOCK_SCHEDULED` berarti 0 HTTP POST ke provider.

**Jangan menggabungkan sign dan ingest ke satu akun pada produksi.** VPS4 signer dan VPS2 receiver harus memiliki isolation/key berbeda dari operator/agen lain; SSH forced command perlu dibuktikan. **Tidak ada kemampuan menerima pesan Telegram yang terdeploy dalam ZIP ini**; jalur itu baru spesifikasi skill sampai operator menyambungkan dan membuktikan sender metadata.

## Kemampuan sekarang

- PASS offline: DRAFT, SCHEDULE intent structured, publisher mock, guard & idempotensi, SQLite clone shim.
- TIDAK DIUJI: live VPS2 production code, SSH route VPS4→VPS2, Telegram actual identity, scheduler live Repliz POST, owner notifications, rendering source PDFs/EPUB, B10 IG.
- BELUM DIIMPLEMENTASI: 1–5 post publishing, publish instant yang nyata, recurring mass, edit/cancel, full Telegram E2E.

Dokumentasi: https://docs.repliz.com/api/schedule/create-schedule . Repliz `POST /public/schedule` menyediakan nested `replies` untuk Threads dan butuh Premium+; pemanggilan live tetap melalui publisher VPS2 lama (single writer), tidak dari kode adapter baru.
