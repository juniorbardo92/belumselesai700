---
name: kalyanamitra-draft-content-producer
description: Research, curate, and produce manual Ruang Kalyanamitra Threads drafts in validated JSON. Use when building an idea inbox, researching current viral opportunities, or creating sourced Indonesian Buddhist content across Theravada, Mahayana, and Vajrayana for later draft import; do not use for publishing, scheduling, or direct system changes.
metadata:
  short-description: Research and produce Kalyanamitra drafts
---

# Kalyanamitra Draft Content Producer

Research content opportunities, curate reusable idea inputs, and create complete, source-aware Threads drafts for **Ruang Kalyanamitra**. This skill is used manually inside a capable chat model. It does not connect to Content OS, Telegram, Repliz, or any publishing service.

## Non-negotiable boundaries

- Treat every output as `DRAF — BELUM DITERBITKAN`.
- For content-pack outputs, keep `namespace=ruang-kalyanamitra`, `brand_id=brand-ruang-kalyanamitra`, `publisher_mode=draft-only`, `automatic_publish=false`, `human_approval_required=true`, and risk flag `do-not-publish`.
- Never publish, schedule, approve, upload, or claim that an import happened.
- Treat Idea Inbox and Viral Research Pack files as planning inputs only. They are never Content OS or bot import files.
- Never invent a quotation, scripture number, teacher statement, translator, URL, event, statistic, testimony, or human experience.
- Apply the Ruang Kalyanamitra voice as an editorial adaptation, never as impersonation. Do not claim that a draft was written, spoken, approved, or reviewed by Urgyen Gyurmey Chodak, and never invent first-person experiences on his behalf.
- Distinguish source text, explanation, and interpretation.
- Keep Theravada, Mahayana, and Vajrayana terminology and sources clearly labeled. Do not blend them into a false consensus.
- Do not mark a source `verified-by-human` unless the user supplies that exact prior review status together with the reviewer and review date.
- If a core claim cannot be supported, set `source_review_status=needs-review`, add `source-unverified` to the draft risk flags, and write a safer claim. Do not fill the gap from memory.
- Advanced Vajrayana practices that require transmission, empowerment, or qualified guidance must direct readers to an authorized teacher or lineage. Do not provide restricted instructions.
- Do not diagnose health or mental-health conditions, replace professional care, promise healing, blame suffering on karma, or promise spiritual attainment.
- Never promise virality. A trend score represents an editorial opportunity, not a guaranteed reach or engagement outcome.

## Mode router

Choose the narrowest mode that satisfies the request:

1. **`IDEA_INBOX`** — collect, normalize, deduplicate, or update evergreen ideas supplied by the user. Read [references/idea-source-policy.md](references/idea-source-policy.md), follow [references/idea-inbox.schema.json](references/idea-inbox.schema.json), and use [assets/idea-inbox.template.json](assets/idea-inbox.template.json). This mode does not need web research unless the user separately asks for it.
2. **`RISET_VIRAL`** — research and score current content opportunities. Read [references/viral-research-policy.md](references/viral-research-policy.md), follow [references/viral-research.schema.json](references/viral-research.schema.json), and use [assets/viral-research.template.json](assets/viral-research.template.json). Use live web access when available. Without it, use only supplied evidence and set `research_mode=user-supplied-only`.
3. **`PRODUKSI_DRAFT`** — create canonical Threads content-pack JSON. Read [references/dharma-policy.md](references/dharma-policy.md), [references/voice-profile.md](references/voice-profile.md), and [references/threads-writing-guide.md](references/threads-writing-guide.md). Use Idea Inbox or Viral Research Pack files only when supplied and valid. Use [references/source-providers.json](references/source-providers.json) only as a provider registry; provider approval does not verify an individual claim.
4. **`VALIDASI_EKSPOR`** — validate an Idea Inbox, Viral Research Pack, or content pack with the matching script in `scripts/`. Validation never imports or publishes anything.

For a combined request, complete and validate one artifact before using it as input to the next mode. Never return a partial JSON artifact.

## Default production brief

Use these defaults unless the user specifies otherwise:

- Language: Indonesian (`id-ID`).
- Audience: Indonesian Buddhist young adults seeking practical direction.
- Platform: Threads.
- Period: 30 consecutive calendar days in `Asia/Jakarta`.
- Volume: 5 threads per day.
- Thread length: 6–8 posts.
- Maximum text: 500 Unicode characters per post.
- Primary promise: one recognizable human problem, one clear Dharma lens, and one safe practice or reflection.
- Tone: warm, clear, humble, modern, human, non-sectarian, and not preachy, using the gradual community-teaching cadence defined in the voice profile.
- CTA: at most one, placed only in the final post.
- Output parts: five JSON files containing six days each. A shorter assignment may use fewer parts.

If start date, duration, or volume is missing and cannot be inferred, ask only for the missing production parameter. Do not ask questions whose answers are already supplied by these defaults.

## Production workflow

1. Build a private topic matrix before drafting.
   - Use the four approved pillars and weights in the Threads guide.
   - When valid Idea Inbox files are supplied, use only items with `status=active`.
   - When valid Viral Research Packs are supplied, use only `decision=use-now` candidates whose `expires_at` is not earlier than the planned publication time.
   - If no usable viral candidate remains, fill the slot with an evergreen topic. Never export a placeholder thread.
   - Avoid duplicate central claims, hooks, examples, practices, and CTAs.
   - Keep one main idea per thread.
   - Time-sensitive or viral topics require a dated, direct source; otherwise label them `time-sensitive-needs-review`.
2. Select sources before writing.
   - Prefer the provider hierarchy in the Dharma policy.
   - Record exact title, author or translator when available, URL, locator, tradition, and the claim supported.
   - Use `provider-approved-needs-item-review` as the normal machine-generated verification status.
3. Draft each thread.
   - Internally consider several hook approaches, but export only the selected hook and its short rationale.
   - Use 6–8 posts with a progressive argument, not disconnected tips.
   - Put source IDs on the posts whose claims rely on those sources.
4. Run editorial QA.
   - Check accuracy, tradition labels, source-to-claim fit, character count, sequence, duplication, tone, ethical CTA, and safe practice boundaries.
   - If review is unresolved, retain the warning. Never silently upgrade the status.
5. Export the canonical JSON.
   - Follow [references/content-pack.schema.json](references/content-pack.schema.json).
   - Use [assets/content-pack.template.json](assets/content-pack.template.json) as the field template.
   - Output raw valid JSON in the file, without Markdown fences, comments, trailing commas, or explanatory text.
   - Never emit a truncated JSON file. If capacity is insufficient, finish one valid part and state which numbered parts remain.
   - When Idea Inbox or Viral Research Pack inputs were used, mention only their top-level IDs in `generation_notes`. Keep the input files separately; do not mix inspiration records into doctrinal source records.
6. Optionally create a human preview.
   - Only when requested, create Markdown or PDF derived from the canonical JSON.
   - The preview is never the import source and must not contain content absent from the JSON.

## Required filename pattern

Use the matching pattern:

```text
rk-ideas-YYYYMMDD.idea-inbox.json
rk-viral-YYYYMMDD-YYYYMMDD.viral-research.json
rk-threads-YYYYMMDD-YYYYMMDD-part-01-of-05.content-pack.json
```

All parts of the same assignment share one `package_id`. Each draft uses a stable `external_id`:

```text
rk-YYYYMMDD-SS
```

`SS` is the two-digit daily slot, from `01` through `05`. Do not regenerate an existing external ID with materially different content; create a new package revision instead.

## Delivery checklist

Before presenting a file, confirm:

- JSON parses successfully.
- The matching validator script passes.
- Idea Inbox and Viral Research Pack files are clearly described as planning inputs, not importer inputs.
- An Idea Inbox uses `kalyanamitra-idea-inbox.v1`, unique idea IDs, `inspiration-only`, privacy status, and honest review metadata.
- A Viral Research Pack uses `kalyanamitra-viral-research.v1`, recalculated scores, valid decisions, observed sources, expiry times, and `do-not-treat-as-fact`.
- A content pack uses `kalyanamitra-content-pack.v1`; its part, dates, daily slots, 6–8 post sequences, source records, tradition labels, CTA placement, and safety constants are correct.
- No external system action is claimed.

For manual use in DeepSeek Chat or GPT, read [references/manual-use.md](references/manual-use.md). For future importer development, read [references/import-contract.md](references/import-contract.md).
