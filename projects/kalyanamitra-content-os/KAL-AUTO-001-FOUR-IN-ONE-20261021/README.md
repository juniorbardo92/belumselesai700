# KAL-AUTO-001 V4 — Four-in-One Publication Proof & Telegram Report

**21 Oktober 2026 — Kandidat implementasi. Status 26 Oktober 2026: sudah terpasang dan berjalan di VPS2/VPS4; "BELUM deployed" adalah konteks historis paket.**

Paket ini menggabungkan **empat pekerjaan** dalam satu jalur: (1) pemeriksaan keterlihatan publik, (2) metadata root–balasan, (3) rekonsiliasi publikasi sesudah jadwal selesai, dan (4) notifikasi otomatis Telegram. Ini merupakan **monitor tambahan**, bukan perubahan publisher atau scheduler yang sudah lulus UAT.

## Mekanisme (GET only ke Repliz)

1. VPS2 membaca job `state=SCHEDULED` pada `/var/lib/kal-auto-intake/state/kalauto/intent.sqlite` secara **read-only**. Tidak memodifikasi tabel `jobs` atau database publisher.
2. VPS2 melakukan GET `/public/schedule/{scheduleId}` dan, ketika `success`, GET `/public/content?accountId=...` dan `/public/content/{contentId}`. Teks, akun, ID unik, permalink dan waktu dibandingkan. Root ID Gampopa Day 1 yang sudah dilaporkan (`18373177039215205`) dipakai sebagai **petunjuk lookup saja**; hasil tetap harus dibuktikan ulang via Content API.
3. Pemeriksaan publik dilakukan dengan GET HTTPS ke permalink yang sudah divalidasi berada di `www.threads.com/@ruangkalyanamitra/post/...`. HTTP 200/halaman JS/login **bukan** bukti isi; `VERIFIED` hanya jika metadata HTML memuat teks post. Jika tidak, `NOT_VERIFIED` dan tautan tetap disediakan untuk pemeriksaan pemilik.
4. Parent-child `VERIFIED` hanya bila ada field induk eksplisit pada respons Content API atau token **Meta Threads read-only** yang mengembalikan `replied_to` dari Graph API resmi. Tanpa izin ini, `NOT_VERIFIED` (walaupun urutan dan struktur schedule cocok). Token Meta bersifat opsional, tidak pernah dibuat/diambil dari Repliz secara diam-diam.
5. Hasil publikasi disimpan pada **sidecar SQLite** `/var/lib/kal-auto-intake/state/kalauto/publication_proof.sqlite`, dengan `CONTENT_CONFIRMED` bila 7/7 Content API lolos. Job asli tetap `SCHEDULED`, sehingga anti-duplikat dan publisher V3 tidak terdampak.
6. Notifikasi otomatis memakai **bot Telegram Kalyanamitra yang sama** melalui Telegram Bot API `sendMessage`, tanpa Gateway OpenClaw kedua. Hanya saat milestone baru `PUBLISHED`, `FAILED`, atau `EVIDENCE_PENDING` (30 menit sesudah slot). Sebelum send, notifikasi diklaim dalam ledger agar timeout tidak mengirim dua kali; jika `UNCERTAIN`, operator harus memeriksa, **tidak di-retry otomatis**.

> `CONTENT_CONFIRMED` berbeda dari `PUBLIC_VISIBILITY_VERIFIED` dan `PARENT_CHILD_VERIFIED`: tiga jenis bukti ini terpisah.

## Yang tidak diubah

- VPS4 tetap menjalankan OpenClaw dan seluruh delapan agen.
- VPS2 publisher `/opt/kalyanamitra/scripts/jalurb/publisher_kalyanamitra.py`, fingerprint, `.env`, database historis, timer publisher lama tetap seperti sebelum pemasangan.
- Timer baru `kalauto-schedule-worker.timer` tetap aktif dan bekerja mandiri; **tidak disentuh**.
- Tidak ada Repliz `POST`, `PUT`, `DELETE` atau `retry` dalam kode V4.

## A. VPS2 — Instalasi kandidat V4

Unggah ZIP yang diberikan ke `/home/ubuntu/` VPS2:

```bash
mkdir -p ~/kal-auto-v4-stage
python3 -m zipfile -e ~/KAL-AUTO-001-FOUR-IN-ONE-20261021.zip ~/kal-auto-v4-stage
cd ~/kal-auto-v4-stage/KAL-AUTO-001-FOUR-IN-ONE
python3 -B -m unittest discover -s tests -q
sudo bash scripts/install_vps2_v4.sh
```

Harus `30 tests OK`, `KAL_AUTO_V4_STAGED`, `NEW_MONITOR_TIMER=DISABLED`, `REPLIZ_POST=0`.

Installer **menolak overwrite** apabila receiver saat ini bukan V3 berhash `5d16f40caf8bc744c48d2077d6d5893bb2d43447bdf2a5c7a5833b3d2927b845` atau V4 yang sama. Membuat backup asli `/opt/kal-auto-001/receiver_vps2.py.bak-pre-proof-v4`. Jangan bypass pengecekan jika source live berbeda.

## B. VPS4 — Pasang pemberi izin notifikasi (tanpa mencetak token)

Unggah ZIP yang sama ke VPS4:

```bash
mkdir -p ~/kal-auto-v4-stage
python3 -m zipfile -e ~/KAL-AUTO-001-FOUR-IN-ONE-20261021.zip ~/kal-auto-v4-stage
cd ~/kal-auto-v4-stage/KAL-AUTO-001-FOUR-IN-ONE
python3 -B -m unittest discover -s tests -q
bash scripts/install_vps4_v4.sh
python3 -B ~/.openclaw/workspace-kalyanamitra/tools/kalauto_notify_provision_v4.py
```

Target akhir: `TELEGRAM_NOTIFY_CONFIGURED`. Program mengambil `botToken` dari konfigurasi akun Kalyanamitra jika tersedia. Jika tersimpan sebagai secret reference, program meminta token melalui prompt tersembunyi di **terminal VPS4 saja**, bukan melalui ChatGPT. Jangan mengirim token dalam chat. Provisioning menggunakan kanal signed forced-SSH yang sudah ada, satu kali, dan menolak penulisan ulang.

Jangan menjalankan provisioning sebelum `KAL_AUTO_V4_STAGED` dari VPS2. Jika status `BOT_TOKEN_NOT_AVAILABLE`, jangan lanjut menyalakan timer; laporkan hanya kode hambatan, tanpa token.

## C. VPS2 — Jalankan satu kali dan nyalakan timer pemantau

Sesudah `TELEGRAM_NOTIFY_CONFIGURED`:

```bash
sudo python3 -B /opt/kal-auto-001/publication_monitor.py preflight
sudo python3 -B /opt/kal-auto-001/publication_monitor.py once
sudo python3 -B /opt/kal-auto-001/publication_monitor.py status --job-id KAL-AUTO-D8BC64FDB13CD47902B6
sudo systemctl enable --now kalauto-publication-monitor.timer
systemctl is-active kalauto-publication-monitor.timer
```

Tunggu receipt Telegram ke DM pemilik. Proses manual `once` **GET Repliz saja**, serta mungkin `sendMessage` ke Telegram, bukan POST Repliz. Hasil `CONTENT_CONFIRMED` yang diharapkan bergantung pada hasil API nyata; jangan klaim sebelum hasil terlihat. Bila berstatus `REPLIZ_SUCCESS`/`API_UNAVAILABLE`, lampirkan kode alasan dan lanjutkan pemantauan. Jangan melakukan POST ulang.

## D. Status empat kemampuan

| Fitur | Implementasi | Bukti minimum untuk PASS |
|---|---|---|
| Keterlihatan publik | GET permalink + pemeriksaan isi HTML | Tujuh metadata HTML berisi potongan teks post, bukan sekadar HTTP 200; jika JS/login, `NOT_VERIFIED` |
| Root–balasan | Field `replied_to` bila tersedia; Meta Graph API opsional | Enam hubungan induk eksplisit valid; jika tidak tersedia, `NOT_VERIFIED` |
| Rekonsiliasi hasil publikasi | GET schedule + 7 GET content, sidecar ledger | `CONTENT_CONFIRMED`, 7 ID/URL unik, akun dan teks 7/7 cocok |
| Laporan otomatis | Timer VPS2 + Bot API sendMessage | Milestone baru tercatat `SENT`, pesan diterima di DM pemilik |

Untuk membuka pemeriksaan parent-child lengkap jika Anda telah memiliki token resmi Meta Threads API berizin read-only, letakkan melalui kanal administratif terpisah sebagai `/var/lib/kal-auto-intake/meta-threads-ro.token` (mode 0600). **Jangan gunakan token Repliz sebagai token Meta**; kedua layanan berbeda. Ketiadaan token tidak menghalangi pelaporan publikasi.

## Error & rollback

Jika installer berstatus `BLOCKED_RECEIVER_HASH_CHANGED_REVIEW_DIFF`, berhenti dan kirim hash/diff tanpa overwrite. Jika `REPLIZ_HTTP_403` atau `CONTENT_API_UNAVAILABLE`, jangan ubah kredensial atau downgrade klaim bukti; gunakan hasil `NOT_VERIFIED` dan catat gate.

Rollback aman (VPS2):

```bash
sudo systemctl disable --now kalauto-publication-monitor.timer
sudo systemctl stop kalauto-publication-monitor.service || true
sudo cp -a /opt/kal-auto-001/receiver_vps2.py.bak-pre-proof-v4 /opt/kal-auto-001/receiver_vps2.py
```

Jangan menghapus `publication_proof.sqlite` atau `telegram-notify.json` saat rollback; keduanya diperlukan sebagai bukti/receipt dan tidak digunakan oleh publisher lama. Tidak perlu mengubah timer publikasi V3 atau Gateway VPS4. Setelah rollback, jalur `PROVISION_NOTIFY` tidak tersedia lagi, tetapi jadwal yang sudah dipublikasikan tetap tidak berubah.

## Audit kode

- `src/publication_monitor.py`: hanya Repliz GET, opsional Meta/Threads GET, notifikasi Telegram POST, sidecar SQLite.
- `src/receiver_vps2_v4.py`: receiver V3 + satu perintah signed `PROVISION_NOTIFY`, dan tetap menolak remote command.
- `src/provision_notify_vps4.py`: membaca token lokal VPS4 dan mengirim ke penerima tertanda, tanpa mencetak rahasia.
- `scripts/install_vps2_v4.sh`/`install_vps4_v4.sh`: instalasi minimal hash-guarded.
- `systemd/kalauto-publication-monitor.*`: timer terpisah, bukan timer publisher.
- `tests/`: unit tests untuk pembuktian, kegagalan data, notifikasi anti-duplikat dan otorisasi receiver.

**Batas klaim:** Paket ini telah diuji offline, tetapi belum diinstal atau di-UAT pada kedua VPS pada saat dibuat. Tidak ada bukti real-time di sini bahwa `CONTENT_CONFIRMED` atau `SENT` sudah terjadi.
