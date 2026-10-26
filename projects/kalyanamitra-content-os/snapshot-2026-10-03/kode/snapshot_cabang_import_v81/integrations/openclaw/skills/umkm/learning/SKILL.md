---
name: learning
description: "Show active DeepSeek Revenue Learning insights and recommendations for the next research and content cycle."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Learning

Use for `/learning` or a request for Revenue Learning insight.

1. Determine the current OpenClaw channel from session metadata. Use `telegram` only for a Telegram-originated request; otherwise use `agent`.
2. Run:

```bash
node {baseDir}/../common/umkm-monetization.mjs learning --interface <agent|telegram>
```

3. Parse the returned JSON and reply in Indonesian with up to five active insights. Include scope, confidence, evidence summary, and recommended action when present.
4. Summarize research guidance and content guidance separately. Explain when evidence is limited or confidence is low.
5. Treat the output as decision support, not an automatic instruction to publish or change mappings.
6. Never print `UMKM_OPENCLAW_TOKEN`, raw customer data, or full internal metadata.
