# Integrasi Main / Reviewer — kontrak yang perlu dipasang setelah preflight VPS4

**Belum dipasang dalam OpenClaw.** Ini adalah kontrak mekanis untuk orkestrator Hermes agar *tidak melompat tugas*; tidak mengubah konfigurasi yang telah CLOSED tanpa membaca kondisi aktual.

## Prosedur wajib Main sebelum delegasi

1. Ambil status `python3 ~/.local/share/hermes-quality-gate-v1/gate.py next` dan pilih tepat **satu ID** yang benar-benar eligible (atau pekerjaan independen yang terkontrol).
2. Panggil `claim --task ID --actor <agent-atau-run-id>`. Jika keluaran `BLOCKED`, `TASK_NOT_ACTIVE`, `BLOCKED_START_DEPENDENCIES`, `TASK_ALREADY_IN_FLIGHT`, atau tool tidak tersedia: **JANGAN** jalankan tugas itu, jangan gunakan bypass alternatif, eskalasi ke pemilik.
3. Simpan token claim pada berkas kerja privat (0600); kirim hanya melalui mekanisme aman ke agen eksekutor. Jangan taruh di chat, log publik, .md Obsidian read-only, atau prompt model tanpa kontrol.
4. Delegasikan **hanya ruang lingkup ID** yang diklaim. Tidak boleh menambah target produksi diam-diam.
5. Setelah agen selesai, catat baseline, command uji, hasil nyata, artefak berkas beserta SHA256 ke receipt JSON. Tuliskan via temp file+rename atomik ke direktori inbox.
6. Verifier otomatis mengembalikan `STRUCTURAL_PASS_OWNER_PENDING` atau penolakan. `STRUCTURAL_PASS_OWNER_PENDING` **bukan** CLOSED.
7. Reviewer harus memeriksa konten artefak, sumber, ketepatan hasil, bukti provider/platform, dan risiko produksi. Bila invalid, tolak/ulang **satu masalah → satu perbaikan → satu tes**.
8. Keputusan CLOSED hanya dilakukan oleh pemilik melalui terminal interaktif setelah bukti sesuai, dengan alasan. Tugas penerus baru boleh `claim` jika dependensinya CLOSED atau CLOSED_DEV sesuai lingkup.

## Bukti minimum per jenis pekerjaan

- **DEV:** log tes Node/Python terbaru, versi baseline, traceability source, artefak hash, ketidakberubahan snapshot produksi (jika relevan), review pengujian independen. CLOSED_DEV bukan deploy.
- **DEPLOYMENT:** receipt deployment VPS yang benar-benar terjadi, checksum paket, regresi, clone smoke/auth, health setelah cutover, DB unchanged dan rencana rollback; keputusan pemilik.
- **PUBLIKASI:** cocokkan ID jadwal, akun tujuan, root+balasan, URL/ID yang disahkan oleh provider/publik dan ledger; internal POSTED atau schedule pending bukan bukti publikasi.
- **HERMES P2-03:** tool benar-benar tersedia dan penolakan izin diuji; TOOL_NOT_AVAILABLE tidak pernah dianggap PASS.
- **BACKUP:** exit=0 saja tidak cukup; butuh checksum arsip, restore pada DB clone terisolasi, dan bukti offsite jika menjadi tujuan.

## Contoh ID yang sengaja memiliki dependensi eksplisit

- `K05` CLOSED dulu sebelum `K06` (klaim dan penutupan).
- `B10` CLOSED/CLOSED_DEV dulu sebelum `B09` (kelengkapan 72 terjemahan sebelum penutupan Enam Bidang).
- `C03` CLOSED dulu sebelum `C04` (QA konten kreatif sebelum klaim carousel final).
- `U03` CLOSED dulu sebelum `U04` (rekonsiliasi H+1 sebelum klaim E2E final).

Hanya empat relasi ini dikunci dalam policy v1. Relasi lain dapat ditambah setelah diverifikasi secara eksplisit bersama owner; jangan mengarang dependency yang dapat memblokir pekerjaan independen. Policy sudah tercatat pada salinan terpasang, pengeditan manual mengurangi integritas dan perlu gate migrasi versi tersendiri.

## Batas kendali terpenting

Ini adalah **gerbang aplikasi untuk agen yang patuh**. Menempelkan SOP pada Main saja tidak secara teknis menghentikan agen, sudo atau service lain yang menjalankan perintah langsung. Untuk enforcement tingkat OS diperlukan pembatasan eksekutor dan izin terpisah setelah audit sistem. Paket v1 sengaja tidak mengubah OpenClaw, sudoers, systemd produksi, Telegram, DB, atau token untuk menghindari merusak pekerjaan yang sudah CLOSED.
