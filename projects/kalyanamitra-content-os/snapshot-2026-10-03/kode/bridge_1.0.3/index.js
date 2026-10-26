import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  assertDraftOnlyResponse,
  assertKalyanamitraRecord,
  assertWorkflowGate,
  buildKalyanamitraMetadata,
  extractContentItemId,
  filterAllowedReplizAccounts,
  isUuid
} from "./guardrails.js";
import { appendLedgerEntry, getLedgerEntry } from "./ledger.js";

const configSchema = Type.Object(
  {
    baseUrl: Type.Optional(Type.String({ minLength: 12 })),
    tokenEnvName: Type.Optional(
      Type.String({ pattern: "^[A-Z][A-Z0-9_]{2,63}$", default: "UMKM_CONTENT_OS_TOKEN" })
    ),
    allowedReplizAccountId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    allowedReplizInstagramAccountId: Type.Optional(
      Type.String({ minLength: 1, maxLength: 128 })
    ),
    allowedReplizThreadsAccountId: Type.Optional(
      Type.String({ minLength: 1, maxLength: 128 })
    ),
    allowedReplizUsername: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 5000, maximum: 30000, default: 20000 })),
    ledgerPath: Type.Optional(Type.String({ minLength: 8, maxLength: 1000 }))
  },
  { additionalProperties: false }
);

const slideSchema = Type.Object(
  {
    number: Type.Integer({ minimum: 1, maximum: 9 }),
    type: Type.Union([
      Type.Literal("hook"),
      Type.Literal("problem"),
      Type.Literal("insight"),
      Type.Literal("action"),
      Type.Literal("cta")
    ]),
    headline: Type.String({ minLength: 1, maxLength: 180 }),
    body: Type.String({ minLength: 1, maxLength: 1600 })
  },
  { additionalProperties: false }
);

const sourceSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 240 }),
    url: Type.String({ minLength: 12, maxLength: 1000 }),
    sourceType: Type.Union([
      Type.Literal("canonical-translation"),
      Type.Literal("trusted-library"),
      Type.Literal("official-lineage"),
      Type.Literal("secondary")
    ]),
    tradition: Type.Union([
      Type.Literal("theravada"),
      Type.Literal("mahayana"),
      Type.Literal("vajrayana"),
      Type.Literal("lintas-tradisi"),
      Type.Literal("umum")
    ]),
    verificationStatus: Type.Union([
      Type.Literal("verified"),
      Type.Literal("needs-review")
    ])
  },
  { additionalProperties: false }
);

const idSchema = Type.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
});

function normalizedBaseUrl(value) {
  if (!value) throw new Error("baseUrl bridge belum dikonfigurasi.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("baseUrl wajib memakai HTTPS.");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function ingressToken(config) {
  const envName = config.tokenEnvName ?? "UMKM_CONTENT_OS_TOKEN";
  const token = process.env[envName]?.trim();
  if (!token) throw new Error(`Environment variable ${envName} belum tersedia.`);
  return token;
}

function configuredReplizAccounts(config) {
  const accounts = {};
  if (config.allowedReplizInstagramAccountId) {
    accounts.instagram = String(config.allowedReplizInstagramAccountId).trim();
  }
  if (config.allowedReplizThreadsAccountId) {
    accounts.threads = String(config.allowedReplizThreadsAccountId).trim();
  }
  return accounts;
}

function replizAccountIdForPlatform(config, platform) {
  const accountId = configuredReplizAccounts(config)[platform];
  if (!accountId) {
    throw new Error(`Akun Repliz ${platform} Ruang Kalyanamitra belum dikunci.`);
  }
  return accountId;
}

async function requestContentOs(path, init, config, context) {
  context.signal?.throwIfAborted();
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs ?? 20000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  let response;
  try {
    response = await fetch(normalizedBaseUrl(config.baseUrl) + path, {
      ...init,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-OpenClaw-Token": ingressToken(config),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Permintaan Kalyanamitra Content OS melewati batas waktu.");
    }
    throw new Error("Kalyanamitra Content OS tidak dapat dihubungi.");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 512 * 1024) throw new Error("Respons Content OS terlalu besar.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 512 * 1024) {
    throw new Error("Respons Content OS terlalu besar.");
  }

  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Content OS mengembalikan respons non-JSON.");
  }

  if (!response.ok) {
    const reason = String(body?.message ?? body?.error ?? "Request rejected").slice(0, 300);
    throw new Error(`Content OS menolak permintaan (HTTP ${response.status}): ${reason}`);
  }
  return body;
}

async function getAndVerifyDraft(contentItemId, config, context) {
  if (!isUuid(contentItemId)) throw new Error("contentItemId bukan UUID yang valid.");
  const ledgerEntry = await getLedgerEntry(contentItemId, config);
  if (!ledgerEntry) {
    throw new Error("UUID tidak tercatat dalam ledger Kalyanamitra; akses ditolak secara fail-closed.");
  }
  const payload = await requestContentOs(
    "/webhook/umkm-content-os/drafts/" + encodeURIComponent(contentItemId),
    { method: "GET" },
    config,
    context
  );
  const verification = assertKalyanamitraRecord(payload, ledgerEntry);
  return {
    ...payload,
    metadata: verification.metadata,
    namespaceVerified: true,
    verificationEvidence: verification.evidence,
    automaticPublish: false,
    publisherMode: "draft-only"
  };
}

export default defineToolPlugin({
  id: "kalyanamitra-content-os",
  name: "Kalyanamitra Content OS Bridge",
  description:
    "Bridge terisolasi dari Asisten Kalyanamitra ke Content OS dengan namespace, verifikasi sumber, approval manusia, dan Repliz draft-only.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "kalyanamitra_content_draft_create",
      label: "Buat Draft Ruang Kalyanamitra",
      description:
        "Membuat satu draft Content OS ber-namespace Ruang Kalyanamitra. Wajib menyertakan tradisi dan sumber. Hanya status review; tidak render, approve, kirim Repliz, atau publish.",
      parameters: Type.Object(
        {
          displayId: Type.String({
            minLength: 10,
            maxLength: 80,
            pattern: "^RK-[A-Z0-9][A-Z0-9-]{6,76}$"
          }),
          title: Type.String({ minLength: 5, maxLength: 180 }),
          tradition: Type.Union([
            Type.Literal("theravada"),
            Type.Literal("mahayana"),
            Type.Literal("vajrayana"),
            Type.Literal("lintas-tradisi"),
            Type.Literal("umum")
          ]),
          sources: Type.Array(sourceSchema, { minItems: 1, maxItems: 12 }),
          verificationStatus: Type.Union([
            Type.Literal("verified"),
            Type.Literal("needs-review")
          ]),
          slides: Type.Array(slideSchema, { minItems: 5, maxItems: 9 }),
          mainAngle: Type.Optional(Type.String({ maxLength: 500 })),
          cta: Type.Optional(Type.String({ maxLength: 500 })),
          riskFlags: Type.Optional(Type.Array(Type.String({ maxLength: 300 }), { maxItems: 10 }))
        },
        { additionalProperties: false }
      ),
      async execute(params, config, context) {
        const metadata = buildKalyanamitraMetadata(params);
        const payload = {
          displayId: params.displayId,
          title: params.title,
          slides: params.slides,
          mainAngle: params.mainAngle,
          cta: params.cta,
          riskFlags: metadata.riskFlags,
          metadata
        };

        const created = await requestContentOs(
          "/webhook/umkm-content-os/drafts",
          { method: "POST", body: JSON.stringify(payload) },
          config,
          context
        );
        const contentItemId = extractContentItemId(created);
        if (!contentItemId) {
          throw new Error("Draft dibuat tetapi server tidak mengembalikan UUID; namespace belum dapat diverifikasi.");
        }
        await appendLedgerEntry(
          {
            contentItemId,
            displayId: params.displayId,
            title: params.title,
            metadata
          },
          config
        );
        let verified;
        try {
          verified = await getAndVerifyDraft(contentItemId, config, context);
        } catch (error) {
          throw new Error(
            `Draft ${contentItemId} dibuat tetapi verifikasi fail-closed: ${String(error?.message ?? error)}`
          );
        }
        return {
          ...created,
          contentItemId,
          namespaceVerified: true,
          verificationEvidence: verified.verificationEvidence,
          automaticPublish: false,
          publisherMode: "draft-only"
        };
      }
    }),
    tool({
      name: "kalyanamitra_content_draft_get",
      label: "Baca Draft Ruang Kalyanamitra",
      description:
        "Membaca draft hanya jika metadata membuktikan namespace Ruang Kalyanamitra. Record UMKM atau tanpa namespace ditolak secara fail-closed.",
      parameters: Type.Object({ contentItemId: idSchema }, { additionalProperties: false }),
      async execute({ contentItemId }, config, context) {
        return getAndVerifyDraft(contentItemId, config, context);
      }
    }),
    tool({
      name: "kalyanamitra_content_repliz_account",
      label: "Periksa Akun Repliz Kalyanamitra",
      description:
        "Read-only. Mengembalikan hanya akun Instagram/Threads Ruang Kalyanamitra yang dikunci per platform; akun lain tidak pernah diteruskan ke model.",
      parameters: Type.Object(
        {
          platform: Type.Optional(
            Type.Union([
              Type.Literal("instagram"),
              Type.Literal("threads")
            ])
          )
        },
        { additionalProperties: false }
      ),
      async execute(params, config, context) {
        const allowedAccounts = configuredReplizAccounts(config);
        if (Object.keys(allowedAccounts).length === 0) {
          throw new Error("Akun Repliz Instagram/Threads Ruang Kalyanamitra belum dikunci.");
        }
        const query = new URLSearchParams();
        if (params.platform) query.set("platform", params.platform);
        if (config.allowedReplizUsername) {
          query.set("username", config.allowedReplizUsername.replace(/^@+/, ""));
        }
        const suffix = query.size ? "?" + query.toString() : "";
        const payload = await requestContentOs(
          "/webhook/umkm-content-os/publisher/accounts" + suffix,
          { method: "GET" },
          config,
          context
        );
        return filterAllowedReplizAccounts(
          payload,
          allowedAccounts,
          config.allowedReplizUsername,
          params.platform
        );
      }
    }),
    tool({
      name: "kalyanamitra_content_workflow",
      label: "Workflow Kalyanamitra Terjaga",
      description:
        "Menjalankan tepat satu aksi setelah verifikasi namespace: render, QA, approve, atau Repliz draft-only. Tidak memiliki aksi publish, reply, engagement, maupun retry otomatis.",
      parameters: Type.Union([
        Type.Object(
          { contentItemId: idSchema, action: Type.Literal("render") },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: idSchema,
            action: Type.Literal("qa"),
            qaConfirmed: Type.Literal(true),
            notes: Type.Optional(Type.String({ maxLength: 500 }))
          },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: idSchema,
            action: Type.Literal("approve"),
            humanApprovalConfirmed: Type.Literal(true),
            sourceReviewConfirmed: Type.Literal(true),
            lineageReviewConfirmed: Type.Optional(Type.Literal(true))
          },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: idSchema,
            action: Type.Literal("repliz_draft"),
            platform: Type.Union([
              Type.Literal("instagram"),
              Type.Literal("threads")
            ]),
            scheduleAt: Type.String({ minLength: 20, maxLength: 40 }),
            confirmDraftOnly: Type.Literal(true),
            humanApprovalConfirmed: Type.Literal(true),
            sourceReviewConfirmed: Type.Literal(true),
            lineageReviewConfirmed: Type.Optional(Type.Literal(true))
          },
          { additionalProperties: false }
        )
      ]),
      async execute(params, config, context) {
        const current = await getAndVerifyDraft(params.contentItemId, config, context);
        assertWorkflowGate(current, params);

        const body = { action: params.action };
        if (params.action === "qa") {
          body.qaConfirmed = true;
          if (params.notes) body.notes = params.notes;
        }
        if (params.action === "repliz_draft") {
          body.accountId = replizAccountIdForPlatform(config, params.platform);
          body.scheduleAt = params.scheduleAt;
          body.confirmDraftOnly = true;
        }

        const result = await requestContentOs(
          "/webhook/umkm-content-os/drafts/" +
            encodeURIComponent(params.contentItemId) +
            "/workflow",
          { method: "POST", body: JSON.stringify(body) },
          config,
          context
        );
        assertDraftOnlyResponse(result);
        return result;
      }
    })
  ]
});
