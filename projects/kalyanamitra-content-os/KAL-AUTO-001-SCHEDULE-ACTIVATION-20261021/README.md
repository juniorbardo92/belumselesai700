# KAL-AUTO-001 — Aktivasi penjadwalan Threads melalui publisher VPS2

Versi: 2026-10-21. Menggunakan publisher B3e yang fingerprint dan hash-nya sudah terverifikasi di VPS2. **Paket dibuat/diuji di lingkungan lokal, BELUM diinstal di VPS2/VPS4.**

## Sudah dimiliki dan tidak diubah

- VPS4: OpenClaw + Telegram `@AsistenKalyanamitraBot`, DM allowlist, SSH pinning `10.11.0.10` dan ED25519 staging.
- VPS2: publisher B3e, Repliz credential, anti-duplikat 3 lapis, receiver V2 pada `/opt/kal-auto-001/receiver_vps2.py`, SSH forced-command, legacy timer OFF.

## Yang baru

- Receiver V3 mendukung bootstrap signing key **melalui forced SSH** (tidak perlu menempel secret di chat), menerima pekerjaan bertanda tangan, dan pembacaan status. Receiver tidak mengirim POST.
- Adapter V3 menambahkan `sources`, `claims`, `public_practice_safe` untuk memenuhi kontrak validator Dharma. **Tidak membuat referensi baru**; konten yang belum diverifikasi akan diblokir.
- Worker terpisah di VPS2 menjalankan `kalauto.py dispatch` untuk **job `KAL-AUTO-*` saja**. Claim sebelum POST dan tanpa automatic retry setelah state tidak pasti. Worker dipasang disabled, lalu diaktifkan setelah tes handshake signed intake.
- Sender + skill pada VPS4. OpenClaw tetap di VPS4, tidak ada MCP write global dan tidak mengubah 7 agen lain.

## 1. Install kode VPS2 (staging, tanpa publikasi)

Unggah ZIP ke `/home/ubuntu/` VPS2, kemudian:

```sh
mkdir -p ~/kal-auto-schedule-stage
python3 -m zipfile -e ~/KAL-AUTO-001-SCHEDULE-ACTIVATION-20261021.zip ~/kal-auto-schedule-stage
cd ~/kal-auto-schedule-stage/KAL-AUTO-001-SCHEDULE-ACTIVATION
python3 -B -m unittest discover -s tests -q
sudo bash scripts/install_vps2.sh
```

Harus muncul `KAL_AUTO_V3_VPS2_STAGED` dan `WORKER_TIMER=DISABLED`. Instalasi **menolak** jika hash receiver V2/publisher/fingerprint berubah atau sudah ada config aktif. Dilarang memaksa override.

## 2. Install tool VPS4 (staging)

Unggah ZIP yang sama ke VPS4 dan:

```sh
mkdir -p ~/kal-auto-schedule-stage
python3 -m zipfile -e ~/KAL-AUTO-001-SCHEDULE-ACTIVATION-20261021.zip ~/kal-auto-schedule-stage
cd ~/kal-auto-schedule-stage/KAL-AUTO-001-SCHEDULE-ACTIVATION
python3 -B -m unittest discover -s tests -q
bash scripts/install_vps4.sh
```

## 3. Bootstrap SSH-signed intake VPS4 -> VPS2

VPS4 (tanpa menampilkan secret):

```sh
python3 -B ~/.openclaw/workspace-kalyanamitra/tools/kalauto_schedule_v3.py bootstrap 10.11.0.10
```

Target `SIGNED_BRIDGE_BOOTSTRAPPED` dengan `publisher_enabled=false`. Bootstrap hanya sekali dan diverifikasi oleh forced-command SSH. Tidak mengirim Repliz POST.

Coba probe lama: mungkin kini mengembalikan `BLOCKED` untuk pesan kosong. Signed submission/STATUS diuji di tahap berikut.

## 4. Contoh UAT pekerjaan DRAFT (aman)

Hanya gunakan `message_id` Telegram yang benar-benar diperoleh dari transport, bukan contoh literal; nilai akun dipilih server. Gunakan materi baru yang belum pernah dicatat. Berikut tes harus dijalankan oleh operator dengan metadata Telegram nyata; bisa menggunakan enam string sampel karena **DRAFT tidak bisa dipublikasikan**:

```json
{"message_id":"<chat_id>:<message_id>","intent":"DRAFT","topic":"UAT intake","tradition":"THERAVADA","posts":["Satu","Dua","Tiga","Empat","Lima","Enam"],"source_refs":[],"source_verified":false,"content_version":1}
```

Simpan sebagai file JSON privat di VPS4 lalu kirim:

```sh
python3 -B ~/.openclaw/workspace-kalyanamitra/tools/kalauto_schedule_v3.py submit /path/to/uat-draft.json
```

Receipt `ACCEPTED_NO_PUBLISH`, `state=DRAFT`. Coba `status <job_id>`; harus `STATUS_OK`, `state=DRAFT`. **Jangan gunakan pekerjaan DRAFT untuk menguji POST**.

## 5. Aktivasi worker VPS2

Pastikan struktur `sources`/`claims` dari satu materi sungguhan lulus `validate_dharma_json.py` dan slot >=10 menit di masa depan. Setelah bootstrap dan UAT DRAFT lulus:

```sh
sudo systemctl enable --now kalauto-schedule-worker.timer
systemctl is-active kalauto-schedule-worker.timer
```

Target `active`. Timer **ini bukan** legacy `kalyanamitra-threads-auto-v1.timer` (yang tetap OFF). Belum ada POST selama belum ada job SCHEDULE baru.

Lalu pada Telegram pemilik kirim instruksi eksplisit dengan waktu WIB dan materi yang benar-benar terverifikasi. Agen membentuk JSON dan submit via sender, serta memeriksa `status` untuk schedule_id. Jangan memublikasikan ulang job historis; bila slot masa lalu, minta slot baru.

## 6. Izinkan instruksi pemilik di skill Dharma

Skill lama mungkin mengandung `Never publish anything`. Sesudah signed intake dan worker sudah diuji, patch **satu baris** melalui script yang membuat backup. VPS4:

```sh
python3 scripts/authorize_owner_skill_vps4.py
```

Script menolak jika line tidak unik atau file berubah. Baca backup jika ada kendala. Tidak perlu mengubah Gateway atau bot lain. Buka sesi Telegram baru setelah instalasi.

## Status dan bukti

- `ACCEPTED_NO_PUBLISH`: diterima di antrean, bukan jadwal Repliz.
- `QA_BLOCKED`: sumber/claim tidak memenuhi validasi, tanpa POST.
- `SUBMISSION_UNCERTAIN`: lakukan GET rekonsiliasi, **jangan submit ulang**.
- `SCHEDULED` + `schedule_id`: Repliz menerima jadwal; bukan bukti sudah terbit di Threads.

## Rollback

VPS2, hentikan timer baru; **jangan rollback source ketika masih ada pekerjaan READY/SUBMISSION_UNCERTAIN**, lakukan rekonsiliasi dulu.

```sh
sudo systemctl disable --now kalauto-schedule-worker.timer
sudo systemctl stop kalauto-schedule-worker.service || true
```

Setelah memastikan tidak ada job aktif:

```sh
sudo cp -a /opt/kal-auto-001/kalauto.py.bak-pre-write /opt/kal-auto-001/kalauto.py
sudo cp -a /opt/kal-auto-001/receiver_vps2.py.bak-pre-write /opt/kal-auto-001/receiver_vps2.py
```

Receiver V2 tidak dapat membaca konfigurasi baru tanpa perubahan; jika bootstrap sudah terjadi, **jangan kembali ke V2 sebelum mengoordinasikan migrasi config**. Data inbox dan job tidak dihapus.

VPS4: hapus hanya skill dan tool baru jika tidak digunakan; pertahankan state dan rahasia untuk rekonsiliasi sebelum dihapus. Untuk policy skill, pulihkan hanya jika backup `SKILL.md.pre-kal-auto-001.bak` sesuai.

## Batas yang belum dipenuhi

- Paket ini mengaktifkan *schedule-as-instructed* melalui agen yang mempunyai `exec` dan metadata Telegram, bukan direct `publish-now` real-time.
- Tidak ada notifikasi Telegram asinkron jika worker selesai **setelah** turn agen; agen dapat menggunakan `status` saat diminta. Notifier otomatis masih pengembangan terpisah.
- Format CSV workbook asli tidak tersedia dalam percakapan ini sehingga konten Gampopa Day 1 **belum pernah dikirim** oleh paket ini.
- Ini candidate deployment: jangan klaim `READY_FOR_OWNER_CONTENT` sebelum pemasangan serta UAT nyata berhasil.
