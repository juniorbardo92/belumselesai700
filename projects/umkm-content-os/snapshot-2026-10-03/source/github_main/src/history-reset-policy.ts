export type ResetScheduleCandidate = {
  accountId: string;
  scheduleAt: string;
  scheduleId: string | null;
  idempotencyKey: string | null;
  isDraft: boolean;
  source: "autopilot" | "publisher-log";
};

export const RESETTABLE_TABLES = Object.freeze([
  "topic_research_posts",
  "topic_research_accounts",
  "topic_research_runs",
  "automation_events",
  "automation_runs",
  "content_designs",
  "design_assets",
  "assets",
  "render_jobs",
  "autopilot_jobs",
  "content_items",
  "topics",
  "activity_logs"
]);

export const PROTECTED_TABLES = Object.freeze([
  "brands",
  "publication_ledger",
  "history_reset_runs",
  "history_reset_requests",
  "d1_migrations"
]);

export const PRESERVED_HISTORY_REFERENCES = Object.freeze([
  { parentTable: "content_items", childTable: "content_pack_items", childColumn: "content_item_id" }
] as const);

function preservedReferenceSql(
  parentAlias: string,
  existingTables: ReadonlySet<string>
): string[] {
  return PRESERVED_HISTORY_REFERENCES
    .filter((reference) => existingTables.has(reference.childTable))
    .map((reference, index) => {
      const alias = `preserved_reference_${index}`;
      return `EXISTS (SELECT 1 FROM ${reference.childTable} AS ${alias} WHERE ${alias}.${reference.childColumn} = ${parentAlias}.id)`;
    });
}

export function resetDeleteFilter(table: string, existingTables: ReadonlySet<string>): string {
  if (table === "topics") {
    const contentReferences = preservedReferenceSql("preserved_content", existingTables);
    if (contentReferences.length === 0) return "";
    return `WHERE NOT EXISTS (SELECT 1 FROM content_items AS preserved_content WHERE preserved_content.topic_id = topics.id AND (${contentReferences.join(" OR ")}))`;
  }

  if (table !== "content_items") return "";
  const references = preservedReferenceSql(table, existingTables);
  return references.length > 0 ? `WHERE NOT (${references.join(" OR ")})` : "";
}

export function parseResetBearerToken(value: string | null): string | null {
  const match = value?.match(/^Bearer ([0-9a-f]{64})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export async function resetRequestTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidInstant(value: string): boolean {
  return value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

export function shouldCancelSchedule(candidate: ResetScheduleCandidate, nowMs: number): boolean {
  if (!candidate.accountId || !isValidInstant(candidate.scheduleAt)) return false;
  if (candidate.isDraft) return true;
  return new Date(candidate.scheduleAt).getTime() > nowMs;
}

export function dedupeScheduleCandidates(candidates: ResetScheduleCandidate[]): ResetScheduleCandidate[] {
  const deduped = new Map<string, ResetScheduleCandidate>();
  for (const candidate of candidates) {
    const key = candidate.scheduleId
      ? `id:${candidate.scheduleId}`
      : `slot:${candidate.accountId}:${new Date(candidate.scheduleAt).toISOString()}:${candidate.idempotencyKey ?? "draft"}`;
    const existing = deduped.get(key);
    if (!existing || (candidate.scheduleId && !existing.scheduleId)) deduped.set(key, candidate);
  }
  return [...deduped.values()];
}

function stablePublicationPayload(input: {
  brandId: string;
  platform: string;
  scheduleAt: string;
  title: string;
  body: Record<string, unknown>;
}): string {
  return JSON.stringify({
    brandId: input.brandId,
    platform: input.platform,
    scheduleAt: new Date(input.scheduleAt).toISOString(),
    title: input.title.trim(),
    threadsPosts: Array.isArray(input.body.threadsPosts) ? input.body.threadsPosts : [],
    instagramCaption: typeof input.body.instagramCaption === "string" ? input.body.instagramCaption : "",
    carousel: input.body.carousel ?? null
  });
}

export async function publicationFingerprint(input: {
  brandId: string;
  platform: string;
  scheduleAt: string;
  title: string;
  body: Record<string, unknown>;
}): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stablePublicationPayload(input)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isTerminalLedgerStatus(status: string): boolean {
  return new Set(["scheduled", "unchanged", "reconcile_required", "published", "cancelled_by_reset"]).has(status);
}
