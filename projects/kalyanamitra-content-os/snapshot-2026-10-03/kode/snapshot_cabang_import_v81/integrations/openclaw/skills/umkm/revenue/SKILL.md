---
name: revenue
description: "Show gross revenue, net revenue, contribution profit, and transaction count from UMKM Monetization Engine."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Revenue

Use for `/revenue` or a request for the current revenue summary.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only when the request originated from Telegram; otherwise use `agent`. Never guess Telegram origin.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs revenue --interface <agent|telegram> --days 30
```

3. Parse the returned JSON and reply in Indonesian with Gross, Net, Contribution Profit, Transactions, and the 30-day period.
4. Keep the reply read-only. Do not publish, create offers, or modify revenue.
5. Never print or mention `UMKM_OPENCLAW_TOKEN`.
