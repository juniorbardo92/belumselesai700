import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESERVED_HISTORY_REFERENCES,
  PROTECTED_TABLES,
  RESETTABLE_TABLES,
  dedupeScheduleCandidates,
  isTerminalLedgerStatus,
  parseResetBearerToken,
  publicationFingerprint,
  resetDeleteFilter,
  resetRequestTokenHash,
  shouldCancelSchedule,
  type ResetScheduleCandidate
} from "./history-reset-policy.ts";

const future = "2030-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";

function candidate(overrides: Partial<ResetScheduleCandidate> = {}): ResetScheduleCandidate {
  return {
    accountId: "account-1",
    scheduleAt: future,
    scheduleId: "schedule-1",
    idempotencyKey: "content:threads:20300101",
    isDraft: false,
    source: "autopilot",
    ...overrides
  };
}

test("reset policy preserves configuration and durable duplicate ledgers", () => {
  assert.equal(PROTECTED_TABLES.includes("brands"), true);
  assert.equal(PROTECTED_TABLES.includes("publication_ledger"), true);
  assert.equal(PROTECTED_TABLES.includes("history_reset_runs"), true);
  assert.equal(PROTECTED_TABLES.includes("history_reset_requests"), true);
  assert.equal(RESETTABLE_TABLES.includes("brands"), false);
  assert.equal(RESETTABLE_TABLES.includes("publication_ledger"), false);
});

test("reset deletes only rows that are not referenced by preserved subsystems", () => {
  const existingTables = new Set(PRESERVED_HISTORY_REFERENCES.map((reference) => reference.childTable));
  const contentFilter = resetDeleteFilter("content_items", existingTables);
  const topicFilter = resetDeleteFilter("topics", existingTables);
  const renderFilter = resetDeleteFilter("render_jobs", existingTables);

  assert.match(contentFilter, /content_pack_items/);
  assert.match(topicFilter, /preserved_content\.topic_id = topics\.id/);
  assert.match(topicFilter, /content_pack_items/);
  assert.equal(renderFilter, "");
  assert.equal(resetDeleteFilter("assets", existingTables), "");
  assert.equal(resetDeleteFilter("content_items", new Set()), "");
});

test("one-time reset authorization accepts only an exact bearer token", async () => {
  const token = "a".repeat(64);
  assert.equal(parseResetBearerToken(`Bearer ${token}`), token);
  assert.equal(parseResetBearerToken(`bearer ${token.toUpperCase()}`), token);
  assert.equal(parseResetBearerToken(`Bearer ${token}extra`), null);
  assert.equal(parseResetBearerToken("Bearer short"), null);
  assert.equal(parseResetBearerToken(null), null);
  assert.equal(await resetRequestTokenHash(token), await resetRequestTokenHash(token));
  assert.notEqual(await resetRequestTokenHash(token), await resetRequestTokenHash("b".repeat(64)));
});

test("only drafts or future schedules are cancellation targets", () => {
  const now = new Date("2026-09-21T00:00:00.000Z").getTime();
  assert.equal(shouldCancelSchedule(candidate(), now), true);
  assert.equal(shouldCancelSchedule(candidate({ scheduleAt: past }), now), false);
  assert.equal(shouldCancelSchedule(candidate({ scheduleAt: past, isDraft: true }), now), true);
  assert.equal(shouldCancelSchedule(candidate({ accountId: "" }), now), false);
});

test("cancellation candidates are idempotently deduplicated", () => {
  const result = dedupeScheduleCandidates([
    candidate(),
    candidate({ source: "publisher-log" }),
    candidate({ scheduleId: null, idempotencyKey: "other" }),
    candidate({ scheduleId: null, idempotencyKey: "other" })
  ]);
  assert.equal(result.length, 2);
});

test("publication fingerprints are stable and schedule-sensitive", async () => {
  const base = {
    brandId: "brand-umkm-naik-kelas",
    platform: "threads",
    scheduleAt: future,
    title: "Diagnosis kas",
    body: { threadsPosts: ["Pembuka", "Balasan"], instagramCaption: "Caption" }
  };
  assert.equal(await publicationFingerprint(base), await publicationFingerprint({ ...base }));
  assert.notEqual(
    await publicationFingerprint(base),
    await publicationFingerprint({ ...base, scheduleAt: "2030-01-01T01:00:00.000Z" })
  );
});

test("cancelled and ambiguous remote writes remain terminal", () => {
  assert.equal(isTerminalLedgerStatus("scheduled"), true);
  assert.equal(isTerminalLedgerStatus("reconcile_required"), true);
  assert.equal(isTerminalLedgerStatus("cancelled_by_reset"), true);
  assert.equal(isTerminalLedgerStatus("failed"), false);
});
