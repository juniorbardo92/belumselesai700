# BelumSelesai700

Ekspor source proyek di luar BaZi/MetaSuite, disiapkan 24 Oktober 2026. Repository ini menjadi tempat melanjutkan pengembangan dari source yang tersedia.

| Proyek | Source yang tersedia |
| --- | --- |
| [UMKM Content OS](projects/umkm-content-os/) | Snapshot Worker main 23 September dalam ekspor 3 Oktober; rekonsiliasi R2.1 19 Oktober. |
| [Kalyanamitra Content OS / KAL-AUTO](projects/kalyanamitra-content-os/) | Ekspor 3 Oktober; B3E/B10 19 Oktober; KAL-AUTO 20–21 Oktober dan pemeriksaan batch 337. |
| [UMKM Monetization Engine](projects/monetization-engine/) | Paket dokumentasi 2 Oktober; source Worker GA4 production v13 di dalam paket. |
| [Portal Affiliate Panglima UMKM](projects/affiliate-portal/) | Ekspor 3 Oktober; Worker 24 Agustus dan frontend sampai 21 September. |
| [Panglima Affiliate Admin](projects/affiliate-admin/) | Source builder dan UI Phase 2J SAFE dari ekspor 3 Oktober. |
| [Lead Capture / Diagnosis 10 Medan / Waitlist](projects/lead-capture/) | Source SAFE 9 dan baseline frontend dalam ekspor 3 Oktober. |
| [Panglima UMKM](projects/panglima-umkm/) | Aset teks APK v1.3.15; snapshot source main/cabang dan arsip produksi 22 September. |
| [Website UMKM Naik Kelas](projects/website-umkm/) | Source website staging ImageSafe 13 Oktober. |
| [Hermes AI Office / Project Advisor / Quality Gate](projects/hermes-ai-office/) | Paket Quality Gate, perbaikan namespace, read-only bridge, Project Advisor, dan konsolidasi tahap 6. |
| [Hermes SEO](projects/hermes-seo/) | Auditor v2 13 Oktober, optimasi CTR v3 14 Oktober, dan patch generator SEO ImageSafe. |

## Membaca hasil ekspor

- [Laporan ekspor](EXPORT_REPORT.md): cakupan, penyaringan, dan pemeriksaan.
- [Pekerjaan tersisa](BACKLOG.md): kelengkapan source dan pekerjaan tiap proyek.
- [Inventaris berkas](EXPORT_INVENTORY.json): sumber asal, ukuran, dan SHA256.
- Pemeriksaan integritas lokal: `python3 tools/verify_export.py`.

Snapshot dan paket pembaruan dipisahkan menurut asal versinya. Ekspor ini belum menyatukan semua versi, membuktikan ulang operasi produksi, atau melengkapi source yang hanya berada di VPS. README setiap proyek menunjukkan titik mulai dan batas kelengkapannya.

Seluruh mesin BaZi/MetaSuite, Zi Wei, Qi Men, Tong Shu/Ze Ri dikecualikan. Proyek yang sudah dihentikan (NadiToko, Bengkel Rukun, Mulai Plant Based) juga tidak dimasukkan.
