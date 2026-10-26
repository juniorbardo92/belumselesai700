type AnalyticsCountRow = { total: number };

type AnalyticsStatusRow = {
  status: string;
  total: number;
};

type AnalyticsActivityRow = {
  id: number;
  event_type: string;
  status: string;
  message: string;
  metadata_json: string;
  created_at: string;
};

type AnalyticsMetadata = Record<string, unknown>;

export type AnalyticsActivity = {
  id: number;
  eventType: string;
  status: string;
  message: string;
  createdAt: string;
  title: string | null;
  platform: string | null;
  scheduleAt: string | null;
  isDraft: boolean | null;
};

export type AnalyticsSnapshot = {
  ok: true;
  mode: "read-only";
  source: "D1";
  generatedAt: string;
  summary: {
    topics: number;
    content: number;
    approvedContent: number;
    publishedContent: number;
    renderCompleted: number;
    renderPending: number;
    assets: number;
    publisherDrafts: number;
  };
  contentByStatus: Record<string, number>;
  draftsByPlatform: Record<string, number>;
  recentActivity: AnalyticsActivity[];
  note: string;
};

const MAX_MESSAGE_BYTES = 360;
const MAX_ACTIVITY_ROWS = 40;
const SUPPORTED_DRAFT_PLATFORMS = ["instagram", "threads", "tiktok"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function limitedText(value: string, maxBytes = MAX_MESSAGE_BYTES): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

function parseMetadata(value: string): AnalyticsMetadata {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function count(env: Env, sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<AnalyticsCountRow>();
  return Number(row?.total ?? 0);
}

function buildContentStatusCounts(rows: AnalyticsStatusRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const status = textValue(row.status, "unknown");
    counts[status] = Number(row.total ?? 0);
    return counts;
  }, {});
}

function buildDraftPlatformCounts(rows: AnalyticsActivityRow[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(SUPPORTED_DRAFT_PLATFORMS.map((platform) => [platform, 0]));
  for (const row of rows) {
    if (row.event_type !== "publisher.draft_submitted" || row.status !== "success") continue;
    const platform = textValue(parseMetadata(row.metadata_json).platform).toLowerCase();
    if (platform) counts[platform] = (counts[platform] ?? 0) + 1;
  }
  return counts;
}

function toActivity(row: AnalyticsActivityRow): AnalyticsActivity {
  const metadata = parseMetadata(row.metadata_json);
  const rawDraft = metadata.isDraft;
  return {
    id: Number(row.id),
    eventType: row.event_type,
    status: row.status,
    message: limitedText(textValue(row.message, "Aktivitas Content OS")),
    createdAt: row.created_at,
    title: textValue(metadata.title) || null,
    platform: textValue(metadata.platform).toLowerCase() || null,
    scheduleAt: textValue(metadata.scheduleAt) || null,
    isDraft: typeof rawDraft === "boolean" ? rawDraft : null
  };
}

export async function getAnalyticsSnapshot(env: Env): Promise<AnalyticsSnapshot> {
  const [topics, content, approvedContent, publishedContent, renderCompleted, renderPending, assets, contentStatuses, activity] = await Promise.all([
    count(env, "SELECT COUNT(*) AS total FROM topics"),
    count(env, "SELECT COUNT(*) AS total FROM content_items"),
    count(env, "SELECT COUNT(*) AS total FROM content_items WHERE status = 'approved'"),
    count(env, "SELECT COUNT(*) AS total FROM content_items WHERE status = 'published'"),
    count(env, "SELECT COUNT(*) AS total FROM render_jobs WHERE status = 'completed'"),
    count(env, "SELECT COUNT(*) AS total FROM render_jobs WHERE status IN ('queued', 'running')"),
    count(env, "SELECT COUNT(*) AS total FROM assets"),
    env.DB.prepare("SELECT status, COUNT(*) AS total FROM content_items GROUP BY status").all<AnalyticsStatusRow>(),
    env.DB.prepare(
      `SELECT id, event_type, status, message, metadata_json, created_at
       FROM activity_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    ).bind(MAX_ACTIVITY_ROWS).all<AnalyticsActivityRow>()
  ]);

  const activityRows = activity.results;
  const publisherDrafts = activityRows.filter(
    (row) => row.event_type === "publisher.draft_submitted" && row.status === "success"
  ).length;

  return {
    ok: true,
    mode: "read-only",
    source: "D1",
    generatedAt: new Date().toISOString(),
    summary: {
      topics,
      content,
      approvedContent,
      publishedContent,
      renderCompleted,
      renderPending,
      assets,
      publisherDrafts
    },
    contentByStatus: buildContentStatusCounts(contentStatuses.results),
    draftsByPlatform: buildDraftPlatformCounts(activityRows),
    recentActivity: activityRows.slice(0, 20).map(toActivity),
    note: "Analytics ini hanya membaca D1. Views, likes, komentar, dan shares platform akan ditambahkan setelah ada posting yang benar-benar terbit dan endpoint metriknya diuji secara manual."
  };
}
