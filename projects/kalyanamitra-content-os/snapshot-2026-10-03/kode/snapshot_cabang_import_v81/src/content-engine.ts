type JsonRecord = Record<string, unknown>;

type GenerationInput = {
  topic: string;
  angle?: string;
  platforms: Array<"threads" | "instagram" | "tiktok">;
};

export type AiRuntimeStatus = {
  configured: boolean;
  enabled: boolean;
  model: string;
};

export type ContentEngineResult = {
  status: number;
  body: unknown;
};

class ContentEngineError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_PROVIDER_BYTES = 2 * 1024 * 1024;
const ALLOWED_PLATFORMS = new Set(["threads", "instagram", "tiktok"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getAiRuntimeStatus(env: Env): AiRuntimeStatus {
  return {
    configured: Boolean(readBinding(env, "DEEPSEEK_API_KEY")),
    enabled: readBinding(env, "CONTENT_AI_ENABLED") === "true",
    model: readBinding(env, "DEEPSEEK_MODEL") ?? DEFAULT_MODEL
  };
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
        throw new ContentEngineError(413, "Payload terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function validateInput(value: unknown): GenerationInput {
  if (!isRecord(value)) throw new ContentEngineError(400, "Format permintaan tidak valid.");

  const topic = typeof value.topic === "string" ? value.topic.trim() : "";
  if (topic.length < 8 || topic.length > 300) {
    throw new ContentEngineError(400, "Topik harus berisi 8–300 karakter.");
  }

  const angle = typeof value.angle === "string" ? value.angle.trim() : undefined;
  if (angle && angle.length > 500) {
    throw new ContentEngineError(400, "Sudut pembahasan maksimal 500 karakter.");
  }

  const rawPlatforms = Array.isArray(value.platforms)
    ? value.platforms
    : ["threads", "instagram", "tiktok"];
  const platforms = rawPlatforms.filter(
    (platform): platform is GenerationInput["platforms"][number] =>
      typeof platform === "string" && ALLOWED_PLATFORMS.has(platform)
  );

  if (platforms.length === 0 || platforms.length > 3 || platforms.length !== rawPlatforms.length) {
    throw new ContentEngineError(400, "Daftar platform tidak valid. Gunakan Threads, Instagram, atau TikTok.");
  }

  return { topic, angle, platforms: [...new Set(platforms)] };
}

function systemPrompt(): string {
  return `Anda adalah editor senior UMKM Naik Kelas untuk pemilik usaha Indonesia.
Tulis dalam Bahasa Indonesia yang tegas, praktis, diagnostik, membumi, dan tidak menggurui.
Kembalikan JSON valid saja. Jangan gunakan markdown atau teks di luar JSON.
Jangan mengarang statistik, nominal uang, persentase, harga, aturan, kutipan, atau fakta spesifik. Jika sumber tidak tersedia, gunakan penjelasan konseptual. Jangan menulis placeholder seperti @namaakun atau usernameanda.
Jangan membuat output untuk LinkedIn atau X.

Gunakan struktur persis berikut:
{
  "title": "string",
  "hook": "string",
  "mainAngle": "string",
  "threadsPosts": ["string"],
  "instagramCaption": "string",
  "tiktokCaption": "string",
  "carousel": {
    "title": "string",
    "slides": [
      {"number": 1, "type": "hook|problem|insight|action|cta", "headline": "string", "body": "string"}
    ]
  },
  "cta": "string",
  "riskFlags": ["string"]
}

Carousel harus 5–9 slide. Slide pertama adalah hook dan slide terakhir CTA. Setiap field wajib ada.`;
}

function userPrompt(input: GenerationInput): string {
  const angle = input.angle ? `\nSudut pembahasan: ${input.angle}` : "";
  return `Topik: ${input.topic}${angle}\nPlatform tujuan: ${input.platforms.join(", ")}`;
}

function extractMessageContent(value: unknown): { content: string; usage: JsonRecord | null } {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) {
    throw new ContentEngineError(502, "Respons AI tidak lengkap.");
  }

  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    throw new ContentEngineError(502, "Konten AI tidak ditemukan.");
  }

  return {
    content: first.message.content,
    usage: isRecord(value.usage) ? value.usage : null
  };
}

function isStringArray(value: unknown, min = 0, max = 100): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function validatePublicationSafety(value: JsonRecord): void {
  const text = JSON.stringify(value);
  const unsupportedAmount = /(?:\brp\.?\s*[\d.,]+|\b[\d.,]+\s*(?:juta|ribu|rb|jt|miliar|triliun|persen|%))\b/i;
  const placeholder = /(?:@(?:namaakun|username|akunanda|yourusername)|\b(?:namaakun|usernameanda|your brand|insert here|placeholder|todo)\b)/i;

  if (unsupportedAmount.test(text)) {
    throw new ContentEngineError(422, "Konten AI memuat nominal atau angka finansial tanpa sumber dan perlu ditinjau.");
  }
  if (placeholder.test(text)) {
    throw new ContentEngineError(422, "Konten AI memuat placeholder akun atau brand dan perlu ditinjau.");
  }
}

function validateDraft(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new ContentEngineError(502, "JSON AI tidak valid.");

  const stringKeys = [
    "title",
    "hook",
    "mainAngle",
    "instagramCaption",
    "tiktokCaption",
    "cta"
  ];
  if (stringKeys.some((key) => typeof value[key] !== "string" || String(value[key]).trim().length === 0)) {
    throw new ContentEngineError(502, "Struktur konten AI tidak lengkap.");
  }
  if (!isStringArray(value.threadsPosts, 1, 20)) {
    throw new ContentEngineError(502, "Struktur Threads AI tidak valid.");
  }
  if ("linkedinPost" in value || "xPosts" in value) {
    throw new ContentEngineError(502, "Respons AI memuat platform yang tidak didukung.");
  }
  if (!isStringArray(value.riskFlags, 0, 20) || !isRecord(value.carousel)) {
    throw new ContentEngineError(502, "Struktur evaluasi AI tidak valid.");
  }

  const carousel = value.carousel;
  if (typeof carousel.title !== "string" || !Array.isArray(carousel.slides)) {
    throw new ContentEngineError(502, "Struktur carousel AI tidak valid.");
  }
  if (carousel.slides.length < 5 || carousel.slides.length > 9) {
    throw new ContentEngineError(502, "Carousel AI harus berisi 5–9 slide.");
  }
  const slidesValid = carousel.slides.every(
    (slide, index) =>
      isRecord(slide) &&
      slide.number === index + 1 &&
      typeof slide.type === "string" &&
      typeof slide.headline === "string" &&
      typeof slide.body === "string"
  );
  if (!slidesValid) throw new ContentEngineError(502, "Isi slide AI tidak valid.");

  validatePublicationSafety(value);

  return value;
}

async function callDeepSeek(env: Env, input: GenerationInput): Promise<{ draft: JsonRecord; usage: JsonRecord | null }> {
  const apiKey = readBinding(env, "DEEPSEEK_API_KEY");
  if (!apiKey) throw new ContentEngineError(503, "DeepSeek belum dikonfigurasi.");

  const model = readBinding(env, "DEEPSEEK_MODEL") ?? DEFAULT_MODEL;
  const providerResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(input) }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 4000,
      stream: false
    })
  });

  const providerText = await readLimitedText(providerResponse.body, MAX_PROVIDER_BYTES);
  if (!providerResponse.ok) {
    console.error(JSON.stringify({ message: "deepseek_request_failed", status: providerResponse.status }));
    throw new ContentEngineError(502, "DeepSeek sedang tidak tersedia.");
  }

  let providerJson: unknown;
  try {
    providerJson = JSON.parse(providerText);
  } catch {
    throw new ContentEngineError(502, "Respons DeepSeek bukan JSON.");
  }

  const message = extractMessageContent(providerJson);
  let draftValue: unknown;
  try {
    draftValue = JSON.parse(message.content);
  } catch {
    throw new ContentEngineError(502, "Konten DeepSeek bukan JSON.");
  }

  return { draft: validateDraft(draftValue), usage: message.usage };
}

async function saveDraft(
  env: Env,
  input: GenerationInput,
  draft: JsonRecord,
  usage: JsonRecord | null
): Promise<{ topicId: string; contentItemId: string }> {
  const topicId = crypto.randomUUID();
  const contentItemId = crypto.randomUUID();
  const title = String(draft.title).slice(0, 240);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO topics (id, brand_id, title, source_type, relevance_score, status, metadata_json)
       VALUES (?, ?, ?, 'manual', 1, 'produced', ?)`
    ).bind(topicId, "brand-umkm-naik-kelas", input.topic, JSON.stringify({ angle: input.angle ?? null, platforms: input.platforms })),
    env.DB.prepare(
      `INSERT INTO content_items (id, topic_id, brand_id, format, platform, title, body_json, status)
       VALUES (?, ?, ?, 'master', 'multi', ?, ?, 'draft')`
    ).bind(contentItemId, topicId, "brand-umkm-naik-kelas", title, JSON.stringify(draft)),
    env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
       VALUES ('content.generated', 'content_item', ?, 'success', 'Draft konten dibuat oleh DeepSeek.', ?)`
    ).bind(contentItemId, JSON.stringify({ model: getAiRuntimeStatus(env).model, usage, platforms: input.platforms }))
  ]);

  return { topicId, contentItemId };
}

export async function generateContent(request: Request, env: Env): Promise<ContentEngineResult> {
  const requestId = crypto.randomUUID();

  try {
    const runtime = getAiRuntimeStatus(env);
    if (!runtime.enabled) {
      throw new ContentEngineError(503, "Content Engine belum diaktifkan karena akses privat belum selesai.");
    }

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new ContentEngineError(413, "Payload terlalu besar.");

    const requestText = await readLimitedText(request.body, MAX_REQUEST_BYTES);
    let requestValue: unknown;
    try {
      requestValue = JSON.parse(requestText);
    } catch {
      throw new ContentEngineError(400, "Body harus berupa JSON valid.");
    }

    const input = validateInput(requestValue);
    const generated = await callDeepSeek(env, input);
    const ids = await saveDraft(env, input, generated.draft, generated.usage);

    return {
      status: 201,
      body: { ok: true, requestId, ...ids, content: generated.draft }
    };
  } catch (error) {
    const status = error instanceof ContentEngineError ? error.status : 500;
    const publicMessage =
      error instanceof ContentEngineError ? error.publicMessage : "Content Engine mengalami kesalahan.";
    const internalMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(JSON.stringify({ message: "content_generation_failed", requestId, status, error: internalMessage }));
    return { status, body: { ok: false, requestId, error: publicMessage } };
  }
}
