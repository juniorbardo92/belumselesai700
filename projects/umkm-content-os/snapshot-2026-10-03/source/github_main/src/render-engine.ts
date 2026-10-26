import { ensureDesignSchema, getRenderDesign, type RenderDesign } from "./design-engine";

type JsonRecord = Record<string, unknown>;

type ContentRow = {
  id: string;
  brand_id: string;
  title: string;
  status: string;
  body_json: string;
  completed_render_count: number;
  asset_count: number;
  created_at: string;
};

type RenderJobRow = {
  id: string;
  content_item_id: string;
  brand_id: string;
  content_title: string;
  status: string;
  attempt_count: number;
  error_message: string | null;
  github_run_id: string | null;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  render_job_id: string;
  platform: string;
  r2_key: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
};

type ManifestImage = {
  platform: "instagram" | "tiktok";
  key: string;
  url: string;
  width: number;
  height: number;
  sha256: string;
};

type RenderManifest = {
  renderJobId: string;
  contentItemId: string;
  githubRunId: string | null;
  images: ManifestImage[];
  qa: {
    passed: true;
    brandId: string;
    resolvedBrand: string;
    label: string;
    slideCount: number;
  };
};

export type RendererRuntimeStatus = {
  configured: boolean;
  repository: string;
  workflow: string;
};

export type RendererResult = {
  status: number;
  body: unknown;
};

class RenderEngineError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const GITHUB_OWNER = "varashoil108-design";
const GITHUB_REPOSITORY = "umkm-content-os";
const GITHUB_WORKFLOW = "render-carousel.yml";
const GITHUB_REF = "main";
const GITHUB_API_VERSION = "2026-03-10";
const PUBLIC_MEDIA_BASE = "https://media.umkmnaikkelas.id";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_GITHUB_BYTES = 128 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DISPATCH_INPUT_BYTES = 60 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readLimitedText(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!stream) return "";

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("payload_too_large");
        throw new RenderEngineError(413, "Respons terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function parseDraft(bodyJson: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(bodyJson);
  } catch {
    throw new RenderEngineError(422, "JSON draft tidak valid.");
  }

  if (!isRecord(value) || !isRecord(value.carousel) || !Array.isArray(value.carousel.slides)) {
    throw new RenderEngineError(422, "Draft belum memiliki carousel.");
  }

  const slides = value.carousel.slides;
  if (slides.length < 5 || slides.length > 9) {
    throw new RenderEngineError(422, "Carousel harus berisi 5–9 slide.");
  }

  const valid = slides.every(
    (slide, index) =>
      isRecord(slide) &&
      slide.number === index + 1 &&
      typeof slide.type === "string" &&
      typeof slide.headline === "string" &&
      typeof slide.body === "string"
  );
  if (!valid) throw new RenderEngineError(422, "Struktur slide carousel tidak valid.");

  return value;
}

function manifestKey(jobId: string): string {
  return `carousel/jobs/${jobId}/manifest.json`;
}

function mediaUrl(key: string): string {
  return `${PUBLIC_MEDIA_BASE}/${key}`;
}

export function getRendererRuntimeStatus(env: Env): RendererRuntimeStatus {
  return {
    configured: Boolean(readBinding(env, "GITHUB_ACTIONS_TOKEN")),
    repository: `${GITHUB_OWNER}/${GITHUB_REPOSITORY}`,
    workflow: GITHUB_WORKFLOW
  };
}

export async function listRenderableContent(env: Env): Promise<RendererResult> {
  await ensureDesignSchema(env);
  const query = await env.DB.prepare(
    `WITH recent_content AS MATERIALIZED (
       SELECT c.id, c.title, c.status, c.body_json, c.created_at,
              COALESCE(d.updated_at, c.created_at) AS render_valid_after
       FROM (
         SELECT id, title, status, body_json, created_at
         FROM content_items
         WHERE status IN ('draft', 'review', 'approved')
         ORDER BY created_at DESC
         LIMIT 30
       ) c
       LEFT JOIN content_designs d ON d.content_item_id = c.id
     ),
     completed_jobs AS MATERIALIZED (
       SELECT r.id, r.content_item_id,
              COUNT(*) OVER (PARTITION BY r.content_item_id) AS completed_render_count,
              ROW_NUMBER() OVER (
                PARTITION BY r.content_item_id
                ORDER BY r.updated_at DESC, r.id DESC
              ) AS render_rank
       FROM render_jobs r
       INNER JOIN recent_content c ON c.id = r.content_item_id
       WHERE r.status = 'completed'
         AND r.updated_at >= c.render_valid_after
     ),
     latest_jobs AS MATERIALIZED (
       SELECT id, content_item_id, completed_render_count
       FROM completed_jobs
       WHERE render_rank = 1
     ),
     asset_counts AS MATERIALIZED (
       SELECT a.render_job_id, COUNT(*) AS asset_count
       FROM assets a
       INNER JOIN latest_jobs j ON j.id = a.render_job_id
       GROUP BY a.render_job_id
     )
     SELECT c.id, c.title, c.status, c.body_json, c.created_at,
            COALESCE(j.completed_render_count, 0) AS completed_render_count,
            COALESCE(a.asset_count, 0) AS asset_count
     FROM recent_content c
     LEFT JOIN latest_jobs j ON j.content_item_id = c.id
     LEFT JOIN asset_counts a ON a.render_job_id = j.id
     ORDER BY c.created_at DESC`
  ).all<ContentRow>();

  const items = query.results.map((row) => {
    let slideCount = 0;
    try {
      const draft = parseDraft(row.body_json);
      const carousel = draft.carousel;
      slideCount = isRecord(carousel) && Array.isArray(carousel.slides) ? carousel.slides.length : 0;
    } catch {
      slideCount = 0;
    }

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      slideCount,
      renderable: slideCount >= 5 && slideCount <= 9,
      assetCount: Number(row.asset_count ?? 0),
      approvalReady: Number(row.completed_render_count ?? 0) > 0 && Number(row.asset_count ?? 0) >= 10,
      createdAt: row.created_at
    };
  });

  return { status: 200, body: { ok: true, items } };
}

function parseManifest(value: unknown, jobId: string, contentItemId: string, brandId: string): RenderManifest {
  if (!isRecord(value) || !Array.isArray(value.images)) {
    throw new RenderEngineError(502, "Manifest renderer tidak valid.");
  }
  if (!isRecord(value.qa) || value.qa.passed !== true || value.qa.brandId !== brandId) {
    throw new RenderEngineError(502, "Manifest renderer tidak memiliki QA brand yang valid.");
  }
  const expectedResolvedBrand = brandId === "brand-ruang-kalyanamitra" ? "ruang-kalyanamitra" : "umkm-naik-kelas";
  const expectedLabel = brandId === "brand-ruang-kalyanamitra" ? "Ruang Kalyanamitra" : "UMKM Naik Kelas";
  if (value.qa.resolvedBrand !== expectedResolvedBrand || value.qa.label !== expectedLabel) {
    throw new RenderEngineError(502, "Identitas visual pada manifest tidak cocok dengan brand konten.");
  }

  const expectedPrefix = `carousel/jobs/${jobId}/`;
  const images: ManifestImage[] = [];

  for (const item of value.images) {
    if (!isRecord(item)) continue;
    const platform = item.platform;
    const key = item.key;
    const sha256 = item.sha256;
    if (
      (platform !== "instagram" && platform !== "tiktok") ||
      typeof key !== "string" ||
      !key.startsWith(expectedPrefix) ||
      !key.endsWith(".png") ||
      typeof sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(sha256)
    ) {
      continue;
    }
    const width = platform === "instagram" ? 1080 : 1080;
    const height = platform === "instagram" ? 1350 : 1920;
    images.push({ platform, key, url: mediaUrl(key), width, height, sha256 });
  }

  if (images.length < 10 || images.length > 18) {
    throw new RenderEngineError(502, "Jumlah aset carousel pada manifest tidak valid.");
  }
  const qaSlideCount = Number(value.qa.slideCount);
  const instagramImages = images.filter((image) => image.platform === "instagram");
  const tiktokImages = images.filter((image) => image.platform === "tiktok");
  if (
    !Number.isInteger(qaSlideCount) ||
    qaSlideCount < 5 ||
    qaSlideCount > 9 ||
    instagramImages.length !== qaSlideCount ||
    tiktokImages.length !== qaSlideCount
  ) {
    throw new RenderEngineError(502, "QA manifest tidak cocok dengan jumlah slide.");
  }
  for (const platformImages of [instagramImages, tiktokImages]) {
    if (new Set(platformImages.map((image) => image.sha256)).size !== platformImages.length) {
      throw new RenderEngineError(502, "QA manifest mendeteksi slide visual duplikat.");
    }
  }

  const manifestJobId = typeof value.renderJobId === "string" ? value.renderJobId : jobId;
  const manifestContentId = typeof value.contentItemId === "string" ? value.contentItemId : contentItemId;
  if (manifestJobId !== jobId || manifestContentId !== contentItemId) {
    throw new RenderEngineError(502, "Identitas manifest renderer tidak cocok.");
  }

  return {
    renderJobId: jobId,
    contentItemId,
    githubRunId:
      typeof value.githubRunId === "string" || typeof value.githubRunId === "number"
        ? String(value.githubRunId)
        : null,
    images,
    qa: {
      passed: true,
      brandId,
      resolvedBrand: expectedResolvedBrand,
      label: expectedLabel,
      slideCount: qaSlideCount
    }
  };
}

async function completeFromManifest(env: Env, job: RenderJobRow): Promise<boolean> {
  const object = await env.MEDIA.get(manifestKey(job.id));
  if (!object) return false;
  if (object.size > MAX_MANIFEST_BYTES) {
    throw new RenderEngineError(502, "Manifest renderer terlalu besar.");
  }

  const text = await object.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RenderEngineError(502, "Manifest renderer bukan JSON.");
  }

  const manifest = parseManifest(value, job.id, job.content_item_id, job.brand_id);
  const statements = manifest.images.map((image) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO assets
       (id, content_item_id, render_job_id, platform, kind, r2_key, public_url, width, height, mime_type)
       VALUES (?, ?, ?, ?, 'carousel_slide', ?, ?, ?, ?, 'image/png')`
    ).bind(
      crypto.randomUUID(),
      job.content_item_id,
      job.id,
      image.platform,
      image.key,
      image.url,
      image.width,
      image.height
    )
  );

  statements.unshift(
    env.DB.prepare(
      `UPDATE render_jobs
       SET status = 'completed', github_run_id = COALESCE(github_run_id, ?), error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(manifest.githubRunId, job.id),
    env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
       VALUES ('render.completed', 'render_job', ?, 'success', 'Carousel selesai dirender dan tersimpan di R2.', ?)`
    ).bind(job.id, JSON.stringify({ images: manifest.images.length, githubRunId: manifest.githubRunId, qa: manifest.qa }))
  );

  await env.DB.batch(statements);
  return true;
}

async function markFailed(env: Env, jobId: string, message: string): Promise<void> {
  const safeMessage = message.slice(0, 500);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE render_jobs
       SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(safeMessage, jobId),
    env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message)
       VALUES ('render.failed', 'render_job', ?, 'error', ?)`
    ).bind(jobId, safeMessage)
  ]);
}

async function readGithubRun(env: Env, runId: string): Promise<JsonRecord | null> {
  const token = readBinding(env, "GITHUB_ACTIONS_TOKEN");
  if (!token) return null;

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/runs/${encodeURIComponent(runId)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "umkm-content-os-worker",
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      }
    }
  );

  const text = await readLimitedText(response.body, MAX_GITHUB_BYTES);
  if (!response.ok) {
    console.error(JSON.stringify({ message: "github_run_status_failed", status: response.status, runId }));
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function refreshRenderJob(env: Env, job: RenderJobRow): Promise<void> {
  try {
    if (await completeFromManifest(env, job)) return;

    if (!job.github_run_id) return;
    const run = await readGithubRun(env, job.github_run_id);
    if (!run) return;

    const status = typeof run.status === "string" ? run.status : "";
    const conclusion = typeof run.conclusion === "string" ? run.conclusion : null;

    if (status === "completed" && conclusion && conclusion !== "success") {
      await markFailed(env, job.id, `GitHub Actions selesai dengan status ${conclusion}.`);
      return;
    }

    if (status === "queued" || status === "in_progress") {
      await env.DB.prepare(
        `UPDATE render_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(job.id).run();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sinkronisasi renderer gagal.";
    console.error(JSON.stringify({ message: "render_job_refresh_failed", jobId: job.id, error: message }));
  }
}

async function queryRenderJobs(env: Env): Promise<RenderJobRow[]> {
  const query = await env.DB.prepare(
    `SELECT r.id, r.content_item_id, c.brand_id, c.title AS content_title, r.status, r.attempt_count,
            r.error_message, r.github_run_id, r.created_at, r.updated_at
     FROM render_jobs r
     JOIN content_items c ON c.id = r.content_item_id
     ORDER BY r.created_at DESC
     LIMIT 30`
  ).all<RenderJobRow>();
  return query.results;
}

export async function listRenderJobs(env: Env): Promise<RendererResult> {
  await refreshActiveRenderJobs(env, 5);

  const jobs = await queryRenderJobs(env);
  const assetQuery = await env.DB.prepare(
    `SELECT id, render_job_id, platform, r2_key, public_url, width, height
     FROM assets
     WHERE render_job_id IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 300`
  ).all<AssetRow>();

  const assetsByJob = new Map<string, AssetRow[]>();
  for (const asset of assetQuery.results) {
    const items = assetsByJob.get(asset.render_job_id) ?? [];
    items.push(asset);
    assetsByJob.set(asset.render_job_id, items);
  }

  return {
    status: 200,
    body: {
      ok: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        contentItemId: job.content_item_id,
        brandId: job.brand_id,
        title: job.content_title,
        status: job.status,
        attemptCount: job.attempt_count,
        error: job.error_message,
        githubRunId: job.github_run_id,
        githubUrl: job.github_run_id
          ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/runs/${job.github_run_id}`
          : null,
        manifestUrl: mediaUrl(manifestKey(job.id)),
        assets: assetsByJob.get(job.id) ?? [],
        createdAt: job.created_at,
        updatedAt: job.updated_at
      }))
    }
  };
}

export async function refreshActiveRenderJobs(env: Env, limit = 10): Promise<void> {
  const jobs = await queryRenderJobs(env);
  const active = jobs
    .filter((job) => job.status === "queued" || job.status === "running")
    .slice(0, Math.max(1, Math.min(limit, 20)));
  await Promise.all(active.map((job) => refreshRenderJob(env, job)));
}

function validateCreateInput(value: unknown): string {
  if (!isRecord(value) || typeof value.contentItemId !== "string" || !UUID_PATTERN.test(value.contentItemId)) {
    throw new RenderEngineError(400, "Content item tidak valid.");
  }
  return value.contentItemId;
}

async function dispatchWorkflow(
  env: Env,
  jobId: string,
  contentItemId: string,
  brandId: string,
  draft: JsonRecord,
  design: RenderDesign
): Promise<{ runId: string | null; htmlUrl: string | null }> {
  const token = readBinding(env, "GITHUB_ACTIONS_TOKEN");
  if (!token) throw new RenderEngineError(503, "Token GitHub Actions belum dikonfigurasi.");

  const contentJson = JSON.stringify({ brandId, content: draft, design });
  if (new TextEncoder().encode(contentJson).byteLength > MAX_DISPATCH_INPUT_BYTES) {
    throw new RenderEngineError(422, "Draft terlalu besar untuk dikirim ke GitHub Actions.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "umkm-content-os-worker",
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      },
      body: JSON.stringify({
        ref: GITHUB_REF,
        inputs: {
          content_json: contentJson,
          upload_to_r2: true,
          render_job_id: jobId,
          content_item_id: contentItemId
        }
      })
    }
  );

  const responseText = await readLimitedText(response.body, MAX_GITHUB_BYTES);
  if (!response.ok) {
    console.error(JSON.stringify({ message: "github_dispatch_failed", status: response.status, jobId }));
    throw new RenderEngineError(502, "GitHub Actions gagal memulai renderer.");
  }

  if (!responseText) return { runId: null, htmlUrl: null };

  let responseValue: unknown;
  try {
    responseValue = JSON.parse(responseText);
  } catch {
    return { runId: null, htmlUrl: null };
  }

  if (!isRecord(responseValue)) return { runId: null, htmlUrl: null };
  const rawRunId = responseValue.workflow_run_id;
  return {
    runId: typeof rawRunId === "string" || typeof rawRunId === "number" ? String(rawRunId) : null,
    htmlUrl: typeof responseValue.html_url === "string" ? responseValue.html_url : null
  };
}

export async function startRenderJob(request: Request, env: Env): Promise<RendererResult> {
  const requestId = crypto.randomUUID();
  let jobId: string | null = null;

  try {
    if (!getRendererRuntimeStatus(env).configured) {
      throw new RenderEngineError(503, "Token GitHub Actions belum dikonfigurasi.");
    }

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new RenderEngineError(413, "Payload terlalu besar.");

    const requestText = await readLimitedText(request.body, MAX_REQUEST_BYTES);
    let requestValue: unknown;
    try {
      requestValue = JSON.parse(requestText);
    } catch {
      throw new RenderEngineError(400, "Body harus berupa JSON valid.");
    }
    const contentItemId = validateCreateInput(requestValue);

    const content = await env.DB.prepare(
      `SELECT id, brand_id, title, status, body_json, created_at
       FROM content_items
       WHERE id = ? AND status IN ('draft', 'review', 'approved')
       LIMIT 1`
    ).bind(contentItemId).first<ContentRow>();
    if (!content) throw new RenderEngineError(404, "Draft konten tidak ditemukan.");

    const existing = await env.DB.prepare(
      `SELECT id FROM render_jobs
       WHERE content_item_id = ? AND status IN ('queued', 'running')
       LIMIT 1`
    ).bind(contentItemId).first<{ id: string }>();
    if (existing) {
      throw new RenderEngineError(409, "Draft ini sudah berada dalam antrean render.");
    }

    const draft = parseDraft(content.body_json);
    jobId = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO render_jobs (id, content_item_id, output_format, status)
         VALUES (?, ?, 'carousel', 'queued')`
      ).bind(jobId, contentItemId),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message)
         VALUES ('render.queued', 'render_job', ?, 'success', 'Draft masuk antrean carousel.')`
      ).bind(jobId)
    ]);

    const design = await getRenderDesign(env, contentItemId);
    const dispatched = await dispatchWorkflow(env, jobId, contentItemId, content.brand_id, draft, design);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE render_jobs
         SET status = 'running', attempt_count = 1, github_run_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(dispatched.runId, jobId),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
         VALUES ('render.started', 'render_job', ?, 'success', 'GitHub Actions renderer dimulai.', ?)`
      ).bind(jobId, JSON.stringify({ githubRunId: dispatched.runId, githubUrl: dispatched.htmlUrl }))
    ]);

    return {
      status: 202,
      body: {
        ok: true,
        requestId,
        jobId,
        contentItemId,
        status: "running",
        githubRunId: dispatched.runId,
        githubUrl: dispatched.htmlUrl,
        manifestUrl: mediaUrl(manifestKey(jobId))
      }
    };
  } catch (error) {
    const status = error instanceof RenderEngineError ? error.status : 500;
    const publicMessage =
      error instanceof RenderEngineError ? error.publicMessage : "Renderer mengalami kesalahan.";
    const internalMessage = error instanceof Error ? error.message : "Unknown error";

    if (jobId) {
      try {
        await markFailed(env, jobId, publicMessage);
      } catch (databaseError) {
        const databaseMessage = databaseError instanceof Error ? databaseError.message : "Unknown database error";
        console.error(JSON.stringify({ message: "render_failure_log_failed", requestId, jobId, error: databaseMessage }));
      }
    }

    console.error(JSON.stringify({ message: "render_start_failed", requestId, jobId, status, error: internalMessage }));
    return { status, body: { ok: false, requestId, error: publicMessage } };
  }
}
