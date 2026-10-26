# OpenClaw → Telegram → Hermes Activation — Monetization Engine v1.0

## Tujuan

Dokumen ini mengaktifkan tiga external-runtime gate tanpa mengubah core Content OS:

1. OpenClaw membaca laporan Monetization Engine.
2. Satu bot Telegram menjadi interface read-only melalui OpenClaw.
3. OpenClaw memberi Revenue Learning context ke Hermes dan menerima hasil research.

Tidak ada langkah dalam dokumen ini yang memberi Telegram atau Hermes kemampuan publish.

## Arsitektur final

```text
Telegram user
  → OpenClaw
    → Monetization Engine read-only command/context
    → Hermes research assistant
  → Telegram reply
```

Direct Telegram → Monetization Engine sengaja dinonaktifkan.

## File kontrak

- `integrations/openclaw/monetization-engine.openapi.json`
- `integrations/openclaw/telegram-command-routing.json`
- `integrations/hermes/revenue-research-feedback-contract.json`

Semua file tersebut bebas secret dan aman disimpan di repository.

## 1. OpenClaw tool registration

Daftarkan OpenAPI contract `integrations/openclaw/monetization-engine.openapi.json` sebagai HTTP/OpenAPI tool pada runtime OpenClaw existing.

Gunakan base URL yang sudah tertulis di contract:

```text
https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev
```

Authentication:

```text
Authorization: Bearer <OPENCLAW_INGRESS_TOKEN existing>
```

Credential yang dipakai harus `OPENCLAW_INGRESS_TOKEN`, bukan `MONETIZATION_INGEST_TOKEN`.

Jangan menulis token ke file contract, prompt, log, Telegram message, atau repository. Simpan token pada secret store runtime OpenClaw.

## 2. OpenClaw runtime acceptance

Setelah tool terdaftar, OpenClaw melakukan:

1. GET `getExternalAcceptanceContract`.
2. POST `monetizationCommand` dengan `query=revenue`, `days=30`.
3. GET `getRevenueLearningContext`.
4. POST `submitExternalAcceptanceEvidence`:

```json
{
  "stage": "runtime",
  "correlationId": "openclaw-runtime-<unique-id>",
  "externalRunId": "<real-openclaw-run-id>"
}
```

`correlationId` dan `externalRunId` hanya boleh memakai huruf, angka, titik, garis bawah, titik dua, `@`, slash, atau dash.

Bukti tidak boleh dikirim dari GitHub Actions hanya untuk membuat status hijau. Caller harus merupakan runtime OpenClaw nyata.

## 3. Telegram single-bot routing

Bot Telegram existing dipasang hanya pada OpenClaw. Jangan mengarahkan Telegram webhook ke Monetization Worker.

Routing mengikuti `integrations/openclaw/telegram-command-routing.json`:

| Telegram command | OpenClaw tool |
|---|---|
| `/revenue` | `monetizationCommand(query=revenue)` |
| `/profit` | `monetizationCommand(query=profit)` |
| `/offers` | `monetizationCommand(query=offer)` |
| `/content` | `monetizationCommand(query=content)` |
| `/health` | `monetizationCommand(query=health)` |
| `/learning` | `getRevenueLearningContext()` |

Sesudah OpenClaw berhasil mengirim reply ke Telegram, OpenClaw mengirim acceptance evidence:

```json
{
  "stage": "telegram",
  "correlationId": "telegram-<unique-id>",
  "externalRunId": "<real-openclaw-run-id>",
  "telegramCommand": "/revenue",
  "transportRunId": "<telegram-delivery-or-openclaw-transport-id>",
  "deliveryStatus": "sent"
}
```

Jangan mengirim chat ID, username, nama, nomor telepon, isi percakapan, atau bot token sebagai evidence.

## 4. Hermes Revenue Learning feedback

OpenClaw mengambil `getRevenueLearningContext`, lalu membentuk research brief untuk Hermes.

Input ke Hermes hanya boleh memuat:

- aggregated revenue/profit;
- content/offer/platform performance;
- learning insight;
- research guidance;
- non-PII research brief.

Input tidak boleh memuat customer identity, shipping information, raw webhook payload, token, atau secret.

Sesudah Hermes menghasilkan research result dan OpenClaw menerima hasilnya:

1. Hitung SHA-256 dari research brief.
2. Hitung SHA-256 dari hasil Hermes yang diterima.
3. Kirim acceptance evidence:

```json
{
  "stage": "hermes",
  "correlationId": "hermes-<unique-id>",
  "externalRunId": "<real-openclaw-run-id>",
  "hermesRunId": "<real-hermes-run-id>",
  "researchBriefHash": "<sha256-hex>",
  "resultHash": "<sha256-hex>",
  "resultAccepted": true
}
```

Hash membuktikan kesinambungan artefak tanpa menyimpan isi research atau prompt di integration log.

## 5. Evidence status

Status evidence dibaca oleh operator melalui endpoint internal:

```text
GET /api/monetization/external-acceptance/status
Authorization: Bearer <MONETIZATION_INGEST_TOKEN>
```

Expected structure:

```json
{
  "ok": true,
  "gates": {
    "runtime": true,
    "telegram": true,
    "hermes": true
  },
  "allExternalRuntimeGreen": true
}
```

Endpoint status bukan untuk OpenClaw dan tidak boleh dipanggil dengan `OPENCLAW_INGRESS_TOKEN`.

## 6. Failure handling

### 401 dari OpenClaw endpoints

- Pastikan OpenClaw memakai `OPENCLAW_INGRESS_TOKEN` existing.
- Pastikan header berbentuk `Authorization: Bearer ...`.
- Jangan mengganti dengan `MONETIZATION_INGEST_TOKEN`.
- Jangan menonaktifkan Content OS verifier atau Cloudflare Access.

### 410 dari direct Telegram webhook

Ini expected behavior. Telegram harus diarahkan ke OpenClaw, bukan Monetization Worker.

### 400 acceptance payload

Periksa required field dan identifier. Evidence Hermes membutuhkan SHA-256 hex. Telegram membutuhkan command yang didukung serta `deliveryStatus=sent`.

### 502 acceptance runtime

OpenClaw terautentikasi, tetapi command atau Revenue Learning context tidak dapat dibaca. Periksa Service Binding `CONTENT_OS`, Content OS verifier, dan Monetization Worker health.

## 7. Definition of done

External-runtime gate hanya GREEN setelah:

```text
runtime=true
telegram=true
hermes=true
allExternalRuntimeGreen=true
```

Status ini belum menyelesaikan commercial attribution. Final release tetap membutuhkan valid provider mapping dan satu real attributed content-to-revenue closed loop.
