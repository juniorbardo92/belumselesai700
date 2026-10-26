"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "security-worker", "worker.js"), "utf8");
const participantIds = {
  rio: "e03d4157-07c1-440f-80a7-340f876faadc",
  vita: "5bccd26c-9df7-4ab3-9175-5b33ce5903aa",
  affiliate: "3bece0ae-3bcc-4355-aaf1-35c70578c14b"
};
const devices = { first: "a".repeat(64), second: "b".repeat(64) };

function sessionToken(participantId, expires = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ pid: participantId, exp: expires })).toString("base64url");
  return payload + ".test-signature";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function mockDatabase(profiles = []) {
  const profileRows = new Map(profiles.map(item => [item.participant_id, Object.assign({}, item)]));
  const licenseRows = new Map();

  return {
    profiles: profileRows,
    licenses: licenseRows,
    prepare(sql) {
      const statement = {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (sql.startsWith("SELECT owner_name, business_name, business_type, source FROM panglima_pretest_profiles")) {
            return profileRows.get(this.args[0]) || null;
          }
          if (sql.startsWith("SELECT participant_id, device_hash, owner_name, business_name, business_type FROM panglima_device_licenses")) {
            return licenseRows.get(this.args[0]) || null;
          }
          if (sql.startsWith("INSERT INTO panglima_device_licenses")) {
            const [participant_id, device_hash, owner_name, business_name, business_type, profile_source, activated_at, last_seen_at] = this.args;
            const current = licenseRows.get(participant_id);
            if (current && current.device_hash !== device_hash) return null;
            licenseRows.set(participant_id, {
              participant_id,
              device_hash,
              owner_name,
              business_name,
              business_type,
              profile_source,
              activated_at: current ? current.activated_at : activated_at,
              last_seen_at
            });
            return { participant_id };
          }
          throw new Error("Mock first SQL unsupported: " + sql);
        },
        async all() {
          if (sql.includes("FROM panglima_pretest_profiles")) return { results: Array.from(profileRows.values()) };
          if (sql.includes("FROM panglima_device_licenses")) return { results: Array.from(licenseRows.values()) };
          throw new Error("Mock all SQL unsupported: " + sql);
        },
        async run() {
          if (sql.startsWith("UPDATE panglima_device_licenses SET last_seen_at")) {
            const [last_seen_at, participantId, hash] = this.args;
            const row = licenseRows.get(participantId);
            if (!row || row.device_hash !== hash) return { meta: { changes: 0 } };
            row.last_seen_at = last_seen_at;
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE FROM panglima_device_licenses")) {
            return { meta: { changes: licenseRows.delete(this.args[0]) ? 1 : 0 } };
          }
          if (sql.startsWith("INSERT INTO panglima_pretest_profiles")) {
            const [participant_id, owner_name, business_name, business_type, email, created_at, updated_at] = this.args;
            const current = profileRows.get(participant_id);
            profileRows.set(participant_id, {
              participant_id,
              owner_name,
              business_name,
              business_type,
              email,
              source: "pretest",
              created_at: current ? current.created_at : created_at,
              updated_at
            });
            return { meta: { changes: 1 } };
          }
          throw new Error("Mock run SQL unsupported: " + sql);
        }
      };
      return statement;
    }
  };
}

function createHarness() {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    Request,
    Response,
    Headers,
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    crypto: crypto.webcrypto,
    atob,
    console
  });
  vm.runInContext(source.replace("export default {", "module.exports = {"), context, {
    filename: "security-worker/worker.js"
  });

  const participantList = [
    { id: participantIds.rio, owner: "Rio", business: "Maquina Art Course" },
    { id: participantIds.vita, owner: "Vita", business: "Azka Prayatna" },
    { id: participantIds.affiliate, owner: "Gan Seng Liong", business: "Affiliate Panglima UMKM" }
  ];
  const database = mockDatabase([{
    participant_id: participantIds.rio,
    owner_name: "Rio",
    business_name: "Maquina Art Course",
    business_type: "Les menggambar",
    email: "user_f88f8fbc@example.invalid",
    source: "pretest"
  }, {
    participant_id: participantIds.vita,
    owner_name: "Vita",
    business_name: "Azka Prayatna",
    business_type: "Jasa Event Organizer",
    email: "user_bea4c363@example.invalid",
    source: "pretest"
  }]);
  const calls = [];

  const core = {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/v1/admin/participants") {
        if (request.headers.get("authorization") !== "Bearer correct-admin") {
          return json({ ok: false, code: "ADMIN_UNAUTHORIZED", message: "Token admin tidak sesuai." }, 401);
        }
        return json({ ok: true, participants: participantList });
      }

      const body = await request.json();
      calls.push({ pathname, body, ip: request.headers.get("cf-connecting-ip") });
      if (pathname === "/v1/activate") {
        const participant = body.accessCode === "PANGLIMA-RIO-2026"
          ? participantList[0]
          : body.accessCode === "PANGLIMA-VITA-2026"
            ? participantList[1]
            : body.accessCode === "PANGLIMA-AFFILIATE-2026"
              ? participantList[2]
              : null;
        if (!participant) return json({ ok: false, code: "INVALID_CODE", message: "Kode akses belum sesuai." }, 401);
        return json({
          ok: true,
          sessionToken: sessionToken(participant.id),
          participant: { owner: participant.owner, business: participant.business, dailyLimit: 3, remainingToday: 2 }
        });
      }
      if (pathname === "/v1/consultation") {
        return json({ ok: true, result: { title: "Saran AI" }, quota: { dailyLimit: 3, remainingToday: 1 } });
      }
      return json({ ok: false }, 404);
    }
  };

  const env = { PANGLIMA_CORE: core, PANGLIMA_DEVICE_DB: database };

  function request(pathname, body, options = {}) {
    return new Request("https://panglima-device-api.example" + pathname, {
      method: options.method || "POST",
      headers: Object.assign({ "content-type": "application/json" }, options.headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  return { worker: module.exports, env, database, calls, participantList, request };
}

test("Worker pengaman terpisah melaporkan status sehat tanpa menghubungi affiliate", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(new Request("https://secure.example/health"), app.env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    ok: true,
    service: "panglima-device-api",
    ready: true,
    oneDevicePerParticipant: true,
    affiliateConnected: false
  });
  assert.doesNotMatch(source, /panglima-lynk-webhook|PANGLIMA_APP_DB|access_code_hash/);
});

test("aktivasi menolak request tanpa identitas perangkat sebelum memanggil Worker lama", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/activate", { accessCode: "PANGLIMA-RIO-2026" }), app.env);
  assert.equal(result.status, 400);
  assert.equal((await result.json()).code, "DEVICE_REQUIRED");
  assert.equal(app.calls.length, 0);
});

test("profil Rio diambil dari PRE-TEST dan perangkat pertama dikunci secara atomik", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first
  }, { headers: { "cf-connecting-ip": "203.0.113.7" } }), app.env);
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.deepEqual(payload.participant, {
    owner: "Rio",
    business: "Maquina Art Course",
    type: "Les menggambar",
    profileSource: "pretest",
    deviceBound: true,
    dailyLimit: 3,
    remainingToday: 2
  });
  assert.equal(app.database.licenses.size, 1);
  assert.notEqual(app.database.licenses.get(participantIds.rio).device_hash, devices.first);
  assert.equal(app.calls[0].ip, "203.0.113.7");
  assert.equal(app.calls[0].body.deviceId, undefined);
});

test("peserta dapat mengaktivasi ulang kode yang sama pada perangkat yang sudah terdaftar", async () => {
  const app = createHarness();
  const body = { accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first };
  const first = await app.worker.fetch(app.request("/v1/activate", body), app.env);
  const next = await app.worker.fetch(app.request("/v1/activate", body), app.env);
  assert.equal(first.status, 200);
  assert.equal(next.status, 200);
  assert.equal(app.database.licenses.size, 1);
});

test("perangkat kedua ditolak dan token sesi tidak dibocorkan", async () => {
  const app = createHarness();
  await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first
  }), app.env);
  const rejected = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.second
  }), app.env);
  const body = await rejected.json();
  assert.equal(rejected.status, 403);
  assert.equal(body.code, "DEVICE_LOCKED");
  assert.equal(body.sessionToken, undefined);
  assert.equal(app.database.licenses.size, 1);
});

test("token sesi yang disalin ke perangkat lain tidak dapat dipakai untuk konsultasi AI", async () => {
  const app = createHarness();
  const activated = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first
  }), app.env);
  const { sessionToken: token } = await activated.json();
  const rejected = await app.worker.fetch(app.request("/v1/consultation", {
    sessionToken: token, deviceId: devices.second, question: "Bagaimana menambah jumlah murid?"
  }), app.env);
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, "DEVICE_LOCKED");
  assert.equal(app.calls.filter(item => item.pathname === "/v1/consultation").length, 0);
});

test("konsultasi AI memakai identitas PRE-TEST resmi meskipun profil client dimanipulasi", async () => {
  const app = createHarness();
  const activated = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first
  }), app.env);
  const { sessionToken: token } = await activated.json();
  const result = await app.worker.fetch(app.request("/v1/consultation", {
    sessionToken: token,
    deviceId: devices.first,
    question: "Bagaimana menambah jumlah murid?",
    context: { profile: { owner: "Orang Lain", business: "Usaha Palsu", type: "Palsu", goal: "target" } }
  }), app.env);
  assert.equal(result.status, 200);
  const sent = app.calls.find(item => item.pathname === "/v1/consultation").body.context.profile;
  assert.deepEqual(sent, { owner: "Rio", business: "Maquina Art Course", type: "Les menggambar", goal: "target" });
});

test("akun affiliate lama tetap bisa dipakai tanpa mengubah sistem affiliate yang stabil", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-AFFILIATE-2026", deviceId: devices.first
  }), app.env);
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.participant.owner, "Gan Seng Liong");
  assert.equal(payload.participant.business, "Affiliate Panglima UMKM");
  assert.equal(payload.participant.profileSource, "registered");
  assert.equal(payload.participant.deviceBound, true);
});

test("kode peserta tidak valid tetap ditolak oleh layanan aktivasi lama", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-SALAH-2026", deviceId: devices.first
  }), app.env);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, "INVALID_CODE");
  assert.equal(app.database.licenses.size, 0);
});

test("sesi kadaluarsa tidak dapat melewati pemeriksaan lisensi", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/consultation", {
    sessionToken: sessionToken(participantIds.rio, Math.floor(Date.now() / 1000) - 1),
    deviceId: devices.first,
    question: "Bagaimana menambah jumlah murid?"
  }), app.env);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, "SESSION_EXPIRED");
});

test("portal admin lisensi menggunakan token admin lama dan tidak membuka data ke publik", async () => {
  const app = createHarness();
  const anonymous = await app.worker.fetch(new Request("https://secure.example/v1/admin/licenses"), app.env);
  assert.equal(anonymous.status, 401);

  const authorized = await app.worker.fetch(new Request("https://secure.example/v1/admin/licenses", {
    headers: { authorization: "Bearer correct-admin" }
  }), app.env);
  const body = await authorized.json();
  assert.equal(authorized.status, 200);
  assert.equal(body.participants.length, 3);
  assert.equal(body.participants.find(item => item.id === participantIds.vita).type, "Jasa Event Organizer");
});

test("admin dapat menambahkan jenis usaha PRE-TEST tanpa mengubah nama resmi peserta", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(app.request("/v1/admin/profiles", {
    participantId: participantIds.affiliate,
    businessType: "Konsultan UMKM",
    email: "gan@example.com",
    owner: "Nama Palsu"
  }, { headers: { authorization: "Bearer correct-admin" } }), app.env);
  assert.equal(result.status, 200);
  assert.equal(app.database.profiles.get(participantIds.affiliate).owner_name, "Gan Seng Liong");
  assert.equal(app.database.profiles.get(participantIds.affiliate).business_type, "Konsultan UMKM");
});

test("hanya admin sah yang dapat melepas kunci untuk perpindahan perangkat", async () => {
  const app = createHarness();
  await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first
  }), app.env);

  const denied = await app.worker.fetch(app.request("/v1/admin/reset-device", {
    participantId: participantIds.rio
  }), app.env);
  assert.equal(denied.status, 401);
  assert.equal(app.database.licenses.size, 1);

  const released = await app.worker.fetch(app.request("/v1/admin/reset-device", {
    participantId: participantIds.rio
  }, { headers: { authorization: "Bearer correct-admin" } }), app.env);
  assert.equal(released.status, 200);
  assert.equal((await released.json()).deviceReleased, true);

  const newDevice = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.second
  }), app.env);
  assert.equal(newDevice.status, 200);
});

test("portal admin menggunakan CSP nonce dan tidak menyimpan token admin", async () => {
  const app = createHarness();
  const result = await app.worker.fetch(new Request("https://secure.example/admin"), app.env);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-security-policy"), /script-src 'nonce-/);
  const html = await result.text();
  assert.match(html, /Admin Profil PRE-TEST/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});

test("body berlebihan atau endpoint tidak dikenal gagal aman", async () => {
  const app = createHarness();
  const oversized = await app.worker.fetch(app.request("/v1/activate", {
    accessCode: "PANGLIMA-RIO-2026", deviceId: devices.first, padding: "x".repeat(17000)
  }), app.env);
  assert.equal(oversized.status, 400);
  const missing = await app.worker.fetch(new Request("https://secure.example/unknown"), app.env);
  assert.equal(missing.status, 404);
});
