import {
  assertContentPackEnvelope,
  contentOsBaseUrl,
  formatCommit,
  formatDryRun,
  normalizeAdminId,
  parseAdminAllowlist,
  parseImportCommand,
  readBoundedJson,
  resolveSafeStagedFile,
  safeError,
} from "./lib.js";

const DEFAULT_CONTENT_OS_URL = "https://umkm-content-os.ruang-belajar-mandiri01.workers.dev";
const EXPECTED_AGENT_ID = "kalyanamitra";
const EXPECTED_ACCOUNT_ID = "kalyanamitra";
const TOKEN_ENV = "KALYANAMITRA_CONTENT_OS_TOKEN";
const ADMINS_ENV = "KALYANAMITRA_IMPORT_ADMIN_IDS";
const REQUEST_TIMEOUT_MS = 45_000;
const PENDING_TTL_MS = 15 * 60 * 1_000;
const OBSERVATION_TTL_MS = 2 * 60 * 1_000;
const RECEIPT_TTL_MS = 30 * 60 * 1_000;
const MAX_OBSERVATIONS = 32;
const MAX_ACTIVE_TASKS = 4;
const MAX_PENDING_CONFIRMATIONS = 12;
const MAX_RECEIPTS = 32;
const MAX_ID_CHARS = 256;
const MAX_SESSION_CHARS = 2_048;
const MAX_MEDIA_PATH_CHARS = 32 * 1_024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedExact(value, maxChars) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxChars || value !== value.trim()) return null;
  return value;
}

function equalDefined(left, right) {
  return left === undefined || left === null || right === undefined || right === null || String(left) === String(right);
}

function pickBounded(left, right, maxChars) {
  if (!equalDefined(left, right)) return null;
  return boundedExact(left ?? right, maxChars);
}

function normalizeConversationId(value) {
  return normalizeAdminId(value);
}

function observationConfig(pluginConfig) {
  const raw = pluginConfig && typeof pluginConfig === "object" ? pluginConfig : {};
  const accountId = raw.accountId ?? EXPECTED_ACCOUNT_ID;
  const agentId = raw.agentId ?? EXPECTED_AGENT_ID;
  if (accountId !== EXPECTED_ACCOUNT_ID || agentId !== EXPECTED_AGENT_ID) return null;
  return { accountId, agentId };
}

function runtimeConfig(pluginConfig, env) {
  const raw = pluginConfig && typeof pluginConfig === "object" ? pluginConfig : {};
  const identity = observationConfig(raw);
  if (!identity) throw new Error("Konfigurasi account/agent importer bukan Kalyanamitra yang kanonis.");
  const tokenRaw = env?.[TOKEN_ENV];
  if (
    typeof tokenRaw !== "string" || tokenRaw !== tokenRaw.trim() ||
    tokenRaw.length < 24 || tokenRaw.length > 4_096
  ) {
    throw new Error(`${TOKEN_ENV} belum dikonfigurasi dengan nilai kanonis minimal 24 karakter.`);
  }
  return {
    ...identity,
    contentOsUrl: contentOsBaseUrl(raw.contentOsUrl ?? DEFAULT_CONTENT_OS_URL),
    token: tokenRaw,
    admins: parseAdminAllowlist(env?.[ADMINS_ENV]),
  };
}

function commandProof(command, content) {
  if (command.valid) return command.canonical;
  if (typeof content === "string" && content.length <= 512 && new TextEncoder().encode(content).byteLength <= 512) {
    return `invalid:${content}`;
  }
  return `invalid-oversized:${command.kind}`;
}

function copyMediaFact(media, messageId) {
  if (!Array.isArray(media)) return { count: 0, fact: null, invalid: false };
  const count = media.length;
  if (count !== 1) return { count: count === 0 ? 0 : 2, fact: null, invalid: count > 1 };
  const item = media[0];
  if (!item || typeof item !== "object") return { count: 1, fact: null, invalid: true };
  const fact = {};
  for (const [field, limit] of [
    ["path", MAX_MEDIA_PATH_CHARS],
    ["workspaceDir", MAX_MEDIA_PATH_CHARS],
    ["contentType", 256],
    ["kind", 256],
    ["messageId", MAX_ID_CHARS],
  ]) {
    const value = item[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > limit) {
      return { count: 1, fact: null, invalid: true };
    }
    fact[field] = value;
  }
  if (fact.messageId !== undefined && fact.messageId !== messageId) {
    return { count: 1, fact: null, invalid: true };
  }
  return { count: 1, fact, invalid: false };
}

function messageIdentity(event, ctx, config) {
  if (!config || ctx?.channelId !== "telegram" || ctx?.accountId !== config.accountId) return null;
  if (!equalDefined(event?.senderId, ctx?.senderId)) return null;
  const senderId = normalizeAdminId(event?.senderId ?? ctx?.senderId);
  const fromId = normalizeAdminId(event?.from);
  const conversationId = normalizeConversationId(ctx?.conversationId);
  if (!senderId || fromId !== senderId || conversationId !== senderId) return null;
  const sessionKey = pickBounded(event?.sessionKey, ctx?.sessionKey, MAX_SESSION_CHARS);
  const messageId = pickBounded(event?.messageId, ctx?.messageId, MAX_ID_CHARS);
  if (!sessionKey || !messageId) return null;
  return { accountId: config.accountId, channelId: "telegram", senderId, conversationId, sessionKey, messageId };
}

function dispatchIdentity(event, ctx, config, resolveAgentIdFromSessionKey) {
  if (!config || event?.isGroup !== false || ctx?.channelId !== "telegram" || ctx?.accountId !== config.accountId) return null;
  if (event?.channel !== undefined && event.channel !== "telegram") return null;
  if (!equalDefined(event?.senderId, ctx?.senderId)) return null;
  const senderId = normalizeAdminId(event?.senderId ?? ctx?.senderId);
  const conversationId = normalizeConversationId(ctx?.conversationId);
  const sessionKey = pickBounded(event?.sessionKey, ctx?.sessionKey, MAX_SESSION_CHARS);
  const messageId = pickBounded(event?.messageId, ctx?.messageId, MAX_ID_CHARS);
  if (!senderId || conversationId !== senderId || !sessionKey || !messageId) return null;
  let resolvedAgentId;
  try {
    resolvedAgentId = resolveAgentIdFromSessionKey(sessionKey);
  } catch {
    return null;
  }
  if (resolvedAgentId !== config.agentId) return null;
  return { accountId: config.accountId, channelId: "telegram", senderId, conversationId, sessionKey, messageId };
}

function identityKey(identity) {
  return JSON.stringify([
    identity.accountId,
    identity.channelId,
    identity.senderId,
    identity.conversationId,
    identity.sessionKey,
    identity.messageId,
  ]);
}

function insertBounded(map, key, value, limit) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function pruneTimed(map, now) {
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key);
  }
}

function handled(text) {
  return { handled: true, text };
}

function boundedWorkerReason(payload) {
  const value = payload?.error ?? payload?.code ?? "alasan tidak tersedia";
  return String(value).slice(0, 300);
}

async function workerRequest({ fetchImpl, url, token, adminId, path, body, extraHeaders }) {
  let response;
  try {
    response = await fetchImpl(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-OpenClaw-Token": token,
        "X-Content-OS-Admin": `telegram:${adminId}`,
        ...extraHeaders,
      },
      body,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Content OS melewati batas waktu 45 detik.");
    }
    throw new Error("Content OS tidak dapat dihubungi.");
  }
  return { response, payload: await readBoundedJson(response) };
}

async function dryRunContentOs(fetchImpl, config, adminId, filename, raw) {
  const { response, payload } = await workerRequest({
    fetchImpl,
    url: config.contentOsUrl,
    token: config.token,
    adminId,
    path: "/webhook/umkm-content-os/content-packs/dry-run",
    body: raw,
    extraHeaders: { "X-Content-Pack-Filename": filename },
  });
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Content OS menolak dry-run (${response.status}): ${boundedWorkerReason(payload)}`);
  }
  if (
    payload.automatic_publish !== false || payload.publisher_mode !== "draft-only" ||
    payload.human_approval_required !== true || payload.ready_for_confirmation !== true ||
    Number(payload.rejected ?? 0) !== 0 || typeof payload.import_id !== "string" ||
    !UUID_PATTERN.test(payload.import_id) || typeof payload.confirmation_token !== "string" ||
    !/^[0-9a-f]{64}$/.test(payload.confirmation_token) || !Number.isFinite(Date.parse(payload.confirmation_expires_at))
  ) {
    throw new Error("Respons dry-run tidak memenuhi kontrak keselamatan draft-only.");
  }
  return payload;
}

function isCommittedReconciliation(response, payload) {
  return response.status === 409 && payload?.code === "confirmation-already-consumed" &&
    payload.status === "committed" && payload.unchanged === true &&
    payload.automatic_publish === false && payload.publisher_mode === "draft-only" &&
    payload.human_approval_required === true;
}

async function confirmContentOs(fetchImpl, config, adminId, importId, confirmationToken) {
  const { response, payload } = await workerRequest({
    fetchImpl,
    url: config.contentOsUrl,
    token: config.token,
    adminId,
    path: `/webhook/umkm-content-os/content-packs/${encodeURIComponent(importId)}/confirm`,
    body: JSON.stringify({ confirmation_token: confirmationToken }),
  });
  if (isCommittedReconciliation(response, payload)) return payload;
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Content OS menolak konfirmasi (${response.status}): ${boundedWorkerReason(payload)}`);
  }
  if (
    payload.automatic_publish !== false || payload.publisher_mode !== "draft-only" ||
    payload.human_approval_required !== true
  ) {
    throw new Error("Respons konfirmasi tidak memenuhi kontrak keselamatan draft-only.");
  }
  return payload;
}

export function registerKalyanamitraImport(api, dependencies = {}) {
  const now = typeof dependencies.now === "function" ? dependencies.now : Date.now;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const env = dependencies.env ?? process.env;
  const observations = new Map();
  const activeTasks = new Map();
  const pending = new Map();
  const turnReceipts = new Map();
  const confirmationReceipts = new Map();
  const confirmationFlights = new Map();

  const observe = (event, ctx) => {
    const command = parseImportCommand(event?.content);
    if (!command.recognized) return;
    const at = now();
    pruneTimed(observations, at);
    const config = observationConfig(api.pluginConfig);
    const identity = messageIdentity(event, ctx, config);
    if (!identity) return;
    const media = copyMediaFact(event?.media, identity.messageId);
    insertBounded(observations, identityKey(identity), {
      command,
      commandProof: commandProof(command, event.content),
      media,
      mediaStagingPending: event?.mediaStagingPending === true,
      expiresAt: at + OBSERVATION_TTL_MS,
    }, MAX_OBSERVATIONS);
  };

  const addPending = (key, value, at) => {
    pruneTimed(pending, at);
    if (!pending.has(key) && pending.size >= MAX_PENDING_CONFIRMATIONS) {
      throw new Error("Kapasitas konfirmasi sementara penuh. Tunggu lalu jalankan /importdraft ulang.");
    }
    pending.set(key, value);
  };

  const runImport = async (observation, config, identity) => {
    if (observation.mediaStagingPending) throw new Error("Lampiran masih berada dalam proses staging. Kirim ulang setelah staging selesai.");
    if (observation.media.invalid || observation.media.count !== 1 || !observation.media.fact) {
      throw new Error("Kirim tepat satu file .content-pack.json dalam satu pesan.");
    }
    const trustedRoots = dependencies.getTrustedRoots();
    const staged = await resolveSafeStagedFile(observation.media.fact, {
      trustedRoots,
      rootFactory: dependencies.rootFactory,
      extractOriginalFilename: dependencies.extractOriginalFilename,
    });
    assertContentPackEnvelope(staged.raw, staged.filename);
    const payload = await dryRunContentOs(fetchImpl, config, identity.senderId, staged.filename, staged.raw);
    const at = now();
    const workerExpiry = Date.parse(payload.confirmation_expires_at);
    if (!Number.isFinite(workerExpiry) || workerExpiry <= at) throw new Error("Konfirmasi dry-run sudah kedaluwarsa.");
    const pendingKey = `${identity.senderId}:${payload.import_id.toLowerCase()}`;
    addPending(pendingKey, {
      confirmationToken: payload.confirmation_token,
      expiresAt: Math.min(workerExpiry, at + PENDING_TTL_MS),
    }, at);
    return formatDryRun(payload);
  };

  const runConfirm = async (observation, config, identity) => {
    if (observation.mediaStagingPending || observation.media.count !== 0) {
      throw new Error("Perintah /confirmdraft tidak menerima lampiran.");
    }
    const importId = observation.command.argument;
    const confirmationKey = `${identity.senderId}:${importId}`;
    const at = now();
    pruneTimed(pending, at);
    pruneTimed(confirmationReceipts, at);
    const terminal = confirmationReceipts.get(confirmationKey);
    if (terminal) return terminal.text;
    const staged = pending.get(confirmationKey);
    if (!staged || staged.expiresAt <= at) {
      pending.delete(confirmationKey);
      throw new Error("Konfirmasi tidak ditemukan atau sudah kedaluwarsa. Jalankan /importdraft ulang.");
    }
    let flight = confirmationFlights.get(confirmationKey);
    if (!flight) {
      flight = (async () => {
        const payload = await confirmContentOs(
          fetchImpl,
          config,
          identity.senderId,
          importId,
          staged.confirmationToken,
        );
        pending.delete(confirmationKey);
        const text = formatCommit(payload);
        insertBounded(confirmationReceipts, confirmationKey, { text, expiresAt: now() + RECEIPT_TTL_MS }, MAX_RECEIPTS);
        return text;
      })().finally(() => confirmationFlights.delete(confirmationKey));
      confirmationFlights.set(confirmationKey, flight);
    }
    return flight;
  };

  const dispatch = async (event, ctx) => {
    const command = parseImportCommand(event?.content);
    if (!command.recognized) return;
    const deny = (message) => handled(safeError(new Error(message)));
    try {
      const config = runtimeConfig(api.pluginConfig, env);
      const identity = dispatchIdentity(event, ctx, config, dependencies.resolveAgentIdFromSessionKey);
      if (!identity || !config.admins.has(identity.senderId)) {
        return deny("Identitas Telegram privat, account, agent, atau admin tidak dapat diverifikasi.");
      }
      const key = identityKey(identity);
      const at = now();
      pruneTimed(observations, at);
      pruneTimed(turnReceipts, at);
      const receipt = turnReceipts.get(key);
      if (receipt) return handled(receipt.text);
      const observation = observations.get(key);
      if (!observation || observation.expiresAt <= at) {
        return deny("Observasi staging untuk pesan ini tidak tersedia. Kirim ulang perintah pada pesan baru.");
      }
      if (observation.commandProof !== commandProof(command, event.content) || observation.command.kind !== command.kind) {
        return deny("Korelasi isi perintah berubah di antara hook; permintaan ditolak.");
      }
      if (!command.valid || !observation.command.valid) {
        const usage = command.kind === "confirmdraft"
          ? "Format: /confirmdraft <import-id dari dry-run>"
          : "Format: kirim tepat satu .content-pack.json dengan caption /importdraft";
        const text = safeError(new Error(usage));
        insertBounded(turnReceipts, key, { text, expiresAt: at + RECEIPT_TTL_MS }, MAX_RECEIPTS);
        return handled(text);
      }
      const existing = activeTasks.get(key);
      if (existing) return handled(await existing);
      if (activeTasks.size >= MAX_ACTIVE_TASKS) return deny("Importer sedang menangani terlalu banyak permintaan. Coba kembali setelah permintaan aktif selesai.");
      const task = (command.kind === "importdraft"
        ? runImport(observation, config, identity)
        : runConfirm(observation, config, identity)
      ).catch((error) => safeError(error));
      activeTasks.set(key, task);
      try {
        const text = await task;
        insertBounded(turnReceipts, key, { text, expiresAt: now() + RECEIPT_TTL_MS }, MAX_RECEIPTS);
        return handled(text);
      } finally {
        activeTasks.delete(key);
        observations.delete(key);
      }
    } catch (error) {
      return handled(safeError(error));
    }
  };

  // message_received is intentionally synchronous: it only snapshots bounded facts.
  api.on("message_received", observe);
  // before_dispatch is the sole claim point and the only hook allowed to perform I/O.
  api.on("before_dispatch", dispatch);

  return {
    sizes: () => ({
      observations: observations.size,
      activeTasks: activeTasks.size,
      pending: pending.size,
      turnReceipts: turnReceipts.size,
      confirmationReceipts: confirmationReceipts.size,
    }),
  };
}
