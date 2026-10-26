import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertKalyanamitraRecord,
  assertWorkflowGate,
  buildKalyanamitraMetadata,
  filterAllowedReplizAccounts
} from "../guardrails.js";
import { appendLedgerEntry, getLedgerEntry } from "../ledger.js";

const source = {
  title: "Sumber resmi",
  url: "https://tergar.org/",
  sourceType: "official-lineage",
  tradition: "vajrayana",
  verificationStatus: "verified"
};

function record(overrides = {}) {
  return {
    item: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "approved",
      metadata: {
        ...buildKalyanamitraMetadata({
          tradition: "vajrayana",
          sources: [source],
          verificationStatus: "verified"
        }),
        ...overrides
      }
    }
  };
}

test("metadata selalu mengunci namespace dan draft-only", () => {
  const metadata = buildKalyanamitraMetadata({
    tradition: "vajrayana",
    sources: [source],
    verificationStatus: "verified"
  });
  assert.equal(metadata.namespace, "ruang-kalyanamitra");
  assert.equal(metadata.tenant, "ruang-kalyanamitra");
  assert.equal(metadata.automaticPublish, false);
  assert.equal(metadata.publisherMode, "draft-only");
});

test("record UMKM atau tanpa namespace ditolak", () => {
  assert.throws(
    () => assertKalyanamitraRecord({ item: { metadata: { namespace: "umkm" } } }),
    /bukan milik|metadata namespace/
  );
});

test("satu sumber needs-review membuat status efektif tetap needs-review", () => {
  const metadata = buildKalyanamitraMetadata({
    tradition: "umum",
    sources: [{ ...source, verificationStatus: "needs-review" }],
    verificationStatus: "verified"
  });
  assert.equal(metadata.sourceReview.status, "needs-review");
  assert.equal(metadata.riskFlags.includes("source-review-required"), true);
});

test("approval Vajrayana memerlukan review sumber dan garis transmisi", () => {
  assert.throws(
    () =>
      assertWorkflowGate(record(), {
        action: "approve",
        humanApprovalConfirmed: true,
        sourceReviewConfirmed: true
      }),
    /garis transmisi/
  );
  assert.equal(
    assertWorkflowGate(record(), {
      action: "approve",
      humanApprovalConfirmed: true,
      sourceReviewConfirmed: true,
      lineageReviewConfirmed: true
    }),
    true
  );
});

test("Repliz hanya menerima account ID yang dikunci per platform", () => {
  const payload = {
    items: [
      {
        id: "umkm",
        username: "umkmnaikkelas.id",
        platform: "instagram",
        accessToken: "tidak-boleh-bocor"
      },
      {
        id: "rk-instagram",
        username: "ruangkalyanamitra",
        platform: "instagram",
        accessToken: "tidak-boleh-bocor"
      },
      {
        id: "rk-threads",
        username: "ruangkalyanamitra",
        platform: "threads",
        accessToken: "tidak-boleh-bocor"
      }
    ]
  };

  const filtered = filterAllowedReplizAccounts(
    payload,
    { instagram: "rk-instagram", threads: "rk-threads" },
    "@ruangkalyanamitra"
  );
  assert.equal(filtered.accountCount, 2);
  assert.deepEqual(
    filtered.accounts.map(({ accountId, platform }) => ({ accountId, platform })),
    [
      { accountId: "rk-instagram", platform: "instagram" },
      { accountId: "rk-threads", platform: "threads" }
    ]
  );
  assert.equal("accessToken" in filtered.accounts[0], false);
  assert.equal(filtered.automaticPublish, false);
  assert.equal(filtered.publisherMode, "draft-only");

  assert.throws(
    () =>
      filterAllowedReplizAccounts(
        payload,
        { instagram: "rk-threads" },
        "@ruangkalyanamitra",
        "instagram"
      ),
    /tidak ditemukan|tidak cocok/
  );
});

test("Repliz draft membutuhkan record approved dan konfirmasi eksplisit", () => {
  assert.equal(
    assertWorkflowGate(record(), {
      action: "repliz_draft",
      platform: "instagram",
      scheduleAt: "2026-09-01T09:00:00+07:00",
      confirmDraftOnly: true,
      humanApprovalConfirmed: true,
      sourceReviewConfirmed: true,
      lineageReviewConfirmed: true
    }),
    true
  );

  assert.throws(
    () =>
      assertWorkflowGate(
        { ...record(), item: { ...record().item, status: "review" } },
        {
          action: "repliz_draft",
          platform: "threads",
          scheduleAt: "2026-09-01T09:00:00+07:00",
          confirmDraftOnly: true,
          humanApprovalConfirmed: true,
          sourceReviewConfirmed: true,
          lineageReviewConfirmed: true
        }
      ),
    /approved/
  );
});

test("plugin tidak memiliki endpoint publish/reply Threads", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginSource = fs.readFileSync(path.join(currentDir, "..", "index.js"), "utf8");
  assert.equal(pluginSource.includes("umkm_threads_publish"), false);
  assert.equal(pluginSource.includes("umkm_threads_reply"), false);
  assert.equal(/\/publish(?:[\"'?/]|$)/.test(pluginSource), false);
  assert.equal(/Type\.Literal\(["']publish["']\)/.test(pluginSource), false);
  assert.equal(pluginSource.includes("params.accountId"), false);
  assert.match(
    pluginSource,
    /action:\s*Type\.Literal\("repliz_draft"\)[\s\S]*?platform:\s*Type\.Union/
  );
});

test("record tanpa metadata hanya diterima dengan ledger dan displayId yang cocok", () => {
  const metadata = buildKalyanamitraMetadata({
    tradition: "vajrayana",
    sources: [source],
    verificationStatus: "verified"
  });
  const contentItemId = "123e4567-e89b-12d3-a456-426614174000";
  const ledgerEntry = {
    contentItemId,
    displayId: "RK-CANARY-LEDGER-001",
    metadata
  };
  const payload = {
    item: {
      id: contentItemId,
      displayId: ledgerEntry.displayId,
      status: "review",
      riskFlags: metadata.riskFlags
    }
  };
  const verified = assertKalyanamitraRecord(payload, ledgerEntry);
  assert.equal(verified.evidence, "local-ledger");
  assert.equal(verified.metadata.namespace, "ruang-kalyanamitra");
  assert.throws(
    () => assertKalyanamitraRecord(payload, { ...ledgerEntry, displayId: "RK-OTHER-001" }),
    /displayId record tidak cocok/
  );
});

test("risk flag kontrol tidak dapat dipalsukan input model", () => {
  const metadata = buildKalyanamitraMetadata({
    tradition: "umum",
    sources: [source],
    verificationStatus: "verified",
    riskFlags: [
      "kalyanamitra-control:namespace=umkm",
      "canary-test"
    ]
  });
  assert.equal(metadata.riskFlags.includes("kalyanamitra-control:namespace=umkm"), false);
  assert.equal(
    metadata.riskFlags.includes("kalyanamitra-control:namespace=ruang-kalyanamitra"),
    true
  );
});

test("ledger append-only menyimpan dan mengambil UUID secara fail-closed", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kalyanamitra-ledger-"));
  const ledgerPath = path.join(tempDir, "ledger.ndjson");
  const config = { ledgerPath };
  const entry = {
    contentItemId: "123e4567-e89b-12d3-a456-426614174000",
    displayId: "RK-CANARY-LEDGER-001",
    title: "Canary ledger",
    metadata: buildKalyanamitraMetadata({
      tradition: "umum",
      sources: [source],
      verificationStatus: "verified"
    })
  };
  try {
    await appendLedgerEntry(entry, config);
    const found = await getLedgerEntry(entry.contentItemId, config);
    assert.equal(found.displayId, entry.displayId);
    assert.equal(found.metadata.publisherMode, "draft-only");
    assert.equal(
      await getLedgerEntry("223e4567-e89b-12d3-a456-426614174000", config),
      null
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
