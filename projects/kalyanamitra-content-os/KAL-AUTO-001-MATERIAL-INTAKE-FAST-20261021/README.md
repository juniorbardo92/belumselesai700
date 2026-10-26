# KAL-AUTO-001 — Material Intake FAST V1

Perubahan minimum untuk bot Kalyanamitra pada **VPS4 saja**. Tidak mengubah OpenClaw gateway, agent binding, config global, Repliz, publisher VPS2 atau SSH. OpenClaw sudah menerima pesan Telegram, skill ini mengajarkan agen menyimpan materi, mengolah lampiran yang disediakan gateway, dan memberikan receipt.

## Install

```bash
cd ~/kalauto_intake_fast_v1
python3 -B -m unittest discover -s tests -v
bash install_vps4.sh
```

Expected `KAL_MATERIAL_INTAKE_INSTALLED`. Tidak butuh root, restart Gateway, atau token bot baru. Installer akan menolak menimpa file berbeda.

## Uji Telegram

Kirim ke @AsistenKalyanamitraBot: `KAL-MATERI-001. Simpan teks ini sebagai bahan Dharma, buat ringkasan dua kalimat, jangan posting: Latihan mettā dimulai dengan niat tidak menyakiti.`

Balasan yang diharapkan: menerima materi, menyebut ID KALMAT hanya jika penyimpanan berhasil, ringkasan pendek, tidak mengklaim posting.

Di VPS4:

```bash
python3 -B ~/.openclaw/workspace-kalyanamitra/tools/kalauto_material_intake.py status
ls -ld ~/.openclaw/workspace-kalyanamitra/inbox/KALMAT-*
```

Uji kemudian dengan satu PDF atau satu foto yang tidak sensitif. Jika path lampiran tidak tersedia/berkas tidak terunduh, agen harus jujur bahwa lampiran tidak tersimpan. Gateway sendiri mempunyai dukungan attachment; kemampuan model membaca PDF/foto perlu diuji dengan pesan sebenarnya.

## Rollback

```bash
bash ~/kalauto_intake_fast_v1/rollback_vps4.sh
```

Rollback sengaja tidak menghapus inbox agar bahan pemilik tidak hilang.

## Batas kemampuan

Tidak memasang publish worker, signer, jadwal Repliz, retry, atau autoresponder terpisah. Alur publikasi tetap tertunda; tidak ada receipt palsu.
