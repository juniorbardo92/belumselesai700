# Kalyanamitra — bukti publikasi + pembaca Repliz terbatas (K04–K09)

**Tanggal:** 19 Oktober 2026  
**Status paket:** bukti dan alat bantu. **Tidak ada POST, tidak ada jadwal baru, timer tetap OFF.**

## Isi

| Path | Isi |
|---|---|
| `code/repliz_reader.py` | Pembaca Repliz berbatas: filter akun terverifikasi, paginasi, proyeksi, penjaga ukuran (K07) |
| `tests/test_reader.py` | 14 tes offline (filter, paginasi, pemotongan, penjaga byte, kegagalan) |
| `tools/verify_thread.py` | Verifikator utas GET-only (root + semua balasan) |
| `evidence/kal_pilot_evidence.json` | K05/K06: root + 7 balasan KAL-PILOT-001, semua PASS |
| `evidence/public_kal_pilot.json` | Bukti publik tanpa login: 8/8 teks terlihat, 85 tayangan |
| `evidence/filter_evidence.json` | K07: `accountIds` diabaikan, `accountIds[0]` dihormati; halaman 381.766 byte |
| `evidence/uat-terakhir.json` | UAT publisher di sandbox: 25 PASS / 1 PARTIAL / 1 FAIL, 0 POST ke api.repliz.com |
| `evidence/b10-*` | K09: preflight, 7 slide 1080×1440, manifest, dimensi |
| `docs/` | Matriks, temuan, hasil tes, runbook, rollback |

## Ringkasan hasil

- **KAL-PILOT-001 terbit lengkap**: root `17937674628128307` + 7 balasan, teks identik, akun benar, tanpa duplikasi, dan **terlihat publik tanpa login** (8/8).
- `schedule.postId` Repliz = `18181149934429102` adalah **balasan pertama**, bukan root — pola yang sama dengan UMKM dan penyebab kegagalan logika berbasis `postId`.
- **Koreksi bukti:** klaim "UAT B3e 27/27" **tidak tereproduksi** di VPS2 dengan kode produksi (`publisher_kalyanamitra.py` SHA `0121951b…8708e6`, cocok dengan yang dipin) dan fixture yang ada: hasilnya **25 PASS, 1 PARTIAL, 1 FAIL**. Kegagalan bersifat *fail-closed* (0 POST), bukan risiko terbit ganda.
- **K07 selesai pada tataran alat:** pembaca baru memaginasi dengan benar dan menolak halaman >256 KB alih-alih menunggu SSE gagal.

## Menjalankan pembaca (GET only)

```bash
python3 code/repliz_reader.py --env /opt/kalyanamitra/.env \
  --account-id 6a8d2c7862caae1e0405397a --kind schedule --json-out /tmp/sched.json
```

Keluaran ringkas: `items`, `payload_bytes`, `max_page_bytes`, `rejected_oversized_pages`, `effective_page_limit`, `dropped_other_account`, `primary_account_only`.

## Batas

- Timer `kalyanamitra-threads-auto-v1.timer` tetap `inactive/disabled`; paket ini tidak menyentuhnya.
- Tidak ada `activation_guard.py apply`, tidak ada `deploy_guarded.py apply`, tidak ada `upload-one`/`publish-one` Instagram.
- K09 tetap `HOLD_LIVE`: carousel hanya dirender ke disk (`/home/ubuntu/kalyanamitra-ig-b10-stage/`), tanpa unggah.
