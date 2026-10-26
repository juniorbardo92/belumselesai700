# Panglima UMKM — APK Pendamping 30 Hari

Aplikasi Android mandiri untuk pembeli Paket Panglima UMKM.

> **Batas SAFE:** proyek ini tidak mengubah, memanggil, atau mengakses portal affiliate, approval, referral, komisi, worker, webhook, maupun sistem produksi lain yang sudah stabil.

## Isi aplikasi

- Profil usaha dan aktivasi demonstrasi yang diberi label secara jelas.
- Diagnosis 10 Medan UMKM berisi 30 pertanyaan.
- Skor merah, kuning, atau hijau untuk setiap medan yang sudah lengkap.
- Peta prioritas bisnis berdasarkan skor terendah.
- Checklist implementasi 30 hari.
- Kalkulator margin produk.
- Kalkulator harga minimum sehat.
- Catatan Cash Flow 7 Hari.
- Checklist 17 Kebocoran Margin.
- KPI mingguan.
- Action Plan 30 / 60 / 90 Hari.
- Halaman jadwal empat sesi Zoom.
- Tombol WhatsApp jika nomor resmi sudah dikonfigurasi.
- Ringkasan progres yang dapat dibagikan.
- Status kelayakan sertifikat; penerbitan tetap diverifikasi pendamping.

Semua data fase ini tersimpan lokal pada perangkat. APK **tidak meminta izin internet**. Website, Zoom, dan WhatsApp—jika dikonfigurasi—dibuka memakai aplikasi resmi/browser eksternal.

## Kode aktivasi demonstrasi

```text
PANGLIMA-DEMO
```

Kode tersebut hanya untuk menguji pengalaman pengguna. Ini **bukan mekanisme verifikasi pembeli yang aman** karena konfigurasi aplikasi dapat diperiksa dari file APK.

Verifikasi pembeli asli sebaiknya ditambahkan pada fase berikutnya melalui layanan aktivasi khusus yang terpisah. Jangan mengubah sistem affiliate yang sudah stabil untuk memenuhi kebutuhan fase ini.

## Cara paling mudah membuat APK melalui GitHub

1. Ekstrak file ZIP proyek.
2. Buat repository GitHub baru khusus untuk aplikasi pembeli, misalnya `panglima-umkm-android`.
3. Unggah **isi folder proyek** ke root repository. Jangan hanya mengunggah file ZIP.
4. Pastikan file berikut ikut terunggah:

   ```text
   .github/workflows/build-apk.yml
   ```

5. Buka tab **Actions** pada repository.
6. Pilih workflow **Build APK Panglima UMKM**.
7. Klik **Run workflow** jika proses belum berjalan otomatis.
8. Tunggu sampai status berubah menjadi hijau.
9. Buka hasil workflow dan unduh artifact **Panglima-UMKM-APK-SAFE**.
10. Ekstrak artifact; file instalasinya bernama:

    ```text
    Panglima-UMKM-v1.0.0-SAFE.apk
    ```

11. Kirim APK ke perangkat Android dan pasang sesuai petunjuk perangkat.

### Jika folder `.github` tidak ikut terunggah

Di repository GitHub, klik **Add file → Create new file**, lalu isi nama:

```text
.github/workflows/build-apk.yml
```

Salin seluruh isi file workflow dari proyek, simpan, lalu ulangi langkah pada tab Actions.

## Cara build dari Android Studio

1. Buka folder proyek dengan Android Studio.
2. Gunakan JDK 17 dan Gradle 8.9.
3. Instal Android SDK Platform 35 jika diminta.
4. Jalankan task Gradle `:app:assembleDebug`.
5. APK hasil build berada di:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Workflow GitHub sudah mengatur Java 17 dan Gradle 8.9 sehingga lebih praktis jika komputer belum memiliki Android Studio.

## Mengisi nomor WhatsApp dan tautan Zoom

Edit file:

```text
app/src/main/assets/config.js
```

Isi nomor WhatsApp resmi tanpa tanda `+`:

```js
whatsappNumber: "6281234567890"
```

Ganti contoh di atas hanya dengan nomor resmi yang benar. Kemudian isi jadwal dan URL Zoom pada `mentoringSessions`:

```js
{
  title: "Sesi 1 · Diagnosis & Peta Prioritas",
  schedule: "Tanggal dan jam sesi resmi",
  url: "https://zoom.us/j/TAUTAN_RESMI"
}
```

Jangan mengisi nomor atau tautan yang belum dikonfirmasi. Tombol memang dinonaktifkan selama nilainya kosong.

## Logo aplikasi

Ikon awal menggunakan lambang huruf **P** berwarna merah marun dan emas. File sumbernya:

```text
app/src/main/res/drawable/ic_panglima.xml
```

Gunakan logo resmi UMKM Naik Kelas sebagai pengganti setelah aset asli tersedia. Tidak ada sampul buku yang diubah atau dimasukkan ulang.

## Pengujian

Jalankan:

```bash
node --test tests/app.test.js
```

Pengujian memeriksa diagnosis, skor prioritas, kalkulator, checklist, penyimpanan lokal, aktivasi demo, tautan eksternal, dan batas keamanan tanpa izin internet.

## Batas fase pertama

Versi ini belum mencakup:

- Validasi pembelian asli.
- Sinkronisasi antarperangkat.
- Server atau akun pembeli produksi.
- Push notification.
- Penerbitan sertifikat otomatis.
- Chat internal.
- Integrasi atau perubahan terhadap sistem affiliate.
- APK release dengan signing key produksi.

APK yang dihasilkan workflow adalah **debug APK** yang dapat dipasang untuk pengujian. Distribusi komersial dan pembaruan jangka panjang memerlukan signing key release yang tetap dan disimpan aman.

## Struktur proyek

```text
Panglima-UMKM-Android/
├── .github/workflows/build-apk.yml
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/
│       │   ├── index.html
│       │   ├── styles.css
│       │   ├── config.js
│       │   └── app.js
│       ├── java/id/umkmnaikkelas/panglima/MainActivity.java
│       └── res/
├── tests/app.test.js
├── build.gradle.kts
├── gradle.properties
└── settings.gradle.kts
```

