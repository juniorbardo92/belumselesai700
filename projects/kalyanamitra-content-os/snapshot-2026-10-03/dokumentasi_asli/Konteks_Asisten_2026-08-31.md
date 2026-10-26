# Memori Lengkap AI Asisten Kalyanamitra

**Nama proyek:** Ruang Kalyanamitra / Kalyanamitra Content OS  
**Checkpoint:** 31 Agustus 2026  
**Zona waktu operasional:** Asia/Jakarta (WIB)  
**Status:** Sistem prioritas selesai, Worker v67 aktif 100%, publisher tetap draft-only  

Dokumen ini adalah checkpoint konteks operasional proyek AI Asisten Kalyanamitra. Gunakan sebagai sumber awal ketika percakapan berpindah thread, sesi terputus, atau pekerjaan dilanjutkan oleh asisten lain. Dokumen ini tidak menyimpan nilai secret, token, password, atau credential.

---

## 1. Tujuan dan identitas asisten

Asisten Kalyanamitra adalah pendamping belajar Buddha Dharma untuk brand **Ruang Kalyanamitra** (`@ruangkalyanamitra`). Gaya komunikasi yang ditetapkan:

- hangat, jernih, rendah hati, dan tidak menggurui;
- menghormati Theravada, Mahayana, dan Vajrayana;
- membedakan kutipan sumber, penjelasan, dan interpretasi;
- menandai ketidakpastian dan tidak mengarang rujukan;
- untuk praktik Vajrayana yang memerlukan transmisi, empowerment, atau bimbingan khusus, mengarahkan pengguna kepada guru/garis transmisi yang sah;
- tidak menerbitkan konten secara otomatis.

Identitas teknis lokal:

- Agent ID: `kalyanamitra`
- Emoji agent: `🌿`
- Workspace Windows: `C:\Users\wguna\.openclaw\workspace-kalyanamitra`
- Agent directory: `C:\Users\wguna\.openclaw\agents\kalyanamitra\agent`
- Telegram memakai binding/account terpisah: `accountId=kalyanamitra`
- Sesi Kalyanamitra harus terisolasi dari bot dan data UMKM Naik Kelas.

---

## 2. Pagar keamanan yang tidak boleh diubah

Ini adalah aturan tetap proyek:

1. `namespace` wajib `ruang-kalyanamitra`.
2. `automaticPublish` wajib `false`.
3. `publisherMode` wajib `draft-only`.
4. Risk flag `do-not-publish` wajib dipertahankan pada canary dan konten uji.
5. Repliz hanya boleh menerima **draft** setelah render, QA, dan persetujuan manusia lulus.
6. Human publish adalah tindakan terpisah dan tidak pernah diasumsikan dari izin approve atau submit draft.
7. Jangan membuat submission Repliz ganda untuk content item yang sama.
8. Jangan memakai akun sosial UMKM Naik Kelas untuk konten Ruang Kalyanamitra.
9. Jangan mengubah draft, brand, akun, ledger, Worker, atau workflow lain ketika memperbaiki satu target.
10. Ledger lokal bersifat append-only dan fail-closed; jangan menghapus atau menulis ulang histori lama.
11. Tidak ada tool publish, reply, engagement, exec, write, atau edit bebas pada allowlist agent Kalyanamitra.
12. Jika field tidak dikembalikan oleh tool, tulis “tidak dikembalikan”; jangan menebak.

Alur konten terjaga:

`brief → verifikasi sumber → draft → review Dharma → desain/render → pemeriksaan visual → QA → persetujuan manusia → Repliz draft → human publish terpisah`

---

## 3. Sumber ajaran dan kebijakan verifikasi

Hirarki sumber yang disepakati:

- SuttaCentral, 84000, dan BDK America untuk sumber kanonik/terjemahan utama;
- Lotsawa House untuk materi terjemahan yang relevan;
- situs resmi guru dan garis transmisi, antara lain Tergar, Samye Mandala, dan Kagyu Office;
- sumber sekunder hanya untuk orientasi dan harus disilang dengan sumber primer/otoritatif.

Aturan konten:

- sumber harus disertakan sebelum produksi;
- status sumber harus `verified` sebelum render final;
- kutipan dan interpretasi tidak boleh dicampur;
- konteks tradisi harus dinyatakan;
- konten dengan sumber belum pasti tidak boleh diloloskan oleh QA.

---

## 4. Arsitektur sistem

Komponen utama:

- Telegram agent `kalyanamitra`;
- bridge `kalyanamitra-content-os` (runtime terakhir dilaporkan v1.0.3; entri ledger lama dapat membawa `bridgeVersion: 1.0.0`);
- ledger lokal NDJSON;
- Cloudflare Worker `umkm-content-os`;
- Cloudflare D1 sebagai database operasional;
- R2 `MEDIA` untuk aset;
- GitHub Actions untuk render carousel;
- Repliz sebagai publisher draft-only;
- Browser Rendering binding untuk kebutuhan renderer;
- telemetry Cloudflare untuk monitoring produksi.

Ledger lokal:

- Path: `C:\Users\wguna\.openclaw\plugin-state\kalyanamitra-content-os\ledger.ndjson`
- Backup: `C:\Users\wguna\.openclaw\backups`
- Format top-level terverifikasi: `schemaVersion`, `contentItemId`, `displayId`, `title`, `metadata`, `recordedAt`
- Metadata penting: namespace, tenant, brand, agentId, contentDomain, tradition, humanApprovalRequired, automaticPublish, publisherMode, workflowPolicy, bridgeId, bridgeVersion, sources, sourceReview, riskFlags.

Prinsip bridge:

- local ledger menjadi bukti namespace/sumber yang dipercaya;
- bridge harus fail-closed jika identitas atau namespace tidak dapat dibuktikan;
- payload renderer harus membawa identitas namespace RK, bukan hanya logo asset.

---

## 5. Brand, logo, dan akun sosial

Brand Ruang Kalyanamitra:

- Brand ID D1: `brand-ruang-kalyanamitra`
- Handle: `@ruangkalyanamitra`
- Logo resmi: emblem lingkaran biru tua–emas dengan lotus
- Nama file sumber: `Logo Ruang Kalyanamitra dengan simbol lotus.png`
- Logo asset ID aktif: `28f44266-dbac-4691-a0ab-04deb94448f5`
- Posisi render: kanan atas
- Ukuran: medium
- Format hasil: WebP

Akun Repliz yang benar:

| Platform | Account ID | Nama/username |
|---|---|---|
| Instagram | `6a8d2c6762caae1e04053962` | Ruang Kalyanamitra / `ruangkalyanamitra` |
| Threads | `6a8d2c7862caae1e0405397a` | Ruang Kalyanamitra / `ruangkalyanamitra` |

Akun yang tidak boleh dipakai untuk konten RK:

| Platform | Account ID | Identitas |
|---|---|---|
| Instagram | `6a8e2fac62caae1e04063415` | UMKM Naik Kelas |
| Threads | `6a8e2fc362caae1e04063419` | UMKM Naik Kelas |

Saat memilih akun, cocokkan platform **dan** account ID. Nama akun saja tidak cukup untuk pembuktian unik.

---

## 6. Infrastruktur produksi terakhir

Repository:

- GitHub: `varashoil108-design/umkm-content-os`
- PR final: `#5`
- PR URL: `https://github.com/varashoil108-design/umkm-content-os/pull/5`
- Commit produksi: `21a9a04233e2bcf0af9c336c66a660fa1eaeb21c`
- CI run sukses: `33346188489`
- Artifact ID: `9742062526`
- Artifact SHA-256: `49affc019d3a0f54a9fa5a118c1c732d34ac966e8e983b3d2ee56568f9cd7076`
- PR digabung ke branch konvergensi `codex/content-os-all-green-20260830`; branch `main` tidak diubah pada operasi tersebut.

Cloudflare:

- Account ID: `4e9350b4532477f1fb91ee27c5b40b49`
- Worker: `umkm-content-os`
- D1 database ID: `d46ea23b-2e7d-489b-af1d-9c26a234c853`
- Worker version number: `67`
- Worker version ID: `af68e054-4e3c-4adb-8764-b3c2afee211c`
- Production deployment ID: `a097e509-b8e1-41b3-9a9c-49c002369bb0`
- Traffic produksi: v67 = `100%`
- Compatibility date: `2026-08-26`
- Compatibility flag: `nodejs_compat`
- Startup time validasi: 7 ms
- ETag upload v67: `d0acbb520f0bcb968488b087521e8321f0962690697197f47318c5023aa8e10c`

Versi rollback historis yang masih dapat dirujuk:

- v65 version ID: `709f35e0-1ae2-473b-a930-aab99656c09f`
- v66 version ID: `477ad484-8b1e-4336-a6cc-0dbb8c354b2c`
- v65/v66 tidak menerima trafik setelah promosi final v67.

Binding v67 yang diwarisi dan diverifikasi (nama saja, tanpa nilai secret):

1. `CONTENT_AI_ENABLED`
2. `CONTENT_OS_AUTOMATION_ENABLED`
3. `DB`
4. `DEEPSEEK_API_KEY`
5. `GITHUB_ACTIONS_TOKEN`
6. `MEDIA`
7. `N8N_WEBHOOK_SECRET`
8. `OPENCLAW_INGRESS_TOKEN`
9. `OPENCLAW_REGISTRY_TOKEN_SHA256`
10. `REPLIZ_ACCESS_KEY`
11. `REPLIZ_SECRET_KEY`
12. `TAVILY_API_KEY`
13. `THREADS_BROWSER`

---

## 7. Strategi deployment v67 yang sudah dilalui

v67 tidak langsung dipasang 100%. Promosi dilakukan bertahap:

1. Upload v67 dengan 13-binding parity dan commit annotation yang tepat.
2. Canary 1%: v65 99%, v67 1%.
   - Deployment: `c8ab6248-05ba-44d5-b20b-d1f1f62f5a99`
   - Telemetry membuktikan v67 menerima trafik nyata.
   - Level hanya `info`.
   - `$metadata.error` tidak memiliki nilai non-kosong.
3. Canary 5%: v65 95%, v67 5%.
   - Deployment: `c89f927b-914d-4a97-992c-6f0841ca3925`
   - Gate runtime kembali lulus.
4. Promosi 100% v67.
   - Deployment: `a097e509-b8e1-41b3-9a9c-49c002369bb0`
   - Telemetry setelah promosi hanya melihat version ID v67.
   - Level hanya `info`; error non-kosong nol.

Jangan mengganti deployment produksi tanpa:

- CI sukses;
- artifact/commit cocok;
- binding parity terbukti;
- canary menerima trafik nyata;
- error gate bersih;
- audit D1 tidak menunjukkan publish atau submission salah akun.

---

## 8. CANARY-01 — konten utama yang sudah selesai

Identitas:

- Content item ID: `e8c29476-06c8-4919-8dd9-3027ebe74257`
- Display ID: `RK-CANARY-20260830-01`
- Judul: **Canary Ruang Kalyanamitra — Berhenti Sejenak Sebelum Bereaksi**
- Versi final: `2`
- Status D1 terakhir: `approved`
- Platform utama: Instagram
- Brand ID: `brand-ruang-kalyanamitra`
- Namespace: `ruang-kalyanamitra`
- Publisher mode: `draft-only`
- Automatic publish: `false`
- Risk flag `do-not-publish`: aktif

Sumber ledger terverifikasi:

1. Dhammapada 183–185 — Thanissaro Bhikkhu, Access to Insight.
2. Anapanasati Sutta MN 118 — Bhikkhu Sujato, SuttaCentral.

Riwayat penting:

- Canary awal diregistrasikan ke ledger append-only dengan UUID di atas.
- Render v1 berhasil teknis tetapi ditolak secara visual karena tulisan **UMKM NAIK KELAS** masih muncul pada seluruh 10 gambar.
- Akar masalah: renderer memilih identitas brand dari `body_json.riskFlags`, sedangkan flag namespace RK saat itu hanya ada di ledger.
- Perbaikan target menambahkan `kalyanamitra-control:namespace=ruang-kalyanamitra` ke draft CANARY-01 dan menaikkan versi `1 → 2`.
- Isi slide, sumber, warna, dan draft lain tidak diubah.

Render v1 yang ditolak:

- Render job: `19c8e6b8-9bc3-4bb7-afb2-862b64b35b27`
- GitHub run: `33316441466`
- Hasil teknis: 5 Instagram + 5 TikTok
- Status keputusan: jangan digunakan; QA otomatis v1 dianggap false positive.

Render v2 yang lulus:

- Render job: `b7f91e99-b85e-4d33-a671-dc8a1fa68c69`
- GitHub run: `33342885913`
- Artifact preview ID: `9741099666`
- Artifact digest: `sha256:a2136806e976b384eb8f1ad20183c2275ea043667579d534233de859747071c5`
- Aset: 5 Instagram + 5 TikTok
- Pemeriksaan langsung: seluruh 10 gambar diperiksa.
- Hasil visual: label **RUANG KALYANAMITRA**, logo RK konsisten, tidak ada teks/logo UMKM, urutan 01–05 benar, tidak ada clipping atau overlap.

QA dan approval v2:

- QA log ID: `95`
- Approval log ID: `96`
- QA visual v2 lulus.
- Status `approved` sah untuk tahap publisher draft-only.

Repliz CANARY-01:

- Publisher job ID: `d02ec7e5-e5f0-4976-8a81-9cceda3ea9c8`
- Account ID: `6a8d2c6762caae1e04053962` (Instagram Ruang Kalyanamitra)
- Platform: Instagram
- `isDraft: true`
- `replizScheduleId: null`
- Submission aktif tepat satu kali.
- Tidak pernah dipublikasikan.

Catatan non-blocking CANARY-01:

- Body mentah D1 terakhir masih menampilkan 1 sumber dan `sourceReview.status=needs-review`.
- Bridge/ledger yang dipakai workflow mengembalikan 2 sumber dan status `verified`.
- Jangan mengubah data mentah ini tanpa patch tersendiri, preflight, dan bukti bahwa perubahan tidak merusak state approved/draft Repliz.

---

## 9. CANARY-02 — koreksi isolasi brand selesai

Identitas:

- Content item ID: `8417231c-785f-4051-848a-afe4d3f5fe8e`
- Display ID: `RK-CANARY-20260830-02`
- Judul: **Tiga Inti Latihan Dharma — Canary Ledger v1.0.2**
- Versi D1 terakhir: `5`
- Status terakhir: `draft`
- Brand ID: `brand-ruang-kalyanamitra`
- Namespace: `ruang-kalyanamitra`
- Publisher mode: `draft-only`
- Automatic publish: `false`
- Sumber: 2, `verified`
- Risk flag `do-not-publish`: aktif

Riwayat koreksi:

- Brand lama yang salah: `brand-umkm-naik-kelas`.
- Brand dikoreksi hanya pada target menjadi `brand-ruang-kalyanamitra`.
- Versi dinaikkan `4 → 5`.
- Status dikembalikan/dipertahankan sebagai `draft` setelah approval dicabut.
- Activity log koreksi:
  - ID `99`: `content.brand_identity_corrected`
  - ID `100`: `publisher.draft_quarantined`

Draft Instagram RK historis:

- Publisher job ID: `3efe0346-de78-4655-a29b-2b70041adee5`
- Account ID: `6a8d2c6762caae1e04053962`
- Platform: Instagram
- `isDraft: true`
- Tidak dipublikasikan.

Insiden draft Threads salah akun:

- Publisher job ID: `41e76c35-187b-460d-8e6a-a54375d4bdfb`
- Akun salah: `6a8e2fc362caae1e04063419` (Threads UMKM Naik Kelas)
- Akun RK yang benar: `6a8d2c7862caae1e0405397a`
- Activity log submission ID `79` diubah dari `success` menjadi `voided`.
- Metadata karantina: `quarantined=true`, alasan `cross-brand-account`.
- Active wrong-account Threads count: `0`.
- Provider cancellation tidak dilakukan karena `replizScheduleId=null`; tidak ada ID schedule spesifik yang dapat dihapus di provider.
- Jangan mengirim ulang ke Repliz tanpa approval baru dan verifikasi account ID.

---

## 10. Audit produksi terakhir

Audit final setelah v67 menerima 100% trafik:

| Pemeriksaan | Hasil |
|---|---:|
| Worker aktif | v67 100% |
| Version ID aktif | `af68e054-4e3c-4adb-8764-b3c2afee211c` |
| Telemetry level | hanya `info` |
| Error non-kosong | 0 |
| Content item berstatus published | 0 |
| Submission aktif draft | 12 |
| Submission aktif non-draft | 0 |
| CANARY-01 draft Instagram RK | tepat 1 |
| CANARY-02 Threads salah akun aktif | 0 |
| CANARY-02 submission dikarantina | 1 |

Kesimpulan audit:

- tidak ada publish;
- tidak ada submission Repliz ulang selama finalisasi;
- tidak ada draft aktif pada akun Threads UMKM untuk CANARY-02;
- kedua content item memakai brand dan namespace RK;
- automatic publish tetap false.

---

## 11. Otomatisasi pemantauan

Scheduled task aktif:

- Nama: **Pantau Error Worker v67**
- Frekuensi: setiap jam
- Zona waktu: Asia/Jakarta
- Target: Worker `umkm-content-os`, version ID v67 `af68e054-4e3c-4adb-8764-b3c2afee211c`
- Kondisi notifikasi: level `error`, `$metadata.error` non-kosong, exception, atau kegagalan runtime baru
- Jika bersih: tidak mengirim notifikasi
- Mode: read-only
- Larangan: tidak mengubah deployment, D1, Repliz, draft, schedule, atau publish.

---

## 12. Insiden dan pelajaran sistem

### A. Logo benar tidak menjamin identitas brand benar

`logoAssetId` RK sudah benar, tetapi renderer masih menampilkan label UMKM karena pemilihan brand berasal dari `body_json.riskFlags`. Selalu verifikasi teks/identitas pada gambar akhir, bukan hanya metadata logo.

### B. QA otomatis dapat false positive

QA v1 lulus meskipun seluruh 10 gambar masih berlabel UMKM. Untuk RK, QA harus memasukkan pemeriksaan visual aktual dan menggagalkan konten jika menemukan identitas UMKM.

### C. Nama akun tidak cukup untuk memilih publisher

Daftar akun memuat Instagram dan Threads dari dua brand. Pemilihan harus memakai kombinasi platform, username, brand, dan account ID. Jangan mengandalkan nama tampilan.

### D. Output verifikasi dapat false negative karena field historis kosong

Verifikasi submission CANARY-01 pernah menghasilkan `accountIdCorrect=false`, `brandIdCorrect=false`, dan `automaticPublishFalse=false` walaupun draft yang tersimpan benar. Penyebabnya adalah pemeriksaan membaca field/metadata historis yang tidak tersedia atau berbeda bentuk. Audit D1 membuktikan account ID benar, isDraft true, brand konten RK, dan automatic publish false.

### E. Provider cancellation memerlukan schedule ID

Draft salah akun tidak dapat dibatalkan lewat endpoint provider tanpa `replizScheduleId`. Tindakan aman yang sudah dilakukan adalah void + quarantine internal dan memastikan count aktif menjadi nol.

### F. Cloudflare Access bukan bukti Worker gagal

Preview URL pernah tertahan Cloudflare Access/human verification. Runtime divalidasi melalui connector telemetry produksi, bukan dengan memaksa melewati Access.

---

## 13. Prioritas yang sengaja ditunda

Poin berikut bukan blocker untuk sistem berjalan:

1. Menyelaraskan body mentah D1 CANARY-01 dari 1 sumber/`needs-review` menjadi 2 sumber/`verified`.
2. Membuat sinkronisasi permanen agar namespace ledger otomatis masuk ke payload renderer.
3. Menambah QA visual sistemik yang mendeteksi label **UMKM NAIK KELAS** pada konten RK.
4. Menambah mekanisme provider reconciliation ketika submission tidak mengembalikan `replizScheduleId`.
5. Mengaktifkan grup Telegram, n8n Kalyanamitra, atau publikasi otomatis—ketiganya belum termasuk scope finalisasi ini; publikasi otomatis tetap dilarang.
6. Verifikasi ulang status skill `kalyanamitra-dharma` sebelum menyatakan skill itu aktif.

Kerjakan satu per satu hanya dengan scope target yang jelas. Jangan mengubah komponen yang sudah stabil.

---

## 14. Runbook ketika pekerjaan dilanjutkan

Sebelum perubahan apa pun:

1. Baca dokumen ini.
2. Pastikan target content item dan account ID tidak tertukar.
3. Lakukan pemeriksaan read-only deployment v67 dan telemetry satu jam terakhir.
4. Audit D1: published count harus 0, non-draft submission aktif harus 0.
5. Pastikan `automaticPublish=false`, `publisherMode=draft-only`, dan `do-not-publish` tetap aktif.
6. Periksa apakah submission target sudah ada; hentikan jika berpotensi duplikasi.
7. Untuk perubahan renderer, gunakan CI → upload version → 1% → 5% → 100%, dengan telemetry gate pada tiap tahap.
8. Untuk perubahan konten, gunakan GET/checkpoint → render → pemeriksaan visual aktual → QA → persetujuan manusia.
9. Repliz hanya draft. Human publish harus memiliki izin baru dan eksplisit.

Jika terjadi error:

- jangan retry buta;
- jangan membuat render atau submission kedua;
- catat job ID/run ID yang sama;
- pisahkan masalah metadata, renderer, provider, dan observability;
- rollback hanya ke version ID yang sudah diketahui sehat setelah membuktikan deployment aktif dan target rollback secara read-only.

---

## 15. Referensi ID cepat

| Objek | ID |
|---|---|
| CANARY-01 content | `e8c29476-06c8-4919-8dd9-3027ebe74257` |
| CANARY-02 content | `8417231c-785f-4051-848a-afe4d3f5fe8e` |
| Logo RK | `28f44266-dbac-4691-a0ab-04deb94448f5` |
| RK Instagram | `6a8d2c6762caae1e04053962` |
| RK Threads | `6a8d2c7862caae1e0405397a` |
| UMKM Instagram | `6a8e2fac62caae1e04063415` |
| UMKM Threads | `6a8e2fc362caae1e04063419` |
| CANARY-01 render v2 | `b7f91e99-b85e-4d33-a671-dc8a1fa68c69` |
| CANARY-01 GitHub run v2 | `33342885913` |
| CANARY-01 Repliz draft job | `d02ec7e5-e5f0-4976-8a81-9cceda3ea9c8` |
| CANARY-02 RK Instagram draft job | `3efe0346-de78-4655-a29b-2b70041adee5` |
| CANARY-02 wrong Threads job | `41e76c35-187b-460d-8e6a-a54375d4bdfb` |
| D1 database | `d46ea23b-2e7d-489b-af1d-9c26a234c853` |
| Worker v67 | `af68e054-4e3c-4adb-8764-b3c2afee211c` |
| Production deployment | `a097e509-b8e1-41b3-9a9c-49c002369bb0` |
| Git commit produksi | `21a9a04233e2bcf0af9c336c66a660fa1eaeb21c` |

---

## 16. Definisi “selesai” proyek pada checkpoint ini

Proyek dianggap selesai untuk tahap penerapan awal karena:

- v67 aktif 100% dan menerima trafik nyata tanpa error runtime terdeteksi;
- CI dan artifact sudah tervalidasi;
- namespace serta brand RK terisolasi;
- CANARY-01 sudah render visual benar, QA, approved, dan dikirim tepat satu kali sebagai draft Instagram RK;
- CANARY-02 sudah dikoreksi ke brand RK dan draft Threads salah akun tidak lagi aktif;
- seluruh submission aktif yang tercatat adalah draft;
- jumlah published tetap nol;
- monitoring error v67 berjalan setiap jam.

Sistem boleh digunakan dengan pola yang sama, tetapi setiap konten baru tetap harus melewati sumber → render → visual QA → approval manusia → Repliz draft. Jangan menganggap checkpoint selesai sebagai izin publikasi otomatis.

---

**Akhir checkpoint.**
