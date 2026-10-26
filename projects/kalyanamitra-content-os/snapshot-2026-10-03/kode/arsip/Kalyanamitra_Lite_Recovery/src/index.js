const APP_NAME = "Kalyanamitra Lite";
const APP_VERSION = "1.0.1";
const NAMESPACE = "ruang-kalyanamitra";
const BRAND_ID = "brand-ruang-kalyanamitra";
const ACCOUNT_ID = "kalyanamitra";
const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_INPUT_CHARS = 4_000;
const HISTORY_LIMIT = 10;
const RATE_LIMIT_PER_MINUTE = 8;
const MAX_UPDATE_ATTEMPTS = 3;

const SYSTEM_PROMPT = `Anda adalah Kalyanamitra 🌿, pendamping belajar Buddha Dharma untuk Ruang Kalyanamitra.

IDENTITAS DAN SIKAP:
- Hangat, jernih, rendah hati, tidak menggurui, dan menjawab terutama dalam Bahasa Indonesia.
- Menghormati Theravada, Mahayana, dan Vajrayana tanpa mencampuradukkan konteks tradisi.
- Bedakan dengan jelas: (1) kutipan sumber, (2) penjelasan, dan (3) interpretasi praktis.
- Jangan mengarang kutipan, nomor sutta/sutra, nama guru, atau rujukan. Jika tidak yakin, katakan bahwa rujukan perlu diverifikasi.
- Untuk praktik Vajrayana yang memerlukan transmisi, empowerment, atau bimbingan khusus, arahkan kepada guru dan garis transmisi yang sah.

HIRARKI SUMBER:
- Utama: SuttaCentral, 84000, dan BDK America.
- Relevan: Lotsawa House, Tergar, Samye Mandala, Kagyu Office, dan situs resmi guru/garis transmisi.
- Sumber sekunder hanya untuk orientasi dan harus disilang dengan sumber primer/otoritatif.

PAGAR OPERASIONAL WAJIB:
- namespace=${NAMESPACE}; brandId=${BRAND_ID}; accountId=${ACCOUNT_ID}.
- automaticPublish=false; publisherMode=draft-only; riskFlag=do-not-publish.
- Anda tidak memiliki kemampuan menerbitkan, membalas komentar, melakukan engagement, menjalankan perintah sistem, atau mengubah akun sosial.
- Jika diminta membuat konten sosial, hasil selalu berstatus DRAF — BELUM DITERBITKAN dan memerlukan verifikasi sumber, review Dharma, QA, serta persetujuan manusia.
- Jangan mengklaim tindakan eksternal sudah dilakukan.

JAWABAN:
- Jawab langsung dan praktis.
- Untuk kutipan tekstual, sebutkan sumber hanya bila yakin. Jika tidak yakin, parafrase dan tandai perlunya verifikasi.
- Untuk keadaan darurat medis atau psikologis, anjurkan bantuan profesional/layanan darurat setempat; jangan menggantikan diagnosis profesional.`;

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAdminIds(raw) {
  return new Set(
    text(raw)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

function isAuthorized(userId, rawAdminIds) {
  if (!Number.isSafeInteger(userId)) return false;
  return parseAdminIds(rawAdminIds).has(String(userId));
}

function normalizeCommand(input) {
  const value = text(input);
  if (!value.startsWith("/")) return { command: "", argument: value };
  const [head, ...rest] = value.split(/\s+/);
  return {
    command: head.toLowerCase().replace(/@[^\s]+$/, ""),
    argument: rest.join(" ").trim(),
  };
}

function splitTelegramMessage(input, limit = 3_800) {
  const value = text(input);
  if (!value) return [];
  if (value.length <= limit) return [value];

  const chunks = [];
  let remaining = value;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < Math.floor(limit * 0.5)) cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.5)) cut = remaining.lastIndexOf(" ", limit);
    if (cut < Math.floor(limit * 0.5)) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function extractAiText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  const choice = result?.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content.trim();
  if (typeof choice?.text === "string") return choice.text.trim();
  return "";
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(String(left ?? ""));
  const b = encoder.encode(String(right ?? ""));
  const max = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let index = 0; index < max; index += 1) {
    diff |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return diff === 0;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function telegramApi(env, method, payload = {}) {
  if (!text(env.TELEGRAM_BOT_TOKEN)) throw new Error("telegram_token_missing");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) {
    throw new Error(`telegram_${method}_failed:${response.status}:${body?.description ?? "unknown"}`);
  }
  return body.result;
}

async function sendTelegramMessage(env, chatId, content) {
  const chunks = splitTelegramMessage(content);
  for (const chunk of chunks) {
    await telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

async function audit(env, eventType, actorId, status, metadata = {}) {
  await env.DB.prepare(
    "INSERT INTO audit_events (id, event_type, actor_id, status, metadata_json) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), eventType, actorId ? String(actorId) : null, status, JSON.stringify(metadata))
    .run();
}

async function claimUpdate(env, update, message) {
  const payloadHash = await sha256(JSON.stringify(update));
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO telegram_updates
      (update_id, user_id, chat_id, message_id, payload_hash, status, attempt_count)
     VALUES (?, ?, ?, ?, ?, 'processing', 1)`,
  )
    .bind(
      update.update_id,
      message?.from?.id ?? null,
      message?.chat?.id ?? null,
      message?.message_id ?? null,
      payloadHash,
    )
    .run();

  if ((result.meta?.changes ?? 0) > 0) return { process: true, retry: false };

  const previous = await env.DB.prepare(
    "SELECT status, attempt_count, updated_at FROM telegram_updates WHERE update_id = ?",
  )
    .bind(update.update_id)
    .first();

  if (previous?.status === "failed" && Number(previous.attempt_count) < MAX_UPDATE_ATTEMPTS) {
    const retry = await env.DB.prepare(
      `UPDATE telegram_updates
       SET status='processing', attempt_count=attempt_count+1, error_code=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE update_id=? AND status='failed' AND attempt_count<?`,
    )
      .bind(update.update_id, MAX_UPDATE_ATTEMPTS)
      .run();
    return { process: (retry.meta?.changes ?? 0) > 0, retry: true, status: "failed" };
  }

  return { process: false, retry: false, status: previous?.status ?? "unknown" };
}

async function finishUpdate(env, updateId, status, errorCode = null) {
  await env.DB.prepare(
    "UPDATE telegram_updates SET status=?, error_code=?, updated_at=CURRENT_TIMESTAMP WHERE update_id=?",
  )
    .bind(status, errorCode, updateId)
    .run();
}

async function appendMessage(env, sourceUpdateId, sessionKey, userId, chatId, role, content) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO messages
      (id, source_update_id, session_key, user_id, chat_id, role, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      sourceUpdateId,
      sessionKey,
      String(userId),
      String(chatId),
      role,
      content,
    )
    .run();
}

async function getStoredAssistantReply(env, sourceUpdateId) {
  const row = await env.DB.prepare(
    "SELECT content FROM messages WHERE source_update_id=? AND role='assistant' LIMIT 1",
  )
    .bind(sourceUpdateId)
    .first();
  return text(row?.content);
}

async function loadHistory(env, sessionKey) {
  const session = await env.DB.prepare("SELECT reset_at FROM sessions WHERE session_key=?")
    .bind(sessionKey)
    .first();
  const resetAt = session?.reset_at ?? "1970-01-01 00:00:00";
  const result = await env.DB.prepare(
    `SELECT role, content FROM messages
     WHERE session_key=? AND created_at>=? AND role IN ('user','assistant')
     ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  )
    .bind(sessionKey, resetAt, HISTORY_LIMIT)
    .all();
  return (result.results ?? []).reverse().map((row) => ({ role: row.role, content: row.content }));
}

async function resetSession(env, sessionKey, userId, chatId, updateId) {
  await env.DB.prepare(
    `INSERT INTO sessions (session_key, user_id, chat_id, reset_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(session_key) DO UPDATE SET reset_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(sessionKey, String(userId), String(chatId))
    .run();
  await audit(env, "session_reset", userId, "success", { updateId, namespace: NAMESPACE });
}

async function isRateLimited(env, userId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM messages
     WHERE user_id=? AND role='user' AND created_at>=datetime('now','-1 minute')`,
  )
    .bind(String(userId))
    .first();
  return Number(row?.count ?? 0) >= RATE_LIMIT_PER_MINUTE;
}

async function runAi(env, history, input, draftMode) {
  const model = text(env.AI_MODEL) || DEFAULT_MODEL;
  const instruction = draftMode
    ? `Buat DRAF — BELUM DITERBITKAN berdasarkan brief berikut. Nyatakan tradisi dan status verifikasi sumber. Jangan mengklaim publikasi.\n\n${input}`
    : input;
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: instruction },
    ],
    max_tokens: 900,
    temperature: 0.25,
    chat_template_kwargs: { enable_thinking: false },
  });
  const output = extractAiText(result);
  if (!output) throw new Error("ai_empty_response");
  return { output, model };
}

function restrictedMessage(userId) {
  return `🌿 Akses bot ini dibatasi untuk dua admin Ruang Kalyanamitra.\n\nID Telegram Anda: ${userId}\nKirim ID ini kepada administrator untuk dimasukkan ke allowlist.`;
}

function helpMessage() {
  return [
    "🌿 Kalyanamitra Lite",
    "",
    "/help — daftar perintah",
    "/whoami — tampilkan ID Telegram",
    "/status — status bot dan pagar keamanan",
    "/reset — mulai konteks percakapan baru tanpa menghapus histori",
    "/draft <brief> — buat draf konten, tidak menerbitkan",
    "",
    "Pesan biasa akan dijawab sebagai percakapan Dharma.",
  ].join("\n");
}

async function processAuthorizedMessage(env, update, message, normalized) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const sessionKey = `${ACCOUNT_ID}:telegram:${chatId}:${userId}`;

  if (normalized.command === "/help" || normalized.command === "/start") {
    return helpMessage();
  }
  if (normalized.command === "/status") {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS message_count FROM messages WHERE user_id=?",
    )
      .bind(String(userId))
      .first();
    return [
      `🌿 ${APP_NAME} v${APP_VERSION}`,
      `Namespace: ${NAMESPACE}`,
      `Brand: ${BRAND_ID}`,
      `Account: ${ACCOUNT_ID}`,
      `Model: ${text(env.AI_MODEL) || DEFAULT_MODEL}`,
      `Pesan tersimpan: ${Number(row?.message_count ?? 0)}`,
      "automaticPublish: false",
      "publisherMode: draft-only",
      "riskFlag: do-not-publish",
    ].join("\n");
  }
  if (normalized.command === "/reset") {
    await resetSession(env, sessionKey, userId, chatId, update.update_id);
    return "Konteks percakapan baru dimulai. Histori lama tetap tersimpan sebagai ledger append-only.";
  }
  if (normalized.command && normalized.command !== "/draft") {
    return "Perintah tidak dikenali. Gunakan /help.";
  }

  const draftMode = normalized.command === "/draft";
  const input = draftMode ? normalized.argument : normalized.argument;
  if (!input) return draftMode ? "Gunakan: /draft <brief konten>." : "Silakan tuliskan pertanyaan Anda.";
  if (input.length > MAX_INPUT_CHARS) {
    return `Pesan terlalu panjang. Maksimal ${MAX_INPUT_CHARS.toLocaleString("id-ID")} karakter per pesan.`;
  }
  if (await isRateLimited(env, userId)) {
    await audit(env, "rate_limit", userId, "blocked", { updateId: update.update_id });
    return "Terlalu banyak permintaan dalam satu menit. Tunggu sebentar lalu coba lagi.";
  }

  const stored = await getStoredAssistantReply(env, update.update_id);
  if (stored) return stored;

  await appendMessage(env, update.update_id, sessionKey, userId, chatId, "user", input);
  const history = await loadHistory(env, sessionKey);
  const withoutCurrent = history.slice(0, -1);
  const { output, model } = await runAi(env, withoutCurrent, input, draftMode);
  const finalOutput = draftMode && !/^DRAF\b/i.test(output)
    ? `DRAF — BELUM DITERBITKAN\n\n${output}`
    : output;
  await appendMessage(env, update.update_id, sessionKey, userId, chatId, "assistant", finalOutput);
  await audit(env, draftMode ? "draft_generated" : "answer_generated", userId, "success", {
    updateId: update.update_id,
    namespace: NAMESPACE,
    model,
    automaticPublish: false,
    publisherMode: "draft-only",
    riskFlags: ["do-not-publish"],
  });
  return finalOutput;
}

async function handleTelegramWebhook(request, env) {
  const configuredSecret = text(env.TELEGRAM_WEBHOOK_SECRET);
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!configuredSecret || !(await constantTimeEqual(configuredSecret, suppliedSecret))) {
    return responseJson({ ok: false, error: "unauthorized" }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return responseJson({ ok: false, error: "invalid_json" }, 400);
  }
  if (!Number.isSafeInteger(update?.update_id)) {
    return responseJson({ ok: false, error: "invalid_update" }, 400);
  }

  const message = update.message;
  const claim = await claimUpdate(env, update, message);
  if (!claim.process) {
    if (claim.status === "processing") {
      return responseJson({ ok: false, retry: true, error: "update_in_progress" }, 503);
    }
    return responseJson({ ok: true, duplicate: true });
  }

  try {
    if (!message?.from?.id || !message?.chat?.id || typeof message?.text !== "string") {
      await finishUpdate(env, update.update_id, "ignored");
      return responseJson({ ok: true, ignored: true });
    }
    if (message.chat.type !== "private") {
      await audit(env, "non_private_chat", message.from.id, "blocked", {
        updateId: update.update_id,
        chatType: message.chat.type,
      });
      await finishUpdate(env, update.update_id, "blocked");
      return responseJson({ ok: true, blocked: true });
    }

    const normalized = normalizeCommand(message.text);
    if (normalized.command === "/whoami") {
      await sendTelegramMessage(env, message.chat.id, `ID Telegram Anda: ${message.from.id}`);
      await finishUpdate(env, update.update_id, "completed");
      return responseJson({ ok: true });
    }

    if (!isAuthorized(message.from.id, env.ADMIN_TELEGRAM_IDS)) {
      await audit(env, "authorization", message.from.id, "blocked", { updateId: update.update_id });
      await sendTelegramMessage(env, message.chat.id, restrictedMessage(message.from.id));
      await finishUpdate(env, update.update_id, "blocked");
      return responseJson({ ok: true, blocked: true });
    }

    const reply = await processAuthorizedMessage(env, update, message, normalized);
    await sendTelegramMessage(env, message.chat.id, reply);
    await finishUpdate(env, update.update_id, "completed");
    return responseJson({ ok: true });
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : String(error);
    const errorCode = rawCode.slice(0, 180);
    await finishUpdate(env, update.update_id, "failed", errorCode).catch(() => undefined);
    await audit(env, "telegram_update", message?.from?.id, "error", {
      updateId: update.update_id,
      errorCode,
    }).catch(() => undefined);
    console.error(JSON.stringify({ message: "telegram update failed", updateId: update.update_id, errorCode }));

    if (message?.chat?.id) {
      const quotaLimited = /3036|account limited|quota|429/i.test(errorCode);
      const emptyAiOutput = errorCode === "ai_empty_response";
      const notice = quotaLimited
        ? "Kuota AI gratis harian sedang habis. Bot tetap aktif; silakan coba lagi setelah kuota direset pukul 07.00 WIB."
        : emptyAiOutput
          ? "Model AI belum menghasilkan jawaban. Silakan kirim ulang permintaan ini; kejadian sudah dicatat."
          : "Permintaan belum berhasil diproses. Silakan coba kirim lagi beberapa saat lagi.";
      try {
        await sendTelegramMessage(env, message.chat.id, notice);
        const handledCode = quotaLimited ? "ai_daily_quota" : emptyAiOutput ? "ai_empty_response" : "processing_error";
        await finishUpdate(env, update.update_id, "completed", handledCode);
        return responseJson({ ok: true, handledError: handledCode });
      } catch (notificationError) {
        const notificationCode = notificationError instanceof Error
          ? notificationError.message.slice(0, 100)
          : "notification_failed";
        await finishUpdate(
          env,
          update.update_id,
          "failed",
          `${errorCode}|${notificationCode}`.slice(0, 180),
        ).catch(() => undefined);
      }
    }
    return responseJson({ ok: false, error: "processing_failed" }, 500);
  }
}

async function adminAuthorized(request, env) {
  const configured = text(env.ADMIN_API_TOKEN);
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(configured) && constantTimeEqual(configured, supplied);
}

async function handleAdmin(request, env, path) {
  if (!(await adminAuthorized(request, env))) {
    return responseJson({ ok: false, error: "unauthorized" }, 401);
  }

  if (path === "/admin/status" && request.method === "GET") {
    const [updates, messages, audits] = await Promise.all([
      env.DB.prepare("SELECT status, COUNT(*) AS count FROM telegram_updates GROUP BY status").all(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM messages").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events").first(),
    ]);
    let webhook = null;
    if (text(env.TELEGRAM_BOT_TOKEN)) {
      webhook = await telegramApi(env, "getWebhookInfo").catch((error) => ({ error: String(error) }));
    }
    return responseJson({
      ok: true,
      app: APP_NAME,
      version: APP_VERSION,
      namespace: NAMESPACE,
      ready: Boolean(text(env.TELEGRAM_BOT_TOKEN) && text(env.TELEGRAM_WEBHOOK_SECRET) && parseAdminIds(env.ADMIN_TELEGRAM_IDS).size === 2),
      guardrails: { automaticPublish: false, publisherMode: "draft-only", riskFlags: ["do-not-publish"] },
      counts: {
        updates: updates.results ?? [],
        messages: Number(messages?.count ?? 0),
        auditEvents: Number(audits?.count ?? 0),
      },
      webhook: webhook
        ? {
            url: webhook.url ?? "",
            pendingUpdateCount: webhook.pending_update_count ?? 0,
            lastErrorDate: webhook.last_error_date ?? null,
            lastErrorMessage: webhook.last_error_message ?? null,
            error: webhook.error ?? null,
          }
        : null,
    });
  }

  if (path === "/admin/bootstrap-telegram" && request.method === "POST") {
    if (!text(env.TELEGRAM_BOT_TOKEN)) {
      return responseJson({ ok: false, error: "telegram_token_missing" }, 409);
    }
    if (!text(env.TELEGRAM_WEBHOOK_SECRET)) {
      return responseJson({ ok: false, error: "webhook_secret_missing" }, 409);
    }
    const origin = new URL(request.url).origin;
    const webhookUrl = `${origin}/telegram/webhook`;
    const bot = await telegramApi(env, "getMe");
    const webhook = await telegramApi(env, "setWebhook", {
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    await telegramApi(env, "setMyCommands", {
      commands: [
        { command: "help", description: "Daftar perintah" },
        { command: "whoami", description: "Lihat ID Telegram" },
        { command: "status", description: "Status dan guardrail bot" },
        { command: "reset", description: "Mulai konteks percakapan baru" },
        { command: "draft", description: "Buat draf konten" },
      ],
    });
    await audit(env, "telegram_bootstrap", null, "success", {
      botId: bot.id,
      username: bot.username,
      webhookUrl,
    });
    return responseJson({ ok: true, bot: { id: bot.id, username: bot.username }, webhook, webhookUrl });
  }

  return responseJson({ ok: false, error: "not_found" }, 404);
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    const adminCount = parseAdminIds(env.ADMIN_TELEGRAM_IDS).size;
    return responseJson({
      ok: true,
      app: APP_NAME,
      version: APP_VERSION,
      namespace: NAMESPACE,
      brandId: BRAND_ID,
      accountId: ACCOUNT_ID,
      ready: Boolean(env.DB && env.AI && text(env.TELEGRAM_BOT_TOKEN) && text(env.TELEGRAM_WEBHOOK_SECRET) && adminCount === 2),
      configuration: {
        database: Boolean(env.DB),
        ai: Boolean(env.AI),
        telegramToken: Boolean(text(env.TELEGRAM_BOT_TOKEN)),
        webhookSecret: Boolean(text(env.TELEGRAM_WEBHOOK_SECRET)),
        authorizedAdminCount: adminCount,
      },
      guardrails: {
        privateChatOnly: true,
        automaticPublish: false,
        publisherMode: "draft-only",
        riskFlags: ["do-not-publish"],
      },
    });
  }
  if (url.pathname === "/telegram/webhook" && request.method === "POST") {
    return handleTelegramWebhook(request, env);
  }
  if (url.pathname.startsWith("/admin/")) {
    return handleAdmin(request, env, url.pathname);
  }
  return responseJson({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 180) : "unknown";
      console.error(JSON.stringify({ message: "unhandled request error", errorCode }));
      return responseJson({ ok: false, error: "internal_error" }, 500);
    }
  },
};

export {
  ACCOUNT_ID,
  APP_VERSION,
  BRAND_ID,
  DEFAULT_MODEL,
  NAMESPACE,
  SYSTEM_PROMPT,
  extractAiText,
  isAuthorized,
  normalizeCommand,
  parseAdminIds,
  runAi,
  splitTelegramMessage,
};
