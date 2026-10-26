# Runtime Integration Inventory — Latest

Generated: 2026-08-31T11:00:40.192Z

> Presence-only report. No secret values, tokens, customer data, or private payloads are written here.

| Integration binding | Status | Purpose |
|---|---|---|
| Content OS Worker: OPENCLAW_INGRESS_TOKEN | **PRESENT** | Identity verifier used through Service Binding |
| Monetization Worker: MONETIZATION_INGEST_TOKEN | **PRESENT** | Internal API/readiness credential |
| Monetization Worker: LYNK_WEBHOOK_SECRET | **PRESENT** | Real Lynk callback protection |
| Monetization Worker: DEEPSEEK_API_KEY | **PRESENT** | Revenue Learning |
| GitHub: OPENCLAW_BASE_URL | **ABSENT** | Needed only for automation-driven external caller probes |
| GitHub: OPENCLAW_WEBHOOK_SECRET | **ABSENT** | Optional external OpenClaw webhook contract |
| GitHub: TELEGRAM_BOT_TOKEN | **ABSENT** | Must be consumed by OpenClaw, never Monetization Worker |
| GitHub: TELEGRAM_WEBHOOK_SECRET | **ABSENT** | Must be consumed by OpenClaw, never Monetization Worker |
| GitHub: HERMES_API_KEY | **ABSENT** | Real Hermes invocation |
| GitHub: HERMES_BASE_URL | **ABSENT** | Real Hermes invocation endpoint |
| GitHub: N8N_WEBHOOK_SECRET | **ABSENT** | Existing automation compatibility only |
| Automation enabled flag | **ABSENT** | Presence only; value is not disclosed |

## Release-gate interpretation

- External runtime configuration still has 4 missing prerequisite(s): GitHub: OPENCLAW_BASE_URL, GitHub: TELEGRAM_BOT_TOKEN, GitHub: HERMES_API_KEY, GitHub: HERMES_BASE_URL.
- PRESENT proves configuration presence only; it does not prove a successful external invocation.
- Telegram remains OpenClaw-only. Direct Telegram webhook on Monetization Worker stays disabled.
- Hermes and Telegram are GREEN only after authenticated runtime evidence is recorded through the external acceptance contract.
