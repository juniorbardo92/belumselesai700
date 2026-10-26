# OpenClaw Integration — UMKM Monetization Engine

## Tujuan

Package ini menghubungkan satu runtime OpenClaw ke Monetization Engine secara read-only. Telegram tetap dikelola oleh OpenClaw dan tidak pernah diarahkan langsung ke Monetization Worker.

Command yang tersedia:

- `/revenue`
- `/profit`
- `/offers`
- `/content`
- `/health`
- `/learning`
- `/research <topik>`

Semua request menggunakan `OPENCLAW_INGRESS_TOKEN` existing melalui alias environment lokal `UMKM_OPENCLAW_TOKEN`. Jangan membuat token baru, menyalin token ke repository, atau mengirim nilainya melalui chat.

## Isi package

```text
umkm-openclaw-integration-v1.0.0/
├── INSTALL.md
├── SHA256SUMS
├── install-skills.sh
├── manifest.json
├── openclaw.config.fragment.json5
└── skills/umkm/
    ├── common/umkm-monetization.mjs
    ├── revenue/SKILL.md
    ├── profit/SKILL.md
    ├── offers/SKILL.md
    ├── content/SKILL.md
    ├── health/SKILL.md
    ├── learning/SKILL.md
    └── research/SKILL.md
```

`common/umkm-monetization.mjs` adalah deterministic HTTP client. File itu hanya dapat memanggil operasi read-only/reporting dan research trigger yang tidak mempunyai action publish.

## 1. Pilih sumber instalasi

### Opsi A — Bundle release yang sudah diverifikasi

Ekstrak ZIP artifact yang berisi file tar dan checksum, lalu jalankan:

```bash
unzip UMKM_OpenClaw_Integration_v1.0.0.zip
sha256sum -c umkm-openclaw-integration-v1.0.0.tar.gz.sha256
tar -xzf umkm-openclaw-integration-v1.0.0.tar.gz
cd umkm-openclaw-integration-v1.0.0
sha256sum -c SHA256SUMS
bash install-skills.sh
```

Semua pemeriksaan checksum harus menghasilkan `OK`. Hentikan instalasi bila checksum tidak cocok.

### Opsi B — Checkout repository existing

```bash
git fetch origin build/monetization-engine-v1
git checkout build/monetization-engine-v1
bash integrations/openclaw/install-skills.sh
```

Installer bersifat idempotent dan menyalin grouped skills ke:

```text
~/.openclaw/workspace/skills/umkm
```

Workspace alternatif dapat diberikan tanpa mengubah script:

```bash
OPENCLAW_WORKSPACE=/path/to/workspace bash integrations/openclaw/install-skills.sh
```

### Opsi C — Copy manual

Gunakan hanya bila installer shell tidak dapat dijalankan:

```bash
install -d -m 700 "$HOME/.openclaw/workspace/skills/umkm"
cp -a integrations/openclaw/skills/umkm/. "$HOME/.openclaw/workspace/skills/umkm/"
chmod 700 "$HOME/.openclaw/workspace/skills/umkm/common/umkm-monetization.mjs"
find "$HOME/.openclaw/workspace/skills/umkm" -type f -name 'SKILL.md' -exec chmod 600 {} \;
```

Folder `umkm` hanya untuk organisasi. Nama command berasal dari `name` pada frontmatter setiap `SKILL.md`.

## 2. Pasang credential pada environment proses OpenClaw

Set environment variable berikut pada secret/environment mechanism yang menjalankan OpenClaw Gateway:

```text
UMKM_OPENCLAW_TOKEN=<nilai existing OPENCLAW_INGRESS_TOKEN>
```

Optional override, bila endpoint production berubah:

```text
UMKM_MONETIZATION_BASE_URL=https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev
```

Aturan keamanan:

- jangan menaruh nilainya di `SKILL.md`;
- jangan commit `.env`;
- jangan menaruh token di Telegram message;
- jangan mencetak environment variable ke log;
- jangan mengganti token existing dengan `MONETIZATION_INGEST_TOKEN`;
- restart proses OpenClaw setelah environment proses diperbarui.

## 3. Aktifkan native skill commands tanpa mengganti konfigurasi Telegram existing

Merge isi `openclaw.config.fragment.json5` ke konfigurasi existing `~/.openclaw/openclaw.json`.

Fragment yang diperlukan:

```json5
{
  commands: {
    text: true,
    nativeSkills: "auto",
  },
  channels: {
    telegram: {
      commands: {
        nativeSkills: "auto",
      },
    },
  },
}
```

Jangan replace object `channels.telegram` secara keseluruhan. Pertahankan bot token, allowlist, group policy, model, dan pengaturan gateway yang sudah ada.

## 4. Verifikasi skill discovery

Setelah copy, config, dan environment selesai, restart Gateway atau buka sesi baru, lalu jalankan:

```bash
openclaw skills check
openclaw skills list --eligible
openclaw skills info revenue
openclaw skills info research
```

Ketujuh skill harus eligible. Bila `UMKM_OPENCLAW_TOKEN` belum tersedia pada proses Gateway, skill harus masuk kategori missing requirement dan tidak boleh dipaksa berjalan tanpa credential.

## 5. Acceptance melalui OpenClaw

Lakukan dari interface OpenClaw terlebih dahulu:

```text
/revenue
/profit
/offers
/content
/health
/learning
/research Strategi arus kas untuk UMKM
```

Expected behavior:

- semua command reporting bersifat read-only;
- `/research` membuat `topic_research` run di Content OS melalui Service Binding;
- Revenue Learning guidance otomatis memperkaya research bila tersedia;
- tidak ada content generation, approval, render, Repliz draft, atau publish dari skill package ini;
- external runtime evidence dicatat hanya dengan hashed correlation ID dan tanpa PII.

## 6. Acceptance Telegram

Setelah command bekerja di OpenClaw, jalankan command yang sama pada bot Telegram existing:

```text
/revenue
/learning
/research Strategi arus kas untuk UMKM
```

Target final:

```text
Telegram
→ OpenClaw skill
→ Monetization Worker
→ Content OS / D1
→ response kembali melalui OpenClaw
→ Telegram
```

Jangan mengatur Telegram webhook menuju Monetization Worker. Endpoint direct Telegram pada Worker memang mengembalikan HTTP 410.

## 7. Pemeriksaan evidence

Setelah command nyata dijalankan, runtime evidence dapat diperiksa melalui endpoint internal Monetization yang dilindungi `MONETIZATION_INGEST_TOKEN`:

```text
GET /api/monetization/openclaw/evidence
```

Evidence menyimpan jenis operasi, status, interface, dan correlation hash. Nilai run ID, Telegram update ID, chat ID, token, serta PII tidak disimpan mentah.

## 8. Rollback package

Rollback hanya menghapus package skill; tidak menyentuh Worker, D1, Lynk, Queue, atau Content OS:

```bash
rm -rf "$HOME/.openclaw/workspace/skills/umkm"
```

Kemudian restart Gateway atau mulai sesi baru. Jangan menghapus `OPENCLAW_INGRESS_TOKEN` dari Content OS bila integrasi OpenClaw lain masih menggunakannya.

## Status acceptance

Package, checksum, deterministic client, skill metadata, fail-closed behavior, dan server-side contract dapat diuji oleh CI. Gate external OpenClaw/Telegram baru GREEN setelah package benar-benar dipasang pada host OpenClaw dan command nyata menghasilkan response serta runtime evidence.
