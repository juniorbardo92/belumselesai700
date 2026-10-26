---
name: research
description: "Start or check a read-only UMKM topic research run in Content OS, enriched by current Revenue Learning guidance."
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["UMKM_OPENCLAW_TOKEN"]}}}
---

# Research

Use for `/research <topik>` or for checking an asynchronous research job.

## Start research

1. Read the topic from the user request. The topic must contain 8–300 characters. Do not invent a topic when it is missing.
2. Use `threads` by default. Use `instagram` only when the user explicitly requests Instagram. Do not use X or TikTok for this research bridge.
3. Determine the current OpenClaw channel from session metadata. Use `telegram` only for a Telegram-originated request; otherwise use `agent`.
4. Run one of these commands:

```bash
node {baseDir}/../common/umkm-monetization.mjs research --interface <agent|telegram> --platform threads --lookback 7 --topic "<topik>"
```

```bash
node {baseDir}/../common/umkm-monetization.mjs research --interface <agent|telegram> --platform instagram --lookback 7 --topic "<topik>"
```

Optional keywords may be added as repeated `--keyword "<keyword>"` arguments. Do not exceed 12 supplied keywords.

5. The backend automatically enriches the request with current Revenue Learning guidance when available.
6. A successful synchronous result has `research.run.status=ready`.
7. When Repliz exceeds the synchronous limit, the backend returns HTTP 202 with `research.status=waiting_provider`, a `research.jobId`, and a `research.pollPath`. This is an accepted asynchronous result, not a failed command.
8. For a queued result, report the job ID and provider status. Do not claim that research data is ready yet.

## Check queued research

When the user supplies a job ID beginning with `research-job-`, run:

```bash
node {baseDir}/../common/umkm-monetization.mjs research-status --interface <agent|telegram> --job-id "<research-job-id>"
```

Interpret status as follows:

- `queued`, `processing`, or `waiting_provider`: still pending; report the current attempt and do not fabricate results.
- `ready`: report the Content OS run ID and summarize only the returned research data.
- `failed`: report that bounded retries were exhausted and include the sanitized provider error.

The asynchronous queue uses bounded retries. Do not create an unbounded manual retry loop.

## Safety

- The bridge is read-only and cannot generate content, approve, render, publish, or create Repliz drafts.
- Never print `UMKM_OPENCLAW_TOKEN`, raw provider credentials, customer data, or unrelated queue payloads.
- Revenue Learning enrichment and research-provider availability are separate facts; do not treat a provider timeout as a Revenue Learning failure.
