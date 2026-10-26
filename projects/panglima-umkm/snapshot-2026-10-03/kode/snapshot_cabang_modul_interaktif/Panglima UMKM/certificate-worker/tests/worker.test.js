"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "worker.js"), "utf8");
const participantId = "e03d4157-07c1-440f-80a7-340f876faadc";
const deviceId = "a".repeat(64);

function sessionToken(pid = participantId, expires = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ pid, exp: expires })).toString("base64url");
  return payload + ".opaque-session-signature";
}

async function licenseHash(rawDeviceId) {
  return Buffer.from(await crypto.webcrypto.subtle.digest(
    "SHA-256", new TextEncoder().encode("panglima-device-license-v1:" + rawDeviceId)
  )).toString("hex");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function mockCertificateDatabase() {
  const completions = new Map();
  const limits = new Map();
  const events = [];
  return {
    completions,
    events,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.startsWith("INSERT INTO certificate_rate_limits")) {
            const [scope, day, limit] = this.args;
            const key = scope + ":" + day;
            const next = (limits.get(key) || 0) + 1;
            if (next > limit) return null;
            limits.set(key, next);
            return { attempts: next };
          }
          if (sql.includes("FROM certificate_completions WHERE participant_id")) {
            return completions.get(this.args[0]) || null;
          }
          throw new Error("Unsupported first SQL: " + sql);
        },
        async all() {
          if (sql.includes("FROM certificate_completions")) return { results: Array.from(completions.values()) };
          throw new Error("Unsupported all SQL: " + sql);
        },
        async run() {
          if (sql.startsWith("INSERT INTO certificate_completions")) {
            const [pid, owner, email, business, completionDate, diagnosisAnswered, diagnosisTotal,
              actionsCompleted, actionsTotal, submittedAt, updatedAt] = this.args;
            const current = completions.get(pid);
            completions.set(pid, Object.assign({
              participant_id: pid,
              owner_name: owner,
              email,
              business_name: business,
              completion_date: current ? current.completion_date : completionDate,
              diagnosis_answered: diagnosisAnswered,
              diagnosis_total: diagnosisTotal,
              actions_completed: actionsCompleted,
              actions_total: actionsTotal,
              status: current && current.status !== "rejected" ? current.status : "pending",
              mentor_notes: current ? current.mentor_notes : "",
              submitted_at: current ? current.submitted_at : submittedAt,
              updated_at: updatedAt,
              verified_at: current ? current.verified_at : null,
              rejected_at: current && current.status !== "rejected" ? current.rejected_at : null,
              dispatched_at: current ? current.dispatched_at : null,
              dispatch_error: current ? current.dispatch_error : "",
              dispatch_attempts: current ? current.dispatch_attempts : 0
            }));
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT INTO certificate_events")) {
            events.push(this.args);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE certificate_completions SET status = 'verified'")) {
            const [notes, verifiedAt, updatedAt, pid] = this.args;
            Object.assign(completions.get(pid), {
              status: "verified", mentor_notes: notes, verified_at: verifiedAt,
              rejected_at: null, updated_at: updatedAt
            });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE certificate_completions SET dispatched_at = ?, dispatch_error = ''")) {
            const [dispatchedAt, updatedAt, pid] = this.args;
            const row = completions.get(pid);
            Object.assign(row, {
              dispatched_at: dispatchedAt,
              dispatch_error: "",
              dispatch_attempts: row.dispatch_attempts + 1,
              updated_at: updatedAt
            });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE certificate_completions SET dispatch_error = ?")) {
            const [error, updatedAt, pid] = this.args;
            const row = completions.get(pid);
            Object.assign(row, { dispatch_error: error, dispatch_attempts: row.dispatch_attempts + 1, updated_at: updatedAt });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE certificate_completions SET status = 'rejected'")) {
            const [notes, rejectedAt, updatedAt, pid] = this.args;
            Object.assign(completions.get(pid), {
              status: "rejected", mentor_notes: notes, rejected_at: rejectedAt,
              verified_at: null, dispatched_at: null, updated_at: updatedAt
            });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE certificate_completions SET dispatched_at = NULL")) {
            completions.get(this.args[0]).dispatched_at = null;
            return { meta: { changes: 1 } };
          }
          throw new Error("Unsupported run SQL: " + sql);
        }
      };
    }
  };
}

async function createHarness(options = {}) {
  const module = { exports: {} };
  const webhookCalls = [];
  const certifierCalls = [];
  const certificateDb = mockCertificateDatabase();
  const context = vm.createContext({
    module,
    Request,
    Response,
    Headers,
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Intl,
    Date,
    crypto: crypto.webcrypto,
    atob,
    console,
    fetch: async (url, init = {}) => {
      if (String(url).startsWith("https://api.certifier.io/")) {
        certifierCalls.push({ url: String(url), init });
        if (String(url).endsWith("/v1/credentials/search")) {
          const row = certificateDb.completions.get(participantId);
          return json({
            data: options.certifierCredentials || [{
              id: "01m0pcertificate00000000001",
              publicId: "65b8cc52-7f56-4439-8e3a-d56f2d67ec9b",
              groupId: "01m0paggvpqnk4nm0azvbzg9r2",
              status: "issued",
              issueDate: row && row.completion_date,
              recipient: { name: "Rio", email: "rio@example.com" },
              createdAt: "2026-08-24T05:00:00.000Z"
            }]
          });
        }
        if (/\/v1\/credentials\/[^/]+\/designs$/.test(String(url))) {
          return json(options.certifierDesigns || [{
            id: "01m0pafxxjfjpxp52r0macd28w",
            name: "Panglima",
            previews: [
              { format: "png", url: "https://cdn.certifier.io/previews/panglima.png" },
              { format: "pdf", url: "https://cdn.certifier.io/previews/panglima.pdf" }
            ]
          }]);
        }
        return json({ message: "not found" }, 404);
      }
      webhookCalls.push({ url, body: JSON.parse(init.body) });
      return json({ ok: true });
    }
  });
  vm.runInContext(source.replace("export default {", "module.exports = {"), context, { filename: "worker.js" });
  const storedHash = await licenseHash(deviceId);
  const deviceDb = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (!sql.includes("FROM panglima_device_licenses")) throw new Error("Unsupported device SQL");
          if (this.args[0] !== participantId) return null;
          return {
            participant_id: participantId,
            device_hash: storedHash,
            owner_name: "Rio",
            business_name: "Maquina Art Course",
            email: options.email === undefined ? "rio@example.com" : options.email
          };
        }
      };
    }
  };
  const core = {
    async fetch(request) {
      return request.headers.get("authorization") === "Bearer correct-admin"
        ? json({ ok: true, participants: [] })
        : json({ ok: false }, 401);
    }
  };
  const env = {
    CERTIFICATE_DB: certificateDb,
    PANGLIMA_DEVICE_DB: deviceDb,
    PANGLIMA_CORE: core,
    CERTIFICATE_WEBHOOK_URL: options.webhook ? "https://script.google.com/macros/s/example/exec" : "",
    CERTIFICATE_WEBHOOK_SECRET: options.webhook ? "x".repeat(32) : "",
    CERTIFIER_API_TOKEN: options.certifier ? "certifier-test-token-1234567890" : "",
    CERTIFIER_GROUP_ID: "01m0paggvpqnk4nm0azvbzg9r2"
  };
  const waits = [];
  const ctx = { waitUntil(promise) { waits.push(promise); } };
  function request(pathname, body, headers = {}) {
    return new Request("https://certificate.example" + pathname, {
      method: body === undefined ? "GET" : "POST",
      headers: Object.assign(body === undefined ? {} : { "content-type": "application/json" }, headers),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  return { worker: module.exports, env, ctx, waits, request, certificateDb, webhookCalls, certifierCalls };
}

function completionBody(overrides = {}) {
  return Object.assign({
    sessionToken: sessionToken(),
    deviceId,
    diagnosis: { answered: 40, total: 40 },
    actions: { completed: 24, total: 30 }
  }, overrides);
}

test("health menegaskan layanan terpisah dan tidak terhubung ke affiliate", async () => {
  const app = await createHarness();
  const result = await app.worker.fetch(app.request("/health"), app.env, app.ctx);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).certificateEligibility, { diagnosis: "40/40", actionsMinimum: "24/30" });
  assert.doesNotMatch(source, /panglima-lynk-webhook|PANGLIMA_AFFILIATE|AFFILIATE_DB|COMMISSION_DB/i);
});

test("halaman verifikasi publik menyediakan formulir aman tanpa mengakses data peserta", async () => {
  const app = await createHarness({ webhook: true });
  const result = await app.worker.fetch(app.request("/verifikasi"), app.env, app.ctx);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /^text\/html/);
  assert.match(result.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(result.headers.get("content-security-policy"), /form-action 'self'/);
  const html = await result.text();
  assert.match(html, /Verifikasi Sertifikat/);
  assert.match(html, /name="id"/);
  assert.match(html, /Certifier \/ Credsverse/);
  assert.equal(app.certificateDb.completions.size, 0);
  assert.equal(app.webhookCalls.length, 0);
});

test("Credential ID valid diarahkan hanya ke halaman resmi Certifier", async () => {
  const app = await createHarness();
  const credentialId = "A04C6D99-0E49-4C85-98FE-A2F7B432F32D";
  const result = await app.worker.fetch(app.request("/verifikasi?id=" + credentialId), app.env, app.ctx);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "https://credsverse.com/credentials/" + credentialId.toLowerCase());
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  assert.equal(app.certificateDb.completions.size, 0);
  assert.equal(app.webhookCalls.length, 0);
});

test("Credential ID berbahaya ditolak tanpa redirect atau kebocoran konten", async () => {
  const app = await createHarness({ webhook: true });
  const input = encodeURIComponent("<script>alert(1)</script>https://jahat.example");
  const result = await app.worker.fetch(app.request("/verifikasi?id=" + input), app.env, app.ctx);
  assert.equal(result.status, 400);
  assert.equal(result.headers.get("location"), null);
  const html = await result.text();
  assert.match(html, /Credential ID belum sesuai/);
  assert.doesNotMatch(html, /jahat\.example|<script>/);
  assert.equal(app.certificateDb.completions.size, 0);
  assert.equal(app.webhookCalls.length, 0);
});

test("penyelesaian sah dicatat pending dengan tanggal server dan identitas PRE-TEST", async () => {
  const app = await createHarness();
  const result = await app.worker.fetch(app.request("/v1/completion", completionBody()), app.env, app.ctx);
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.certificate.status, "pending");
  assert.match(payload.certificate.completionDate, /^\d{4}-\d{2}-\d{2}$/);
  const stored = app.certificateDb.completions.get(participantId);
  assert.equal(stored.owner_name, "Rio");
  assert.equal(stored.email, "rio@example.com");
  assert.equal(stored.actions_completed, 24);
});

test("progres belum 80 persen ditolak dan tidak mencatat sertifikat", async () => {
  const app = await createHarness();
  const result = await app.worker.fetch(app.request("/v1/completion", completionBody({
    diagnosis: { answered: 40, total: 40 },
    actions: { completed: 23, total: 30 }
  })), app.env, app.ctx);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, "NOT_ELIGIBLE");
  assert.equal(app.certificateDb.completions.size, 0);
});

test("perangkat berbeda dan email PRE-TEST kosong gagal aman", async () => {
  const wrongDevice = await createHarness();
  const rejected = await wrongDevice.worker.fetch(wrongDevice.request("/v1/completion", completionBody({ deviceId: "b".repeat(64) })), wrongDevice.env, wrongDevice.ctx);
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, "DEVICE_LOCKED");

  const noEmail = await createHarness({ email: "" });
  const missing = await noEmail.worker.fetch(noEmail.request("/v1/completion", completionBody()), noEmail.env, noEmail.ctx);
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, "EMAIL_MISSING");
});

test("hanya admin sah dapat memverifikasi dan baris approve dikirim tepat sekali", async () => {
  const app = await createHarness({ webhook: true });
  await app.worker.fetch(app.request("/v1/completion", completionBody()), app.env, app.ctx);
  await Promise.all(app.waits.splice(0));
  assert.equal(app.webhookCalls[0].body.event, "stage");

  const denied = await app.worker.fetch(app.request("/v1/admin/verify", {
    participantId, mentorNotes: "Layak"
  }), app.env, app.ctx);
  assert.equal(denied.status, 401);

  const headers = { authorization: "Bearer correct-admin" };
  const verified = await app.worker.fetch(app.request("/v1/admin/verify", {
    participantId, mentorNotes: "Layak"
  }, headers), app.env, app.ctx);
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).dispatch.status, "sent");
  assert.equal(app.webhookCalls[1].body.event, "approve");
  assert.equal(app.webhookCalls[1].body.tanggalSelesai, app.certificateDb.completions.get(participantId).completion_date);

  const again = await app.worker.fetch(app.request("/v1/admin/verify", {
    participantId, mentorNotes: "Layak"
  }, headers), app.env, app.ctx);
  assert.equal((await again.json()).dispatch.status, "already_dispatched");
  assert.equal(app.webhookCalls.filter(call => call.body.event === "approve").length, 1);
});

test("PDF sertifikat hanya diberikan setelah verifikasi, dispatch, dan pencocokan Certifier", async () => {
  const app = await createHarness({ webhook: true, certifier: true });
  await app.worker.fetch(app.request("/v1/completion", completionBody()), app.env, app.ctx);
  await Promise.all(app.waits.splice(0));
  await app.worker.fetch(app.request("/v1/admin/verify", {
    participantId, mentorNotes: "Layak"
  }, { authorization: "Bearer correct-admin" }), app.env, app.ctx);

  const result = await app.worker.fetch(app.request("/v1/certificate", {
    sessionToken: sessionToken(), deviceId
  }), app.env, app.ctx);
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.certificate.status, "issued");
  assert.equal(payload.certificate.format, "pdf");
  assert.equal(payload.certificate.url, "https://cdn.certifier.io/previews/panglima.pdf");
  assert.equal(app.certifierCalls.length, 2);
  assert.equal(app.certifierCalls[0].init.headers.get("authorization"), "Bearer certifier-test-token-1234567890");
  const filter = JSON.parse(app.certifierCalls[0].init.body).filter.AND;
  assert.deepEqual(filter[0], { groupId: { equals: "01m0paggvpqnk4nm0azvbzg9r2" } });
  assert.deepEqual(filter[2], { recipient: { email: { equals: "rio@example.com" } } });
  assert.deepEqual(filter[3], { issueDate: { equals: app.certificateDb.completions.get(participantId).completion_date } });
});

test("sertifikat pending atau perangkat berbeda tidak pernah memanggil Certifier", async () => {
  const pending = await createHarness({ certifier: true });
  await pending.worker.fetch(pending.request("/v1/completion", completionBody()), pending.env, pending.ctx);
  const notReady = await pending.worker.fetch(pending.request("/v1/certificate", {
    sessionToken: sessionToken(), deviceId
  }), pending.env, pending.ctx);
  assert.equal(notReady.status, 409);
  assert.equal((await notReady.json()).code, "CERTIFICATE_NOT_READY");
  assert.equal(pending.certifierCalls.length, 0);

  const wrongDevice = await createHarness({ certifier: true });
  const denied = await wrongDevice.worker.fetch(wrongDevice.request("/v1/certificate", {
    sessionToken: sessionToken(), deviceId: "b".repeat(64)
  }), wrongDevice.env, wrongDevice.ctx);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "DEVICE_LOCKED");
  assert.equal(wrongDevice.certifierCalls.length, 0);
});
