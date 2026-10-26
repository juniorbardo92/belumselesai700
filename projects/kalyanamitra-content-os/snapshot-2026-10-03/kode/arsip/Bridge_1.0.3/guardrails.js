export const KALYANAMITRA_NAMESPACE = "ruang-kalyanamitra";
export const BRIDGE_VERSION = "1.0.3";

const KNOWN_RECORD_KEYS = ["item", "data", "content", "draft", "result"];
const RESERVED_RISK_PREFIX = "kalyanamitra-control:";
const CONTROL_RISK_FLAGS = Object.freeze([
  `${RESERVED_RISK_PREFIX}namespace=ruang-kalyanamitra`,
  `${RESERVED_RISK_PREFIX}agent=kalyanamitra`,
  `${RESERVED_RISK_PREFIX}publisher=draft-only`
]);
const OFFICIAL_VAJRAYANA_DOMAINS = new Set([
  "84000.co",
  "www.84000.co",
  "lotsawahouse.org",
  "www.lotsawahouse.org",
  "tergar.org",
  "www.tergar.org",
  "samyemandala.org",
  "www.samyemandala.org",
  "kagyuoffice.org",
  "www.kagyuoffice.org"
]);

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "")
  );
}

export function normalizeHttpsUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") {
    throw new Error("Semua sumber wajib memakai HTTPS.");
  }
  url.hash = "";
  return url.toString();
}

export function normalizeSources(sources) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 12) {
    throw new Error("Draft wajib memiliki 1 sampai 12 sumber.");
  }

  return sources.map((source) => ({
    title: String(source.title).trim().slice(0, 240),
    url: normalizeHttpsUrl(source.url),
    sourceType: source.sourceType,
    tradition: source.tradition,
    verificationStatus: source.verificationStatus
  }));
}

function hasOfficialVajrayanaSource(sources) {
  return sources.some((source) => {
    try {
      return OFFICIAL_VAJRAYANA_DOMAINS.has(new URL(source.url).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}

export function buildKalyanamitraMetadata({
  tradition,
  sources,
  verificationStatus,
  riskFlags = []
}) {
  const normalizedSources = normalizeSources(sources);
  const userFlags = riskFlags
    .map((flag) => String(flag).trim())
    .filter(Boolean)
    .filter((flag) => !flag.toLowerCase().startsWith(RESERVED_RISK_PREFIX))
    .slice(0, 5);
  const flags = new Set([...userFlags, ...CONTROL_RISK_FLAGS]);
  const allSourcesVerified = normalizedSources.every(
    (source) => source.verificationStatus === "verified"
  );
  const effectiveVerificationStatus =
    verificationStatus === "verified" && allSourcesVerified
      ? "verified"
      : "needs-review";

  if (effectiveVerificationStatus !== "verified") {
    flags.add("source-review-required");
  }

  if (tradition === "vajrayana" && !hasOfficialVajrayanaSource(normalizedSources)) {
    flags.add("vajrayana-lineage-review-required");
  }

  return {
    namespace: KALYANAMITRA_NAMESPACE,
    tenant: KALYANAMITRA_NAMESPACE,
    brand: "@ruangkalyanamitra",
    agentId: "kalyanamitra",
    contentDomain: "buddhist-education",
    tradition,
    sources: normalizedSources,
    sourceReview: {
      status: effectiveVerificationStatus,
      requestedStatus: verificationStatus,
      humanReviewRequired: true
    },
    riskFlags: [...flags],
    humanApprovalRequired: true,
    automaticPublish: false,
    publisherMode: "draft-only",
    workflowPolicy: "draft-verification-approval",
    bridgeId: "kalyanamitra-content-os",
    bridgeVersion: BRIDGE_VERSION
  };
}

function parseMetadata(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractRecord(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (looksLikeRecord(payload)) return payload;

  for (const key of KNOWN_RECORD_KEYS) {
    const candidate = payload[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      if (looksLikeRecord(candidate)) return candidate;
      for (const nestedKey of KNOWN_RECORD_KEYS) {
        const nested = candidate[nestedKey];
        if (nested && typeof nested === "object" && !Array.isArray(nested) && looksLikeRecord(nested)) {
          return nested;
        }
      }
    }
  }
  return null;
}

function looksLikeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "metadata",
    "displayId",
    "display_id",
    "contentItemId",
    "content_item_id",
    "id",
    "title",
    "slides",
    "riskFlags",
    "risk_flags",
    "status"
  ].some((key) => value[key] !== undefined);
}

function recordDisplayId(record) {
  return String(record?.displayId ?? record?.display_id ?? "").trim();
}

function recordRiskFlags(record) {
  const raw = record?.riskFlags ?? record?.risk_flags ?? [];
  if (Array.isArray(raw)) return raw.map((value) => String(value));
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
}

function assertMetadataPolicy(metadata) {
  if (
    metadata.namespace !== KALYANAMITRA_NAMESPACE ||
    metadata.tenant !== KALYANAMITRA_NAMESPACE ||
    metadata.agentId !== "kalyanamitra"
  ) {
    throw new Error("Record bukan milik Ruang Kalyanamitra; akses ditolak.");
  }

  if (metadata.automaticPublish !== false || metadata.publisherMode !== "draft-only") {
    throw new Error("Policy publikasi record tidak sesuai; akses ditolak.");
  }
}

export function assertKalyanamitraRecord(payload, ledgerEntry = null) {
  const record = extractRecord(payload);
  const metadata = parseMetadata(record?.metadata);

  if (!record) {
    throw new Error("Respons tidak memiliki record yang dapat diverifikasi; akses ditolak secara fail-closed.");
  }

  if (metadata) {
    assertMetadataPolicy(metadata);
    if (ledgerEntry && recordDisplayId(record) !== ledgerEntry.displayId) {
      throw new Error("displayId record tidak cocok dengan ledger Kalyanamitra; akses ditolak.");
    }
    return { record, metadata, evidence: "record-metadata" };
  }

  if (!ledgerEntry?.metadata || !ledgerEntry?.displayId) {
    throw new Error("Record tidak memiliki metadata dan ledger namespace tidak ditemukan; akses ditolak secara fail-closed.");
  }

  assertMetadataPolicy(ledgerEntry.metadata);

  if (recordDisplayId(record) !== ledgerEntry.displayId) {
    throw new Error("displayId record tidak cocok dengan ledger Kalyanamitra; akses ditolak.");
  }

  const recordId = extractContentItemId(record) ?? extractContentItemId(payload);
  if (recordId && recordId !== ledgerEntry.contentItemId) {
    throw new Error("UUID record tidak cocok dengan ledger Kalyanamitra; akses ditolak.");
  }

  const flags = recordRiskFlags(record);
  const controlFlagsPresent = CONTROL_RISK_FLAGS.every((flag) => flags.includes(flag));
  if (flags.length > 0 && !controlFlagsPresent) {
    throw new Error("Marker kontrol Kalyanamitra pada record tidak lengkap; akses ditolak.");
  }

  const status = String(record?.status ?? "").toLowerCase();
  if (status === "published") {
    throw new Error("Record berstatus published; akses ditolak oleh policy draft-only.");
  }

  return { record, metadata: ledgerEntry.metadata, evidence: "local-ledger" };
}

export function extractContentItemId(payload) {
  const candidates = [
    payload?.contentItemId,
    payload?.content_item_id,
    payload?.id,
    payload?.item?.contentItemId,
    payload?.item?.content_item_id,
    payload?.item?.id,
    payload?.data?.contentItemId,
    payload?.data?.content_item_id,
    payload?.data?.id,
    payload?.content?.contentItemId,
    payload?.content?.id,
    payload?.draft?.contentItemId,
    payload?.draft?.id
  ];
  return candidates.find(isUuid) ?? null;
}

export function extractStatus(payload) {
  const record = extractRecord(payload);
  return String(
    record?.status ??
      payload?.status ??
      payload?.item?.status ??
      payload?.data?.status ??
      ""
  ).toLowerCase();
}

export function assertWorkflowGate(payload, params) {
  const { metadata } = assertKalyanamitraRecord(payload);
  const action = params.action;

  if (action === "qa" && params.qaConfirmed !== true) {
    throw new Error("QA wajib dikonfirmasi secara eksplisit.");
  }

  if (action === "approve" || action === "repliz_draft") {
    if (params.humanApprovalConfirmed !== true || params.sourceReviewConfirmed !== true) {
      throw new Error("Approval manusia dan review sumber wajib dikonfirmasi.");
    }
    if (metadata.sourceReview?.status !== "verified") {
      throw new Error("Sumber belum berstatus verified; workflow dihentikan.");
    }
    if (
      metadata.tradition === "vajrayana" &&
      params.lineageReviewConfirmed !== true
    ) {
      throw new Error("Konten Vajrayana memerlukan konfirmasi review garis transmisi.");
    }
  }

  if (action === "repliz_draft") {
    if (params.confirmDraftOnly !== true) {
      throw new Error("Repliz hanya diizinkan dalam mode draft-only.");
    }
    if (extractStatus(payload) !== "approved") {
      throw new Error("Hanya record berstatus approved yang boleh dikirim ke Repliz.");
    }
  }

  return true;
}

export function assertDraftOnlyResponse(payload) {
  const values = [
    payload?.status,
    payload?.item?.status,
    payload?.data?.status,
    payload?.publicationStatus
  ].map((value) => String(value ?? "").toLowerCase());

  if (
    payload?.published === true ||
    payload?.automaticPublish === true ||
    values.includes("published")
  ) {
    throw new Error("Server melaporkan publikasi; respons ditolak oleh policy draft-only.");
  }
  return true;
}

function replizAccountsFromPayload(payload) {
  const arrays = [
    Array.isArray(payload) ? payload : null,
    payload?.items,
    payload?.accounts,
    payload?.data
  ].filter(Array.isArray);
  return arrays.flat();
}

function replizAccountId(account) {
  return String(account?.id ?? account?.accountId ?? "");
}

function replizUsername(account) {
  return String(account?.username ?? account?.handle ?? "")
    .replace(/^@+/, "")
    .toLowerCase();
}

function replizPlatform(account) {
  return String(account?.platform ?? "").toLowerCase();
}

function safeReplizAccount(account) {
  return {
    accountId: replizAccountId(account),
    username: replizUsername(account),
    platform: replizPlatform(account),
    name: String(account?.name ?? account?.displayName ?? ""),
    status: String(account?.status ?? ""),
    connected: account?.connected === true
  };
}

export function filterAllowedReplizAccounts(
  payload,
  allowedByPlatform,
  allowedUsername,
  requestedPlatform
) {
  const normalizedUsername = String(allowedUsername ?? "")
    .replace(/^@+/, "")
    .toLowerCase();

  const configured = Object.entries(allowedByPlatform ?? {})
    .map(([platform, accountId]) => [
      String(platform).toLowerCase(),
      String(accountId ?? "").trim()
    ])
    .filter(([, accountId]) => accountId.length > 0);

  const targets = requestedPlatform
    ? configured.filter(([platform]) => platform === String(requestedPlatform).toLowerCase())
    : configured;

  if (targets.length === 0) {
    throw new Error("Akun Repliz untuk platform yang diminta belum dikunci.");
  }

  const accounts = replizAccountsFromPayload(payload);
  const matches = targets.map(([platform, accountId]) => {
    const match = accounts.find((account) => {
      const idMatches = replizAccountId(account) === accountId;
      const platformMatches = replizPlatform(account) === platform;
      const usernameMatches =
        !normalizedUsername || replizUsername(account) === normalizedUsername;
      return idMatches && platformMatches && usernameMatches;
    });

    if (!match) {
      throw new Error(
        `Akun Repliz ${platform} Ruang Kalyanamitra tidak ditemukan atau tidak cocok.`
      );
    }
    return safeReplizAccount(match);
  });

  return {
    accounts: matches,
    accountCount: matches.length,
    namespaceVerified: true,
    automaticPublish: false,
    publisherMode: "draft-only"
  };
}
