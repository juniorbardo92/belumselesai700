# PowerShell Repliz Kalyanamitra + Hermes IG UMKM

Paket koreksi untuk dua pekerjaan yang berbeda:

1. **450 utas Kalyanamitra:** unggah manual ke akun Threads Ruang Kalyanamitra.
2. **800 utas UMKM Naik Kelas:** setelah utas UMKM terbit dan engagement memenuhi aturan H+1, render tujuh slide Instagram melalui Hermes. Aset disimpan lokal. Tidak ada publikasi IG dalam paket ini.

Ekstrak seluruh ZIP ke satu folder permanen. Jalankan perintah di Windows PowerShell 5.1, bukan terminal WSL.

## A. Unggah manual 450 utas Kalyanamitra

Di folder hasil ekstraksi:

```powershell
Set-Location 'C:\PATH\KE\Corrected_Kalyanamitra450_UMKM800'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Import-Kalyanamitra450-Repliz.ps1 -Mode DryRun
```

Dry-run membaca schedule Repliz, memeriksa akun Threads `6a8d2c7862caae1e0405397a`, menghitung duplikat dan slot, lalu membuat pratinjau CSV. Setelah hasilnya sesuai:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Import-Kalyanamitra450-Repliz.ps1 -Mode Upload
```

Jurnal `Ruang_Kalyanamitra_450_upload_state.json` disimpan di samping skrip. Proses ulang memakai jurnal dan pembacaan remote untuk melewati utas yang sudah diterima.

## B. Pemantau UMKM 800 dan Hermes

Sumber yang dipakai adalah **versi final 800 utas / 7.200 post** dari ZIP rewrite 13 Oktober–31 Desember 2026. File JSON 6.400 post sebelumnya tidak digunakan.

Pra-syarat:

- 800 utas UMKM telah benar-benar masuk ke Repliz dan terbit pada akun Threads `6a8e2fc362caae1e04063419` (`@umkmnaikkelas.id`).
- Meta Threads access token milik akun tersebut memiliki izin `threads_manage_insights`.
- Hermes tersedia di WSL dan `hermes chat -q 'Jawab hanya: OK'` berhasil.
- Komputer Windows menyala dan akun pengguna masuk saat Scheduled Task berjalan.

Bank final UMKM mencatat bahwa pemetaan Repliz, URL untuk 160 media, dan refresh H-1 belum selesai. **Pemantau ini tidak mengimpor bank UMKM.** Ia baru bekerja untuk utas yang sudah terbit dan cocok dengan isi bank final.

Pasang pemantau dengan perintah berikut dari folder utama:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\UMKM_IG_Hermes\Monitor-UMKM800-ThreadsToHermes.ps1 -Install
```

Saat instalasi, masukkan kredensial Repliz dan token Meta untuk UMKM. Kredensial disimpan dengan enkripsi pengguna Windows di `%LOCALAPPDATA%\UMKM800Hermes\credentials.xml`. Skrip memverifikasi akun Repliz dan username Meta sebelum membuat task `UMKM 800 H+1 Threads ke Hermes`, yang berjalan setiap jam.

Satu siklus manual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\UMKM_IG_Hermes\Monitor-UMKM800-ThreadsToHermes.ps1
```

## Aturan engagement

- Status Repliz harus `success` dan `postId` harus ada.
- Pembuka dan seluruh balasan remote harus sama dengan bank final UMKM.
- Usia H+1 dihitung **24 jam sejak skrip pertama kali mengamati status success**. Ini konservatif ketika waktu publikasi aktual tidak dikembalikan oleh Repliz.
- Interaksi = likes + replies + reposts + quotes + shares; ER = interaksi / views.
- Minimal 10 interaksi dan ER ≥ nilai tertinggi antara 2% atau 1,5× median 30 hari; alternatifnya ER ≥ persentil ke-90 bila tersedia minimal 10 sampel.
- Maksimal satu utas dipilih per tanggal WIB. Jika metrik tidak tersedia, skrip tidak menebak nilai.

Rujukan kontrak metrik: [Threads Insights](https://developers.facebook.com/docs/threads/insights/) dan [referensi Insights](https://developers.facebook.com/docs/threads/reference/insights/).

## Hasil render

Hermes menerima isi 8–10 post dari utas UMKM terpilih dan diminta membuat **tujuh slide** PNG/JPEG 1080×1350, satu CTA akhir, identitas `umkmnaikkelas.id`, serta manifest. Validasi skrip memeriksa jumlah, nama, dan dimensi file. Hasil ada di:

```text
UMKM_IG_Hermes\instagram_rendered\<thread_id>\
```

State dan metrik berada di `UMKM_IG_Hermes\UMKM_800_IG_Hermes_state.json`. Status render `started` tidak dijalankan ulang otomatis. Status `failed` dapat dicoba ulang setelah penyebab diperiksa dan aset parsial dipindahkan ke folder audit:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\UMKM_IG_Hermes\Monitor-UMKM800-ThreadsToHermes.ps1 -RetryFailed
```

Paket ini tidak melakukan POST Instagram/Repliz dari pemantau dan tidak mengubah task Kalyanamitra yang sudah terpasang.

Untuk menghentikan pemantau UMKM ini saja:

```powershell
Unregister-ScheduledTask -TaskName 'UMKM 800 H+1 Threads ke Hermes' -Confirm:$false
```

## Pemeriksaan integritas

Di Windows PowerShell:

```powershell
Get-FileHash .\UMKM_IG_Hermes\UMKM_Repliz_Manual_800_Utas_7200_Post.json -Algorithm SHA256
```

Nilai yang diharapkan tercatat dalam `SHA256SUMS.txt`. Skrip PowerShell belum dapat dijalankan secara live dari lingkungan pembuatan paket; lakukan dry-run uploader pada komputer Windows sebelum memilih Upload.
