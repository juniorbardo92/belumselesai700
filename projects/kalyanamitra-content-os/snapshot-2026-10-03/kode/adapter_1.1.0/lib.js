import path from "node:path";

export const CONTENT_PACK_SCHEMA_VERSION = "kalyanamitra-content-pack.v1";
export const IDEA_INBOX_SCHEMA_VERSION = "kalyanamitra-idea-inbox.v1";
export const VIRAL_RESEARCH_SCHEMA_VERSION = "kalyanamitra-viral-research.v1";
export const CONTENT_PACK_SUFFIX = ".content-pack.json";
export const MAX_FILE_BYTES = 1_500_000;
export const MAX_RESPONSE_BYTES = 512 * 1024;
export const MAX_COMMAND_BYTES = 512;
export const MAX_REPLY_CHARS = 3_800;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMAND_PREFIX = /^\s*\/(importdraft|confirmdraft)(?:@[A-Za-z0-9_]{1,64})?(?=\s|$)/i;
const COMPLETE_COMMAND = /^\s*\/(importdraft|confirmdraft)(?:@[A-Za-z0-9_]{1,64})?(?:\s+([^\s]+))?\s*$/i;
const MIME_JSON = new Set(["application/json", "text/json"]);
const MAX_ROOTS = 16;
const MAX_PATH_CHARS = 32 * 1024;

function boundedText(value, maxChars) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxChars) return null;
  return value;
}

export function parseImportCommand(value) {
  if (typeof value !== "string") return { recognized: false, valid: false, kind: null, canonical: null, argument: null };
  const prefixMatch = COMMAND_PREFIX.exec(value.slice(0, MAX_COMMAND_BYTES + 1));
  if (!prefixMatch) return { recognized: false, valid: false, kind: null, canonical: null, argument: null };
  const kind = prefixMatch[1].toLowerCase();
  if (value.length > MAX_COMMAND_BYTES || new TextEncoder().encode(value).byteLength > MAX_COMMAND_BYTES) {
    return { recognized: true, valid: false, kind, canonical: null, argument: null };
  }
  const complete = COMPLETE_COMMAND.exec(value);
  if (!complete || complete[1].toLowerCase() !== kind) {
    return { recognized: true, valid: false, kind, canonical: null, argument: null };
  }
  const argument = complete[2] ?? null;
  if (kind === "importdraft" && argument !== null) {
    return { recognized: true, valid: false, kind, canonical: null, argument: null };
  }
  if (kind === "confirmdraft" && (argument === null || !UUID_PATTERN.test(argument))) {
    return { recognized: true, valid: false, kind, canonical: null, argument: null };
  }
  const canonical = kind === "importdraft" ? "/importdraft" : `/confirmdraft ${argument.toLowerCase()}`;
  return { recognized: true, valid: true, kind, canonical, argument: argument?.toLowerCase() ?? null };
}

export function importCaptionMatches(value) {
  const command = parseImportCommand(value);
  return command.valid && command.kind === "importdraft";
}

export function normalizeAdminId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  if (raw !== raw.trim()) return null;
  const normalized = raw.toLowerCase().replace(/^telegram:/, "");
  return /^\d{3,24}$/.test(normalized) && !/^0+$/.test(normalized) ? normalized : null;
}

export function parseAdminAllowlist(raw) {
  if (typeof raw !== "string" || raw.length > 256) {
    throw new Error("KALYANAMITRA_IMPORT_ADMIN_IDS must contain exactly two unique Telegram numeric IDs.");
  }
  const entries = raw.split(",");
  const normalized = entries.map(normalizeAdminId);
  const admins = new Set(normalized);
  if (entries.length !== 2 || normalized.some((value) => value === null) || admins.size !== 2) {
    throw new Error("KALYANAMITRA_IMPORT_ADMIN_IDS must contain exactly two unique Telegram numeric IDs.");
  }
  return admins;
}

export function assertContentPackEnvelope(raw, filename) {
  if (typeof raw !== "string" || raw.length < 2 || Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES) {
    throw new Error("Ukuran lampiran harus 2 byte–1,5 MB.");
  }
  const normalizedName = String(filename ?? "").toLowerCase();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("File bukan JSON yang valid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dokumen JSON teratas harus berupa object.");
  }
  if (
    value.schema_version === IDEA_INBOX_SCHEMA_VERSION ||
    value.schema_version === VIRAL_RESEARCH_SCHEMA_VERSION ||
    normalizedName.endsWith(".idea-inbox.json") ||
    normalizedName.endsWith(".viral-research.json")
  ) {
    throw new Error("File ini hanya untuk perencanaan; bot tidak boleh mengimpornya sebagai draft.");
  }
  if (!normalizedName.endsWith(CONTENT_PACK_SUFFIX)) {
    throw new Error(`Nama file wajib berakhiran ${CONTENT_PACK_SUFFIX}.`);
  }
  if (value.schema_version !== CONTENT_PACK_SCHEMA_VERSION) {
    throw new Error("Schema content pack tidak didukung.");
  }
  return value;
}

function trustedAbsoluteRoots(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_ROOTS) return [];
  const roots = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = boundedText(values[index], MAX_PATH_CHARS);
    if (!value || !path.isAbsolute(value) || value.includes("\0")) return [];
    roots.push(value);
  }
  return roots;
}

function isLexicallyInside(rootDir, filePath) {
  const relative = path.relative(path.resolve(rootDir), filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveSafeStagedFile(media, dependencies) {
  const mediaPath = boundedText(media?.path, MAX_PATH_CHARS);
  if (!mediaPath || !path.isAbsolute(mediaPath) || mediaPath.includes("\0")) {
    throw new Error("Lampiran belum tersedia sebagai file staging lokal yang tepercaya.");
  }
  const contentTypeRaw = media?.contentType;
  if (contentTypeRaw !== undefined && contentTypeRaw !== null) {
    const contentType = boundedText(contentTypeRaw, 256)?.toLowerCase().split(";", 1)[0].trim();
    if (!contentType || !MIME_JSON.has(contentType)) throw new Error("MIME lampiran wajib application/json.");
  }
  if (typeof dependencies?.rootFactory !== "function" || typeof dependencies?.extractOriginalFilename !== "function") {
    throw new Error("Pembaca staging aman tidak tersedia.");
  }
  const roots = trustedAbsoluteRoots(dependencies.trustedRoots);
  const candidates = roots.filter((rootDir) => isLexicallyInside(rootDir, mediaPath));
  if (candidates.length === 0) throw new Error("Path lampiran berada di luar root staging tepercaya.");

  let lastError;
  for (const rootDir of candidates) {
    try {
      const safeRoot = await dependencies.rootFactory(rootDir, {
        hardlinks: "reject",
        maxBytes: MAX_FILE_BYTES,
        symlinks: "reject",
      });
      const result = await safeRoot.readAbsolute(mediaPath, {
        hardlinks: "reject",
        maxBytes: MAX_FILE_BYTES,
        symlinks: "reject",
      });
      if (!result?.stat?.isFile?.()) throw new Error("Lampiran staging bukan regular file.");
      if (!Buffer.isBuffer(result.buffer) || result.buffer.byteLength < 2 || result.buffer.byteLength > MAX_FILE_BYTES) {
        throw new Error("Ukuran lampiran harus 2 byte–1,5 MB.");
      }
      if (Number(result.stat.size) !== result.buffer.byteLength) {
        throw new Error("Ukuran lampiran berubah saat dibaca; kirim ulang file.");
      }
      let raw;
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(result.buffer);
      } catch {
        throw new Error("Lampiran harus menggunakan UTF-8 yang valid.");
      }
      const filename = dependencies.extractOriginalFilename(result.realPath);
      if (
        typeof filename !== "string" || filename.length === 0 || filename.length > 512 ||
        filename.includes("/") || filename.includes("\\") || filename.includes("\0")
      ) {
        throw new Error("Nama file staging tidak valid.");
      }
      return { raw, filename };
    } catch (error) {
      lastError = error;
    }
  }
  const code = typeof lastError?.code === "string" ? lastError.code : "unsafe-file";
  throw new Error(`Lampiran staging ditolak oleh pembaca aman (${code}).`);
}

export function contentOsBaseUrl(value) {
  const raw = String(value ?? "");
  if (!raw || raw !== raw.trim() || raw.length > 2_048) throw new Error("contentOsUrl harus URL HTTPS yang kanonis.");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("contentOsUrl harus URL HTTPS tanpa credential, query, atau fragment.");
  }
  return parsed.href.replace(/\/$/, "");
}

export async function readBoundedJson(response) {
  const declaredRaw = response.headers.get("content-length");
  if (declaredRaw !== null && !/^\d+$/.test(declaredRaw)) throw new Error("Content-Length respons Content OS tidak valid.");
  const declared = Number(declaredRaw ?? "0");
  if (!Number.isSafeInteger(declared) || declared > MAX_RESPONSE_BYTES) {
    throw new Error("Respons Content OS melewati batas 512 KiB.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Content OS mengembalikan respons kosong.");
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel("response_too_large");
      throw new Error("Respons Content OS melewati batas 512 KiB.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged));
  } catch {
    throw new Error("Content OS mengembalikan respons non-JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Struktur respons Content OS tidak valid.");
  }
  return value;
}

function short(value, fallback = "—", max = 160) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : fallback;
}

export function formatDryRun(payload) {
  const warning = Number(payload.source_review_required ?? 0) > 0
    ? `⚠️ ${Number(payload.source_review_required)} draft masih memerlukan review sumber manusia.`
    : null;
  return [
    "Dry-run content pack selesai.",
    `Paket: ${short(payload.package_id)} · revisi ${short(payload.package_revision)} · bagian ${Number(payload.part_number ?? 0)}/${Number(payload.parts_expected ?? 0)}`,
    `Diterima: ${Number(payload.drafts_received ?? 0)} · baru: ${Number(payload.valid ?? 0)} · duplikat: ${Number(payload.duplicates ?? 0)} · ditolak: ${Number(payload.rejected ?? 0)}`,
    `Review sumber: ${Number(payload.source_review_required ?? 0)} · auto-publish: NONAKTIF`,
    warning,
    `Jika ringkasan benar, kirim:\n/confirmdraft ${short(payload.import_id, "", 64)}`,
    "Konfirmasi kedaluwarsa dalam 15 menit. Konten tetap berstatus draft.",
  ].filter(Boolean).join("\n").slice(0, MAX_REPLY_CHARS);
}

export function formatCommit(payload) {
  const reconciled = payload.unchanged === true ? " (konfirmasi sebelumnya sudah tersimpan)" : "";
  return [
    `Impor content pack selesai${reconciled}.`,
    `Paket: ${short(payload.package_id)} · bagian ${Number(payload.part_number ?? 0)}`,
    `Draft baru: ${Number(payload.created ?? 0)} · duplikat dilewati: ${Number(payload.duplicates ?? 0)}`,
    "Status: DRAFT · approval manusia wajib · auto-publish NONAKTIF.",
  ].join("\n").slice(0, MAX_REPLY_CHARS);
}

export function safeError(error) {
  const detail = error instanceof Error ? error.message : "Kegagalan tidak dikenal.";
  return [
    "Impor draft dibatalkan.",
    detail.slice(0, 700),
    "File tidak dikirim ke model dan tidak ada publikasi otomatis.",
  ].join("\n").slice(0, MAX_REPLY_CHARS);
}
