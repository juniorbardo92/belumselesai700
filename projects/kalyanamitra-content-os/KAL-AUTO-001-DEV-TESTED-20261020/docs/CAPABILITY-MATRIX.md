# KAL-AUTO-001 — capability matrix and execution receipt

Evaluasi: 2026-10-20. **Runtime:** offline container lokal, bukan VPS2/VPS4. Seluruh posting provider: 0. Tidak ada integrasi produksi yang diubah.

| Kemampuan | Implementasi tersedia | Uji yang dieksekusi | Status produksi |
|---|---|---|---|
| Validasi owner/account/intent Telegram terstruktur | Ada di `kalauto.py`, tandatangan HMAC, SSH client | Lulus mock dan unit | BLOCKED — peer binding Telegram riil belum dites |
| Materi tanpa perintah → draft | Ada untuk JSON terstruktur | PASS offline | BLOCKED — parsing media/file & OpenClaw belum dipasang |
| Materi sumber Dharma, QA | Gerbang source_verified & source_refs, bukan QA sumber otomatis | PASS negatif | BLOCKED — akurasi sumber tidak dapat dinilai oleh bool |
| Jadwalkan 6–8 bagian Threads | Adapter ke publisher VPS2, hanya lewat 1 writer | PASS via fake publisher + clone DB | BLOCKED — kode & DB produksi belum diverifikasi |
| Jadwal Repliz GET oleh Telegram | Terbukti pada laporan agen KAL-REPLIZ-002/003 | Laporan agen, bukan uji ulang bundle | PASS scoped — read-only historis |
| Posting saat ini | `PUBLISH_ASAP` menjadwalkan minimal 16 menit, bukan publish instant | PASS offline untuk konversi slot | BLOCKED — publish-now provider belum diuji |
| Publisher API create real | Delegasi `publisher_kalyanamitra.py`, tidak membuat HTTP POST sendiri | 0 live POST, 1 mock | BLOCKED — credential, plan/permission, flag produksi belum diperiksa |
| Cek duplikasi / idempotensi adapter | PK Telegram, source+slot version, claim satu kali | PASS concurrent/replay | PASS offline; DB/repliz live unverified |
| Anti-duplikat publisher kanonis | Dibangun dari fungsi lama (tidak dimodifikasi) | 13/13 tes B3e lokal | PASS offline; live UAT 27 fixture tetap perlu pemeriksaan |
| Cek jadwal status owner | CLI `status` ledger dan Repliz READ-ONLY yang sudah ada | PASS ledger offline | PARTIAL — notifikasi Telegram belum dipasang |
| Serial 7/30 hari | Tidak diimplementasikan | NOT_RUN | BLOCKED |
| Cancel/ubah jadwal | Tidak diekspos | NOT_RUN | BLOCKED |
| Media PDF/EPUB/gambar | Diharapkan diekstrak oleh tool agen | NOT_RUN | BLOCKED |
| Instagram carousel | Tidak diaktifkan | NOT_RUN | BLOCKED — perlu B10 staging dan media storage |
| Keamanan pengirim via metadata Telegram | Memerlukan binding OpenClaw yang tepercaya | Simulasi flag saja | BLOCKED — tidak dibuktikan |
| Transport SSH forced command | Client SSH pinned-host tersedia | Unit mock | BLOCKED — VPS4→VPS2 belum dites |
| Status Repliz root+7 | Sudah diperiksa historis dan dikonfirmasi visual pemilik | Tidak diuji ulang | Historis PASS visual owner, formal gate OPEN |
| Backups/rollback nyata | Runbook disiapkan | NOT_RUN on VPS | BLOCKED |

## Bukti pengujian

- `python3 -B -m unittest discover -s tests -v` → **31/31 PASS**, perincian `evidence/test-results.log`.
- B3e source sandbox `python3 -B tests/test_b3e_dev.py` → **13 pemeriksaan PASS**, `POST_TO_FAKE 0`, perincian `evidence/b3e-regression.log`.
- Tidak ada tes koneksi HTTP nyata, Repliz POST, Gateway, Telegram ataupun SQLite produksi dilakukan di sesi ini.
- SHA256 kanonis fixture: `319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930`.

## Keputusan

`KAL-AUTO-001: PARTIAL/BLOCKED` — kode adapter & uji lokal tersedia, belum live. **Jangan** menyatakan `READY_FOR_OWNER_CONTENT` sampai E2E sebenarnya pada VPS4/VPS2 dan isolasi kredensial, syarat provider, dan non-regresi Guardian/Hermes dibuktikan. Otorisasi user untuk deploy sudah diberikan, tetapi akses eksekusi VPS tidak tersedia dalam sesi ini.
