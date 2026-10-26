# UMKM Naik Kelas — 800 utas Threads, impor PowerShell, render IG Hermes

Paket ini hanya untuk **UMKM Naik Kelas**. Akun Threads Repliz: `6a8e2fc362caae1e04063419`; akun IG Repliz: `6a8e2fac62caae1e04063415`. Tidak ada konten atau skrip unggah Kalyanamitra.

Sumber editorial final: 800 utas, 7.200 post (13 Oktober–31 Desember 2026), 160 visual PNG. Konten, urutan, waktu, dan visual dari sumber tidak diubah.

## Satu pintu masuk PowerShell

Gunakan `UMKM-ContentOS.ps1` di folder paket. Jika launcher disimpan di Downloads dan paket diekstrak ke folder `Downloads\UMKM800_Manual`, launcher menemukannya otomatis. Pilihan tindakan:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\UMKM-ContentOS.ps1' -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\UMKM-ContentOS.ps1' -Action Media -RenewCloudflareToken
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\UMKM-ContentOS.ps1' -Action Preview -StartDate '2026-10-13'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\UMKM-ContentOS.ps1' -Action Import -StartDate '2026-10-13'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\UMKM-ContentOS.ps1' -Action InstallIG
```

`Status` hanya membaca file lokal. `Media` mengunggah PNG dan mengisi peta URL sesudah diverifikasi; `-RenewCloudflareToken` hanya perlu ketika mengganti token lama yang ditolak REST, lalu token tersimpan terenkripsi. `Preview` membaca jadwal Repliz tanpa POST. `Import` mengirim utas pada tanggal/bentang `-StartDate` sampai `-EndDate` yang disebutkan; jalankan setelah URL lengkap, audit H-1, dan preview sesuai. `InstallIG` melewati task UMKM jika sudah terpasang. `RunIG` menjalankan satu siklus pemantauan/render, tanpa publikasi IG. Kredensial Repliz UMKM yang sudah tersimpan dari pilot dipakai ulang oleh importer dan pemantau IG; token Meta diminta hanya saat pemasangan pertama jika belum tersimpan. Tidak ada kredensial yang dicetak.

Jika folder paket berbeda, tambahkan `-PackageFolder 'C:\path\folder-UMKM'` dengan path lengkap. Launcher memeriksa keberadaan payload dan ketiga komponen sebelum menjalankan aksi. Untuk memperbarui instalasi lama, ekstrak `UMKM_ContentOS_PowerShell_Update.zip` ke folder paket yang sudah ada; arsip itu berisi tiga skrip saja dan tidak menyentuh payload, visual, peta URL, jurnal, atau aset render.

## Ekstrak dan jalankan

Ekstrak ZIP **seluruhnya** ke folder permanen di Windows. Buka PowerShell di folder hasil ekstraksi yang memuat `Import-UMKM800-Repliz.ps1`. Periksa lokasinya:

```powershell
Get-Location
Test-Path -LiteralPath '.\Import-UMKM800-Repliz.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Import-UMKM800-Repliz.ps1' -Mode Validate
```

`Test-Path` harus menghasilkan `True`. `Validate` hanya memeriksa file lokal; tidak meminta kredensial, mengirim jadwal, atau mengakses Repliz. Opsi `-PayloadPath`, `-MediaMapPath`, `-JournalPath`, `-StartDate`, dan `-EndDate` tersedia untuk batch tanggal.

**Blokir saat ini:** sumber final memberi `media_url=null` untuk 160 pembuka visual. `Upload-UMKM800-Media.ps1` menyiapkan URL itu melalui bucket Cloudflare R2 `umkm-content-media` yang sudah dipakai sebelumnya. Jalankan dari folder ini:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Upload-UMKM800-Media.ps1' -Mode CheckAuth
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Upload-UMKM800-Media.ps1' -Mode Upload
```

`CheckAuth` memeriksa status token dan akses baca daftar objek pada bucket tanpa PUT. Jika token pemantau lama ditolak (`Authentication error`), gunakan Cloudflare API Token baru dengan izin **Workers R2 Storage Bucket Item Write** untuk bucket ini:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Upload-UMKM800-Media.ps1' -Mode CheckAuth -RenewCloudflareToken
```

Hanya tempel token ketika diminta oleh PowerShell. Token R2 dengan label **Object Read & Write** khusus S3 tidak didukung Cloudflare REST API: https://developers.cloudflare.com/r2/api/tokens/ . Token baru disimpan terenkripsi pada `%LOCALAPPDATA%\UMKM800Importer\cloudflare.xml` setelah preflight REST berhasil. Token lama milik pemantau tidak diubah.

Perintah `Upload` mengunggah 160 PNG ke namespace baru `umkm/threads-800/visuals/`, memeriksa hash SHA256 dari gambar yang dapat diakses publik, lalu mengisi `UMKM_160_Media_URLs.json` satu per satu. Jika URL yang telah dipetakan berisi objek berbeda, skrip berhenti tanpa menimpanya. Ia tidak menggunakan kredensial R2 SigV4 yang sebelumnya bermasalah. **Tidak ada Repliz POST atau publikasi Threads/IG dalam langkah media.** Jika ingin uji satu gambar, tambahkan `-Limit 1`, lalu jalankan lagi tanpa `-Limit` untuk melanjutkan.

Periksa juga konteks dan sumber pada H-1 sesuai audit sumber. Sampai URL media dan pemeriksaan editorial yang relevan selesai, 800 utas **belum siap diunggah**.

Sesudah URL untuk batch tanggal yang dipilih terisi dan sumber diperiksa, jalankan pratinjau read-only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Import-UMKM800-Repliz.ps1' -Mode DryRun -StartDate '2026-10-13' -EndDate '2026-10-13'
```

`DryRun` memakai kredensial Repliz UMKM yang tersimpan dari pilot sebelumnya bila ada, atau dari pemantau UMKM; jika keduanya tidak ada, ia meminta kunci dan menyimpannya terenkripsi untuk akun Windows ini. Ia memeriksa identitas akun, seluruh jadwal remote, konten dan balasan yang sudah ada, serta benturan slot. Hasilnya `UMKM_800_Preview.csv`. Jika ada konten/slot berbeda, proses berhenti tanpa POST.

Setelah meninjau pratinjau, unggah batch itu sendiri:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Import-UMKM800-Repliz.ps1' -Mode Upload -StartDate '2026-10-13' -EndDate '2026-10-13'
```

`Upload` menjadwalkan utas Threads (`isDraft=false`) pada waktu asli payload, memeriksa hasil remote, dan menyimpan jurnal agar proses ulang melewati yang sudah ada. Tidak ada hapus/edit jadwal. Jika respons POST tidak pasti, skrip membaca remote sekali untuk rekonsiliasi dan berhenti jika hasilnya tidak dapat dipastikan. Jangan menjalankan dua instance bersamaan. Mode ini **belum diuji live pada Windows atau Repliz**; uji satu batch lewat `DryRun` dan tinjau hasilnya sebelum menggunakan `Upload`.

## IG UMKM lewat Hermes

`Monitor-UMKM800-ThreadsToHermes.ps1` memantau hanya utas UMKM yang telah terbit, menilai engagement H+1, lalu meminta Hermes merender 7 slide IG untuk konten terpilih. Skrip ini tidak menerbitkan IG. Setelah prasyarat pada README paket sebelumnya terpenuhi:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\Monitor-UMKM800-ThreadsToHermes.ps1' -Install
```

Pemantau sudah mengarah ke payload UMKM di folder yang sama. Instalasi task membutuhkan Windows, token Meta Threads `@umkmnaikkelas.id`, dan Hermes di WSL. Task berjalan saat pengguna masuk dan komputer menyala.

Catatan: kendala `SignatureDoesNotMatch` SigV4 R2 pada pilot sebelumnya belum terbukti selesai. Langkah media memakai token Cloudflare API yang berbeda dan endpoint REST yang didokumentasikan. Integrasi ini belum diuji live pada Windows dalam lingkungan pembuatan paket; jika API menolak permintaan, skrip berhenti tanpa mengirim jadwal Repliz. Semua jadwal dan publikasi masih menunggu langkah manual Anda.
