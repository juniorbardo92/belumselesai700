# R2.1 Security gate patch — LOCAL CANDIDATE ONLY

Reproducer against original R2 (temporary SQLite, mocked GET) confirmed SHADOW bypass:
`status=published`, nonempty `publishedAt` -> code promotes `PUBLISHED` even if `PROMOTE=False` or `PROMOTE=True` without contract. Furthermore provider `schedule.postId` denotes first reply in relevant observed threads.

## Changes
- Removes the legacy branch that called `promote()` directly for published/posted status.
- Routes positive terminal states `success`, `published`, `posted` through Content API `prove_thread` and the same `promotion_gate`.
- Replaces original legacy test with three regression cases (SHADOW, missing contract, explicit contract).
- Preserves all other R2 logic. **Do not deploy without independent review and fresh VPS2 read-only preflight.**

## Interpretations
The bundled existing `docs/03-TEST-RESULTS.md` is historical evidence from the developer's R2, not proof of R2.1. The new tests are strictly offline and do not connect to Repliz or production SQLite.

## Live blockers
- User approval of published_at provenance `root_createdAt` is still required before any promotion.
- Quiesce IG H+1 under an approved maintenance plan before enabling promotion.
- Kalyanamitra still has 1 FAIL/1 PARTIAL in publisher UAT, and B10 watermark absent.
