import { getBrandRoute, type AutomationPlatform } from "./brand-registry";

type JsonRecord = Record<string, unknown>;

export type GateAsset = {
  platform: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
};

export type PublicationGateInput = {
  brandId: string;
  platform: AutomationPlatform;
  body: JsonRecord;
  assets: GateAsset[];
};

export type PublicationGateResult = {
  passed: boolean;
  reasons: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function readBoolean(body: JsonRecord, key: string): boolean | undefined {
  const automation = isRecord(body.automation) ? body.automation : {};
  const value = automation[key] ?? body[key];
  return typeof value === "boolean" ? value : undefined;
}

function readRiskFlags(body: JsonRecord): string[] {
  return [...stringArray(body.riskFlags), ...stringArray(body.risk_flags), ...stringArray(body.package_risk_flags)]
    .map((item) => item.toLowerCase());
}

function slideCount(body: JsonRecord): number {
  return isRecord(body.carousel) && Array.isArray(body.carousel.slides) ? body.carousel.slides.length : 0;
}

function sourceStatus(body: JsonRecord): string {
  const sourceReview = isRecord(body.sourceReview)
    ? body.sourceReview
    : isRecord(body.source_review)
      ? body.source_review
      : {};
  const value = sourceReview.status ?? body.sourceReviewStatus ?? body.source_review_status;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sourceCount(body: JsonRecord): number {
  if (Array.isArray(body.sources)) return body.sources.length;
  if (Array.isArray(body.source_records)) return body.source_records.length;
  return 0;
}

function threadPosts(body: JsonRecord): string[] {
  const candidates = [body.threadsPosts, body.posts, body.threadPosts];
  for (const value of candidates) {
    const posts = stringArray(value);
    if (posts.length > 0) return posts;
  }
  return [];
}

export function evaluatePublicationGate(input: PublicationGateInput): PublicationGateResult {
  const reasons: string[] = [];
  const route = getBrandRoute(input.brandId, input.platform);
  if (!route) reasons.push("brand-route-unknown");

  if (readBoolean(input.body, "automaticPublish") !== true) reasons.push("automatic-publish-disabled");
  if (readBoolean(input.body, "humanApprovalRequired") !== false) reasons.push("human-approval-contract-not-disabled");

  const flags = new Set(readRiskFlags(input.body));
  const blockedFlags = [
    "do-not-publish",
    "source-unverified",
    "source-review-required",
    "source-item-human-review-required",
    "time-sensitive-needs-review",
    "restricted-practice"
  ];
  for (const flag of blockedFlags) if (flags.has(flag)) reasons.push("risk-flag:" + flag);

  const serialized = JSON.stringify(input.body);
  if (/(?:@(?:namaakun|username|akunanda|yourusername)|\b(?:namaakun|usernameanda|your\s+brand|insert\s+here|placeholder|todo)\b)/i.test(serialized)) {
    reasons.push("placeholder-detected");
  }
  if (/(?:\b(?:rp\.?\s*[\d.,]+|[\d.,]+\s*(?:juta|ribu|rb|jt|miliar|triliun|persen|%))\b)/i.test(serialized)) {
    const citations = Array.isArray(input.body.sources) ? input.body.sources.length : 0;
    if (citations === 0) reasons.push("numeric-claim-without-source");
  }

  if (input.brandId === "brand-ruang-kalyanamitra") {
    const namespace = typeof input.body.namespace === "string" ? input.body.namespace : "";
    if (namespace !== "ruang-kalyanamitra") reasons.push("kalyanamitra-namespace-mismatch");
    if (!["verified", "machine-verified"].includes(sourceStatus(input.body))) reasons.push("kalyanamitra-source-not-verified");
    if (sourceCount(input.body) < 1) reasons.push("kalyanamitra-source-missing");
  }

  if (input.platform === "threads") {
    const posts = threadPosts(input.body);
    const minimum = 6;
    const maximum = input.brandId === "brand-ruang-kalyanamitra" ? 8 : 10;
    if (posts.length < minimum || posts.length > maximum) reasons.push("threads-post-count-invalid");
    if (posts.some((post) => Array.from(post).length > 500)) reasons.push("threads-post-too-long");
  }

  if (input.platform === "instagram") {
    const expected = slideCount(input.body);
    const instagramAssets = input.assets.filter((asset) => asset.platform === "instagram");
    if (expected < 5 || expected > 9 || instagramAssets.length !== expected) reasons.push("instagram-asset-count-invalid");
    if (instagramAssets.some((asset) => asset.width !== 1080 || asset.height !== 1350)) reasons.push("instagram-dimensions-invalid");
    if (instagramAssets.some((asset) => typeof asset.public_url !== "string" || !asset.public_url.startsWith("https://"))) {
      reasons.push("instagram-public-url-missing");
    }
  }

  return { passed: reasons.length === 0, reasons };
}
