---
name: offers
description: "Show top monetization offers ranked by contribution profit from UMKM Monetization Engine."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Offers

Use for `/offers` or a request for the best-performing offers.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only for Telegram origin; otherwise use `agent`.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs offers --interface <agent|telegram> --days 30
```

3. Parse the returned JSON and reply in Indonesian with up to five offers, ordered as returned, including contribution profit and available transaction/revenue metrics.
4. Say clearly when no attributed offer data is available; do not infer or create mappings.
5. Keep the reply read-only and never print `UMKM_OPENCLAW_TOKEN`.
