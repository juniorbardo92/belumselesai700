# Content-pack import contract

This reference defines the boundary between the manual producer skill and a future Content OS or Telegram importer. The skill only creates files. It does not perform an import.

## Canonical input

- MIME type: `application/json`.
- Filename suffix: `.content-pack.json`.
- Schema version: `kalyanamitra-content-pack.v1`.
- Encoding: UTF-8.
- Canonical data: JSON only. PDF, Markdown, CSV, and screenshots are never authoritative import sources.
- One monthly assignment may contain multiple ordered parts sharing one `package_id`.

## Planning files are not import files

The skill can also create these manual planning inputs:

- `*.idea-inbox.json` using `kalyanamitra-idea-inbox.v1`;
- `*.viral-research.json` using `kalyanamitra-viral-research.v1`.

They must remain outside the importer. Content OS and the private bot should reject them as unsupported import types rather than attempting to convert or store them as content. Only `*.content-pack.json` is canonical importer input.

## Import stages

A compatible importer should use one validation implementation for both the dashboard and private bot:

1. **Upload quarantine**: store the file temporarily; do not create content rows.
2. **Parse and schema validation**: reject malformed or unsupported JSON.
3. **Safety constants**: require the exact namespace, brand, draft-only mode, human approval, automatic-publish false, and `do-not-publish` flag.
4. **Semantic validation**: dates, part numbers, daily slots, post counts, 500-character limit, source records, tradition labels, and unique IDs.
5. **Duplicate preflight**: compare `package_id`, `external_id`, date+slot, and existing content fingerprints.
6. **Dry-run report**: return valid, warning, rejected, duplicate, and source-review counts without writing operational rows.
7. **Explicit admin confirmation**: required after the dry-run.
8. **Transactional insert**: create only draft records. Never call renderer, Repliz, schedule, or publish from the import transaction.
9. **Audit log**: record package ID, file hash, admin identity, counts, timestamp, and outcome.

## Idempotency

- Primary external key: `namespace + package_id + external_id`.
- Re-importing identical content should return `already-imported`, not create a duplicate.
- Reusing an external ID with different content should fail closed as `external-id-conflict`.
- A corrected package should use a new `package_revision` and preserve the original audit history.

## Source handling

- `provider-approved-needs-item-review` and `needs-review` may enter Content OS as drafts.
- They must not be upgraded to verified during import.
- `verified-by-human` is accepted only with non-empty reviewer and review date.
- Missing or uncertain sources become blocking warnings for later render/approval, not reasons to invent replacements.

## Bot behavior

The private bot may act as a thin upload client for the same importer:

- accept a JSON document from an allowlisted admin;
- return the dry-run summary;
- require a separate confirmation action;
- report the final import result;
- never send file contents to a language model merely to parse them;
- never publish, schedule, or submit to Repliz as part of import.

Suggested future caption:

```text
/importdraft
```

This caption and importer are not installed by this skill package.

## Minimum dry-run response

```json
{
  "package_id": "rk-threads-20260903-20261002",
  "schema_version": "kalyanamitra-content-pack.v1",
  "parts_received": 5,
  "parts_expected": 5,
  "drafts_received": 150,
  "valid": 143,
  "warnings": 7,
  "rejected": 0,
  "duplicates": 0,
  "source_review_required": 7,
  "ready_for_confirmation": true,
  "automatic_publish": false
}
```

The importer must derive these counts from validation; it must not trust summary values declared inside the uploaded package.
