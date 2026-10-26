# Validation Report

**Artifact:** Kalyanamitra Content OS Bridge 1.0.3  
**Validation date:** 30 August 2026  
**Previous v1.0.2 archive SHA-256:** `938d2177f83056f0ca1de939b5aff9d5c1e87f9898e2ebd09557319f37745765`

## Source baseline

- Active `umkm-content-os` manifest SHA-256: `42d860c66defbea9866a5869fded91b4b1aafb9bda5775d6a42de078c8f010d5`.
- Active `umkm-content-registry` manifest SHA-256: `a42798f863cfda55ce1e09a0f723e01479084ca65be6e7bd491c2b36469b2064`.
- The bridge is a new plugin. Neither active source tree was modified.

## Automated checks

- JSON manifest/package parsing: passed.
- JavaScript syntax checks: passed.
- Namespace and draft-only metadata test: passed.
- Cross-namespace record rejection test: passed.
- Effective source-review status test: passed.
- Vajrayana lineage-review gate test: passed.
- Repliz Instagram/Threads account mapping test: passed.
- Repliz response credential-minimization test: passed.
- Repliz draft approval gate test: passed.
- No Threads publish/reply endpoint test: passed.
- Ledger fallback with matching UUID/display ID test: passed.
- Reserved control-marker anti-spoofing test: passed.
- Append-only ledger persistence test: passed.
- Total: 10 passed, 0 failed.

## Guardrails

- The model cannot supply arbitrary metadata, tenant, namespace, or Repliz account ID.
- Every read and workflow action requires a UUID created by this bridge, then fetches the record and verifies its display ID and namespace policy.
- Missing ledger entries, mismatched record fields, malformed ledgers, and conflicting metadata fail closed.
- Approval requires explicit human and source-review confirmations.
- Vajrayana approval additionally requires lineage-review confirmation.
- Repliz Instagram and Threads are locked to separate operator-configured account IDs and one exact username.
- The model must choose a platform but cannot submit or override an account ID.
- Account inspection returns only a minimized safe field set; credential-like fields are discarded.
- The bridge exposes no publish, reply, engagement, auto-reply, or retry action.

## Deployment boundary

Automated tests validate the plugin package and policy logic. The real Content OS request/response shape and metadata persistence must still be verified through one canary after installation. The canary installer exposes only create/get tools. Worker, D1 schema, Cloudflare traffic, n8n rollback, existing UMKM plugins, and Publisher configuration are unchanged.

## Canary 2026-08-30

The production Worker accepted the draft but its GET response omitted `metadata`. Version 1.0.2 therefore adds an append-only local namespace ledger outside the model workspace. Every GET requires a UUID already recorded by the bridge and a matching `displayId`; metadata or control-marker mismatches still fail closed. No Worker, D1 schema, UMKM plugin, n8n, or Publisher change is required.

Database-level tenant isolation is not claimed because the production Worker and D1 schema were intentionally left untouched. The bridge enforces fail-closed isolation at the OpenClaw tool boundary.

## Multi-account patch 2026-08-30

Read-only account discovery returned two official `@ruangkalyanamitra` records: Instagram `6a8d2c6762caae1e04053962` and Threads `6a8d2c7862caae1e0405397a`. Version 1.0.3 binds both IDs by platform. The workflow requires an explicit `instagram` or `threads` platform and resolves the corresponding ID only from operator configuration. Swapped IDs, mismatched usernames, missing platform configuration, and unapproved records fail closed.
