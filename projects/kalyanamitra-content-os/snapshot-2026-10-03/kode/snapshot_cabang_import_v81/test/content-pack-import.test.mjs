import assert from "node:assert/strict";
import test from "node:test";

import worker, { applyDraftContentEdit, fingerprintContentPackDraft, resolveContentSlides, validateContentPackDocument } from "../dist/index.js";

const baseUrl = "https://content-os.test";
const token = "test-kalyanamitra-import-token-123456";
const admins = "111111111,222222222";
const brand = {
  id: "brand-ruang-kalyanamitra",
  name: "Ruang Kalyanamitra",
  slug: "ruang-kalyanamitra",
  voice: "Edukasi Buddhis yang jernih, hangat, lintas tradisi, dan berbasis sumber terverifikasi.",
  status: "active"
};

function validPack(partNumber = 1, packageId = "rk-sample-threads-20260903", revision = 1) {
  const periodStart = "2026-09-03";
  const partStartDate = new Date(Date.UTC(2026, 8, 3 + ((partNumber - 1) * 6)));
  const partStart = partStartDate.toISOString().slice(0, 10);
  const partEnd = new Date(partStartDate.getTime() + (5 * 86_400_000)).toISOString().slice(0, 10);
  const pack = {
    schema_version: "kalyanamitra-content-pack.v1",
    package_id: packageId,
    package_revision: revision,
    part: { number: partNumber, total: 5, start_date: partStart, end_date: partEnd },
    namespace: "ruang-kalyanamitra",
    brand: "Ruang Kalyanamitra",
    brand_id: "brand-ruang-kalyanamitra",
    platform: "threads",
    language: "id-ID",
    timezone: "Asia/Jakarta",
    content_status: "draft",
    publisher_mode: "draft-only",
    automatic_publish: false,
    human_approval_required: true,
    package_risk_flags: ["do-not-publish"],
    generated_at: "2026-09-02T17:00:00+07:00",
    generator: { service: "chatgpt", model: "test-model", mode: "manual-chat" },
    period: { start_date: periodStart, end_date: "2026-10-02" },
    expected_counts: {
      days_total_package: 30,
      threads_per_day: 5,
      posts_min_per_thread: 6,
      posts_max_per_thread: 8,
      drafts_total_package: 150,
      drafts_in_this_part: 30
    },
    drafts: []
  };
  for (let day = 0; day < 6; day += 1) {
    const date = new Date(partStartDate.getTime() + (day * 86_400_000)).toISOString().slice(0, 10);
    for (let slot = 1; slot <= 5; slot += 1) {
      const hook = `Pernah menutup chat kerja pada ${date}, tetapi percakapannya masih berputar di kepala? Slot ${slot}.`;
      pack.drafts.push({
        external_id: `rk-${date.replaceAll("-", "")}-0${slot}`,
        publish_date: date,
        slot,
        content_pillar: "Dharma untuk Kehidupan Sehari-hari",
        series: "Dharma di Tempat Kerja",
        funnel_goal: "value",
        audience_problem: "Percakapan kerja memicu reaksi tergesa-gesa.",
        title: `Tiga Napas ${date} Slot ${slot}`,
        promise: "Membantu pembaca membuat jeda sebelum bereaksi.",
        selected_hook: hook,
        hook_rationale: "Situasi konkret yang membuka praktik sederhana.",
        tradition_scope: "theravada",
        traditions_covered: ["theravada"],
        source_review_status: "needs-review",
        sources: [{
          source_id: "src-mn118-sujato",
          provider_id: "suttacentral",
          title: "Mindfulness of Breathing (MN 118)",
          author_teacher_or_translator: "Bhikkhu Sujato",
          tradition: "theravada",
          source_type: "canonical-text",
          url: "https://suttacentral.net/mn118/en/sujato",
          locator: "MN 118; periksa paragraf sebelum approval.",
          claim_supported: "Perhatian pada napas disajikan sebagai latihan bertahap.",
          verification_status: "provider-approved-needs-item-review",
          checked_at: null,
          checked_by: null
        }],
        posts: [
          { sequence: 1, role: "hook", text: hook, source_ids: [] },
          { sequence: 2, role: "context", text: "Batin masih menyusun jawaban dan membela diri.", source_ids: [] },
          { sequence: 3, role: "dharma-lens", text: "MN 118 menjelaskan perhatian pada napas sebagai latihan bertahap.", source_ids: ["src-mn118-sujato"] },
          { sequence: 4, role: "explanation", text: "Jeda memberi ruang untuk melihat reaksi sebelum menjadi ucapan.", source_ids: ["src-mn118-sujato"] },
          { sequence: 5, role: "application", text: "Letakkan ponsel, rasakan napas, lalu baca ulang dari sisi penerima.", source_ids: [] },
          { sequence: 6, role: "reflection", text: "Respons apa yang tetap jujur tanpa menambah luka?", source_ids: [] },
          { sequence: 7, role: "cta", text: "Simpan utas ini dan periksa teks sumber lengkap sebelum menyimpulkan.", source_ids: ["src-mn118-sujato"] }
        ],
        metric_hypothesis: "Situasi spesifik dan praktik sederhana akan meningkatkan penyimpanan utas.",
        review_required: true,
        risk_flags: ["source-item-needs-human-review"]
      });
    }
  }
  return pack;
}

function shortPack() {
  const pack = validPack(1, "rk-short-threads-20260903", 1);
  pack.part.total = 1;
  pack.part.end_date = "2026-09-05";
  pack.period.end_date = "2026-09-05";
  pack.expected_counts.days_total_package = 3;
  pack.expected_counts.drafts_total_package = 15;
  pack.expected_counts.drafts_in_this_part = 15;
  pack.drafts = pack.drafts.slice(0, 15);
  return pack;
}

function singleFilePack(days = 7, threadsPerDay = 7, postsPerThread = 6) {
  const pack = validPack(1, `rk-single-file-${days}d-${threadsPerDay}t`, 1);
  const periodStart = pack.period.start_date;
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(start.getTime() + ((days - 1) * 86_400_000)).toISOString().slice(0, 10);
  const template = structuredClone(pack.drafts[0]);
  pack.part = { number: 1, total: 1, start_date: periodStart, end_date: periodEnd };
  pack.period.end_date = periodEnd;
  pack.expected_counts = {
    days_total_package: days,
    threads_per_day: threadsPerDay,
    posts_min_per_thread: 6,
    posts_max_per_thread: 8,
    drafts_total_package: days * threadsPerDay,
    drafts_in_this_part: days * threadsPerDay
  };
  pack.drafts = [];
  for (let day = 0; day < days; day += 1) {
    const date = new Date(start.getTime() + (day * 86_400_000)).toISOString().slice(0, 10);
    for (let slot = 1; slot <= threadsPerDay; slot += 1) {
      const draft = structuredClone(template);
      const hook = `Anicca tampak dalam rutinitas ${date}, slot ${slot}: keadaan berubah sebelum kita siap.`;
      draft.external_id = `rk-${date.replaceAll("-", "")}-0${slot}`;
      draft.publish_date = date;
      draft.slot = slot;
      draft.title = `Anicca ${date} Slot ${slot}`;
      draft.selected_hook = hook;
      draft.posts = draft.posts.slice(0, postsPerThread);
      draft.posts[0].text = hook;
      pack.drafts.push(draft);
    }
  }
  return pack;
}

function manifestOf(pack) {
  return {
    period_start: pack.period.start_date,
    period_end: pack.period.end_date,
    part_number: pack.part.number,
    part_total: pack.part.total,
    part_start: pack.part.start_date,
    part_end: pack.part.end_date,
    days_total_package: 30,
    threads_per_day: 5,
    drafts_total_package: 150,
    drafts_in_part: 30,
    posts_min_per_thread: 6,
    posts_max_per_thread: 8
  };
}

function databaseMustNotBeTouched() {
  return new Proxy({}, { get() { throw new Error("Database must not be touched."); } });
}

class FakeStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }
  bind(...bindings) { return new FakeStatement(this.database, this.sql, bindings); }
  first() { return this.database.first(this); }
  all() { return this.database.all(this); }
  run() { return this.database.execute(this); }
}

class FakeD1 {
  constructor({ schemaReady = true } = {}) {
    this.schemaReady = schemaReady;
    this.imports = [];
    this.packItems = [];
    this.topics = [];
    this.contentItems = [];
    this.activity = [];
    this.guards = [];
    this.batchSizes = [];
    this.batchFirstSql = [];
    this.queryCount = 0;
    this.execCalls = 0;
    this.race = null;
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async exec() { this.execCalls += 1; throw new Error("runtime DDL is forbidden"); }
  normalized(statement) { return statement.sql.replace(/\s+/g, " ").trim(); }

  async first(statement) {
    this.queryCount += 1;
    const sql = this.normalized(statement);
    if (sql.startsWith("SELECT COUNT(*) AS ready FROM brands")) {
      return { ready: this.schemaReady ? 1 : 0 };
    }
    if (sql.includes("AS ready") && sql.includes("FROM content_pack_")) {
      return { ready: this.schemaReady ? 1 : 0 };
    }
    if (sql.startsWith("SELECT id, name, slug, voice, status FROM brands")) return this.schemaReady ? { ...brand } : null;
    if (sql.includes("FROM content_pack_imports WHERE id = ?")) return this.imports.find((row) => row.id === statement.bindings[0]) ?? null;
    if (sql.includes("LEFT JOIN content_pack_commit_guards")) {
      const row = this.imports.find((item) => item.id === statement.bindings[0]);
      return row ? { status: row.status, expires_at: row.expires_at, summary_json: row.summary_json, guard_claimed: this.guards.includes(row.id) ? 1 : 0 } : null;
    }
    return null;
  }

  async all(statement) {
    this.queryCount += 1;
    const sql = this.normalized(statement);
    if (sql.includes("FROM sqlite_schema")) {
      if (!this.schemaReady) return { results: [] };
      return { results: [
        { type: "table", name: "content_pack_imports" },
        { type: "table", name: "content_pack_items" },
        { type: "table", name: "content_pack_commit_guards" },
        { type: "index", name: "idx_content_pack_imports_package" },
        { type: "index", name: "idx_content_pack_imports_status" },
        { type: "index", name: "idx_content_pack_items_date" },
        { type: "index", name: "idx_content_pack_items_import" }
      ] };
    }
    if (sql.includes("json_extract(payload_json") && sql.includes("FROM content_pack_imports")) {
      const [, packageId] = statement.bindings;
      const active = this.imports.filter((row) => row.namespace === "ruang-kalyanamitra" && row.package_id === packageId && ["pending", "committed"].includes(row.status)).slice(0, 101);
      return { results: active.map((row) => {
        let facts = {};
        if (row.payload_json) {
          const pack = JSON.parse(row.payload_json);
          facts = {
            period_start: pack.period?.start_date ?? null,
            period_end: pack.period?.end_date ?? null,
            manifest_part_number: pack.part?.number ?? null,
            manifest_part_total: pack.part?.total ?? null,
            part_start: pack.part?.start_date ?? null,
            part_end: pack.part?.end_date ?? null,
            days_total_package: pack.expected_counts?.days_total_package ?? null,
            threads_per_day: pack.expected_counts?.threads_per_day ?? null,
            drafts_total_package: pack.expected_counts?.drafts_total_package ?? null,
            drafts_in_part: pack.expected_counts?.drafts_in_this_part ?? null,
            posts_min_per_thread: pack.expected_counts?.posts_min_per_thread ?? null,
            posts_max_per_thread: pack.expected_counts?.posts_max_per_thread ?? null
          };
        } else {
          const summary = JSON.parse(row.summary_json || "{}");
          facts = {
            period_start: summary.manifest?.period_start ?? null,
            period_end: summary.manifest?.period_end ?? null,
            manifest_part_number: summary.manifest?.part_number ?? null,
            manifest_part_total: summary.manifest?.part_total ?? null,
            part_start: summary.manifest?.part_start ?? null,
            part_end: summary.manifest?.part_end ?? null,
            days_total_package: summary.manifest?.days_total_package ?? null,
            threads_per_day: summary.manifest?.threads_per_day ?? null,
            drafts_total_package: summary.manifest?.drafts_total_package ?? null,
            drafts_in_part: summary.manifest?.drafts_in_part ?? null,
            posts_min_per_thread: summary.manifest?.posts_min_per_thread ?? null,
            posts_max_per_thread: summary.manifest?.posts_max_per_thread ?? null
          };
        }
        return { id: row.id, package_revision: row.package_revision, part_number: row.part_number, part_total: row.part_total, ...facts };
      }) };
    }
    if (sql.includes("FROM content_pack_items WHERE namespace = ? AND package_id = ?")) {
      const [, packageId] = statement.bindings;
      return { results: this.packItems.filter((row) => row.package_id === packageId).slice(0, 241) };
    }
    if (sql.includes("FROM content_pack_items WHERE namespace = ? AND publish_date BETWEEN")) {
      const [, start, end] = statement.bindings;
      return { results: this.packItems.filter((row) => row.publish_date >= start && row.publish_date <= end).slice(0, 241) };
    }
    return { results: [] };
  }

  concurrentError(message, action) {
    const error = new Error(message);
    error.concurrentAction = action;
    return error;
  }

  async execute(statement) {
    this.queryCount += 1;
    const sql = this.normalized(statement);
    const values = statement.bindings;
    if (sql.startsWith("UPDATE content_pack_imports SET status = 'expired'") && sql.includes("WHERE id IN")) {
      const cutoff = values[0];
      const expired = this.imports.filter((row) => row.status === "pending" && row.expires_at <= cutoff).sort((a, b) => a.expires_at.localeCompare(b.expires_at)).slice(0, 25);
      for (const row of expired) Object.assign(row, { status: "expired", payload_json: null, confirmation_token_hash: null });
      return { success: true, meta: { changes: expired.length } };
    }
    if (sql.startsWith("UPDATE content_pack_imports SET status = 'expired'") && sql.includes("namespace = ?")) {
      for (const row of this.imports) {
        if (row.namespace === values[0] && row.package_id === values[1] && row.part_number === values[2] && row.admin_id === values[3] && row.status === "pending") Object.assign(row, { status: "expired", payload_json: null, confirmation_token_hash: null });
      }
      return { success: true };
    }
    if (sql.startsWith("UPDATE content_pack_imports SET status = 'expired'") && sql.includes("WHERE id = ?")) {
      const row = this.imports.find((item) => item.id === values[0] && item.status === "pending");
      if (row) Object.assign(row, { status: "expired", payload_json: null, confirmation_token_hash: null });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO content_pack_imports") && sql.includes("'pending'")) {
      this.imports.push({
        id: values[0], namespace: values[1], package_id: values[2], package_revision: values[3],
        part_number: values[4], part_total: values[5], file_hash: values[6], filename: values[7],
        payload_json: values[8], summary_json: values[9], admin_id: values[10], status: "pending",
        confirmation_token_hash: values[11], expires_at: values[12], created_at: new Date().toISOString(), confirmed_at: null
      });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO content_pack_imports") && sql.includes("NULL, ?, ?, 'rejected'")) {
      this.imports.push({
        id: values[0], namespace: values[1], package_id: values[2], package_revision: values[3],
        part_number: values[4], part_total: values[5], file_hash: values[6], filename: values[7],
        payload_json: null, summary_json: values[8], admin_id: values[9], status: "rejected",
        confirmation_token_hash: null, expires_at: null, created_at: new Date().toISOString(), confirmed_at: null
      });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO content_pack_commit_guards")) {
      const [importId] = values;
      const now = new Date().toISOString();
      const row = this.imports.find((item) => item.id === importId);
      if (this.race === "guard-expired") {
        throw this.concurrentError("guard lost to expiry", () => { const current = this.imports.find((item) => item.id === importId); if (current) current.status = "expired"; });
      }
      if (this.race === "guard-committed") {
        throw this.concurrentError("guard lost to commit", () => { const current = this.imports.find((item) => item.id === importId); if (current) current.status = "committed"; if (!this.guards.includes(importId)) this.guards.push(importId); });
      }
      if (!row || row.status !== "pending" || !row.expires_at || row.expires_at <= now || this.guards.includes(importId)) throw new Error("commit guard rejected");
      this.guards.push(importId);
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO topics")) {
      for (let index = 0; index < values.length; index += 5) this.topics.push({ id: values[index], brand_id: values[index + 1], title: values[index + 2], source_url: values[index + 3], metadata_json: values[index + 4] });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO content_items")) {
      for (let index = 0; index < values.length; index += 5) this.contentItems.push({ id: values[index], topic_id: values[index + 1], brand_id: values[index + 2], title: values[index + 3], body_json: values[index + 4], format: "thread", platform: "threads", status: "draft", version: 1 });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO content_pack_items")) {
      if (this.race === "slot-race") {
        const competitor = { namespace: values[0], package_id: "rk-competing-package", external_id: "rk-competing-external", publish_date: values[3], slot: values[4], content_fingerprint: "other", content_item_id: "competing-content", package_revision: 1, import_id: "competing-import" };
        throw this.concurrentError("date slot race", () => this.packItems.push(competitor));
      }
      for (let index = 0; index < values.length; index += 9) {
        const row = { namespace: values[index], package_id: values[index + 1], external_id: values[index + 2], publish_date: values[index + 3], slot: values[index + 4], content_fingerprint: values[index + 5], content_item_id: values[index + 6], package_revision: values[index + 7], import_id: values[index + 8] };
        if (this.packItems.some((item) => (item.namespace === row.namespace && item.package_id === row.package_id && item.external_id === row.external_id) || (item.namespace === row.namespace && item.publish_date === row.publish_date && item.slot === row.slot))) throw new Error("content pack ledger conflict");
        this.packItems.push(row);
      }
      return { success: true };
    }
    if (sql.startsWith("UPDATE content_pack_imports SET status = 'committed'")) {
      const row = this.imports.find((item) => item.id === values[1] && item.status === "pending");
      if (!row) throw new Error("pending import not found");
      Object.assign(row, { status: "committed", payload_json: null, confirmation_token_hash: null, summary_json: values[0], confirmed_at: new Date().toISOString() });
      return { success: true };
    }
    if (sql.startsWith("UPDATE content_pack_imports SET status = 'rejected'")) {
      const row = this.imports.find((item) => item.id === values[1] && item.status === "pending");
      if (row) Object.assign(row, { status: "rejected", payload_json: null, confirmation_token_hash: null, summary_json: values[0] });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO activity_logs")) {
      this.activity.push({ sql, values });
      return { success: true };
    }
    throw new Error(`Unhandled fake SQL: ${sql.slice(0, 180)}`);
  }

  async batch(statements) {
    this.batchSizes.push(statements.length);
    this.batchFirstSql.push(this.normalized(statements[0]));
    const snapshot = structuredClone({
      imports: this.imports,
      packItems: this.packItems,
      topics: this.topics,
      contentItems: this.contentItems,
      activity: this.activity,
      guards: this.guards
    });
    try {
      const results = [];
      for (const statement of statements) results.push(await this.execute(statement));
      return results;
    } catch (error) {
      Object.assign(this, snapshot);
      if (typeof error.concurrentAction === "function") error.concurrentAction();
      throw error;
    }
  }
}

function env(DB, overrides = {}) {
  return { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: admins, DB, ...overrides };
}

function dryRunRequest(pack, headers = {}) {
  return new Request(`${baseUrl}/api/content-packs/dry-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenClaw-Token": token,
      "X-Content-OS-Admin": "telegram:111111111",
      "X-Content-Pack-Filename": "month-part.content-pack.json",
      ...headers
    },
    body: JSON.stringify(pack)
  });
}

function confirmRequest(importId, confirmationToken) {
  return new Request(`${baseUrl}/api/content-packs/${importId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OpenClaw-Token": token, "X-Content-OS-Admin": "telegram:111111111" },
    body: JSON.stringify({ confirmation_token: confirmationToken })
  });
}

async function stage(DB, pack = validPack()) {
  const response = await worker.fetch(dryRunRequest(pack), env(DB));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

test("canonical 30-day package part passes exact topology and NFC fingerprints", async () => {
  const pack = validPack();
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(validation.stats, { drafts: 30, posts: 210, sources: 30, dates: 6 });
  assert.equal(validation.sourceReviewRequired, 30);
  const composed = { title: "mettá" };
  const decomposed = { title: "metta\u0301" };
  assert.equal(await fingerprintContentPackDraft(composed), await fingerprintContentPackDraft(decomposed));
});

test("single file accepts the requested 7 days x 7 threads x 6 posts topology", async () => {
  const pack = singleFilePack();
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(validation.stats, { drafts: 49, posts: 294, sources: 49, dates: 7 });

  const DB = new FakeD1();
  const dryRun = await stage(DB, pack);
  assert.equal(dryRun.parts_expected, 1);
  assert.equal(dryRun.valid, 49);
  assert.equal(dryRun.manifest.threads_per_day, 7);
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.created, 49);
  assert.equal(DB.contentItems.length, 49);
  assert.ok(Math.max(...DB.batchSizes) < 50);
});

test("single-file envelope is locked at 30 days x 8 threads", () => {
  const validation = validateContentPackDocument(singleFilePack(30, 8, 6));
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(validation.stats, { drafts: 240, posts: 1440, sources: 240, dates: 30 });
});

test("short assignment derives one part and fifteen drafts without operational writes", async () => {
  const pack = shortPack();
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(validation.stats, { drafts: 15, posts: 105, sources: 15, dates: 3 });
  assert.equal(validation.sourceReviewRequired, 15);

  const DB = new FakeD1();
  const dryRun = await stage(DB, pack);
  assert.equal(dryRun.parts_received, 1);
  assert.equal(dryRun.parts_expected, 1);
  assert.equal(dryRun.drafts_received, 15);
  assert.equal(dryRun.valid, 15);
  assert.equal(dryRun.ready_for_confirmation, true);
  assert.equal(dryRun.automatic_publish, false);
  assert.equal(dryRun.manifest.days_total_package, 3);
  assert.equal(dryRun.manifest.drafts_total_package, 15);
  assert.equal(dryRun.manifest.drafts_in_part, 15);
  assert.equal(DB.contentItems.length, 0);
});

test("topology, canonical identifiers, and deterministic six-day ranges fail closed", () => {
  const pack = validPack();
  pack.part.end_date = "2026-09-07";
  pack.expected_counts.days_total_package = 29;
  pack.package_id = ` ${pack.package_id}`;
  pack.drafts[0].external_id += " ";
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === "topology"));
  assert.ok(validation.errors.some((issue) => issue.code === "part-range"));
  assert.ok(validation.errors.some((issue) => issue.path === "$.package_id"));
  assert.ok(validation.errors.some((issue) => issue.path.endsWith("external_id")));
});

test("oversized draft arrays are rejected before traversing their entries", () => {
  const pack = validPack();
  const drafts = new Array(241);
  Object.defineProperty(drafts, 0, { get() { throw new Error("must not traverse oversized drafts"); } });
  pack.drafts = drafts;
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, false);
  assert.equal(validation.stats.drafts, 241);
  assert.ok(validation.errors.some((issue) => issue.code === "import-part-too-large"));
});

test("source collections and validation responses remain bounded", () => {
  const pack = validPack();
  pack.drafts[0].sources = Array.from({ length: 50 }, (_, index) => ({ ...pack.drafts[0].sources[0], source_id: `src-over-${index}`, url: "http://evil.example/source" }));
  for (const draft of pack.drafts) {
    draft.risk_flags = Array.from({ length: 100 }, (_, index) => `flag-${index}`);
    draft.posts[0].source_ids = Array.from({ length: 100 }, (_, index) => `src-ref-${index}`);
  }
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.length <= 64);
  assert.ok(validation.warnings.length <= 64);
  assert.ok(validation.errors.some((issue) => issue.path.includes("sources")));
});

test("adversarial property names cannot amplify validation responses", async () => {
  const pack = validPack();
  pack[`x${"y".repeat(500_000)}`] = true;
  for (let index = 0; index < 10_000; index += 1) pack[`unknown_${index}`] = index;
  const response = await worker.fetch(dryRunRequest(pack), env(databaseMustNotBeTouched()));
  const raw = await response.text();
  assert.equal(response.status, 422);
  assert.ok(Buffer.byteLength(raw, "utf8") < 32 * 1024, `response was ${Buffer.byteLength(raw, "utf8")} bytes`);
  assert.equal(JSON.parse(raw).code, "validation-failed");
});

test("oversized nested arrays are rejected before traversing their items", () => {
  const pack = validPack();
  const poisonedSources = new Array(9);
  Object.defineProperty(poisonedSources, 0, { get() { throw new Error("must not traverse oversized sources"); } });
  pack.drafts[0].sources = poisonedSources;
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.path === "$.drafts[0].sources" && issue.code === "max-items"));
});

test("approved providers require their canonical HTTPS domain or an official subdomain", () => {
  for (const url of ["http://suttacentral.net/mn118", "https://example.com/mn118", "https://suttacentral.net.evil.example/mn118"]) {
    const pack = validPack();
    pack.drafts[0].sources[0].url = url;
    const validation = validateContentPackDocument(pack);
    assert.equal(validation.ok, false, url);
    assert.ok(validation.errors.some((issue) => issue.path.endsWith(".url")), url);
  }

  const pack = validPack();
  pack.drafts[0].sources[0].provider_id = "tergar";
  pack.drafts[0].sources[0].url = "https://blog.tergar.org/blog/how-to-meditate/";
  const validation = validateContentPackDocument(pack);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test("dedicated token and exactly two numeric admin IDs are required before database access", async () => {
  for (const badEnv of [
    { OPENCLAW_INGRESS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: admins },
    { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: "100000001" },
    { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: "100000001,111111111" },
    { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: "100000001, invalid" },
    { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: "telegram:111111111,telegram:222222222" },
    { KALYANAMITRA_CONTENT_OS_TOKEN: token, KALYANAMITRA_IMPORT_ADMIN_IDS: " 111111111,222222222 " },
    { KALYANAMITRA_CONTENT_OS_TOKEN: ` ${token} `, KALYANAMITRA_IMPORT_ADMIN_IDS: admins }
  ]) {
    const response = await worker.fetch(dryRunRequest(validPack()), { ...badEnv, DB: databaseMustNotBeTouched() });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "importer-not-configured");
  }
});

test("schema readiness is read-only and fails closed without runtime DDL", async () => {
  const DB = new FakeD1({ schemaReady: false });
  const response = await worker.fetch(dryRunRequest(validPack()), env(DB));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "importer-schema-not-ready");
  assert.equal(DB.execCalls, 0);
  assert.equal(DB.imports.length, 0);
});

test("planning files are rejected before database access", async () => {
  const request = dryRunRequest(validPack(), { "X-Content-Pack-Filename": "ideas.idea-inbox.json" });
  const bodyObject = { schema_version: "kalyanamitra-idea-inbox.v1" };
  const response = await worker.fetch(new Request(request, { body: JSON.stringify(bodyObject) }), env(databaseMustNotBeTouched()));
  assert.equal(response.status, 415);
  assert.equal((await response.json()).code, "planning-only");
});

test("mixed revisions and phantom package part assignments are rejected", async () => {
  const packageId = "rk-history-threads-20260903";
  const existingPack = validPack(1, packageId, 1);
  for (const mutation of [
    (row) => { row.package_revision = 2; },
    (row) => { const summary = JSON.parse(row.summary_json); summary.manifest.part_number = 4; row.summary_json = JSON.stringify(summary); },
    (row) => { const summary = JSON.parse(row.summary_json); summary.manifest.threads_per_day = 4; row.summary_json = JSON.stringify(summary); }
  ]) {
    const DB = new FakeD1();
    const row = {
      id: crypto.randomUUID(), namespace: "ruang-kalyanamitra", package_id: packageId,
      package_revision: 1, part_number: 1, part_total: 5, payload_json: null,
      summary_json: JSON.stringify({ manifest: manifestOf(existingPack) }), admin_id: "telegram:111111111",
      status: "committed", expires_at: null, file_hash: "x", filename: "old.content-pack.json",
      confirmation_token_hash: null, created_at: new Date().toISOString(), confirmed_at: new Date().toISOString()
    };
    mutation(row);
    DB.imports.push(row);
    const response = await worker.fetch(dryRunRequest(validPack(2, packageId, 1)), env(DB));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "package-manifest-conflict");
  }
});

test("package manifest history is bounded and fails closed past 100 active records", async () => {
  const DB = new FakeD1();
  const pack = validPack();
  for (let index = 0; index < 101; index += 1) {
    DB.imports.push({
      id: crypto.randomUUID(), namespace: "ruang-kalyanamitra", package_id: pack.package_id,
      package_revision: 1, part_number: 1, part_total: 5, payload_json: JSON.stringify(pack),
      summary_json: "{}", admin_id: "telegram:111111111", status: "pending",
      expires_at: "2099-01-01T00:00:00.000Z", file_hash: "x", filename: "part.content-pack.json",
      confirmation_token_hash: "x", created_at: new Date().toISOString(), confirmed_at: null
    });
  }
  const response = await worker.fetch(dryRunRequest(pack), env(DB));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "package-history-too-large");
});

test("expired quarantine cleanup is capped at 25 rows per dry-run", async () => {
  const DB = new FakeD1();
  for (let index = 0; index < 40; index += 1) {
    DB.imports.push({ id: crypto.randomUUID(), namespace: "ruang-kalyanamitra", package_id: `rk-old-package-${String(index).padStart(6, "0")}`, package_revision: 1, part_number: 1, part_total: 5, payload_json: "large", summary_json: "{}", admin_id: "telegram:111111111", status: "pending", expires_at: "2020-01-01T00:00:00.000Z", file_hash: "x", filename: "old.content-pack.json", confirmation_token_hash: "x", created_at: new Date().toISOString(), confirmed_at: null });
  }
  await stage(DB, validPack(1, "rk-cleanup-threads-20260903"));
  assert.equal(DB.imports.filter((row) => row.status === "expired").length, 25);
  assert.equal(DB.imports.filter((row) => row.status === "pending").length, 16);
});

test("dry-run and confirmation atomically create 30 drafts with guard first and no publish path", async () => {
  const DB = new FakeD1();
  const dryRun = await stage(DB);
  assert.equal(dryRun.valid, 30);
  assert.equal(dryRun.source_review_required, 30);
  assert.equal(DB.contentItems.length, 0);
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.created, 30);
  assert.equal(DB.contentItems.length, 30);
  assert.equal(DB.packItems.length, 30);
  assert.match(DB.batchFirstSql.at(-1), /^INSERT INTO content_pack_commit_guards/);
  assert.ok(Math.max(...DB.batchSizes) < 50);
  assert.ok(DB.queryCount < 50, `query count was ${DB.queryCount}`);
  for (const item of DB.contentItems) {
    assert.equal(item.status, "draft");
    assert.equal(item.platform, "threads");
    const mapped = JSON.parse(item.body_json);
    assert.equal(mapped.publisherMode, "draft-only");
    assert.equal(mapped.automaticPublish, false);
    assert.equal(mapped.sourceReview.status, "needs-review");
    assert.ok(mapped.riskFlags.includes("source-review-required"));
  }
  assert.equal(DB.activity.some((entry) => entry.sql.includes("publisher")), false);
  assert.equal(DB.activity.some((entry) => entry.values.some((value) => typeof value === "string" && value.includes('"adminId"'))), false);
  assert.equal(DB.execCalls, 0);
});

test("uploaded human verification claims remain untrusted after mapping", async () => {
  const DB = new FakeD1();
  const pack = validPack();
  for (const draft of pack.drafts) {
    draft.source_review_status = "verified-by-human";
    draft.sources[0].verification_status = "verified-by-human";
    draft.sources[0].checked_at = "2026-09-02T10:00:00Z";
    draft.sources[0].checked_by = "Uploader";
  }
  const dryRun = await stage(DB, pack);
  assert.equal(dryRun.source_review_required, 30);
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  assert.equal(response.status, 200);
  const mapped = JSON.parse(DB.contentItems[0].body_json);
  assert.deepEqual(mapped.sourceReview, { status: "needs-review", requestedStatus: "verified-by-human", checkedAt: null, checkedBy: null });
  assert.equal(mapped.sources[0].canonicalVerificationStatus, "needs-review");
  assert.equal(mapped.sources[0].requestedVerificationStatus, "verified-by-human");
  assert.equal(mapped.sources[0].verificationStatus, "needs-review");
  assert.equal(mapped.sources[0].checkedAt, null);
  assert.equal(mapped.sources[0].checkedBy, null);
  assert.equal(mapped.canonicalDraft.source_review_status, "needs-review");
  assert.equal(mapped.canonicalDraft.sources[0].verification_status, "needs-review");
  assert.equal(mapped.canonicalDraft.sources[0].checked_at, null);
  assert.equal(mapped.canonicalDraft.sources[0].checked_by, null);
});

test("a consumed confirmation reconciles to deterministic 409", async () => {
  const DB = new FakeD1();
  const dryRun = await stage(DB);
  assert.equal((await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB))).status, 200);
  const repeated = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await repeated.json();
  assert.equal(repeated.status, 409);
  assert.equal(body.code, "confirmation-already-consumed");
  assert.equal(body.status, "committed");
  assert.equal(body.unchanged, true);
  assert.equal(body.automatic_publish, false);
  assert.equal(DB.contentItems.length, 30);
});

test("commit guard aborts a superseded or expired confirmation before operational inserts", async () => {
  const DB = new FakeD1();
  const dryRun = await stage(DB);
  DB.race = "guard-expired";
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await response.json();
  assert.equal(response.status, 410, JSON.stringify(body));
  assert.equal(body.code, "confirmation-expired");
  assert.equal(DB.topics.length, 0);
  assert.equal(DB.contentItems.length, 0);
  assert.equal(DB.packItems.length, 0);
});

test("commit guard reconciles a concurrent winner without duplicate rows", async () => {
  const DB = new FakeD1();
  const dryRun = await stage(DB);
  DB.race = "guard-committed";
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await response.json();
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.equal(body.code, "confirmation-already-consumed");
  assert.equal(DB.topics.length, 0);
  assert.equal(DB.contentItems.length, 0);
});

test("a concurrent date-slot loser is re-preflighted and leaves no partial operational rows", async () => {
  const DB = new FakeD1();
  const dryRun = await stage(DB);
  DB.race = "slot-race";
  const response = await worker.fetch(confirmRequest(dryRun.import_id, dryRun.confirmation_token), env(DB));
  const body = await response.json();
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.equal(body.code, "preflight-conflict");
  assert.equal(DB.topics.length, 0);
  assert.equal(DB.contentItems.length, 0);
  assert.equal(DB.packItems.length, 1, "only the independently committed competing row remains");
  assert.equal(DB.imports.find((row) => row.id === dryRun.import_id).status, "rejected");
});

test("dashboard exposes importer but no automatic publish route", async () => {
  const response = await worker.fetch(new Request(baseUrl + "/"), {});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="content-pack-import"/);
  assert.doesNotMatch(html, /\/api\/content-packs\/publish/);
});

test("Kalyanamitra thread draft resolves into editable Design Studio slides", () => {
  const draft = shortPack().drafts[0];
  const body = {
    title: draft.title,
    threadsPosts: draft.posts.map((post) => post.text),
    canonicalDraft: draft
  };
  const before = structuredClone(body);

  const slides = resolveContentSlides(body);

  assert.equal(slides.length, draft.posts.length);
  assert.deepEqual(slides.map((slide) => slide.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(slides[0].type, "hook");
  assert.equal(slides[0].headline, draft.title);
  assert.equal(slides[0].body, draft.posts[0].text);
  assert.equal(slides[1].headline, "Konteks");
  assert.equal(slides[1].body, draft.posts[1].text);
  assert.equal(slides[6].headline, "Ajakan");
  assert.deepEqual(body, before, "normalization must not mutate stored draft JSON");
});

test("native carousel slides remain unchanged", () => {
  const nativeSlides = Array.from({ length: 5 }, (_, index) => ({
    number: index + 1,
    type: index === 0 ? "hook" : "body",
    headline: `Judul ${index + 1}`,
    body: `Isi ${index + 1}`
  }));

  assert.deepEqual(resolveContentSlides({ carousel: { slides: nativeSlides } }), nativeSlides);
});

function editableKalyanamitraBody() {
  const roles = ["hook", "context", "dharma-lens", "application", "reflection", "cta"];
  const texts = roles.map((role, index) => "Teks awal " + (index + 1) + " untuk " + role + ".");
  return {
    title: "Judul Awal",
    hook: texts[0],
    threadsPosts: texts,
    cta: texts[5],
    contentStatus: "draft",
    publisherMode: "draft-only",
    automaticPublish: false,
    humanApprovalRequired: true,
    riskFlags: ["source-review-required", "do-not-publish"],
    sources: [{ sourceId: "src-1", title: "Sumber tetap" }],
    metadata: {
      namespace: "ruang-kalyanamitra",
      externalId: "rk-20260907-01",
      automaticPublish: false,
      publisherMode: "draft-only",
      humanApprovalRequired: true
    },
    canonicalDraft: {
      title: "Judul Awal",
      selected_hook: texts[0],
      sources: [{ source_id: "src-1", title: "Sumber tetap" }],
      posts: roles.map((role, index) => ({
        sequence: index + 1,
        role,
        text: texts[index],
        source_ids: index === 2 ? ["src-1"] : []
      }))
    }
  };
}

test("draft editor synchronizes Kalyanamitra projections without weakening safety metadata", () => {
  const original = editableKalyanamitraBody();
  const before = structuredClone(original);
  const slides = resolveContentSlides(original).map((slide) => ({
    number: slide.number,
    headline: slide.headline,
    body: "Teks revisi " + slide.number + "."
  }));
  const updated = JSON.parse(applyDraftContentEdit(JSON.stringify(original), "Judul Revisi", slides));

  assert.deepEqual(original, before, "pure editor must not mutate caller input");
  assert.equal(updated.title, "Judul Revisi");
  assert.deepEqual(updated.threadsPosts, slides.map((slide) => slide.body));
  assert.equal(updated.hook, slides[0].body);
  assert.equal(updated.cta, slides[5].body);
  assert.equal(updated.canonicalDraft.title, "Judul Revisi");
  assert.equal(updated.canonicalDraft.selected_hook, slides[0].body);
  assert.deepEqual(updated.canonicalDraft.posts.map((post) => post.text), slides.map((slide) => slide.body));
  assert.deepEqual(updated.sources, before.sources);
  assert.deepEqual(updated.canonicalDraft.sources, before.canonicalDraft.sources);
  assert.equal(updated.publisherMode, "draft-only");
  assert.equal(updated.automaticPublish, false);
  assert.equal(updated.humanApprovalRequired, true);
  assert.ok(updated.riskFlags.includes("do-not-publish"));
});

class DraftEditorStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }
  bind(...bindings) { return new DraftEditorStatement(this.database, this.sql, bindings); }
  first() { return this.database.first(this); }
}

class DraftEditorD1 {
  constructor(content) {
    this.content = content;
    this.renderJobs = [
      { id: "render-old", content_item_id: content.id, status: "completed", error_message: null }
    ];
    this.activity = [];
  }
  prepare(sql) { return new DraftEditorStatement(this, sql); }
  async first(statement) {
    const sql = statement.sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT id, title, status, body_json, format, platform, version, updated_at FROM content_items")) {
      return statement.bindings[0] === this.content.id ? { ...this.content } : null;
    }
    return null;
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const sql = statement.sql.replace(/\s+/g, " ").trim();
      let changes = 0;
      if (sql.startsWith("UPDATE content_items SET title = ?")) {
        const [title, bodyJson, id, expectedVersion] = statement.bindings;
        if (
          id === this.content.id &&
          expectedVersion === this.content.version &&
          ["draft", "review"].includes(this.content.status)
        ) {
          this.content = {
            ...this.content,
            title,
            body_json: bodyJson,
            status: "draft",
            version: this.content.version + 1,
            updated_at: "2026-09-07 01:00:00"
          };
          changes = 1;
        }
      } else if (sql.startsWith("UPDATE render_jobs SET status = 'cancelled'")) {
        const [contentId, rowId, version, requestId] = statement.bindings;
        const marker = JSON.parse(this.content.body_json)._contentEditor;
        if (
          contentId === this.content.id &&
          rowId === this.content.id &&
          version === this.content.version &&
          marker?.requestId === requestId
        ) {
          for (const job of this.renderJobs) {
            if (job.content_item_id === contentId && ["queued", "running", "completed"].includes(job.status)) {
              job.status = "cancelled";
              job.error_message = "Dibatalkan otomatis karena isi draft diedit.";
              changes += 1;
            }
          }
        }
      } else if (sql.startsWith("INSERT INTO activity_logs")) {
        const [entityId, metadataJson, rowId, version, requestId] = statement.bindings;
        const marker = JSON.parse(this.content.body_json)._contentEditor;
        if (
          entityId === this.content.id &&
          rowId === this.content.id &&
          version === this.content.version &&
          marker?.requestId === requestId
        ) {
          this.activity.push({
            event_type: "content.edited",
            entity_id: entityId,
            metadata: JSON.parse(metadataJson)
          });
          changes = 1;
        }
      }
      results.push({ meta: { changes } });
    }
    return results;
  }
}

test("draft edit endpoint versions atomically, cancels stale render, audits, and rejects stale clients", async () => {
  const contentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const DB = new DraftEditorD1({
    id: contentId,
    title: "Judul Awal",
    status: "draft",
    body_json: JSON.stringify(editableKalyanamitraBody()),
    format: "thread",
    platform: "threads",
    version: 1,
    updated_at: "2026-09-07 00:30:56"
  });

  const readResponse = await worker.fetch(new Request(baseUrl + "/api/content/" + contentId + "/draft"), { DB });
  assert.equal(readResponse.status, 200);
  const readBody = await readResponse.json();
  assert.equal(readBody.content.version, 1);
  assert.equal(readBody.content.slides.length, 6);
  assert.equal(readBody.content.sourceKind, "threads");
  assert.equal(readBody.content.slides[0].headlineEditable, false);

  const editedSlides = readBody.content.slides.map((slide) => ({
    number: slide.number,
    headline: slide.headline,
    body: slide.body + " Diperbaiki."
  }));
  const payload = {
    expectedVersion: 1,
    title: "Judul Revisi",
    slides: editedSlides
  };
  const editResponse = await worker.fetch(new Request(baseUrl + "/api/content/" + contentId + "/draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }), { DB });
  const editBody = await editResponse.json();
  assert.equal(editResponse.status, 200, JSON.stringify(editBody));
  assert.equal(editBody.content.version, 2);
  assert.equal(editBody.content.status, "draft");
  assert.equal(editBody.render_invalidated, 1);
  assert.equal(editBody.publisher_mode, "draft-only");
  assert.equal(editBody.automatic_publish, false);
  assert.equal(editBody.human_approval_required, true);
  assert.equal(DB.renderJobs[0].status, "cancelled");
  assert.equal(DB.activity.length, 1);
  assert.equal(DB.activity[0].metadata.previousVersion, 1);
  assert.equal(DB.activity[0].metadata.version, 2);

  const staleResponse = await worker.fetch(new Request(baseUrl + "/api/content/" + contentId + "/draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }), { DB });
  const staleBody = await staleResponse.json();
  assert.equal(staleResponse.status, 409);
  assert.equal(staleBody.code, "version-conflict");
  assert.equal(DB.activity.length, 1);
});
