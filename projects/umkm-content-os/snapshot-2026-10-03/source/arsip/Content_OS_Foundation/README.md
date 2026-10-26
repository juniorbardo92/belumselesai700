# UMKM Content OS

Command center privat untuk riset, produksi, rendering, distribusi, dan evaluasi konten UMKM Naik Kelas.

## Status

Fase 1 — fondasi aktif:

- Dashboard: https://umkm-content-os.ruang-belajar-mandiri01.workers.dev
- Cloudflare Worker API sudah dideploy
- Enam tabel aplikasi dan satu brand awal tersimpan di Cloudflare D1
- Binding Cloudflare R2 sudah lulus uji baca/tulis
- Validasi otomatis melalui GitHub Actions

Integrasi DeepSeek, GitHub renderer, Repliz, Hermes, Cron, dan multi-brand ditambahkan setelah fondasi lolos pengujian end-to-end.

## Resource terisolasi

- Worker: `umkm-content-os`
- D1: `umkm-content-os-db`
- R2: `umkm-content-media`

Resource Panglima, affiliate, OTP, peserta, dan webhook tidak digunakan oleh proyek ini.

## Pengembangan lokal

```bash
npm install
npm run types
npm run check
npm run dev
```

Konfigurasi `wrangler.jsonc` sudah menggunakan UUID D1 produksi. Credential berikutnya disimpan sebagai Cloudflare Secrets atau GitHub Secrets dan tidak pernah dimasukkan ke repository.
