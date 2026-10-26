import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

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

const configSchema = Type.Object(
  {
    baseUrl: Type.String({
      minLength: 12,
      description: "URL Worker UMKM Content OS tanpa slash di akhir."
    }),
    ingressToken: Type.String({
      minLength: 16,
      description: "Token ingress OpenClaw; tidak pernah dikirim ke model atau dikembalikan oleh tool."
    }),
    timeoutMs: Type.Optional(
      Type.Integer({
        minimum: 5000,
        maximum: 30000,
        default: 20000
      })
    )
  },
  { additionalProperties: false }
);

function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("baseUrl wajib memakai HTTPS.");
  return url.toString().replace(/\/$/, "");
}

async function requestContentOs(path, init, config, context) {
  context.signal?.throwIfAborted();
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs ?? 20000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(normalizedBaseUrl(config.baseUrl) + path, {
    ...init,
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-OpenClaw-Token": config.ingressToken,
      ...(init.headers ?? {})
    }
  });
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 512 * 1024) throw new Error("Respons Content OS terlalu besar.");
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
  return { httpStatus: response.status, ...body };
}

export default defineToolPlugin({
  id: "umkm-content-registry",
  name: "UMKM Content Registry",
  description: "Menyimpan dan membaca draft permanen serta menjalankan workflow draft-only yang terjaga.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "umkm_content_draft_create",
      label: "Buat Draft Permanen",
      description:
        "Simpan carousel manual persis seperti input ke registry D1 dengan UUID resmi. Hanya membuat status review; tidak render, tidak approve, tidak mengirim Repliz, dan tidak publish.",
      parameters: Type.Object(
        {
          displayId: Type.String({ minLength: 10, maxLength: 80 }),
          title: Type.String({ minLength: 5, maxLength: 180 }),
          slides: Type.Array(slideSchema, { minItems: 5, maxItems: 9 }),
          mainAngle: Type.Optional(Type.String({ maxLength: 500 })),
          cta: Type.Optional(Type.String({ maxLength: 500 })),
          riskFlags: Type.Optional(Type.Array(Type.String({ maxLength: 300 }), { maxItems: 10 })),
          metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
        },
        { additionalProperties: false }
      ),
      async execute(params, config, context) {
        return requestContentOs(
          "/webhook/umkm-content-os/drafts",
          { method: "POST", body: JSON.stringify(params) },
          config,
          context
        );
      }
    }),
    tool({
      name: "umkm_content_draft_get",
      label: "Baca Draft UUID",
      description:
        "Baca ulang record draft resmi berdasarkan contentItemId UUID, termasuk slide, logo, render, QA, approval readiness, dan langkah berikutnya. Read-only.",
      parameters: Type.Object(
        {
          contentItemId: Type.String({
            pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
          })
        },
        { additionalProperties: false }
      ),
      async execute({ contentItemId }, config, context) {
        return requestContentOs(
          "/webhook/umkm-content-os/drafts/" + encodeURIComponent(contentItemId),
          { method: "GET" },
          config,
          context
        );
      }
    }),
    tool({
      name: "umkm_content_repliz_accounts",
      label: "Lookup Akun Repliz",
      description:
        "Baca daftar akun Repliz yang terhubung dan didukung Publisher. Read-only; tidak membuat draft, tidak menjadwalkan, tidak publish, dan tidak melakukan engagement.",
      parameters: Type.Object(
        {
          platform: Type.Optional(
            Type.Union([
              Type.Literal("instagram"),
              Type.Literal("tiktok"),
              Type.Literal("threads")
            ])
          ),
          username: Type.Optional(Type.String({ minLength: 1, maxLength: 100 }))
        },
        { additionalProperties: false }
      ),
      async execute(params, config, context) {
        const query = new URLSearchParams();
        if (params.platform) query.set("platform", params.platform);
        if (params.username) query.set("username", params.username.replace(/^@+/, ""));
        const suffix = query.size > 0 ? "?" + query.toString() : "";
        return requestContentOs(
          "/webhook/umkm-content-os/publisher/accounts" + suffix,
          { method: "GET" },
          config,
          context
        );
      }
    }),
    tool({
      name: "umkm_content_workflow",
      label: "Workflow Konten Aman",
      description:
        "Jalankan tepat satu aksi eksplisit: render, konfirmasi QA, approve, atau kirim ke Repliz sebagai draft-only. Urutan dipaksa server. Tidak menyediakan publish, engagement, atau retry otomatis.",
      parameters: Type.Union([
        Type.Object(
          {
            contentItemId: Type.String(),
            action: Type.Literal("render")
          },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: Type.String(),
            action: Type.Literal("qa"),
            qaConfirmed: Type.Literal(true),
            notes: Type.Optional(Type.String({ maxLength: 500 }))
          },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: Type.String(),
            action: Type.Literal("approve")
          },
          { additionalProperties: false }
        ),
        Type.Object(
          {
            contentItemId: Type.String(),
            action: Type.Literal("repliz_draft"),
            accountId: Type.String({ minLength: 1, maxLength: 128 }),
            scheduleAt: Type.String({ minLength: 20, maxLength: 40 }),
            confirmDraftOnly: Type.Literal(true)
          },
          { additionalProperties: false }
        )
      ]),
      async execute(params, config, context) {
        const { contentItemId, ...body } = params;
        return requestContentOs(
          "/webhook/umkm-content-os/drafts/" + encodeURIComponent(contentItemId) + "/workflow",
          { method: "POST", body: JSON.stringify(body) },
          config,
          context
        );
      }
    })
  ]
});
