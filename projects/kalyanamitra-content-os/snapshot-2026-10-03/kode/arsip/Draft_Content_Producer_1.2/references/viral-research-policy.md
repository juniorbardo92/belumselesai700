# Viral research policy

## Purpose and limits

Viral research identifies timely conversation opportunities for Ruang Kalyanamitra. It does not guarantee virality, replace audience judgment, verify doctrinal claims, or authorize publication.

Every candidate uses `usage=inspiration-only`. A source showing that a topic is active does not prove factual assertions inside the eventual draft.

## Research modes

- `web-researched`: the model directly inspected current sources during this run.
- `user-supplied-only`: the model had no live access and used only links, exports, screenshots, or notes supplied by the user.
- `mixed`: both live inspection and user-supplied evidence were used.

If web access is unavailable, never simulate current research, invent metrics, or reuse remembered trend claims. Use `user-supplied-only` and describe only supplied evidence.

## Signal sources

Prefer several independent signals when practical:

1. native Threads topics, communities, search results, or composer suggestions;
2. the account's own Threads Insights and replies;
3. Google Trends Indonesia or another directly observed trend index;
4. anonymized audience questions and recurring community language;
5. primary reporting, official agencies, official event pages, or current source pages needed to understand the event;
6. creator observations only as secondary evidence of conversation patterns.

Platform behavior, feature availability, and performance benchmarks change. Verify them during the research run. Do not embed historical benchmark numbers as timeless facts.

## Evidence rules

- Record what was actually observed in `observed_signal`.
- Store a metric only when it was visible in the source. Preserve its unit and context in `metric_value`; otherwise use null.
- Never invent a URL, view count, search volume, engagement count, quotation, or publication time.
- A user-supplied screenshot or private Insight may have a null URL, but must use the correct privacy status and a clear signal description.
- Separate observation from inference. `summary` describes the trend; `possible_dharma_bridge` is an editorial hypothesis.
- Do not copy a competitor's hook, story, or wording. Extract the audience problem and create an original angle.

## Opportunity score

Score each positive component from 0 to 5:

- `recency`: how recently the signal was observed;
- `velocity`: evidence that conversation interest is increasing, not merely large;
- `audience_fit`: relevance to Ruang Kalyanamitra's Indonesian audience;
- `dharma_bridge`: how naturally a safe, sourced Dharma lens fits;
- `source_quality`: directness and reliability of the evidence;
- `novelty`: opportunity for an original and useful angle.

Set `risk_penalty` from 0 to 10. Calculate:

```text
viral_opportunity_score = clamp(
  recency + velocity + audience_fit + dharma_bridge + source_quality + novelty - risk_penalty,
  0,
  30
)
```

Decision rules:

- `use-now`: score 20–30 and risk is not high;
- `monitor`: score 14–19 and risk is not high;
- `reject`: score 0–13, or any candidate with `risk_level=high`.

The validator must reject a file when the declared score or decision conflicts with these rules.

## Risk gate

Use `risk_level=high` and `decision=reject` when the angle depends on:

- exploiting death, disaster, illness, abuse, crime victims, or acute suffering for reach;
- blaming suffering on karma;
- sectarian conflict or attacks on teachers, communities, religions, or traditions;
- unverified accusations, rumors, private-person controversy, or speculative diagnosis;
- political endorsement presented as Dharma;
- restricted Vajrayana instruction;
- a forced Dharma connection that trivializes the original event.

Public-service information may be researched, but it requires a direct official source and qualified human review before content production.

## Expiry and publication fit

- Every candidate must have `observed_at` and `expires_at`.
- Use the shortest defensible expiry. Seven days is a practical default; event-specific opportunities may be shorter or longer.
- Expiry more than 14 days after observation should produce a validator warning and needs a reason in `risk_notes` or the summary.
- Never use a candidate in a draft scheduled after its `expires_at`.
- If no valid `use-now` candidate fits a planned day, use an evergreen idea. Never export a trend placeholder.

## Monthly production mix

The default planning target is four evergreen/pain-point threads and no more than one timely trend-responsive thread per day. This is an editorial default, not a platform guarantee. For a 30-day assignment, refresh viral research before producing each six-day part when possible.

## Review and retention

Machine-created candidates normally use `review_status=needs-review`. `reviewed-by-human` requires the actual reviewer and review time. Keep the research file with the editorial records, but never upload it to the Content OS or bot importer.
