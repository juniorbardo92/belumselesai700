// This importer intentionally has no dependency on AI, renderer, scheduler, or publisher modules.

type JsonRecord = Record<string, unknown>;

type ValidationIssue = { code: string; path: string; message: string };
type ValidationStats = { drafts: number; posts: number; sources: number; dates: number };

export type ContentPackValidation = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
  sourceReviewRequired: number;
  value: JsonRecord | null;
};

export type ContentPackImportResult = { status: number; body: unknown };

type ImportedItemRow = {
  external_id: string;
  publish_date: string;
  slot: number;
  content_fingerprint: string;
  content_item_id: string;
};

type OccupiedSlotRow = {
  package_id: string;
  external_id: string;
  publish_date: string;
  slot: number;
  content_item_id: string;
};

type ImportRow = {
  id: string;
  namespace: string;
  package_id: string;
  package_revision: number;
  part_number: number;
  part_total: number;
  file_hash: string;
  filename: string;
  payload_json: string | null;
  summary_json: string;
  admin_id: string;
  status: string;
  confirmation_token_hash: string | null;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
};

type PackageHistoryRow = {
  id: string;
  package_revision: number;
  part_number: number;
  part_total: number;
  period_start: string | null;
  period_end: string | null;
  manifest_part_number: number | null;
  manifest_part_total: number | null;
  part_start: string | null;
  part_end: string | null;
  days_total_package: number | null;
  threads_per_day: number | null;
  drafts_total_package: number | null;
  drafts_in_part: number | null;
  posts_min_per_thread: number | null;
  posts_max_per_thread: number | null;
};

type CommitStateRow = { status: string; expires_at: string | null; summary_json: string; guard_claimed: number };

type PreflightItem = {
  draft: JsonRecord;
  fingerprint: string;
  outcome: "new" | "already-imported" | "external-id-conflict" | "date-slot-conflict";
  contentItemId: string | null;
};

type PreflightResult = {
  items: PreflightItem[];
  valid: number;
  duplicates: number;
  rejected: number;
  conflicts: JsonRecord[];
};

class ContentPackImportError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(publicMessage);
  }
}

export const CONTENT_PACK_SCHEMA_VERSION = "kalyanamitra-content-pack.v1";
export const IDEA_INBOX_SCHEMA_VERSION = "kalyanamitra-idea-inbox.v1";
export const VIRAL_RESEARCH_SCHEMA_VERSION = "kalyanamitra-viral-research.v1";
export const CONTENT_PACK_NAMESPACE = "ruang-kalyanamitra";
export const CONTENT_PACK_BRAND_ID = "brand-ruang-kalyanamitra";

const BRAND_NAME = "Ruang Kalyanamitra";
const BRAND_SLUG = "ruang-kalyanamitra";
const BRAND_VOICE = "Edukasi Buddhis yang jernih, hangat, lintas tradisi, dan berbasis sumber terverifikasi.";
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_CONFIRM_BYTES = 16 * 1024;
const MAX_PERIOD_DAYS = 30;
const DAYS_PER_PART = 6;
const MAX_PARTS = Math.ceil(MAX_PERIOD_DAYS / DAYS_PER_PART);
const MAX_THREADS_PER_DAY = 8;
const POSTS_MIN_PER_THREAD = 6;
const POSTS_MAX_PER_THREAD = 8;
const MAX_DRAFTS_PER_IMPORT = MAX_PERIOD_DAYS * MAX_THREADS_PER_DAY;
const MAX_SOURCES_PER_DRAFT = 8;
const MAX_SOURCE_REFS_PER_POST = 8;
const MAX_FLAGS = 16;
const MAX_TRADITIONS = 7;
const MAX_ERRORS = 64;
const MAX_WARNINGS = 64;
const MAX_DRAFT_BYTES = 64 * 1024;
const MAX_MAPPED_ROW_BYTES = 256 * 1024;
const MAX_PACKAGE_HISTORY = 100;
const MAX_D1_BINDINGS_PER_STATEMENT = 100;
const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const CONTENT_PACK_SUFFIX = ".content-pack.json";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE_ID_PATTERN = /^rk-[a-z0-9][a-z0-9-]{5,79}$/;
const EXTERNAL_ID_PATTERN = /^rk-(\d{8})-(0[1-8])$/;
const SOURCE_ID_PATTERN = /^src-[a-z0-9][a-z0-9-]{2,63}$/;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

const EXACT_VALUES: Readonly<Record<string, unknown>> = {
  schema_version: CONTENT_PACK_SCHEMA_VERSION,
  namespace: CONTENT_PACK_NAMESPACE,
  brand: BRAND_NAME,
  brand_id: CONTENT_PACK_BRAND_ID,
  platform: "threads",
  language: "id-ID",
  timezone: "Asia/Jakarta",
  content_status: "draft",
  publisher_mode: "draft-only",
  automatic_publish: false,
  human_approval_required: true
};

const TOP_LEVEL_KEYS = new Set([
  "schema_version", "package_id", "package_revision", "part", "namespace", "brand",
  "brand_id", "platform", "language", "timezone", "content_status", "publisher_mode",
  "automatic_publish", "human_approval_required", "package_risk_flags", "generated_at",
  "generator", "period", "expected_counts", "generation_notes", "drafts"
]);
const PART_KEYS = new Set(["number", "total", "start_date", "end_date"]);
const GENERATOR_KEYS = new Set(["service", "model", "mode"]);
const PERIOD_KEYS = new Set(["start_date", "end_date"]);
const COUNT_KEYS = new Set([
  "days_total_package", "threads_per_day", "posts_min_per_thread", "posts_max_per_thread",
  "drafts_total_package", "drafts_in_this_part"
]);
const DRAFT_KEYS = new Set([
  "external_id", "publish_date", "slot", "content_pillar", "series", "funnel_goal",
  "audience_problem", "title", "promise", "selected_hook", "hook_rationale",
  "tradition_scope", "traditions_covered", "source_review_status", "sources", "posts",
  "metric_hypothesis", "review_required", "risk_flags"
]);
const SOURCE_KEYS = new Set([
  "source_id", "provider_id", "title", "author_teacher_or_translator", "tradition",
  "source_type", "url", "locator", "claim_supported", "verification_status", "checked_at",
  "checked_by"
]);
const POST_KEYS = new Set(["sequence", "role", "text", "source_ids"]);

const CONTENT_PILLARS = new Set([
  "Dharma untuk Kehidupan Sehari-hari", "Tiga Tradisi, Satu Topik",
  "Mitos, Istilah, dan Ketepatan Sumber", "Praktik Kecil Hari Ini"
]);
const FUNNEL_GOALS = new Set(["discovery", "consumption", "value", "conversion"]);
const TRADITION_SCOPES = new Set(["theravada", "mahayana", "vajrayana", "cross-tradition", "general-buddhist"]);
const TRADITIONS = new Set([
  "theravada", "mahayana", "vajrayana", "early-buddhist-texts", "east-asian-buddhism",
  "tibetan-buddhism", "general-buddhist"
]);
const SOURCE_TYPES = new Set([
  "canonical-text", "translation", "commentary", "teacher-teaching",
  "official-lineage-guidance", "secondary-orientation", "user-provided"
]);
const SOURCE_STATUSES = new Set(["provider-approved-needs-item-review", "needs-review", "verified-by-human"]);
const POST_ROLES = new Set([
  "hook", "context", "dharma-lens", "explanation", "application", "practice",
  "reflection", "summary", "source-note", "cta"
]);
const GENERATOR_SERVICES = new Set(["deepseek-chat", "chatgpt", "codex", "other-manual-chat"]);
const PROVIDER_HOSTS: Readonly<Record<string, string>> = {
  suttacentral: "suttacentral.net",
  "84000": "84000.co",
  "bdk-america": "bdkamerica.org",
  "lotsawa-house": "lotsawahouse.org",
  tergar: "tergar.org",
  "samye-institute": "samyeinstitute.org",
  "samye-mandala": "samyemandala.org",
  "kagyu-office": "kagyuoffice.org"
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function addError(target: ValidationIssue[], code: string, path: string, message: string): void {
  if (target.length < MAX_ERRORS) target.push({ code, path, message });
}

function addWarning(target: ValidationIssue[], code: string, path: string, message: string): void {
  if (target.length < MAX_WARNINGS) target.push({ code, path, message });
}

function boundedPropertyPath(path: string, key: string): string {
  const prefix = key.slice(0, 120).replace(/[^a-zA-Z0-9_-]/g, "?");
  return `${path}.${prefix}${key.length > 120 ? "…" : ""}`;
}

function checkKeys(value: JsonRecord, allowed: Set<string>, path: string, errors: ValidationIssue[]): void {
  let inspected = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (!allowed.has(key)) addError(errors, "additional-property", boundedPropertyPath(path, key), "Field tidak didukung.");
    inspected += 1;
    if (inspected >= 65) break;
  }
}

function requireKeys(value: JsonRecord, required: Set<string>, path: string, errors: ValidationIssue[]): void {
  for (const key of required) {
    if (!(key in value)) addError(errors, "required", `${path}.${key}`, "Field wajib belum ada.");
  }
}

function validDate(value: unknown): value is string {
  if (!canonicalText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0) / 86_400_000);
}

function dateAt(start: string, offset: number): string {
  return new Date((dateOrdinal(start) + offset) * 86_400_000).toISOString().slice(0, 10);
}

function validDateTime(value: unknown): value is string {
  return canonicalText(value) && charLength(value) <= 64 && Number.isFinite(Date.parse(value));
}

function validHttpsUrl(value: unknown, canonicalHost?: string): value is string {
  if (!canonicalText(value) || charLength(value) > 1000) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port &&
      (!canonicalHost || hostname === canonicalHost || hostname.endsWith(`.${canonicalHost}`));
  } catch {
    return false;
  }
}

function stringWithin(value: unknown, minimum: number, maximum: number): value is string {
  return canonicalText(value) && charLength(value) >= minimum && charLength(value) <= maximum;
}

function stringArray(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
  options: { min?: number; max?: number; itemMax?: number; allowed?: Set<string>; pattern?: RegExp } = {}
): string[] {
  if (!Array.isArray(value)) {
    addError(errors, "type", path, "Harus berupa array.");
    return [];
  }
  if (options.min !== undefined && value.length < options.min) addError(errors, "min-items", path, `Minimal ${options.min} item.`);
  if (options.max !== undefined && value.length > options.max) addError(errors, "max-items", path, `Maksimal ${options.max} item.`);
  const maximum = options.max ?? MAX_FLAGS;
  const result: string[] = [];
  for (let index = 0; index < Math.min(value.length, maximum); index += 1) {
    const item = value[index];
    if (!canonicalText(item)) {
      addError(errors, "canonical-string", `${path}[${index}]`, "Harus berupa teks kanonis tanpa spasi tepi.");
      continue;
    }
    if (options.itemMax !== undefined && charLength(item) > options.itemMax) {
      addError(errors, "max-length", `${path}[${index}]`, `Maksimal ${options.itemMax} karakter.`);
    }
    if (options.allowed && !options.allowed.has(item)) addError(errors, "enum", `${path}[${index}]`, "Nilai tidak didukung.");
    if (options.pattern && !options.pattern.test(item)) addError(errors, "pattern", `${path}[${index}]`, "Format tidak valid.");
    result.push(item);
  }
  if (new Set(result).size !== result.length) addError(errors, "duplicate", path, "Array tidak boleh berisi duplikat.");
  return result;
}

function stableValue(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  const sorted: JsonRecord = {};
  for (const key of Object.keys(value).sort()) sorted[key.normalize("NFC")] = stableValue(value[key]);
  return sorted;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function valueGroups(rows: number, columns: number): string {
  const group = `(${Array.from({ length: columns }, () => "?").join(", ")})`;
  return Array.from({ length: rows }, () => group).join(", ");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintContentPackDraft(draft: unknown): Promise<string> {
  return sha256(stableJson(draft));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateSource(
  source: unknown,
  path: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): string {
  if (!isRecord(source)) {
    addError(errors, "type", path, "Sumber harus berupa object.");
    return "";
  }
  checkKeys(source, SOURCE_KEYS, path, errors);
  requireKeys(source, new Set([
    "source_id", "provider_id", "title", "tradition", "source_type", "url", "locator",
    "claim_supported", "verification_status"
  ]), path, errors);

  const sourceId = canonicalText(source.source_id) ? source.source_id : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) addError(errors, "pattern", `${path}.source_id`, "Format source_id tidak valid atau memiliki spasi tepi.");
  const providerId = canonicalText(source.provider_id) ? source.provider_id : "";
  if (!PROVIDER_ID_PATTERN.test(providerId)) addError(errors, "pattern", `${path}.provider_id`, "Format provider_id tidak valid atau memiliki spasi tepi.");
  if (!stringWithin(source.title, 1, 300)) addError(errors, "length", `${path}.title`, "Judul sumber harus 1–300 karakter tanpa spasi tepi.");
  if (source.author_teacher_or_translator !== undefined && source.author_teacher_or_translator !== null &&
      !stringWithin(source.author_teacher_or_translator, 1, 240)) {
    addError(errors, "length", `${path}.author_teacher_or_translator`, "Harus 1–240 karakter tanpa spasi tepi.");
  }
  if (!TRADITIONS.has(text(source.tradition)) || !canonicalText(source.tradition)) addError(errors, "enum", `${path}.tradition`, "Tradisi tidak didukung.");
  if (!SOURCE_TYPES.has(text(source.source_type)) || !canonicalText(source.source_type)) addError(errors, "enum", `${path}.source_type`, "Jenis sumber tidak didukung.");
  const canonicalHost = PROVIDER_HOSTS[providerId];
  if (!validHttpsUrl(source.url, canonicalHost)) {
    addError(errors, "url", `${path}.url`, canonicalHost
      ? `URL provider '${providerId}' wajib HTTPS pada domain ${canonicalHost} atau subdomain resminya.`
      : "URL sumber wajib HTTPS yang valid.");
  }
  if (!stringWithin(source.locator, 1, 500)) addError(errors, "length", `${path}.locator`, "Locator harus 1–500 karakter tanpa spasi tepi.");
  if (!stringWithin(source.claim_supported, 1, 1000)) addError(errors, "length", `${path}.claim_supported`, "Claim supported harus 1–1.000 karakter tanpa spasi tepi.");

  const verificationStatus = canonicalText(source.verification_status) ? source.verification_status : "";
  if (!SOURCE_STATUSES.has(verificationStatus)) addError(errors, "enum", `${path}.verification_status`, "Status verifikasi sumber tidak didukung.");
  if (!canonicalHost) {
    addWarning(warnings, "provider-not-registered", `${path}.provider_id`, "Provider belum ada di registry skill.");
    if (verificationStatus === "provider-approved-needs-item-review") {
      addError(errors, "provider-status-invalid", `${path}.verification_status`, "Provider tak terdaftar tidak boleh memakai status provider-approved.");
    }
  }
  if (source.checked_at !== undefined && source.checked_at !== null && !validDateTime(source.checked_at)) {
    addError(errors, "date-time", `${path}.checked_at`, "checked_at harus ISO date-time kanonis atau null.");
  }
  if (source.checked_by !== undefined && source.checked_by !== null && !stringWithin(source.checked_by, 1, 160)) {
    addError(errors, "length", `${path}.checked_by`, "checked_by harus 1–160 karakter atau null.");
  }
  if (verificationStatus === "verified-by-human" &&
      (!validDateTime(source.checked_at) || !stringWithin(source.checked_by, 1, 160))) {
    addError(errors, "human-verification-incomplete", path, "verified-by-human memerlukan checked_at dan checked_by.");
  }
  return sourceId;
}

function validatePost(
  post: unknown,
  index: number,
  path: string,
  sourceIds: Set<string>,
  errors: ValidationIssue[]
): { role: string; text: string; sequence: number | null } {
  if (!isRecord(post)) {
    addError(errors, "type", path, "Post harus berupa object.");
    return { role: "", text: "", sequence: null };
  }
  checkKeys(post, POST_KEYS, path, errors);
  requireKeys(post, POST_KEYS, path, errors);
  const sequence = integer(post.sequence) ? post.sequence : null;
  if (sequence !== index + 1 || sequence < 1 || sequence > 8) addError(errors, "sequence", `${path}.sequence`, "Urutan post harus beruntun mulai dari 1.");
  const role = canonicalText(post.role) ? post.role : "";
  if (!POST_ROLES.has(role)) addError(errors, "enum", `${path}.role`, "Peran post tidak didukung.");
  const postText = typeof post.text === "string" ? post.text : "";
  if (!stringWithin(post.text, 1, 500)) addError(errors, "length", `${path}.text`, "Teks post harus 1–500 karakter tanpa spasi tepi.");
  const refs = stringArray(post.source_ids, `${path}.source_ids`, errors, {
    max: MAX_SOURCE_REFS_PER_POST,
    itemMax: 68,
    pattern: SOURCE_ID_PATTERN
  });
  for (const ref of refs) {
    if (!sourceIds.has(ref)) addError(errors, "unknown-source", `${path}.source_ids`, "source_id tidak ditemukan di draft.");
  }
  return { role, text: postText, sequence };
}

export function validateContentPackDocument(value: unknown): ContentPackValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const stats: ValidationStats = { drafts: 0, posts: 0, sources: 0, dates: 0 };
  let sourceReviewRequired = 0;
  const result = (): ContentPackValidation => ({ ok: errors.length === 0, errors, warnings, stats, sourceReviewRequired, value: isRecord(value) ? value : null });

  if (!isRecord(value)) {
    addError(errors, "type", "$", "Dokumen teratas harus berupa object JSON.");
    return result();
  }
  checkKeys(value, TOP_LEVEL_KEYS, "$", errors);
  requireKeys(value, new Set([
    "schema_version", "package_id", "package_revision", "part", "namespace", "brand", "brand_id",
    "platform", "language", "timezone", "content_status", "publisher_mode", "automatic_publish",
    "human_approval_required", "package_risk_flags", "generated_at", "generator", "period",
    "expected_counts", "drafts"
  ]), "$", errors);
  for (const [field, expected] of Object.entries(EXACT_VALUES)) {
    if (value[field] !== expected) addError(errors, "safety-constant", `$.${field}`, `Wajib bernilai ${JSON.stringify(expected)}.`);
  }
  if (!canonicalText(value.package_id) || !PACKAGE_ID_PATTERN.test(value.package_id)) addError(errors, "pattern", "$.package_id", "Format package_id tidak valid atau memiliki spasi tepi.");
  if (!integer(value.package_revision) || value.package_revision < 1) addError(errors, "range", "$.package_revision", "package_revision harus integer minimal 1.");
  if (!validDateTime(value.generated_at)) addError(errors, "date-time", "$.generated_at", "generated_at harus ISO date-time kanonis.");
  if (value.generation_notes !== undefined && value.generation_notes !== "" && !stringWithin(value.generation_notes, 1, 2000)) {
    addError(errors, "max-length", "$.generation_notes", "generation_notes maksimal 2.000 karakter tanpa spasi tepi.");
  }
  const packageFlags = stringArray(value.package_risk_flags, "$.package_risk_flags", errors, { min: 1, max: MAX_FLAGS, itemMax: 100 });
  if (!packageFlags.includes("do-not-publish")) addError(errors, "safety-flag", "$.package_risk_flags", "Harus berisi 'do-not-publish'.");
  if (packageFlags.includes("cross-part-duplicate-check-pending")) addWarning(warnings, "cross-part-check-pending", "$.package_risk_flags", "Pemeriksaan duplikat lintas bagian masih tertunda.");

  const part = isRecord(value.part) ? value.part : {};
  if (!isRecord(value.part)) addError(errors, "type", "$.part", "part harus berupa object.");
  checkKeys(part, PART_KEYS, "$.part", errors);
  requireKeys(part, PART_KEYS, "$.part", errors);
  const partNumber = integer(part.number) ? part.number : 0;
  const partTotal = integer(part.total) ? part.total : 0;
  if (partTotal < 1 || partTotal > MAX_PARTS) addError(errors, "range", "$.part.total", `part.total harus 1–${MAX_PARTS}.`);
  if (partNumber < 1 || partNumber > partTotal) addError(errors, "range", "$.part.number", "part.number harus berada di antara 1 dan part.total.");
  const partStart = validDate(part.start_date) ? part.start_date : null;
  const partEnd = validDate(part.end_date) ? part.end_date : null;
  if (!partStart) addError(errors, "date", "$.part.start_date", "Tanggal tidak valid.");
  if (!partEnd) addError(errors, "date", "$.part.end_date", "Tanggal tidak valid.");

  const generator = isRecord(value.generator) ? value.generator : {};
  if (!isRecord(value.generator)) addError(errors, "type", "$.generator", "generator harus berupa object.");
  checkKeys(generator, GENERATOR_KEYS, "$.generator", errors);
  requireKeys(generator, GENERATOR_KEYS, "$.generator", errors);
  if (!canonicalText(generator.service) || !GENERATOR_SERVICES.has(generator.service)) addError(errors, "enum", "$.generator.service", "Generator service tidak didukung.");
  if (!stringWithin(generator.model, 1, 120)) addError(errors, "length", "$.generator.model", "Model harus 1–120 karakter tanpa spasi tepi.");
  if (generator.mode !== "manual-chat") addError(errors, "safety-constant", "$.generator.mode", "Mode wajib 'manual-chat'.");

  const period = isRecord(value.period) ? value.period : {};
  if (!isRecord(value.period)) addError(errors, "type", "$.period", "period harus berupa object.");
  checkKeys(period, PERIOD_KEYS, "$.period", errors);
  requireKeys(period, PERIOD_KEYS, "$.period", errors);
  const periodStart = validDate(period.start_date) ? period.start_date : null;
  const periodEnd = validDate(period.end_date) ? period.end_date : null;
  if (!periodStart) addError(errors, "date", "$.period.start_date", "Tanggal tidak valid.");
  if (!periodEnd) addError(errors, "date", "$.period.end_date", "Tanggal tidak valid.");
  const periodDays = periodStart && periodEnd ? dateOrdinal(periodEnd) - dateOrdinal(periodStart) + 1 : 0;
  if (periodStart && periodEnd && (periodDays < 1 || periodDays > MAX_PERIOD_DAYS)) {
    addError(errors, "topology", "$.period", `Periode paket harus 1–${MAX_PERIOD_DAYS} hari.`);
  }
  const legacyPartTotal = periodDays >= 1 ? Math.ceil(periodDays / DAYS_PER_PART) : 0;
  const singleFile = partTotal === 1;
  if (legacyPartTotal > 0 && !singleFile && partTotal !== legacyPartTotal) {
    addError(errors, "topology", "$.part.total", `part.total wajib 1 untuk single-file atau ${legacyPartTotal} untuk format multipart lama.`);
  }
  let partDays = 0;
  if (periodStart && periodEnd && partNumber >= 1 && partNumber <= partTotal && partStart && partEnd) {
    const spanDays = singleFile ? periodDays : DAYS_PER_PART;
    const expectedStart = dateAt(periodStart, (partNumber - 1) * spanDays);
    const fullPartEnd = dateAt(expectedStart, spanDays - 1);
    const expectedEnd = fullPartEnd < periodEnd ? fullPartEnd : periodEnd;
    if (partStart !== expectedStart || partEnd !== expectedEnd) {
      addError(errors, "part-range", "$.part", `Bagian ${partNumber} wajib mencakup ${expectedStart} sampai ${expectedEnd}.`);
    }
    partDays = dateOrdinal(expectedEnd) - dateOrdinal(expectedStart) + 1;
  }

  const counts = isRecord(value.expected_counts) ? value.expected_counts : {};
  if (!isRecord(value.expected_counts)) addError(errors, "type", "$.expected_counts", "expected_counts harus berupa object.");
  checkKeys(counts, COUNT_KEYS, "$.expected_counts", errors);
  requireKeys(counts, COUNT_KEYS, "$.expected_counts", errors);
  const threadsPerDay = integer(counts.threads_per_day) ? counts.threads_per_day : 0;
  if (threadsPerDay < 1 || threadsPerDay > MAX_THREADS_PER_DAY) {
    addError(errors, "range", "$.expected_counts.threads_per_day", `threads_per_day harus 1–${MAX_THREADS_PER_DAY}.`);
  }
  const exactCounts: Record<string, number> = {
    days_total_package: periodDays,
    posts_min_per_thread: POSTS_MIN_PER_THREAD,
    posts_max_per_thread: POSTS_MAX_PER_THREAD,
    drafts_total_package: periodDays * threadsPerDay,
    drafts_in_this_part: partDays * threadsPerDay
  };
  for (const [field, expected] of Object.entries(exactCounts)) {
    if (counts[field] !== expected) addError(errors, "topology", `$.expected_counts.${field}`, `Wajib bernilai ${expected}.`);
  }

  if (!Array.isArray(value.drafts)) {
    addError(errors, "type", "$.drafts", "drafts harus berupa array.");
    return result();
  }
  stats.drafts = value.drafts.length;
  const expectedDraftsInPart = partDays * threadsPerDay;
  if (value.drafts.length > MAX_DRAFTS_PER_IMPORT) {
    addError(errors, "import-part-too-large", "$.drafts", `Satu file maksimal ${MAX_DRAFTS_PER_IMPORT} draft (${MAX_PERIOD_DAYS} hari × ${MAX_THREADS_PER_DAY} utas).`);
    return result();
  }
  if (value.drafts.length !== expectedDraftsInPart) {
    addError(errors, "topology", "$.drafts", `Bagian ini wajib berisi tepat ${expectedDraftsInPart} draft.`);
    return result();
  }

  const externalIds = new Set<string>();
  const dateSlots = new Set<string>();
  const dates = new Map<string, number[]>();
  const titles = new Set<string>();
  for (let draftIndex = 0; draftIndex < value.drafts.length; draftIndex += 1) {
    const rawDraft = value.drafts[draftIndex];
    const path = `$.drafts[${draftIndex}]`;
    if (!isRecord(rawDraft)) {
      addError(errors, "type", path, "Draft harus berupa object.");
      continue;
    }
    checkKeys(rawDraft, DRAFT_KEYS, path, errors);
    requireKeys(rawDraft, DRAFT_KEYS, path, errors);
    const oversizedNestedArray =
      (Array.isArray(rawDraft.sources) && rawDraft.sources.length > MAX_SOURCES_PER_DRAFT) ||
      (Array.isArray(rawDraft.posts) && rawDraft.posts.length > 8) ||
      (Array.isArray(rawDraft.risk_flags) && rawDraft.risk_flags.length > MAX_FLAGS) ||
      (Array.isArray(rawDraft.traditions_covered) && rawDraft.traditions_covered.length > MAX_TRADITIONS);
    if (oversizedNestedArray) {
      if (Array.isArray(rawDraft.sources) && rawDraft.sources.length > MAX_SOURCES_PER_DRAFT) addError(errors, "max-items", `${path}.sources`, `Maksimal ${MAX_SOURCES_PER_DRAFT} sumber per draft.`);
      if (Array.isArray(rawDraft.posts) && rawDraft.posts.length > 8) addError(errors, "post-count", `${path}.posts`, "Jumlah post harus 6–8.");
      if (Array.isArray(rawDraft.risk_flags) && rawDraft.risk_flags.length > MAX_FLAGS) addError(errors, "max-items", `${path}.risk_flags`, `Maksimal ${MAX_FLAGS} item.`);
      if (Array.isArray(rawDraft.traditions_covered) && rawDraft.traditions_covered.length > MAX_TRADITIONS) addError(errors, "max-items", `${path}.traditions_covered`, `Maksimal ${MAX_TRADITIONS} item.`);
      continue;
    }
    const externalId = canonicalText(rawDraft.external_id) ? rawDraft.external_id : "";
    const match = EXTERNAL_ID_PATTERN.exec(externalId);
    if (!match) addError(errors, "pattern", `${path}.external_id`, "Format external_id tidak valid atau memiliki spasi tepi.");
    if (externalIds.has(externalId)) addError(errors, "duplicate", `${path}.external_id`, "external_id duplikat.");
    externalIds.add(externalId);
    const publishDate = validDate(rawDraft.publish_date) ? rawDraft.publish_date : null;
    if (!publishDate) addError(errors, "date", `${path}.publish_date`, "Tanggal publikasi tidak valid.");
    const slot = integer(rawDraft.slot) ? rawDraft.slot : 0;
    if (slot < 1 || slot > threadsPerDay) addError(errors, "range", `${path}.slot`, `Slot harus 1–${threadsPerDay}.`);
    if (match && publishDate && match[1] !== publishDate.replaceAll("-", "")) addError(errors, "id-date-mismatch", `${path}.external_id`, "Tanggal external_id tidak sama dengan publish_date.");
    if (match && Number(match[2]) !== slot) addError(errors, "id-slot-mismatch", `${path}.external_id`, "Slot external_id tidak sama dengan slot.");
    if (publishDate && partStart && partEnd && (publishDate < partStart || publishDate > partEnd)) addError(errors, "date-range", `${path}.publish_date`, "Tanggal draft berada di luar rentang bagian.");
    if (publishDate && slot > 0) {
      const key = `${publishDate}:${slot}`;
      if (dateSlots.has(key)) addError(errors, "duplicate", path, "Kombinasi publish_date + slot duplikat.");
      dateSlots.add(key);
      dates.set(publishDate, [...(dates.get(publishDate) ?? []), slot]);
    }
    if (!canonicalText(rawDraft.content_pillar) || !CONTENT_PILLARS.has(rawDraft.content_pillar)) addError(errors, "enum", `${path}.content_pillar`, "Pilar konten tidak didukung.");
    if (!stringWithin(rawDraft.series, 1, 160)) addError(errors, "length", `${path}.series`, "Series harus 1–160 karakter tanpa spasi tepi.");
    if (!canonicalText(rawDraft.funnel_goal) || !FUNNEL_GOALS.has(rawDraft.funnel_goal)) addError(errors, "enum", `${path}.funnel_goal`, "Funnel goal tidak didukung.");
    if (!stringWithin(rawDraft.audience_problem, 1, 600)) addError(errors, "length", `${path}.audience_problem`, "Audience problem harus 1–600 karakter tanpa spasi tepi.");
    if (!stringWithin(rawDraft.title, 1, 240)) addError(errors, "length", `${path}.title`, "Judul harus 1–240 karakter tanpa spasi tepi.");
    if (!stringWithin(rawDraft.promise, 1, 600)) addError(errors, "length", `${path}.promise`, "Promise harus 1–600 karakter tanpa spasi tepi.");
    if (!stringWithin(rawDraft.selected_hook, 1, 500)) addError(errors, "length", `${path}.selected_hook`, "Hook harus 1–500 karakter tanpa spasi tepi.");
    if (!stringWithin(rawDraft.hook_rationale, 1, 600)) addError(errors, "length", `${path}.hook_rationale`, "Rasional hook harus 1–600 karakter tanpa spasi tepi.");
    if (!stringWithin(rawDraft.metric_hypothesis, 1, 600)) addError(errors, "length", `${path}.metric_hypothesis`, "Hipotesis metrik harus 1–600 karakter tanpa spasi tepi.");
    if (rawDraft.review_required !== true) addError(errors, "safety-constant", `${path}.review_required`, "review_required wajib true.");
    if (typeof rawDraft.title === "string") {
      if (titles.has(rawDraft.title)) addError(errors, "duplicate-title", `${path}.title`, "Judul harus unik di dalam bagian.");
      titles.add(rawDraft.title);
    }
    const traditionScope = canonicalText(rawDraft.tradition_scope) ? rawDraft.tradition_scope : "";
    if (!TRADITION_SCOPES.has(traditionScope)) addError(errors, "enum", `${path}.tradition_scope`, "Scope tradisi tidak didukung.");
    const traditionsCovered = stringArray(rawDraft.traditions_covered, `${path}.traditions_covered`, errors, { min: 1, max: MAX_TRADITIONS, itemMax: 40, allowed: TRADITIONS });
    if (traditionScope === "cross-tradition" && new Set(traditionsCovered).size < 2) addError(errors, "tradition-scope", path, "Konten cross-tradition harus mencakup minimal dua tradisi.");
    if (["theravada", "mahayana", "vajrayana"].includes(traditionScope) && !traditionsCovered.includes(traditionScope)) addError(errors, "tradition-scope", path, "tradition_scope harus ada di traditions_covered.");
    const riskFlags = stringArray(rawDraft.risk_flags, `${path}.risk_flags`, errors, { max: MAX_FLAGS, itemMax: 100 });

    if (!Array.isArray(rawDraft.sources)) {
      addError(errors, "type", `${path}.sources`, "sources harus berupa array.");
    }
    const sourceValues = Array.isArray(rawDraft.sources) ? rawDraft.sources : [];
    if (sourceValues.length > MAX_SOURCES_PER_DRAFT) addError(errors, "max-items", `${path}.sources`, `Maksimal ${MAX_SOURCES_PER_DRAFT} sumber per draft.`);
    const sources = sourceValues.slice(0, MAX_SOURCES_PER_DRAFT);
    stats.sources += sources.length;
    if (sources.length === 0 && !riskFlags.includes("source-unverified")) addError(errors, "source-flag", path, "Draft tanpa sumber wajib memiliki risk flag 'source-unverified'.");
    const sourceIds = new Set<string>();
    let completeHumanClaims = 0;
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex];
      const sourceId = validateSource(source, `${path}.sources[${sourceIndex}]`, errors, warnings);
      if (sourceId && sourceIds.has(sourceId)) addError(errors, "duplicate", `${path}.sources[${sourceIndex}].source_id`, "source_id duplikat.");
      if (sourceId) sourceIds.add(sourceId);
      if (isRecord(source) && source.verification_status === "verified-by-human" && validDateTime(source.checked_at) && stringWithin(source.checked_by, 1, 160)) completeHumanClaims += 1;
    }
    const requestedReview = canonicalText(rawDraft.source_review_status) ? rawDraft.source_review_status : "";
    if (requestedReview !== "needs-review" && requestedReview !== "verified-by-human") addError(errors, "enum", `${path}.source_review_status`, "Status review sumber tidak didukung.");
    if (requestedReview === "verified-by-human" && (sources.length === 0 || completeHumanClaims !== sources.length)) addError(errors, "human-verification-incomplete", `${path}.source_review_status`, "Semua sumber harus memiliki klaim verifikasi lengkap.");
    sourceReviewRequired += 1;
    addWarning(warnings, "source-review-required", path, "Klaim verifikasi file tidak dipercaya; verifikasi manusia di Content OS tetap wajib.");

    if (!Array.isArray(rawDraft.posts)) {
      addError(errors, "type", `${path}.posts`, "posts harus berupa array.");
      continue;
    }
    if (rawDraft.posts.length < 6 || rawDraft.posts.length > 8) addError(errors, "post-count", `${path}.posts`, "Jumlah post harus 6–8.");
    const posts = rawDraft.posts.slice(0, 8);
    stats.posts += posts.length;
    const validatedPosts = posts.map((post, postIndex) => validatePost(post, postIndex, `${path}.posts[${postIndex}]`, sourceIds, errors));
    const first = validatedPosts[0];
    if (!first || first.role !== "hook") addError(errors, "first-post", `${path}.posts[0].role`, "Post pertama wajib berperan sebagai hook.");
    if (!first || rawDraft.selected_hook !== first.text) addError(errors, "hook-mismatch", `${path}.selected_hook`, "selected_hook harus sama persis dengan teks post pertama.");
    const ctaIndices = validatedPosts.map((post, index) => post.role === "cta" ? index : -1).filter((index) => index >= 0);
    if (ctaIndices.length > 1) addError(errors, "cta-count", `${path}.posts`, "Maksimal satu CTA.");
    if (ctaIndices.length === 1 && ctaIndices[0] !== posts.length - 1) addError(errors, "cta-position", `${path}.posts`, "CTA harus menjadi post terakhir.");
    if (byteLength(JSON.stringify(rawDraft)) > MAX_DRAFT_BYTES) addError(errors, "draft-too-large", path, "Draft terlalu besar untuk satu row D1.");
  }

  stats.dates = dates.size;
  if (partStart) {
    const expectedSlots = Array.from({ length: threadsPerDay }, (_, index) => index + 1);
    const expectedSlotsJson = stableJson(expectedSlots);
    for (let day = 0; day < partDays; day += 1) {
      const date = dateAt(partStart, day);
      const actual = [...(dates.get(date) ?? [])].sort((left, right) => left - right);
      if (stableJson(actual) !== expectedSlotsJson) addError(errors, "daily-slots", "$.drafts", `Tanggal ${date} wajib memiliki tepat slot 1–${threadsPerDay}.`);
    }
  }
  return result();
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 && value === value.trim() ? value : undefined;
}

function normalizeAdminId(value: string): string | null {
  const raw = value.startsWith("telegram:") ? value.slice("telegram:".length) : value;
  return /^\d{3,24}$/.test(raw) ? `telegram:${raw}` : null;
}

function configuredAdmins(env: Env): Set<string> | null {
  const candidate: unknown = Reflect.get(env, "KALYANAMITRA_IMPORT_ADMIN_IDS");
  if (typeof candidate !== "string" || !candidate) return null;
  const raw = candidate;
  const entries = raw.split(",");
  if (entries.length !== 2 || entries.some((value) => !/^\d{3,24}$/.test(value))) return null;
  const admins = new Set(entries.map((value) => `telegram:${value}`));
  return admins.size === 2 ? admins : null;
}

async function constantTimeMatch(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([sha256(provided), sha256(expected)]);
  let mismatch = providedHash.length ^ expectedHash.length;
  for (let index = 0; index < Math.max(providedHash.length, expectedHash.length); index += 1) mismatch |= (providedHash.charCodeAt(index) || 0) ^ (expectedHash.charCodeAt(index) || 0);
  return mismatch === 0;
}

async function authorize(request: Request, env: Env): Promise<string> {
  const expectedToken = readBinding(env, "KALYANAMITRA_CONTENT_OS_TOKEN");
  const admins = configuredAdmins(env);
  if (!expectedToken || expectedToken.length < 24 || expectedToken.length > 4_096 || !admins) throw new ContentPackImportError(503, "Importer Kalyanamitra belum dikonfigurasi lengkap.", "importer-not-configured");
  const providedToken = request.headers.get("X-OpenClaw-Token") ?? "";
  if (!providedToken || providedToken.length > 4_096 || providedToken !== providedToken.trim() || !await constantTimeMatch(providedToken, expectedToken)) throw new ContentPackImportError(403, "Token importer tidak valid.", "forbidden");
  const header = request.headers.get("X-Content-OS-Admin") ?? "";
  const adminId = header === header.trim() ? normalizeAdminId(header) : null;
  if (!adminId || !admins.has(adminId)) throw new ContentPackImportError(403, "Admin Telegram tidak termasuk allowlist importer.", "admin-not-allowlisted");
  return adminId;
}

async function readLimitedText(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximum) {
        await reader.cancel("payload_too_large");
        throw new ContentPackImportError(413, "File content pack terlalu besar.", "payload-too-large");
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } catch (error) {
    if (error instanceof ContentPackImportError) throw error;
    throw new ContentPackImportError(400, "File harus menggunakan UTF-8 yang valid.", "invalid-encoding");
  } finally {
    reader.releaseLock();
  }
}

function baseResponse(extra: JsonRecord = {}): JsonRecord {
  return { ok: false, namespace: CONTENT_PACK_NAMESPACE, publisher_mode: "draft-only", automatic_publish: false, human_approval_required: true, ...extra };
}

function publicFailure(error: unknown, requestId: string): ContentPackImportResult {
  if (error instanceof ContentPackImportError) {
    return { status: error.status, body: baseResponse({ request_id: requestId, code: error.code, error: error.publicMessage, details: error.details ?? null }) };
  }
  console.error(JSON.stringify({ message: "content_pack_import_failed", requestId, error: error instanceof Error ? error.message : String(error) }));
  return { status: 500, body: baseResponse({ request_id: requestId, code: "internal-error", error: "Importer mengalami kegagalan internal." }) };
}

async function assertSchemaReady(env: Env): Promise<void> {
  let schemaStep = "brand";
  try {
    const brandCheck = await env.DB.prepare(
      `SELECT COUNT(*) AS ready FROM brands
       WHERE id = ? AND name = ? AND slug = ? AND status = 'active'`
    ).bind(CONTENT_PACK_BRAND_ID, BRAND_NAME, BRAND_SLUG).first<{ ready: number }>();

    schemaStep = "imports-package-index";
    const importsPackage = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS ready
       FROM content_pack_imports INDEXED BY idx_content_pack_imports_package`
    ).first<{ ready: number }>();

    schemaStep = "imports-status-index";
    const importsStatus = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS ready
       FROM content_pack_imports INDEXED BY idx_content_pack_imports_status`
    ).first<{ ready: number }>();

    schemaStep = "items-date-index";
    const itemsDate = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS ready
       FROM content_pack_items INDEXED BY idx_content_pack_items_date`
    ).first<{ ready: number }>();

    schemaStep = "items-import-index";
    const itemsImport = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS ready
       FROM content_pack_items INDEXED BY idx_content_pack_items_import`
    ).first<{ ready: number }>();

    schemaStep = "guards-table";
    const guardsTable = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS ready FROM content_pack_commit_guards`
    ).first<{ ready: number }>();

    schemaStep = "evaluate";
    const operationalChecks: Array<[string, { ready: number } | null]> = [
      ["imports_package_index_ready", importsPackage],
      ["imports_status_index_ready", importsStatus],
      ["items_date_index_ready", itemsDate],
      ["items_import_index_ready", itemsImport],
      ["guards_table_ready", guardsTable]
    ];

    const failedChecks = [
      ...(Number(brandCheck?.ready) === 1 ? [] : ["brand_ready"]),
      ...operationalChecks
        .filter(([, result]) => Number(result?.ready) < 1)
        .map(([name]) => name)
    ];
    if (failedChecks.length > 0) {
      throw new ContentPackImportError(
        503,
        "Schema importer Kalyanamitra belum siap.",
        "importer-schema-not-ready",
        { failed_checks: failedChecks }
      );
    }
  } catch (error) {
    if (error instanceof ContentPackImportError) throw error;
    const schemaError = error instanceof Error
      ? error.message.replace(/\s+/g, " ").slice(0, 240)
      : "unknown-error";
    throw new ContentPackImportError(
      503,
      "Schema importer Kalyanamitra belum siap.",
      "importer-schema-not-ready",
      {
        failed_checks: ["schema-query"],
        schema_step: schemaStep,
        schema_error: schemaError
      }
    );
  }
}

async function cleanupExpiredQuarantine(env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE content_pack_imports SET status = 'expired', payload_json = NULL, confirmation_token_hash = NULL
     WHERE id IN (
       SELECT id FROM content_pack_imports
       WHERE status = 'pending' AND expires_at <= ? ORDER BY expires_at LIMIT 25
     )`
  ).bind(new Date().toISOString()).run();
}

function manifest(pack: JsonRecord): JsonRecord {
  const period = pack.period as JsonRecord;
  const part = pack.part as JsonRecord;
  const counts = pack.expected_counts as JsonRecord;
  const periodDays = dateOrdinal(String(period.end_date)) - dateOrdinal(String(period.start_date)) + 1;
  const partDays = dateOrdinal(String(part.end_date)) - dateOrdinal(String(part.start_date)) + 1;
  const threadsPerDay = Number(counts.threads_per_day);
  return {
    period_start: period.start_date,
    period_end: period.end_date,
    part_number: part.number,
    part_total: part.total,
    part_start: part.start_date,
    part_end: part.end_date,
    days_total_package: periodDays,
    threads_per_day: threadsPerDay,
    drafts_total_package: periodDays * threadsPerDay,
    drafts_in_part: partDays * threadsPerDay,
    posts_min_per_thread: POSTS_MIN_PER_THREAD,
    posts_max_per_thread: POSTS_MAX_PER_THREAD
  };
}

async function packageHistory(env: Env, pack: JsonRecord): Promise<{ receivedParts: number }> {
  const expected = manifest(pack);
  const history = await env.DB.prepare(
    `SELECT id, package_revision, part_number, part_total,
            COALESCE(json_extract(payload_json, '$.period.start_date'), json_extract(summary_json, '$.manifest.period_start')) AS period_start,
            COALESCE(json_extract(payload_json, '$.period.end_date'), json_extract(summary_json, '$.manifest.period_end')) AS period_end,
            COALESCE(json_extract(payload_json, '$.part.number'), json_extract(summary_json, '$.manifest.part_number')) AS manifest_part_number,
            COALESCE(json_extract(payload_json, '$.part.total'), json_extract(summary_json, '$.manifest.part_total')) AS manifest_part_total,
            COALESCE(json_extract(payload_json, '$.part.start_date'), json_extract(summary_json, '$.manifest.part_start')) AS part_start,
            COALESCE(json_extract(payload_json, '$.part.end_date'), json_extract(summary_json, '$.manifest.part_end')) AS part_end,
            COALESCE(json_extract(payload_json, '$.expected_counts.days_total_package'), json_extract(summary_json, '$.manifest.days_total_package')) AS days_total_package,
            COALESCE(json_extract(payload_json, '$.expected_counts.threads_per_day'), json_extract(summary_json, '$.manifest.threads_per_day')) AS threads_per_day,
            COALESCE(json_extract(payload_json, '$.expected_counts.drafts_total_package'), json_extract(summary_json, '$.manifest.drafts_total_package')) AS drafts_total_package,
            COALESCE(json_extract(payload_json, '$.expected_counts.drafts_in_this_part'), json_extract(summary_json, '$.manifest.drafts_in_part')) AS drafts_in_part,
            COALESCE(json_extract(payload_json, '$.expected_counts.posts_min_per_thread'), json_extract(summary_json, '$.manifest.posts_min_per_thread')) AS posts_min_per_thread,
            COALESCE(json_extract(payload_json, '$.expected_counts.posts_max_per_thread'), json_extract(summary_json, '$.manifest.posts_max_per_thread')) AS posts_max_per_thread
     FROM content_pack_imports
     WHERE namespace = ? AND package_id = ? AND status IN ('pending', 'committed')
     ORDER BY created_at LIMIT 101`
  ).bind(CONTENT_PACK_NAMESPACE, pack.package_id).all<PackageHistoryRow>();
  if (history.results.length > MAX_PACKAGE_HISTORY) throw new ContentPackImportError(409, "Riwayat paket terlalu besar untuk diverifikasi aman.", "package-history-too-large");
  const parts = new Set<number>();
  const expectedPartTotal = Number(expected.part_total);
  const historySpanDays = expectedPartTotal === 1 ? Number(expected.days_total_package) : DAYS_PER_PART;
  for (const row of history.results) {
    const partNumber = Number(row.part_number);
    const expectedStart = integer(partNumber) && partNumber >= 1 && partNumber <= expectedPartTotal
      ? dateAt(String(expected.period_start), (partNumber - 1) * historySpanDays)
      : "";
    const fullPartEnd = expectedStart ? dateAt(expectedStart, historySpanDays - 1) : "";
    const expectedEnd = fullPartEnd && fullPartEnd < String(expected.period_end) ? fullPartEnd : String(expected.period_end);
    const expectedPartDays = expectedStart && expectedEnd ? dateOrdinal(expectedEnd) - dateOrdinal(expectedStart) + 1 : 0;
    const expectedDraftsInPart = expectedPartDays * Number(expected.threads_per_day);
    const valid = Number(row.package_revision) === Number(pack.package_revision) &&
      partNumber >= 1 && partNumber <= expectedPartTotal && Number(row.part_total) === expectedPartTotal &&
      Number(row.manifest_part_number) === partNumber && Number(row.manifest_part_total) === expectedPartTotal &&
      row.period_start === expected.period_start && row.period_end === expected.period_end &&
      row.part_start === expectedStart && row.part_end === expectedEnd &&
      Number(row.days_total_package) === Number(expected.days_total_package) &&
      Number(row.threads_per_day) === Number(expected.threads_per_day) &&
      Number(row.drafts_total_package) === Number(expected.drafts_total_package) &&
      Number(row.drafts_in_part) === expectedDraftsInPart &&
      Number(row.posts_min_per_thread) === Number(expected.posts_min_per_thread) &&
      Number(row.posts_max_per_thread) === Number(expected.posts_max_per_thread);
    if (!valid) throw new ContentPackImportError(409, "Manifest paket bertentangan dengan bagian aktif yang sudah diterima.", "package-manifest-conflict", { import_id: row.id, part_number: row.part_number });
    parts.add(partNumber);
  }
  parts.add(Number((pack.part as JsonRecord).number));
  return { receivedParts: parts.size };
}

async function preflight(env: Env, pack: JsonRecord): Promise<PreflightResult> {
  const packageId = String(pack.package_id);
  const part = pack.part as JsonRecord;
  const drafts = pack.drafts as JsonRecord[];
  const [existingItems, occupiedSlots] = await Promise.all([
    env.DB.prepare(
      `SELECT external_id, publish_date, slot, content_fingerprint, content_item_id
       FROM content_pack_items WHERE namespace = ? AND package_id = ? LIMIT ${MAX_DRAFTS_PER_IMPORT + 1}`
    ).bind(CONTENT_PACK_NAMESPACE, packageId).all<ImportedItemRow>(),
    env.DB.prepare(
      `SELECT package_id, external_id, publish_date, slot, content_item_id
       FROM content_pack_items WHERE namespace = ? AND publish_date BETWEEN ? AND ? LIMIT ${MAX_DRAFTS_PER_IMPORT + 1}`
    ).bind(CONTENT_PACK_NAMESPACE, part.start_date, part.end_date).all<OccupiedSlotRow>()
  ]);
  if (existingItems.results.length > MAX_DRAFTS_PER_IMPORT || occupiedSlots.results.length > MAX_DRAFTS_PER_IMPORT) throw new ContentPackImportError(409, "Ledger importer melebihi batas aman preflight.", "preflight-history-too-large");
  const byExternalId = new Map(existingItems.results.map((row) => [row.external_id, row]));
  const bySlot = new Map(occupiedSlots.results.map((row) => [`${row.publish_date}:${row.slot}`, row]));
  const items: PreflightItem[] = [];
  const conflicts: JsonRecord[] = [];
  for (const draft of drafts.slice(0, MAX_DRAFTS_PER_IMPORT)) {
    const externalId = String(draft.external_id);
    const publishDate = String(draft.publish_date);
    const slot = Number(draft.slot);
    const fingerprint = await fingerprintContentPackDraft(draft);
    const existing = byExternalId.get(externalId);
    if (existing) {
      if (existing.content_fingerprint === fingerprint) items.push({ draft, fingerprint, outcome: "already-imported", contentItemId: existing.content_item_id });
      else {
        items.push({ draft, fingerprint, outcome: "external-id-conflict", contentItemId: existing.content_item_id });
        conflicts.push({ code: "external-id-conflict", external_id: externalId, content_item_id: existing.content_item_id });
      }
      continue;
    }
    const occupied = bySlot.get(`${publishDate}:${slot}`);
    if (occupied) {
      items.push({ draft, fingerprint, outcome: "date-slot-conflict", contentItemId: occupied.content_item_id });
      conflicts.push({ code: "date-slot-conflict", external_id: externalId, publish_date: publishDate, slot, occupied_by_package_id: occupied.package_id, occupied_by_external_id: occupied.external_id, content_item_id: occupied.content_item_id });
      continue;
    }
    items.push({ draft, fingerprint, outcome: "new", contentItemId: null });
  }
  return {
    items,
    valid: items.filter((item) => item.outcome === "new").length,
    duplicates: items.filter((item) => item.outcome === "already-imported").length,
    rejected: conflicts.length,
    conflicts
  };
}

function dryRunSummary(pack: JsonRecord, validation: ContentPackValidation, result: PreflightResult, receivedParts: number): JsonRecord {
  const part = pack.part as JsonRecord;
  return {
    package_id: pack.package_id,
    package_revision: pack.package_revision,
    schema_version: pack.schema_version,
    part_number: part.number,
    parts_received: receivedParts,
    parts_expected: part.total,
    drafts_received: validation.stats.drafts,
    valid: result.valid,
    warnings: validation.warnings.length,
    warning_details: validation.warnings,
    rejected: result.rejected,
    rejection_details: result.conflicts,
    duplicates: result.duplicates,
    source_review_required: validation.sourceReviewRequired,
    ready_for_confirmation: result.rejected === 0,
    content_status: "draft",
    publisher_mode: "draft-only",
    automatic_publish: false,
    human_approval_required: true,
    manifest: manifest(pack)
  };
}

async function stageRejected(env: Env, pack: JsonRecord, filename: string, fileHash: string, adminId: string, summary: JsonRecord, importId: string): Promise<void> {
  const part = pack.part as JsonRecord;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO content_pack_imports
       (id, namespace, package_id, package_revision, part_number, part_total, file_hash, filename,
        payload_json, summary_json, admin_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'rejected')`
    ).bind(importId, CONTENT_PACK_NAMESPACE, pack.package_id, pack.package_revision, part.number, part.total, fileHash, filename, JSON.stringify(summary), adminId),
    env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
       VALUES ('content_pack.import_rejected', 'content_pack_import', ?, 'failure', ?, ?)`
    ).bind(importId, "Content pack ditolak pada duplicate preflight.", JSON.stringify({ namespace: CONTENT_PACK_NAMESPACE, packageId: pack.package_id, fileHash, valid: summary.valid, duplicates: summary.duplicates, rejected: summary.rejected, automaticPublish: false }))
  ]);
}

function parseUploadedDocument(raw: string, filename: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ContentPackImportError(400, "File bukan JSON yang valid.", "invalid-json");
  }
  if (!isRecord(value)) throw new ContentPackImportError(400, "Dokumen JSON teratas harus berupa object.", "invalid-document");
  const version = canonicalText(value.schema_version) ? value.schema_version : "";
  if (version === IDEA_INBOX_SCHEMA_VERSION || version === VIRAL_RESEARCH_SCHEMA_VERSION || filename.endsWith(".idea-inbox.json") || filename.endsWith(".viral-research.json")) {
    throw new ContentPackImportError(415, "File ini hanya untuk perencanaan dan tidak boleh diimpor sebagai draft.", "planning-only");
  }
  if (!filename.endsWith(CONTENT_PACK_SUFFIX)) throw new ContentPackImportError(415, `Nama file wajib berakhiran ${CONTENT_PACK_SUFFIX}.`, "unsupported-filename");
  if (version !== CONTENT_PACK_SCHEMA_VERSION) throw new ContentPackImportError(415, "Versi schema content pack tidak didukung.", "unsupported-schema", {
    schema_version: version && charLength(version) <= 120 ? version : null
  });
  return value;
}

function uploadFilename(request: Request): string {
  const raw = request.headers.get("X-Content-Pack-Filename") ?? "";
  if (!canonicalText(raw) || raw.length > 180 || raw.includes("/") || raw.includes("\\")) throw new ContentPackImportError(400, "Header X-Content-Pack-Filename tidak valid.", "invalid-filename");
  return raw.toLowerCase();
}

export async function dryRunContentPackImport(request: Request, env: Env): Promise<ContentPackImportResult> {
  const requestId = crypto.randomUUID();
  try {
    const adminId = await authorize(request, env);
    const contentType = text(request.headers.get("Content-Type")).toLowerCase();
    if (!contentType.startsWith("application/json")) throw new ContentPackImportError(415, "Content-Type wajib application/json.", "unsupported-media-type");
    const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new ContentPackImportError(413, "File content pack terlalu besar.", "payload-too-large");
    const filename = uploadFilename(request);
    const raw = await readLimitedText(request.body, MAX_REQUEST_BYTES);
    const pack = parseUploadedDocument(raw, filename);
    const validation = validateContentPackDocument(pack);
    if (!validation.ok) {
      const oversized = validation.errors.find((issue) => issue.code === "import-part-too-large");
      throw new ContentPackImportError(
        422,
        "Content pack gagal validasi dan tidak disimpan.",
        oversized ? "import-part-too-large" : "validation-failed",
        oversized
          ? { maximum: MAX_DRAFTS_PER_IMPORT, received: validation.stats.drafts }
          : { errors: validation.errors, warnings: validation.warnings, stats: validation.stats }
      );
    }
    await assertSchemaReady(env);
    await cleanupExpiredQuarantine(env);
    const history = await packageHistory(env, pack);
    const fileHash = await sha256(raw);
    const result = await preflight(env, pack);
    const summary = dryRunSummary(pack, validation, result, history.receivedParts);
    const importId = crypto.randomUUID();
    if (result.rejected > 0) {
      await stageRejected(env, pack, filename, fileHash, adminId, summary, importId);
      return { status: 409, body: baseResponse({ request_id: requestId, import_id: importId, code: "preflight-conflict", ...summary }) };
    }
    const confirmationToken = randomToken();
    const confirmationTokenHash = await sha256(confirmationToken);
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
    const part = pack.part as JsonRecord;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE content_pack_imports SET status = 'expired', payload_json = NULL, confirmation_token_hash = NULL
         WHERE namespace = ? AND package_id = ? AND part_number = ? AND admin_id = ? AND status = 'pending'`
      ).bind(CONTENT_PACK_NAMESPACE, pack.package_id, part.number, adminId),
      env.DB.prepare(
        `INSERT INTO content_pack_imports
         (id, namespace, package_id, package_revision, part_number, part_total, file_hash, filename,
          payload_json, summary_json, admin_id, status, confirmation_token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).bind(importId, CONTENT_PACK_NAMESPACE, pack.package_id, pack.package_revision, part.number, part.total, fileHash, filename, raw, JSON.stringify(summary), adminId, confirmationTokenHash, expiresAt),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
         VALUES ('content_pack.dry_run_ready', 'content_pack_import', ?, 'success', ?, ?)`
      ).bind(importId, "Content pack lolos dry-run dan menunggu konfirmasi admin.", JSON.stringify({ namespace: CONTENT_PACK_NAMESPACE, packageId: pack.package_id, packageRevision: pack.package_revision, partNumber: part.number, fileHash, valid: result.valid, duplicates: result.duplicates, sourceReviewRequired: validation.sourceReviewRequired, automaticPublish: false, expiresAt }))
    ]);
    return { status: 200, body: { ok: true, request_id: requestId, import_id: importId, confirmation_token: confirmationToken, confirmation_expires_at: expiresAt, ...summary } };
  } catch (error) {
    return publicFailure(error, requestId);
  }
}

function parseConfirmation(raw: string): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ContentPackImportError(400, "Body konfirmasi harus berupa JSON valid.", "invalid-json");
  }
  if (!isRecord(value) || Object.keys(value).length !== 1 || !("confirmation_token" in value)) throw new ContentPackImportError(400, "Body konfirmasi tidak valid.", "invalid-confirmation");
  const token = canonicalText(value.confirmation_token) ? value.confirmation_token : "";
  if (!/^[0-9a-f]{64}$/.test(token)) throw new ContentPackImportError(400, "Token konfirmasi tidak valid.", "invalid-confirmation-token");
  return token;
}

function mappedSources(draft: JsonRecord): JsonRecord[] {
  return (draft.sources as JsonRecord[]).slice(0, MAX_SOURCES_PER_DRAFT).map((source) => ({
    sourceId: source.source_id,
    providerId: source.provider_id,
    title: source.title,
    authorTeacherOrTranslator: source.author_teacher_or_translator ?? null,
    tradition: source.tradition,
    sourceType: source.source_type,
    url: source.url,
    locator: source.locator,
    claimSupported: source.claim_supported,
    canonicalVerificationStatus: "needs-review",
    requestedVerificationStatus: source.verification_status,
    verificationStatus: "needs-review",
    checkedAt: null,
    checkedBy: null
  }));
}

function mappedBody(pack: JsonRecord, draft: JsonRecord, importId: string): JsonRecord {
  const posts = (draft.posts as JsonRecord[]).slice(0, 8);
  const sources = mappedSources(draft);
  const sourceReview = { status: "needs-review", requestedStatus: draft.source_review_status, checkedAt: null, checkedBy: null };
  const canonicalDraft = {
    ...draft,
    source_review_status: "needs-review",
    sources: (draft.sources as JsonRecord[]).slice(0, MAX_SOURCES_PER_DRAFT).map((source) => ({
      ...source,
      verification_status: "needs-review",
      checked_at: null,
      checked_by: null
    }))
  };
  const riskFlags = [...new Set(["source-review-required", ...(pack.package_risk_flags as string[]), ...(draft.risk_flags as string[])])]
    .slice(0, MAX_FLAGS + 1);
  const cta = posts.find((post) => post.role === "cta");
  const metadata = {
    displayId: String(draft.external_id).toUpperCase(), externalId: draft.external_id,
    namespace: CONTENT_PACK_NAMESPACE, brandId: CONTENT_PACK_BRAND_ID, packageId: pack.package_id,
    packageRevision: pack.package_revision, partNumber: (pack.part as JsonRecord).number,
    publishDate: draft.publish_date, slot: draft.slot, contentPillar: draft.content_pillar,
    series: draft.series, funnelGoal: draft.funnel_goal, audienceProblem: draft.audience_problem,
    metricHypothesis: draft.metric_hypothesis, targetPlatform: "threads",
    source: "kalyanamitra_content_pack_import", importId, namespaceVerified: true,
    humanApprovalRequired: true, automaticPublish: false, publisherMode: "draft-only",
    sources, sourceReview, riskFlags
  };
  return {
    title: draft.title, hook: draft.selected_hook, mainAngle: draft.promise,
    threadsPosts: posts.map((post) => post.text), cta: cta?.text ?? "",
    contentStatus: "draft", publisherMode: "draft-only", automaticPublish: false,
    humanApprovalRequired: true, sources, sourceReview, riskFlags, metadata, canonicalDraft
  };
}

function topicMetadata(pack: JsonRecord, draft: JsonRecord, importId: string): JsonRecord {
  return {
    namespace: CONTENT_PACK_NAMESPACE, brandId: CONTENT_PACK_BRAND_ID, externalId: draft.external_id,
    packageId: pack.package_id, packageRevision: pack.package_revision,
    partNumber: (pack.part as JsonRecord).number, publishDate: draft.publish_date, slot: draft.slot,
    contentPillar: draft.content_pillar, series: draft.series, funnelGoal: draft.funnel_goal,
    importId, source: "kalyanamitra_content_pack_import", automaticPublish: false, publisherMode: "draft-only"
  };
}

function safeSummary(raw: string): JsonRecord {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

async function expireImport(env: Env, row: ImportRow): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_pack_imports SET status = 'expired', payload_json = NULL, confirmation_token_hash = NULL
       WHERE id = ? AND status = 'pending'`
    ).bind(row.id),
    env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
       VALUES ('content_pack.confirmation_expired', 'content_pack_import', ?, 'failure', ?, ?)`
    ).bind(row.id, "Konfirmasi content pack kedaluwarsa.", JSON.stringify({ packageId: row.package_id, automaticPublish: false }))
  ]);
}

function alreadyConsumed(requestId: string, importId: string, summary: JsonRecord): ContentPackImportResult {
  return {
    status: 409,
    body: baseResponse({ request_id: requestId, import_id: importId, code: "confirmation-already-consumed", status: "committed", unchanged: true, summary })
  };
}

async function reconcileCommitFailure(
  env: Env,
  row: ImportRow,
  pack: JsonRecord,
  validation: ContentPackValidation,
  requestId: string,
  originalError: unknown
): Promise<ContentPackImportResult> {
  const state = await env.DB.prepare(
    `SELECT i.status, i.expires_at, i.summary_json,
            CASE WHEN g.import_id IS NULL THEN 0 ELSE 1 END AS guard_claimed
     FROM content_pack_imports i LEFT JOIN content_pack_commit_guards g ON g.import_id = i.id
     WHERE i.id = ? LIMIT 1`
  ).bind(row.id).first<CommitStateRow>();
  if (state?.status === "committed" || Number(state?.guard_claimed) === 1) return alreadyConsumed(requestId, row.id, safeSummary(state?.summary_json ?? row.summary_json));
  if (state?.status === "expired" || !state?.expires_at || Date.parse(state.expires_at) <= Date.now()) {
    if (state?.status === "pending") await expireImport(env, row);
    throw new ContentPackImportError(410, "Konfirmasi sudah kedaluwarsa; jalankan dry-run ulang.", "confirmation-expired");
  }
  const retry = await preflight(env, pack);
  if (retry.rejected > 0) {
    const summary = dryRunSummary(pack, validation, retry, 1);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE content_pack_imports SET status = 'rejected', payload_json = NULL,
         confirmation_token_hash = NULL, summary_json = ? WHERE id = ? AND status = 'pending'`
      ).bind(JSON.stringify(summary), row.id),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
         VALUES ('content_pack.import_rejected', 'content_pack_import', ?, 'failure', ?, ?)`
      ).bind(row.id, "Content pack kalah race pada date-slot ledger.", JSON.stringify({ packageId: row.package_id, rejected: retry.rejected, conflicts: retry.conflicts, automaticPublish: false }))
    ]);
    throw new ContentPackImportError(409, "Terjadi konflik baru sejak dry-run; import dibatalkan.", "preflight-conflict", retry.conflicts);
  }
  throw originalError;
}

export async function confirmContentPackImport(request: Request, env: Env, importId: string): Promise<ContentPackImportResult> {
  const requestId = crypto.randomUUID();
  try {
    const adminId = await authorize(request, env);
    if (!UUID_PATTERN.test(importId)) throw new ContentPackImportError(400, "Import ID tidak valid.", "invalid-import-id");
    const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CONFIRM_BYTES) throw new ContentPackImportError(413, "Body konfirmasi terlalu besar.", "payload-too-large");
    const raw = await readLimitedText(request.body, MAX_CONFIRM_BYTES);
    const confirmationToken = parseConfirmation(raw);
    await assertSchemaReady(env);
    const row = await env.DB.prepare(
      `SELECT id, namespace, package_id, package_revision, part_number, part_total, file_hash, filename,
              payload_json, summary_json, admin_id, status, confirmation_token_hash, expires_at,
              created_at, confirmed_at FROM content_pack_imports WHERE id = ? LIMIT 1`
    ).bind(importId).first<ImportRow>();
    if (!row) throw new ContentPackImportError(404, "Dry-run import tidak ditemukan.", "import-not-found");
    if (row.admin_id !== adminId) throw new ContentPackImportError(403, "Konfirmasi harus dilakukan admin yang memulai dry-run.", "admin-mismatch");
    if (row.status === "committed") return alreadyConsumed(requestId, importId, safeSummary(row.summary_json));
    if (row.status === "expired") throw new ContentPackImportError(410, "Konfirmasi sudah kedaluwarsa; jalankan dry-run ulang.", "confirmation-expired");
    if (row.status !== "pending") throw new ContentPackImportError(409, "Dry-run tidak lagi dapat dikonfirmasi.", "import-not-pending", { status: row.status });
    if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
      await expireImport(env, row);
      throw new ContentPackImportError(410, "Konfirmasi sudah kedaluwarsa; jalankan dry-run ulang.", "confirmation-expired");
    }
    const providedConfirmationHash = await sha256(confirmationToken);
    if (!row.confirmation_token_hash || !await constantTimeMatch(providedConfirmationHash, row.confirmation_token_hash)) throw new ContentPackImportError(403, "Token konfirmasi tidak valid.", "invalid-confirmation-token");
    if (!row.payload_json || await sha256(row.payload_json) !== row.file_hash) throw new ContentPackImportError(409, "Payload karantina tidak utuh.", "quarantine-integrity-failed");
    const pack = parseUploadedDocument(row.payload_json, row.filename);
    const validation = validateContentPackDocument(pack);
    if (!validation.ok) throw new ContentPackImportError(409, "Payload tidak lagi lolos validasi.", "revalidation-failed", { errors: validation.errors });
    if (pack.package_id !== row.package_id || pack.package_revision !== row.package_revision ||
        (pack.part as JsonRecord).number !== row.part_number || (pack.part as JsonRecord).total !== row.part_total) {
      throw new ContentPackImportError(409, "Identitas payload karantina tidak cocok dengan record import.", "quarantine-identity-mismatch");
    }
    await packageHistory(env, pack);
    const result = await preflight(env, pack);
    if (result.rejected > 0) {
      const summary = dryRunSummary(pack, validation, result, 1);
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE content_pack_imports SET status = 'rejected', payload_json = NULL,
           confirmation_token_hash = NULL, summary_json = ? WHERE id = ? AND status = 'pending'`
        ).bind(JSON.stringify(summary), importId),
        env.DB.prepare(
          `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
           VALUES ('content_pack.import_rejected', 'content_pack_import', ?, 'failure', ?, ?)`
        ).bind(importId, "Content pack berubah konflik sebelum konfirmasi.", JSON.stringify({ packageId: row.package_id, fileHash: row.file_hash, rejected: result.rejected, conflicts: result.conflicts, automaticPublish: false }))
      ]);
      throw new ContentPackImportError(409, "Terjadi konflik baru sejak dry-run; import dibatalkan.", "preflight-conflict", result.conflicts);
    }

    const statements: D1PreparedStatement[] = [];
    const created: JsonRecord[] = [];
    const duplicates: JsonRecord[] = [];
    const newItems: Array<{ item: PreflightItem; topicId: string; contentItemId: string; bodyJson: string }> = [];
    for (const item of result.items) {
      const draft = item.draft;
      if (item.outcome === "already-imported") {
        duplicates.push({ external_id: draft.external_id, content_item_id: item.contentItemId, status: "already-imported" });
        continue;
      }
      const topicId = crypto.randomUUID();
      const contentItemId = crypto.randomUUID();
      const bodyJson = JSON.stringify(mappedBody(pack, draft, importId));
      if (byteLength(bodyJson) > MAX_MAPPED_ROW_BYTES) throw new ContentPackImportError(422, "Hasil pemetaan draft terlalu besar untuk D1.", "mapped-row-too-large", { external_id: draft.external_id });
      newItems.push({ item, topicId, contentItemId, bodyJson });
      created.push({ external_id: draft.external_id, content_item_id: contentItemId, status: "draft" });
    }

    const commitNow = new Date().toISOString();
    // The guard must remain statement zero. A missing/expired pending row yields NULL and aborts the batch.
    statements.push(env.DB.prepare(
      `INSERT INTO content_pack_commit_guards (import_id)
       VALUES ((SELECT id FROM content_pack_imports
                WHERE id = ? AND status = 'pending'
                  AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') LIMIT 1))`
    ).bind(importId));
    for (const group of chunks(newItems, Math.floor(MAX_D1_BINDINGS_PER_STATEMENT / 5))) {
      const bindings = group.flatMap(({ item, topicId }) => {
        const source = (item.draft.sources as JsonRecord[])[0];
        return [topicId, CONTENT_PACK_BRAND_ID, item.draft.title, source?.url ?? null, JSON.stringify(topicMetadata(pack, item.draft, importId))];
      });
      statements.push(env.DB.prepare(
        `INSERT INTO topics (id, brand_id, title, source_type, source_url, relevance_score, status, metadata_json)
         VALUES ${Array.from({ length: group.length }, () => "(?, ?, ?, 'manual-import', ?, 0, 'produced', ?)").join(", ")}`
      ).bind(...bindings));
    }
    for (const group of chunks(newItems, Math.floor(MAX_D1_BINDINGS_PER_STATEMENT / 5))) {
      const bindings = group.flatMap(({ item, topicId, contentItemId, bodyJson }) => [contentItemId, topicId, CONTENT_PACK_BRAND_ID, item.draft.title, bodyJson]);
      statements.push(env.DB.prepare(
        `INSERT INTO content_items (id, topic_id, brand_id, title, body_json, format, platform, status, version)
         VALUES ${Array.from({ length: group.length }, () => "(?, ?, ?, ?, ?, 'thread', 'threads', 'draft', 1)").join(", ")}`
      ).bind(...bindings));
    }
    for (const group of chunks(newItems, Math.floor(MAX_D1_BINDINGS_PER_STATEMENT / 9))) {
      const bindings = group.flatMap(({ item, contentItemId }) => [
        CONTENT_PACK_NAMESPACE, pack.package_id, item.draft.external_id, item.draft.publish_date,
        item.draft.slot, item.fingerprint, contentItemId, pack.package_revision, importId
      ]);
      statements.push(env.DB.prepare(
        `INSERT INTO content_pack_items
         (namespace, package_id, external_id, publish_date, slot, content_fingerprint, content_item_id, package_revision, import_id)
         VALUES ${valueGroups(group.length, 9)}`
      ).bind(...bindings));
    }
    const finalSummary = { ...safeSummary(row.summary_json), created: created.length, duplicates: duplicates.length, committed_at: commitNow, automatic_publish: false };
    statements.push(
      env.DB.prepare(
        `UPDATE content_pack_imports SET status = 'committed', payload_json = NULL, confirmation_token_hash = NULL,
         summary_json = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`
      ).bind(JSON.stringify(finalSummary), importId),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
         VALUES ('content_pack.import_committed', 'content_pack_import', ?, 'success', ?, ?)`
      ).bind(importId, "Content pack diimpor sebagai draft; tidak ada publikasi otomatis.", JSON.stringify({ namespace: CONTENT_PACK_NAMESPACE, packageId: row.package_id, packageRevision: row.package_revision, partNumber: row.part_number, fileHash: row.file_hash, created: created.length, duplicates: duplicates.length, sourceReviewRequired: validation.sourceReviewRequired, contentStatus: "draft", publisherMode: "draft-only", automaticPublish: false, humanApprovalRequired: true }))
    );
    try {
      await env.DB.batch(statements);
    } catch (error) {
      return await reconcileCommitFailure(env, row, pack, validation, requestId, error);
    }
    return {
      status: 200,
      body: {
        ok: true, request_id: requestId, import_id: importId, package_id: row.package_id,
        package_revision: row.package_revision, part_number: row.part_number, status: "committed",
        created: created.length, duplicates: duplicates.length, items: [...created, ...duplicates],
        content_status: "draft", publisher_mode: "draft-only", automatic_publish: false,
        human_approval_required: true
      }
    };
  } catch (error) {
    return publicFailure(error, requestId);
  }
}
