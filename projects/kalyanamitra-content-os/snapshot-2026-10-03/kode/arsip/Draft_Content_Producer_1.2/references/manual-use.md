# Manual use in DeepSeek Chat or GPT

## Preferred setup

Upload the complete ZIP when the chat service can read archives or folders. If files must be uploaded individually, provide only the common files and the files for the requested mode.

| Mode | Files |
|---|---|
| Common | `SKILL.md` |
| `IDEA_INBOX` | `references/idea-source-policy.md`, `references/idea-inbox.schema.json`, `assets/idea-inbox.template.json`, `scripts/validate_idea_inbox.py` |
| `RISET_VIRAL` | `references/viral-research-policy.md`, `references/viral-research.schema.json`, `assets/viral-research.template.json`, `scripts/validate_viral_research.py` |
| `PRODUKSI_DRAFT` | `references/dharma-policy.md`, `references/voice-profile.md`, `references/threads-writing-guide.md`, `references/source-providers.json`, `references/content-pack.schema.json`, `assets/content-pack.template.json`, `scripts/validate_content_pack.py` |

For production based on prior research, also upload the valid `*.idea-inbox.json` and/or `*.viral-research.json` files. Do not paste API keys, bot tokens, account credentials, raw private conversations, or identifiable audience data.

## Paste-ready Idea Inbox request

```text
Use mode IDEA_INBOX from the attached Kalyanamitra Draft Content Producer.

Turn the ideas I provide into one valid kalyanamitra-idea-inbox.v1 JSON file.
- Summarize; do not copy full articles or private conversations.
- Anonymize private audience input.
- Treat every item as inspiration-only, not factual or doctrinal evidence.
- Deduplicate overlapping ideas.
- Do not browse unless I explicitly request research.
- Return one complete JSON file only and validate it before delivery.
```

## Paste-ready viral research request

```text
Use mode RISET_VIRAL from the attached Kalyanamitra Draft Content Producer.

Research current Threads content opportunities for Ruang Kalyanamitra:
- Region: Indonesia.
- Research period: [YYYY-MM-DD] through [YYYY-MM-DD].
- Audience: Indonesian Buddhist young adults.
- Use current, directly observed sources when web research is available.
- Separate observed signals from editorial inference.
- Reject exploitative, sectarian, speculative, or high-risk trend bridges.
- Never claim a topic will definitely go viral.
- Return one complete kalyanamitra-viral-research.v1 JSON file only and validate it before delivery.

If live web access is unavailable, do not simulate research. Use only my supplied links, exports, screenshots, or notes and set research_mode=user-supplied-only.
```

## Paste-ready production request

```text
Use the attached Kalyanamitra Draft Content Producer skill and its references.

Create a manual content package for Ruang Kalyanamitra:
- Platform: Threads.
- Start date: [YYYY-MM-DD].
- Duration: 30 days.
- Volume: 5 threads per day.
- Length: 6–8 posts per thread.
- Language: Indonesian.
- Timezone: Asia/Jakarta.
- Traditions: Theravada, Mahayana, and Vajrayana must remain clearly labeled.
- Voice: apply `references/voice-profile.md` as a Ruang Kalyanamitra editorial adaptation; do not impersonate, attribute authorship, or invent first-person experiences.
- Inputs: use attached valid Idea Inbox and Viral Research Pack files when present. Use only active ideas and non-expired `use-now` trend candidates. These files are inspiration inputs, never doctrinal evidence.
- Mix: default to no more than one trend-responsive thread among five daily threads; fill missing trend slots with evergreen content.
- Status: draft only; never publish or schedule.

First plan the full month privately to prevent repetition. Then generate complete JSON parts following kalyanamitra-content-pack.v1. When time-sensitive candidates are used, generate only parts whose publication dates are covered by their expiry and refresh viral research before later parts. If you cannot safely complete all requested files within the current output capacity, produce only the next complete valid part and state which parts remain. Never output partial or truncated JSON.
```

## Local validation commands

```text
python scripts/validate_idea_inbox.py PATH_TO_IDEA_INBOX_JSON
python scripts/validate_viral_research.py PATH_TO_VIRAL_RESEARCH_JSON
python scripts/validate_content_pack.py PATH_TO_CONTENT_PACK_JSON
```

## Continuing a multipart package

Use this request after a part is complete:

```text
Continue package [PACKAGE_ID] with part [N] of [TOTAL]. Preserve the existing date range, topic matrix, external-ID convention, source rules, and safety constants. Do not repeat prior topics or regenerate completed external IDs. Return one complete valid JSON file only.
```

Provide the previously completed part files when possible so the model can check duplication. If they are unavailable, do not claim the duplicate check is complete; add `cross-part-duplicate-check-pending` to `package_risk_flags`.

## Optional preview request

```text
Create a human-readable Markdown preview derived only from these validated content-pack JSON files. Preserve dates, slots, traditions, sources, warnings, and post order. Do not add or rewrite content. The JSON remains the canonical import source.
```

Convert that preview to PDF only when the chat service supports reliable file generation. Do not import the PDF into Content OS.

## What to upload later

- Content OS or the private bot receives only `*.content-pack.json` files.
- Never upload `*.idea-inbox.json` or `*.viral-research.json` to the importer.
- A PDF or Markdown preview is for review only.
- Keep all part files until the importer confirms the complete package ID and every external ID.
