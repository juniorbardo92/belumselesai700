---
name: profit
description: "Show contribution profit from UMKM Monetization Engine for the last 30 days."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Profit

Use for `/profit` or a request for contribution profit.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only for a Telegram-originated request; otherwise use `agent`.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs profit --interface <agent|telegram> --days 30
```

3. Parse the returned JSON and answer in Indonesian. Label the number as Contribution Profit, not accounting net profit.
4. State the 30-day period and any transaction count available.
5. Keep the reply read-only and never print `UMKM_OPENCLAW_TOKEN`.
