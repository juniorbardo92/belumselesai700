# KAL-AUTO-001 — deployment manual terjaga (belum dieksekusi)

**Dibaca dulu:** artefak ini diuji di sandbox ChatGPT, BUKAN source live `/opt/kalyanamitra` dan BUKAN perubahan VPS2/VPS4. Sebelum deployment, operator harus mencatat snapshot source produksi dan melakukan diff/rebase. STOP bila hash skema/fingerprint berbeda; jangan overwrite produksi.

## A. Inventaris read-only di VPS2 & VPS4

Di VPS2 (tanpa mencetak env):

```bash
hostname; sha256sum /opt/kalyanamitra/scripts/jalurb/publisher_kalyanamitra.py
systemctl list-timers --all 'kalyanamitra*' --no-pager
systemctl list-units --all 'kalyanamitra*' --no-pager
python3 - <<'PY'
import sqlite3
p='/opt/kalyanamitra/data/kalyanamitra.db'
con=sqlite3.connect(f'file:{p}?mode=ro',uri=True)
print('QUEUE_SCHEMA_COLUMNS=', [r[1] for r in con.execute('PRAGMA table_info(content_queue)')]);con.close()
PY
```

Di VPS4:

```bash
openclaw status
openclaw mcp status --verbose
openclaw agents list
```

## B. Backup — lakukan sebelum mutasi, di server masing-masing

- SQLite produksi di VPS2: `sqlite3.Connection.backup()` ke direktori backup privat yang hanya dapat dibaca operator; backup HARUS diuji `PRAGMA integrity_check=ok`. Jangan menyalin database mentah ke chat.
- File publisher, fingerprint, `/opt/kalyanamitra/.env`, OpenClaw config dan skill lama: backup berizin 0600, hash sebelum/sesudah, jangan tampilkan nilai konfigurasi.
- Jangan aktifkan timer lama `kalyanamitra-threads-auto-v1.timer`; jalur owner-intent bersifat baru, bukan pelepasan backlog.

## C. Staging lokal VPS2 (tanpa POST Repliz)

Unggah ZIP ke VPS2. Ekstrak ke direktori privat baru, bukan `/opt/kalyanamitra` dan BUKAN overwrite file. Sesuaikan lokasi yang aman, lalu:

```bash
cd /path/to/KAL-AUTO-001
python3 -B -m unittest discover -s tests -v
# Batas sebelum produksi: semua tes harus PASS, setelah fingerprint tetap persis SHA-256 v1.0.1.
```

Untuk staging receiver, buat `KAL_AUTO_OWNER_ID` dari user ID Telegram sebenarnya, bukan nama bot, dan `KAL_AUTO_HMAC_FILE` milik akun service khusus. Dua salinan secret yang sama hanya dimiliki service bridge VPS4 dan receiver VPS2; jangan memberikan secret atau OAuth ke model/Telegram. Set `KAL_AUTO_DATA_DIR` ke folder privat, awalnya `KAL_AUTO_BACKEND=mock` dan `KAL_AUTO_WRITE_ENABLED=false`.

Buat key SSH khusus terpisah dengan passphrase/penyimpanan aman dan `known_hosts` terpin; jangan menyalin SSH private key dari Windows, VPS2 atau Hermes. Di VPS2, buat akun terbatas `kalauto-intake` yang `authorized_keys`-nya hanya menerima forced-command untuk `src/kalauto.py ingest`, tanpa shell interaktif, tanpa port/X11/agent forwarding. Jangan menjalankan `ssh` receiver sebagai root. Gunakan service VPS2 tersendiri untuk `dispatch`; pengguna `kalauto-intake` **tidak** diberi izin menulis ke database produksi. Verifikasi network private path sebelum digunakan.

## D. Pemisahan otoritas dan rekonsiliasi

1. `bridge_vps4.py` → SSH forced-command → `kalauto.py ingest`: **hanya** menambah record `READY`/`DRAFT` di ledger mandiri. Belum POST.
2. VPS2 trusted worker → `kalauto.py dispatch JOB_ID`: **satu** jalur yang boleh memasukkan antrean ke `content_queue` dan memanggil publisher lama; tidak boleh ada writer Repliz paralel atau timer auto lama.
3. Setelah status `SCHEDULED`, `repliz_ro` di VPS4 memeriksa scheduleId/accountId menggunakan GET dan agen membalas Telegram. Jika hanya SUBMISSION_UNCERTAIN, hentikan otomatis, cek provider lewat GET lalu rekonsiliasi manual dengan idempotensi.
4. Batasi signer agar hanya menerima materi dari ID pemilik yang dibuktikan metadata Telegram. Tanpa isolasi exec dan secret per-user, **jangan aktifkan**. Profile global full membuat risiko bypass jika owner ID hanya ditentukan LLM.
5. Pastikan tidak ada cutover yang memicu pekerjaan historis: `KAL-PILOT-001` tetap terkunci.

## E. Aktivasi hanya setelah seluruh gate lulus

Gate minimum: hash produksi cocok dengan sumber yang diuji, skema queue, 27/27 UAT B3e produksi (atau baseline terkini), mock sengaja gagal dan berhasil, signing/SSH forced-command real, owner Telegram sender ID terbukti asli, QA sumber sungguh diuji, single-writer disahkan, rollback restorasi diuji, 8 akun Telegram masih OK, andai thread 8 bagian semua cocok.

Flag `KAL_AUTO_BACKEND=publisher_vps2` dan `KAL_AUTO_WRITE_ENABLED=true` boleh dipasang pada service dispatch khusus **setelah** gate; tidak boleh lewat lingkungan shared OpenClaw. `KAL_AUTO_PUBLISHER_SHA256` wajib diisi hasil SHA256 **file produksi yang sudah diaudit**, `KAL_AUTO_FINGERPRINT_PATH` diarahkan ke kanonis versi 1.0.1, `KAL_AUTO_PRODUCTION_DB` ke DB setelah skema disetujui. Untuk `preflight` tidak perlu flag tulis.

## F. Rollback

1. Nonaktifkan hanya jalur baru (`KAL_AUTO_TRANSPORT_ENABLED=false`, `KAL_AUTO_WRITE_ENABLED=false`) dan hentikan worker KAL-AUTO baru. Tidak mengubah timer lama.
2. Jangan rollback jadwal/provider yang telah dibuat tanpa perintah owner; hentikan saja kiriman baru.
3. Pertahankan ledger privat dan receipt untuk rekonsiliasi jobs `SUBMISSION_UNCERTAIN`. Jangan menghapus pekerjaan atau mengulang POST.
4. Pulihkan hanya modifikasi file/skill milik jalur baru dari backup. Uji `openclaw status`, delapan bot Telegram, MCP Repliz GET, dan `PRAGMA integrity_check` database produksi.
5. Jika migrasi schema tak diperlukan (desain ini tidak memigrasi skema), tidak ada downgrade DB; jika terlanjur ada update queue, rekonsiliasi sebelum pemulihan snapshot agar tidak kehilangan status jadwal.

## G. Verifikasi penerimaan live

- Pesan Telegram baru dari pemilik -> parser -> QA sumber -> satu requestId unik -> receiver VPS2 -> dispatch via publisher lama -> Repliz `SCHEDULED`/scheduleId -> GET Repliz sesuai akun -> balasan Telegram, tepat satu kali.
- Input tanpa instruksi hanya `DRAFT`; user lain `BLOCKED`; salah akun/sumber/slot/duplikasi `BLOCKED`; crash setelah SUBMITTING => `SUBMISSION_UNCERTAIN`, tidak ada retry POST otomatis.
- Jangan membuat posting percobaan live; gunakan materi baru ketika pemilik mengirim perintah secara eksplisit setelah semua gate lulus.
- Publish-asap masih jadwal paling cepat (+16 menit), bukan publish instan; Instagram dan full recurring membutuhkan pengembangan lanjutan.
