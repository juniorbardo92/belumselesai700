import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearIdempotencyStateForTests,
  executeAutoReplyPolicyBatch,
  getOwnPostInsights,
  getOwnPostReplies,
  getRecentOwnPosts,
  publishTextPost,
  replyToPost,
} from "../dist/meta-threads.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  token: process.env.META_THREADS_ACCESS_TOKEN,
  userId: process.env.META_THREADS_USER_ID,
  version: process.env.META_THREADS_API_VERSION,
  autoReplyStateFile: process.env.META_THREADS_AUTOREPLY_STATE_FILE,
};
const testStateDirectory = await mkdtemp(join(tmpdir(), "umkm-auto-reply-test-"));
let testStateSequence = 0;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setTestEnvironment() {
  process.env.META_THREADS_ACCESS_TOKEN = "test-token-not-a-real-secret";
  process.env.META_THREADS_USER_ID = "17841475926640637";
  process.env.META_THREADS_API_VERSION = "v1.0";
  process.env.META_THREADS_AUTOREPLY_STATE_FILE = join(
    testStateDirectory,
    `state-${++testStateSequence}.json`,
  );
  clearIdempotencyStateForTests();
}

test.after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    META_THREADS_ACCESS_TOKEN: originalEnvironment.token,
    META_THREADS_USER_ID: originalEnvironment.userId,
    META_THREADS_API_VERSION: originalEnvironment.version,
    META_THREADS_AUTOREPLY_STATE_FILE: originalEnvironment.autoReplyStateFile,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(testStateDirectory, { recursive: true, force: true });
});

test("reads owned-post insights in one bounded request", async () => {
  setTestEnvironment();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: [{ name: "views", values: [{ value: 42 }] }] });
  };

  const result = await getOwnPostInsights({
    postId: "18021960167704263",
    metrics: ["views", "likes"],
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\.0\/18021960167704263\/insights/);
  assert.match(calls[0].url, /metric=views%2Clikes/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token-not-a-real-secret");
});

test("reads replies without a write", async () => {
  setTestEnvironment();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: [] });
  };

  const result = await getOwnPostReplies({
    postId: "18021960167704263",
    limit: 10,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.match(calls[0].url, /limit=10/);
});

test("reads up to five recent owned posts in one request", async () => {
  setTestEnvironment();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: [{ id: "18021960167704263" }] });
  };

  const result = await getRecentOwnPosts({ limit: 3 });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.match(calls[0].url, /\/17841475926640637\/threads/);
  assert.match(calls[0].url, /limit=3/);
});

test("publishes once, cross-shares, and deduplicates the same key", async () => {
  setTestEnvironment();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? jsonResponse({ id: "18011111111111111" })
      : jsonResponse({ id: "18022222222222222" });
  };

  const input = {
    text: "Konten final",
    shareToInstagramStory: true,
    idempotencyKey: "publish-test-001",
  };
  const first = await publishTextPost(input);
  const duplicate = await publishTextPost(input);

  assert.equal(calls.length, 2);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.match(calls[0].options.body, /media_type=TEXT/);
  assert.match(calls[0].options.body, /crossreshare_to_ig=true/);
  assert.match(calls[1].options.body, /creation_id=18011111111111111/);
});

test("rejects idempotency-key reuse with different content", async () => {
  setTestEnvironment();
  let count = 0;
  globalThis.fetch = async () => {
    count += 1;
    return count === 1
      ? jsonResponse({ id: "18011111111111111" })
      : jsonResponse({ id: "18022222222222222" });
  };

  await publishTextPost({
    text: "Versi A",
    idempotencyKey: "publish-test-002",
  });
  await assert.rejects(
    publishTextPost({
      text: "Versi B",
      idempotencyKey: "publish-test-002",
    }),
    /already used with different write parameters/,
  );
  assert.equal(count, 2);
});

test("creates and publishes exactly one approved reply primitive", async () => {
  setTestEnvironment();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? jsonResponse({ id: "18033333333333333" })
      : jsonResponse({ id: "18044444444444444" });
  };

  const result = await replyToPost({
    replyToId: "18021960167704263",
    text: "Terima kasih.",
    idempotencyKey: "reply-test-001",
  });

  assert.equal(result.operation, "reply");
  assert.equal(calls.length, 2);
  assert.match(calls[0].options.body, /reply_to_id=18021960167704263/);
  assert.doesNotMatch(calls[0].options.body, /crossreshare_to_ig/);
});

test("guarded auto-reply persists one safe reply and prevents reprocessing", async () => {
  setTestEnvironment();
  const stateFile = process.env.META_THREADS_AUTOREPLY_STATE_FILE;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? jsonResponse({ id: "18055555555555555" })
      : jsonResponse({ id: "18066666666666666" });
  };
  const decisions = [{
    replyToId: "18077777777777777",
    username: "pemilik_umkm",
    sourceText: "Bagaimana cara mengecek arus kas UMKM?",
    action: "reply",
    replyText: "Mulai dari saldo kas, tagihan tujuh hari, dan stok lambat bergerak.",
  }];

  const first = await executeAutoReplyPolicyBatch({
    runId: "cron-run-safe-001",
    policyApproval: "APPROVE_AUTO_REPLY_POLICY_V1",
    decisions,
  });
  const repeated = await executeAutoReplyPolicyBatch({
    runId: "cron-run-safe-002",
    policyApproval: "APPROVE_AUTO_REPLY_POLICY_V1",
    decisions,
  });

  assert.equal(calls.length, 2);
  assert.equal(first.counts.replied, 1);
  assert.equal(repeated.counts.already_handled, 1);
  const persisted = await readFile(stateFile, "utf8");
  assert.match(persisted, /18077777777777777/);
  assert.doesNotMatch(persisted, /test-token-not-a-real-secret/);
});

test("guard escalates sensitive or transactional questions without writing", async () => {
  setTestEnvironment();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("fetch must not be called");
  };

  const result = await executeAutoReplyPolicyBatch({
    runId: "cron-run-guard-001",
    policyApproval: "APPROVE_AUTO_REPLY_POLICY_V1",
    decisions: [{
      replyToId: "18088888888888888",
      username: "pelanggan",
      sourceText: "Saya sudah transfer, kenapa pesanan belum dikirim?",
      action: "reply",
      replyText: "Silakan kirim bukti pembayaran.",
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.counts.escalated_by_guard, 1);
  assert.equal(result.results[0].reason, "transaction");
});

test("guard rejects more than three automatic replies before any write", async () => {
  setTestEnvironment();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ id: "18099999999999999" });
  };
  const decisions = [1, 2, 3, 4].map((value) => ({
    replyToId: `1800000000000000${value}`,
    sourceText: `Bagaimana strategi UMKM nomor ${value}?`,
    action: "reply",
    replyText: "Mulai dengan diagnosis masalah utama usaha.",
  }));

  await assert.rejects(
    executeAutoReplyPolicyBatch({
      runId: "cron-run-limit-001",
      policyApproval: "APPROVE_AUTO_REPLY_POLICY_V1",
      decisions,
    }),
    /at most 3 replies per run/,
  );
  assert.equal(calls, 0);
});
