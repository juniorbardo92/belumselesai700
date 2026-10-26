---
name: health
description: "Show recent Monetization Engine integration health and operational errors."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Health

Use for `/health` or a request for Monetization Engine integration health.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only for a Telegram-originated request; otherwise use `agent`.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs health --interface <agent|telegram> --days 30
```

3. Parse the returned JSON and reply in Indonesian with the current health summary and up to five recent actionable errors or warnings.
4. Distinguish a real runtime error from an expected fail-closed response or an old test record. Do not expose secrets, tokens, customer data, or raw request payloads.
5. Keep the reply read-only. Do not restart, deploy, retry transactions, or change configuration automatically.
