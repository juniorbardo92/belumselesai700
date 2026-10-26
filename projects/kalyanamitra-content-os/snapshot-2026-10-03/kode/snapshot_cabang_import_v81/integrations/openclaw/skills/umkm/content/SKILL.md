---
name: content
description: "Show top monetized content ranked by contribution profit from UMKM Monetization Engine."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Content

Use for `/content` or a request for the best-performing monetized content.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only for a Telegram-originated request; otherwise use `agent`.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs content --interface <agent|telegram> --days 30
```

3. Parse the returned JSON and reply in Indonesian with up to five content items, ordered as returned, including platform, contribution profit, and available transaction/revenue metrics.
4. Say clearly when no attributed content data is available. Do not infer attribution or create mappings.
5. Keep the reply read-only and never print `UMKM_OPENCLAW_TOKEN`.
