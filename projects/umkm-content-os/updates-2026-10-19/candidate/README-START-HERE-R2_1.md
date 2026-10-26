# UMKM R2.1 — SECURITY GATE CANDIDATE ONLY (19 Oct 2026)

**READ THIS FIRST.** This package is a local test-only revision of the developer-supplied R2. The original R2 has a safety defect: SHADOW or uncontracted PROMOTE can still update published status via the legacy `published`/`posted` + `publishedAt` schedule shortcut. Reproducer confirmed it.

R2.1 removes that shortcut. Tests: **52/52 PASS offline**. The embedded `docs/03-TEST-RESULTS.md` and other developer evidence describe the original R2 and do not assert production acceptance of R2.1.

No installation performed; no live Repliz calls or VPS2 access was made by this review. Kalyanamitra is handled in its original bundle and still reports one publisher FAIL and one PARTIAL.

Required before deployment: developer review, UAT clone on VPS2, schema/consumers checks, explicit owner consent for `published_at` semantics and IG H+1 suppression during candidate promotion.
