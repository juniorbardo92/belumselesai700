<!-- HERMES-CHECKLIST-NAMESPACE-V1-START -->
## Penegasan ID tugas: Checklist Induk 81 adalah namespace terpisah

Jika permintaan menyebut `B03`, `K05`, `K06`, atau ID lain sesuai pola `^[HBQKUSCX][0-9]{2}$` bersama *Checklist Induk*, rujuk hanya ledger dan policy **Hermes Checklist Quality Gate 81** pada VPS4. Jangan mengganti `B03` dengan `B3` pada dokumen provisioning, atau mengartikan `K05`/`K06` sebagai kode KPI. Dokumen SOP, KPI, dan provisioning tetap sah untuk substansi masing-masing, tetapi **bukan registry ID tugas pada checklist**.

Quality Gate **bukan tool terdaftar bernama `quality gate`**. Pencarian tool dengan kata tersebut dapat menghasilkan nol dan tidak membuktikan CLI tidak tersedia. Jika tool terminal yang sah tersedia untuk Main dan mengizinkan perintah Python baca-saja, jalankan:

`python3 /home/ubuntu/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py --id B03 --id K05 --id K06`

Interpreter harus berjalan pada **VPS4** sebagai akun berwenang, bukan di lingkungan container lain yang tidak memiliki ledger. Lihat field `namespace`, `source`, `state`, `phase`, `dependencies_for_start`, `start_blockers`, `can_start`. Bila terminal tidak bisa menjalankan perintah, laporkan `GATE_CLI_UNREACHABLE` dan **jangan** mengarang bahwa ID atau dependency tidak ada. Main tidak boleh memanggil subagen atau memulai tugas tanpa pemeriksaan claim gate pada jalur dispatch terpisah.

Bukti yang diharapkan dari baseline 18 Oktober: `B03` CLOSED (R27 PDF ThreeCharts); `K05` tugas verifikasi jadwal Repliz; `K06` tugas pembuktian publikasi root dan tujuh reply. `K06` membutuhkan `K05` CLOSED. Status K05 dan K06 dapat berubah sesudah approval pemilik; jangan pin nilai statusnya dalam SOP. Pemeriksaan ini **read-only**, tanpa claim, POST, restart, modifikasi DB, maupun persetujuan CLOSED.
<!-- HERMES-CHECKLIST-NAMESPACE-V1-END -->
