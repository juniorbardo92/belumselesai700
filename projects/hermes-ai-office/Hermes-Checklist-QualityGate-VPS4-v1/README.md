# Hermes Checklist Quality Gate v1 — 81 tugas

**Scope:** perangkat lunak pendamping read-only terhadap aplikasi yang ada, berjalan di VPS4. Pakai checklist `18-10-2026 16.40 WIB`. Tidak mengubah konfigurasi OpenClaw / Guardian atau VPS2 dan tidak melakukan deploy BaZi/publikasi.

## Apa yang dilakukan

- Impor **81 ID tetap**; menolak duplikasi/marker tidak cocok; 31 CLOSED/CLOSED_DEV historis tetap ditutup.
- `claim`: periksa status/dependensi sebelum orkestrator Hermes memberi tugas ke agen.
- `inbox/*.json`: saat agen menulis receipt dengan rename atomik, `systemd.path` membangunkan verifikator; bukti SHA256 dan angka hasil tes diperiksa. Hasil **`STRUCTURAL_PASS_OWNER_PENDING` bukan CLOSED**.
- `approve`: hanya lewat terminal interaktif dan review manusia; memeriksa dependensi *saat penutupan*, sehingga bukti untuk tugas paralel tetap boleh diuji dahulu.
- Audit hash-chain events, status dan blocking. Tidak pernah menutup item secara otomatis, tidak pernah menjalankan perintah produksi. Tugas `CLOSED_DEV` tetap berbeda dari `CLOSED` produksi.
- Policy dependensi awal dikonservatifkan: K05→K06, B10→B09, C03→C04 dan U03→U04 **sebelum dispatch dan saat close** (fail-closed; lebih banyak relasi membutuhkan persetujuan). Dependency lain harus ditentukan bersama pemilik dari SOP yang jelas. Checklist historis CLOSED tidak ditulis ulang.

## Pemasangan terjaga — VPS4 saja

Salin ZIP dan `.sha256` ke `/home/ubuntu` pada VPS4, kemudian sebagai `ubuntu` (BUKAN sudo):

```bash
cd /home/ubuntu
sha256sum -c Hermes-Checklist-QualityGate-VPS4-v1.zip.sha256
unzip -oq Hermes-Checklist-QualityGate-VPS4-v1.zip
cd hermes-quality-gate-v1
python3 -m unittest discover -s tests -v
python3 installer.py --preflight
python3 installer.py --apply
python3 installer.py --verify
systemctl --user status hermes-checklist-gate.path --no-pager
```

Tunggu `INSTALL_PASS_PATH_ACTIVE`, `AUDIT_PASS` dan `task_count=81`. Jika DBus pengguna tidak tersedia, status `INSTALLED_NOT_ACTIVATED` bukan PASS. Jangan mengganti konfigurasi OpenClaw untuk memaksakan keberhasilan.

## Integrasi Hermes (wajib, belum terpasang oleh installer)

Atur orkestrator Main/reviewer agar setiap dispatch tugas menggunakan `claim` sebelum menjalankan aktivitas. Agen tidak boleh melewati gate untuk tugas yang dikontrol.

```bash
GATE="$HOME/.local/share/hermes-quality-gate-v1/gate.py"
python3 "$GATE" next
python3 "$GATE" claim --task K05 --actor reviewer
```

`claim` menghasilkan token sekali pakai. Simpan token pada berkas privat 0600; **jangan tempel token dalam chat/log umum**. Agen membuat receipt sesuai `examples/receipt-schema.json` menggunakan token dari claim. File artefak bukti (misalnya TAP atau laporan verifikasi) harus sudah ada, bertanggal relevan, dan hash-nya benar. `run_id` harus unik, isinya tanpa credential/data klien. Jangan menaruh rahasia di artefak yang akan diserahkan.

Tulis dulu ke berkas sementara **di direktori inbox yang sama**, lalu rename atomik menjadi ekstensi `.json`, contoh:

```bash
mkdir -p "$HOME/.local/state/hermes-quality-gate/inbox"
# Tulis receipt dari proses Hermes ke file berizin 0600; jangan echo token di history shell.
# mv "$HOME/.local/state/hermes-quality-gate/inbox/receipt.tmp" \
#    "$HOME/.local/state/hermes-quality-gate/inbox/receipt-K05-UNIQUE.json"
```

Saat verifikator menerima receipt, status menjadi `STRUCTURAL_PASS_OWNER_PENDING` atau `BLOCKED`. Bukti harus mencakup hasil pengujian nyata, SHA256 artefak aktual, dan pemeriksaan manusia bahwa ruang lingkup/hasil benar. Pemeriksaan otomatis hanya memastikan struktur, angka, dan hash yang diklaim: tidak bisa membuktikan posting platform, kesesuaian sumber buku, atau kebenaran isi tes.

Bila hasil dianggap sah, pemilik menjalankan secara interaktif:

```bash
python3 "$GATE" status
python3 "$GATE" approve --task K05 --decision CLOSED --reviewer owner --reason "Bukti GET dan jadwal tervalidasi"
# Ketik: CLOSED K05
python3 "$GATE" audit
```

**Jangan** set CLOSED tugas terkait produksi hanya dengan receipt DEV. Untuk platform Repliz/Kalyanamitra, butuh bukti provider/public nyata; tidak ada POST otomatis. Untuk BaZi, butuh bukti deployment/UAT yang sah.

## Penanganan kendala

- `BLOCKED_CLOSE_DEPENDENCIES`: tidak boleh menutup tugas lanjutan. Contoh K06 membutuhkan K05 CLOSED.
- `TASK_NOT_ACTIVE`: menolak eksekusi checklist CLOSED/HOLD/STOPPED.
- `BLOCKED_TEST`: tes gagal, status induk tidak dinaikkan.
- `REJECTED`: receipt rusak masuk `rejected/`; perbaiki satu masalah dan submit ulang dari claim baru bila perlu.
- `TOOL_NOT_AVAILABLE` pada P2-03 adalah penghalang nyata; jangan tandai PASS.
- `AUDIT_WARN` atau chain rusak: jangan lanjutkan; cek integritas state.

Lihat status read-only: `python3 "$GATE" status`, `python3 "$GATE" audit`, `python3 "$GATE" next`.

## Rollback yang aman

```bash
cd /home/ubuntu/hermes-quality-gate-v1
python3 installer.py --rollback
```

Hanya path watcher yang dinonaktifkan; ledger dan source tetap disimpan. Jangan menghapus audit/backup kecuali sesuai proses pemeliharaan dengan persetujuan pemilik.

## Batas kendali

Paket ini **belum mengintersep semua perintah Hermes**. Agar benar-benar mencegah lompatan, delegasi Main dan eksekutor agen harus diwajibkan memanggil gate sebelum pekerjaan. Pengintegrasian itu memerlukan inspeksi konfigurasi VPS4 secara read-only dan persetujuan perubahan yang relevan; tidak aman ditebak dan tidak disertakan dalam instalasi terjaga ini. Pemeriksaan ChatGPT tiap jam yang sudah dibuat tetap merupakan lapis audit eksternal dan tidak menggantikan event gate VPS4.
