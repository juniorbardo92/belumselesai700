# Real OpenClaw Runtime Acceptance Runner

Runner: `scripts/openclaw-runtime-acceptance.mjs`

Runner ini harus dijalankan dari environment OpenClaw nyata atau job yang benar-benar merupakan bagian dari runtime OpenClaw. Jangan menjalankannya dari CI hanya untuk membuat gate tampak hijau.

## Secret runtime

```text
OPENCLAW_INGRESS_TOKEN=<existing Content OS OpenClaw token>
```

Jangan memakai `MONETIZATION_INGEST_TOKEN` dan jangan mencetak token ke log.

## 1. Runtime gate

```bash
OPENCLAW_RUN_ID='real-openclaw-run-001' \
CORRELATION_ID='openclaw-runtime-001' \
node scripts/openclaw-runtime-acceptance.mjs runtime
```

Runner akan membaca acceptance contract, revenue command, Revenue Learning context, lalu merekam evidence `runtime`.

## 2. Telegram gate

Jalankan hanya sesudah OpenClaw benar-benar berhasil mengirim reply ke Telegram:

```bash
OPENCLAW_RUN_ID='real-openclaw-run-telegram-001' \
CORRELATION_ID='telegram-revenue-001' \
TELEGRAM_COMMAND='/revenue' \
TELEGRAM_TRANSPORT_RUN_ID='telegram-delivery-001' \
node scripts/openclaw-runtime-acceptance.mjs telegram
```

`TELEGRAM_TRANSPORT_RUN_ID` adalah ID delivery/transport milik OpenClaw atau Telegram integration. Jangan memakai chat ID, username, atau nama pengguna.

## 3. Hermes gate

Simpan research brief dan hasil Hermes sebagai file sementara di runtime OpenClaw, lalu:

```bash
OPENCLAW_RUN_ID='real-openclaw-run-hermes-001' \
CORRELATION_ID='hermes-feedback-001' \
HERMES_RUN_ID='real-hermes-run-001' \
HERMES_RESEARCH_BRIEF_FILE='/secure/tmp/research-brief.json' \
HERMES_RESULT_FILE='/secure/tmp/hermes-result.json' \
node scripts/openclaw-runtime-acceptance.mjs hermes
```

Runner hanya mengirim SHA-256 kedua artefak, bukan isi prompt atau hasil research.

Alternatif inline tersedia melalui `HERMES_RESEARCH_BRIEF` dan `HERMES_RESULT`, tetapi file sementara lebih aman untuk isi yang panjang.

## Output aman

Output runner hanya memuat:

- stage;
- correlation ID;
- external run ID;
- contract version;
- command type;
- jumlah insight;
- evidence recorded/duplicate.

Token, prompt, Telegram user identity, customer identity, dan raw webhook payload tidak dicetak.

## Idempotency

Mengulangi stage dengan `correlationId` yang sama menghasilkan `duplicate:true` dan tidak menambah evidence ganda.

## Expected completion

Operator kemudian membaca status menggunakan internal credential:

```text
GET /api/monetization/external-acceptance/status
```

Final external-runtime completion:

```json
{
  "gates": {
    "runtime": true,
    "telegram": true,
    "hermes": true
  },
  "allExternalRuntimeGreen": true
}
```
