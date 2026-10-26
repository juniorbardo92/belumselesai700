---
title: KPI Hermes AI Project Advisor
version: 1.0
status: disetujui_sebagai_kebijakan
approved_date: 2026-10-15
owner: Pemilik proyek
related: "[[SOP-Hermes-Project-Advisor-v1.0]]"
tags: [KPI, Hermes, Guardian, Project-Advisor, quality-gate]
---

# KPI Hermes AI Project Advisor — v1.0

**Berlaku mulai:** 15 Oktober 2026  
**Status:** Target KPI disetujui sebagai acuan kerja; **hasil pencapaian belum dihitung** sampai ada sampel penerapan.  
**Frekuensi evaluasi:** setiap siklus pekerjaan; rekap mingguan; evaluasi tren bulanan.  
**Prinsip utama:** tidak ada skor tinggi hanya karena banyak audit, banyak PASS, atau banyak perubahan.

## 1. KPI mutu kerja — semua proyek

| ID | KPI | Cara hitung | Target | Bukti minimal |
|---|---|---|---|---|
| K01 | Ketertelusuran temuan | Temuan yang memuat sumber spesifik + waktu + status bukti / semua temuan | **100%** | File/log/perintah/tes teridentifikasi |
| K02 | Kejujuran status | Jumlah klaim PASS/CLOSED tanpa bukti penerimaan | **0 kejadian** | Audit silang laporan vs tes |
| K03 | Fokus ruang lingkup | Siklus yang tidak menambah persyaratan/komponen tanpa persetujuan / seluruh siklus | **100%** | Scope awal vs akhir |
| K04 | Penyelesaian satu prioritas | Siklus dengan satu masalah utama, satu solusi minimum, dan satu gate tes yang eksplisit / seluruh siklus yang memerlukan tindakan | **100%** | Rencana tindakan, hasil tes |
| K05 | Cakupan tes sebelum CLOSED | Masalah yang ditutup dengan seluruh acceptance test disepakati lulus / seluruh masalah CLOSED | **100%** | Exit code, bukti regresi, persetujuan jika diperlukan |
| K06 | Kepatuhan keamanan | Perubahan tanpa izin, eskalasi hak akses terlarang, secret bocor, atau gangguan produksi tidak disetujui | **0 kejadian** | Log perubahan + pengecualian |
| K07 | Temuan ulang tidak produktif | Rekomendasi yang mengulang item CLOSED tanpa regresi/bukti baru | **0 kejadian** | Riwayat issue + baseline |
| K08 | Ketepatan tindak lanjut | Perbaikan prioritas yang selesai sesuai tenggat yang disetujui / seluruh perbaikan jatuh tempo | **≥90%** | Tanggal kesepakatan dan penutupan; N/A bila belum ada tenggat |

**Definisi penting:**
- K01 menilai ketertelusuran, bukan mengharuskan semua sumber dapat diakses. Temuan tak terbukti harus diberi label `UNVERIFIED`/`BLOCKED`, bukan `VERIFIED`.
- K04 hanya berlaku jika sebuah siklus memang memilih tindakan; untuk `NO_ACTION_NEEDED`, validasi cakupan yang jujur lebih penting daripada menciptakan tugas.
- K08 tidak boleh diberi nilai 100% jika penyebut nol; tampilkan **N/A**.
- Semua KPI persentase dengan penyebut nol dilaporkan **N/A**, bukan PASS.

## 2. KPI penerapan pertama — observabilitas Hermes Guardian

| ID | KPI | Cara hitung | Target / gerbang penerimaan | Frekuensi |
|---|---|---|---|---|
| G01 | Akses status tanpa eskalasi | Tes baca status sebagai `hermes-ai` tanpa `sudo` dan tanpa membaca secret | **PASS**, exit code 0 | Saat implementasi; setelah perubahan |
| G02 | Kesamaan sumber bukti | Pasangan nilai status ringkas yang cocok dengan checker Guardian asli / semua sampel berpasangan | **10/10** sampel cocok; mismatch dijelaskan sebelum CLOSED | Uji penerimaan |
| G03 | Kesegaran status | Sampel valid berumur < 2 × interval checker / seluruh sampel terjadwal | **≥99% dalam 7 hari**, setelah status tersedia | Harian/mingguan |
| G04 | Keamanan klasifikasi stale | Kasus status terlambat/hilang yang dilaporkan `STALE` atau `UNKNOWN`, bukan `OK` | **100%** kasus uji | Uji penerimaan + regresi |
| G05 | Ketahanan Guardian | Regresi yang memengaruhi timer, heartbeat, notifikasi Telegram, atau status yang sebelumnya benar | **0 regresi terdeteksi**; cek sesuai cakupan yang disepakati | Setelah perubahan |
| G06 | Rahasia dan hak akses | URL heartbeat/token/secret terungkap atau izin berlebihan ditambahkan | **0 kejadian** | Setiap siklus |

**Catatan pengukuran:** G03 dievaluasi *setelah* jalur status terpasang dan diamati selama 7 hari. Sampai itu terjadi nilainya **NOT_STARTED/N/A**, bukan FAIL atau PASS. Jika status belum ada, G01 dan G02 juga belum lulus.

## 3. Dashboard ringkas per siklus

| Bidang | Nilai yang dicatat |
|---|---|
| Proyek / baseline | nama, versi, commit/hash bila relevan |
| Siklus | tanggal mulai/selesai, pemilik keputusan |
| Temuan utama | masalah, prioritas, sumber bukti |
| Status | OPEN / BLOCKED / MONITORING / CLOSED / NO_ACTION_NEEDED |
| Gate | DOCUMENT_ONLY / SOURCE_VERIFIED / DEV_TESTED / PRODUCTION_VERIFIED |
| Perubahan | tidak ada / DEV / produksi disetujui |
| Uji penerimaan | daftar kasus, PASS/FAIL, exit code |
| KPI K01–K08 | angka pembilang/penyebut dan hasil atau N/A |
| KPI G01–G06 | jika proyek Guardian, hasil dan rentang pengamatan |
| Tindakan berikutnya | **maksimal satu**, terukur dan berbatas |

## 4. Gerbang kelulusan akhir

**Kinerja Project Advisor dianggap memadai untuk satu siklus** bila seluruh klaim didukung atau jujur diberi status keterbatasan, rekomendasi bukan pengulangan tanpa alasan, batas keamanan dipatuhi, dan hasil tindakan sesuai penerimaan. **Tidak berarti setiap siklus harus menghasilkan perubahan.**

**Pekerjaan observabilitas Guardian CLOSED** hanya jika G01, G02, G04, G05, G06 lulus dan G03 mencapai target periode observasi; bukti uji dilampirkan, serta persetujuan perubahan produksi tercatat bila relevan.

**Baseline pada 15 Oktober 2026 (belum skor KPI):** Hermes AI mampu menulis review Guardian berbasis bukti yang dapat diakses dan membaca salinan vault service. Akses status Guardian secara utuh dari akun `hermes-ai` belum terbukti; rekomendasi status read-only belum diimplementasikan/diterima. Integrasi delegasi OpenClaw dari Hermes terhalang `NoNewPrivileges=1`; ini **bukan prasyarat** untuk evaluasi dokumen Guardian yang sudah berjalan.

## 5. Aturan pencegah KPI semu

- Jangan menaikkan status `DOCUMENT_ONLY` menjadi `PRODUCTION_VERIFIED` hanya karena laporan bagus.
- Jangan menghitung temuan sama berulang pada review berikutnya sebagai temuan baru.
- Jangan memberi skor 100% pada KPI yang belum diamati atau penyebutnya nol.
- Jangan menunda penutupan dengan kontrak/acceptance criteria baru yang belum disetujui.
- KPI dinilai dari **kualitas bukti, perbaikan teruji, keamanan, dan penyelesaian**, bukan jumlah artefak yang dibuat.
