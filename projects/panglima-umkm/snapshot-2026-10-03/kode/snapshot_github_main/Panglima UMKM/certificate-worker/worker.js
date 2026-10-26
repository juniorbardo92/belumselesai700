const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const MAX_BODY_BYTES = 16000;
const MAX_UPSTREAM_BYTES = 131072;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;
const PARTICIPANT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CERTIFIER_GROUP_PATTERN = /^[a-z0-9]{26}$/i;
const CERTIFIER_API_BASE = "https://api.certifier.io";
const EXPECTED_DIAGNOSIS_TOTAL = 40;
const EXPECTED_ACTION_TOTAL = 30;
const MINIMUM_ACTIONS = 24;

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY"
});

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function failure(code, message, status) {
  return response({ ok: false, code, message }, status);
}

function cleanText(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function safeHttpsUrl(value) {
  const candidate = cleanText(value, 2048);
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

async function boundedJson(upstream, maximum = MAX_UPSTREAM_BYTES) {
  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > maximum || !upstream.body) throw new Error("Jawaban layanan sertifikat tidak valid.");
  const reader = upstream.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("Jawaban layanan sertifikat terlalu besar.");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(TEXT_DECODER.decode(bytes));
}

async function requestBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return null;
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return null;
  try {
    const text = await request.text();
    if (!text || TEXT_ENCODER.encode(text).byteLength > MAX_BODY_BYTES) return null;
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch (_) {
    return null;
  }
}

function participantFromSession(sessionToken) {
  if (typeof sessionToken !== "string" || sessionToken.length > 1000) return null;
  const sections = sessionToken.split(".");
  if (sections.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(sections[0])) return null;
  try {
    const normalized = sections[0].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    const payload = JSON.parse(TEXT_DECODER.decode(bytes));
    if (!PARTICIPANT_ID_PATTERN.test(String(payload.pid || ""))) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.pid;
  } catch (_) {
    return null;
  }
}

async function hashDevice(deviceId) {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", TEXT_ENCODER.encode("panglima-device-license-v1:" + deviceId.toLowerCase())
  ));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function sameHash(left, right) {
  if (!DEVICE_ID_PATTERN.test(String(left || "")) || !DEVICE_ID_PATTERN.test(String(right || ""))) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function jakartaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return parts.year + "-" + parts.month + "-" + parts.day;
}

async function reserveLimit(database, scope, limit) {
  const row = await database.prepare(
    "INSERT INTO certificate_rate_limits (scope, day_key, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(scope, day_key) DO UPDATE SET attempts = attempts + 1 " +
    "WHERE attempts < ? RETURNING attempts"
  ).bind(scope, jakartaDate(), limit).first();
  return Boolean(row);
}

async function participantProfile(env, participantId, deviceId) {
  const record = await env.PANGLIMA_DEVICE_DB.prepare(
    "SELECT l.participant_id, l.device_hash, l.owner_name, l.business_name, " +
    "p.email FROM panglima_device_licenses l " +
    "LEFT JOIN panglima_pretest_profiles p ON p.participant_id = l.participant_id " +
    "WHERE l.participant_id = ? LIMIT 1"
  ).bind(participantId).first();
  if (!record || !sameHash(record.device_hash, await hashDevice(deviceId))) return null;
  const email = cleanText(record.email, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { missingEmail: true };
  return {
    participantId,
    owner: cleanText(record.owner_name, 80),
    business: cleanText(record.business_name, 100),
    email
  };
}

function validatedProgress(body) {
  const diagnosis = body.diagnosis && typeof body.diagnosis === "object" ? body.diagnosis : {};
  const actions = body.actions && typeof body.actions === "object" ? body.actions : {};
  const result = {
    diagnosisAnswered: Number(diagnosis.answered),
    diagnosisTotal: Number(diagnosis.total),
    actionsCompleted: Number(actions.completed),
    actionsTotal: Number(actions.total)
  };
  const integers = Object.values(result).every(Number.isInteger);
  const eligible = integers &&
    result.diagnosisTotal === EXPECTED_DIAGNOSIS_TOTAL &&
    result.diagnosisAnswered === EXPECTED_DIAGNOSIS_TOTAL &&
    result.actionsTotal === EXPECTED_ACTION_TOTAL &&
    result.actionsCompleted >= MINIMUM_ACTIONS &&
    result.actionsCompleted <= EXPECTED_ACTION_TOTAL;
  return eligible ? result : null;
}

async function recordEvent(env, participantId, eventType, eventData) {
  await env.CERTIFICATE_DB.prepare(
    "INSERT INTO certificate_events (id, participant_id, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), participantId, eventType, JSON.stringify(eventData || {}).slice(0, 4000), new Date().toISOString()).run();
}

async function completionRow(env, participantId) {
  return env.CERTIFICATE_DB.prepare(
    "SELECT participant_id, owner_name, email, business_name, completion_date, " +
    "diagnosis_answered, diagnosis_total, actions_completed, actions_total, status, mentor_notes, " +
    "submitted_at, updated_at, verified_at, rejected_at, dispatched_at, dispatch_error, dispatch_attempts " +
    "FROM certificate_completions WHERE participant_id = ? LIMIT 1"
  ).bind(participantId).first();
}

function webhookConfigured(env) {
  return /^https:\/\//.test(String(env.CERTIFICATE_WEBHOOK_URL || "")) &&
    typeof env.CERTIFICATE_WEBHOOK_SECRET === "string" && env.CERTIFICATE_WEBHOOK_SECRET.length >= 24;
}

function webhookPayload(row, eventType, secret) {
  return {
    secret,
    event: eventType,
    participantId: row.participant_id,
    namaLengkap: row.owner_name,
    email: row.email,
    namaUsaha: row.business_name,
    tanggalSelesai: row.completion_date,
    diagnosis: row.diagnosis_answered + "/" + row.diagnosis_total,
    aksiSelesai: row.actions_completed + "/" + row.actions_total,
    statusVerifikasi: row.status,
    catatanMentor: row.mentor_notes || "",
    diterimaPada: row.submitted_at,
    diverifikasiPada: row.verified_at || ""
  };
}

async function dispatchCompletion(env, participantId, eventType) {
  if (!webhookConfigured(env)) return { status: "not_configured" };
  const row = await completionRow(env, participantId);
  if (!row) return { status: "missing" };
  if (eventType === "approve" && row.dispatched_at) return { status: "already_dispatched" };

  let dispatchError = "";
  try {
    const upstream = await fetch(env.CERTIFICATE_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", "accept": "application/json" },
      body: JSON.stringify(webhookPayload(row, eventType, env.CERTIFICATE_WEBHOOK_SECRET))
    });
    const raw = await upstream.text();
    let result = null;
    try { result = JSON.parse(raw); } catch (_) {}
    if (!upstream.ok || !result || result.ok !== true) {
      throw new Error(cleanText(result && result.message || "Webhook Google Sheets menolak permintaan.", 300));
    }
    const dispatchedAt = eventType === "approve" ? new Date().toISOString() : row.dispatched_at;
    await env.CERTIFICATE_DB.prepare(
      "UPDATE certificate_completions SET dispatched_at = ?, dispatch_error = '', " +
      "dispatch_attempts = dispatch_attempts + 1, updated_at = ? WHERE participant_id = ?"
    ).bind(dispatchedAt || null, new Date().toISOString(), participantId).run();
    await recordEvent(env, participantId, "webhook_" + eventType, { ok: true });
    return { status: "sent" };
  } catch (error) {
    dispatchError = cleanText(error && error.message || error, 300) || "Webhook gagal.";
    await env.CERTIFICATE_DB.prepare(
      "UPDATE certificate_completions SET dispatch_error = ?, dispatch_attempts = dispatch_attempts + 1, " +
      "updated_at = ? WHERE participant_id = ?"
    ).bind(dispatchError, new Date().toISOString(), participantId).run();
    await recordEvent(env, participantId, "webhook_" + eventType, { ok: false, error: dispatchError });
    return { status: "failed", message: dispatchError };
  }
}

async function submitCompletion(request, env, ctx) {
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Data penyelesaian tidak valid.", 400);
  const deviceId = cleanText(body.deviceId, 64);
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure("DEVICE_REQUIRED", "Perangkat belum dapat diverifikasi. Gunakan APK resmi terbaru.", 400);
  }
  const participantId = participantFromSession(body.sessionToken);
  if (!participantId) return failure("SESSION_EXPIRED", "Sesi peserta berakhir. Aktifkan kembali kode akses.", 401);
  if (!await reserveLimit(env.CERTIFICATE_DB, "completion:" + participantId, 12)) {
    return failure("SUBMISSION_LIMIT", "Sinkronisasi sertifikat mencapai batas harian.", 429);
  }
  const profile = await participantProfile(env, participantId, deviceId);
  if (!profile) return failure("DEVICE_LOCKED", "Sesi peserta tidak berlaku untuk perangkat ini.", 403);
  if (profile.missingEmail) {
    return failure("EMAIL_MISSING", "Email PRE-TEST belum tersedia. Hubungi pendamping sebelum verifikasi sertifikat.", 409);
  }
  const progress = validatedProgress(body);
  if (!progress) {
    return failure("NOT_ELIGIBLE", "Syarat belum lengkap: diagnosis 40/40 dan minimal 24/30 aksi.", 409);
  }

  const now = new Date().toISOString();
  const completionDate = jakartaDate();
  await env.CERTIFICATE_DB.prepare(
    "INSERT INTO certificate_completions " +
    "(participant_id, owner_name, email, business_name, completion_date, diagnosis_answered, diagnosis_total, " +
    "actions_completed, actions_total, status, submitted_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) " +
    "ON CONFLICT(participant_id) DO UPDATE SET " +
    "owner_name = excluded.owner_name, email = excluded.email, business_name = excluded.business_name, " +
    "diagnosis_answered = excluded.diagnosis_answered, diagnosis_total = excluded.diagnosis_total, " +
    "actions_completed = excluded.actions_completed, actions_total = excluded.actions_total, " +
    "status = CASE WHEN certificate_completions.status = 'rejected' THEN 'pending' ELSE certificate_completions.status END, " +
    "rejected_at = CASE WHEN certificate_completions.status = 'rejected' THEN NULL ELSE certificate_completions.rejected_at END, " +
    "updated_at = excluded.updated_at"
  ).bind(
    participantId, profile.owner, profile.email, profile.business, completionDate,
    progress.diagnosisAnswered, progress.diagnosisTotal, progress.actionsCompleted, progress.actionsTotal, now, now
  ).run();
  await recordEvent(env, participantId, "submitted", progress);
  ctx.waitUntil(dispatchCompletion(env, participantId, "stage"));
  const row = await completionRow(env, participantId);
  return response({
    ok: true,
    certificate: {
      status: row.status,
      completionDate: row.completion_date,
      submittedAt: row.submitted_at,
      verifiedAt: row.verified_at || null,
      dispatched: Boolean(row.dispatched_at)
    }
  });
}

function certifierConfigured(env) {
  return typeof env.CERTIFIER_API_TOKEN === "string" && env.CERTIFIER_API_TOKEN.trim().length >= 20 &&
    CERTIFIER_GROUP_PATTERN.test(String(env.CERTIFIER_GROUP_ID || ""));
}

async function certifierRequest(env, pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("authorization", "Bearer " + env.CERTIFIER_API_TOKEN.trim());
  headers.set("certifier-version", "2022-10-26");
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json; charset=utf-8");
  const upstream = await fetch(CERTIFIER_API_BASE + pathname, { ...init, headers });
  let payload;
  try {
    payload = await boundedJson(upstream);
  } catch (_) {
    throw new Error("Jawaban Certifier tidak dapat dibaca.");
  }
  if (!upstream.ok) throw new Error("Certifier belum dapat menyiapkan tautan sertifikat.");
  return payload;
}

async function issuedCertificate(env, profile, row) {
  const groupId = String(env.CERTIFIER_GROUP_ID || "");
  const search = await certifierRequest(env, "/v1/credentials/search", {
    method: "POST",
    body: JSON.stringify({
      filter: {
        AND: [
          { groupId: { equals: groupId } },
          { status: { equals: "issued" } },
          { recipient: { email: { equals: profile.email } } },
          { issueDate: { equals: row.completion_date } }
        ]
      },
      sort: { property: "createdAt", order: "desc" },
      limit: 10
    })
  });
  const credentials = search && Array.isArray(search.data) ? search.data : [];
  const credential = credentials.find(item => item && item.status === "issued" &&
    item.groupId === groupId && item.issueDate === row.completion_date && item.recipient &&
    cleanText(item.recipient.email, 254).toLowerCase() === profile.email);
  if (!credential || !cleanText(credential.id, 100)) return null;

  const designsResult = await certifierRequest(env, "/v1/credentials/" + encodeURIComponent(credential.id) + "/designs", { method: "GET" });
  const designs = Array.isArray(designsResult) ? designsResult :
    designsResult && Array.isArray(designsResult.data) ? designsResult.data : [];
  let pdfUrl = "";
  for (const design of designs) {
    const previews = design && Array.isArray(design.previews) ? design.previews : [];
    const preview = previews.find(item => item && item.format === "pdf" && safeHttpsUrl(item.url));
    if (preview) {
      pdfUrl = safeHttpsUrl(preview.url);
      break;
    }
  }
  const publicId = cleanText(credential.publicId, 80).toLowerCase();
  const publicUrl = PARTICIPANT_ID_PATTERN.test(publicId)
    ? "https://credsverse.com/credentials/" + publicId
    : "";
  const url = pdfUrl || publicUrl;
  return url ? { status: "issued", url, publicId, format: pdfUrl ? "pdf" : "public" } : null;
}

async function certificateLink(request, env) {
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Permintaan sertifikat tidak valid.", 400);
  const deviceId = cleanText(body.deviceId, 64);
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure("DEVICE_REQUIRED", "Perangkat belum dapat diverifikasi. Gunakan APK resmi terbaru.", 400);
  }
  const participantId = participantFromSession(body.sessionToken);
  if (!participantId) return failure("SESSION_EXPIRED", "Sesi peserta berakhir. Aktifkan kembali kode akses.", 401);
  const profile = await participantProfile(env, participantId, deviceId);
  if (!profile) return failure("DEVICE_LOCKED", "Sesi peserta tidak berlaku untuk perangkat ini.", 403);
  if (profile.missingEmail) return failure("EMAIL_MISSING", "Email PRE-TEST belum tersedia.", 409);
  const row = await completionRow(env, participantId);
  if (!row || row.status !== "verified" || !row.dispatched_at) {
    return failure("CERTIFICATE_NOT_READY", "Sertifikat belum tersedia. Silakan periksa kembali setelah proses penerbitan selesai.", 409);
  }
  if (!certifierConfigured(env)) {
    return failure("CERTIFIER_NOT_CONFIGURED", "Akses unduh sertifikat belum dikonfigurasi.", 503);
  }
  if (!await reserveLimit(env.CERTIFICATE_DB, "certificate:" + participantId, 30)) {
    return failure("CERTIFICATE_LOOKUP_LIMIT", "Pemeriksaan sertifikat mencapai batas harian.", 429);
  }
  const certificate = await issuedCertificate(env, profile, row);
  if (!certificate) {
    return failure("CERTIFICATE_NOT_READY", "Sertifikat belum tersedia. Silakan periksa kembali setelah Certifier selesai menerbitkan.", 409);
  }
  return response({ ok: true, certificate });
}

async function adminAuthorized(request, env) {
  const authorization = cleanText(request.headers.get("authorization"), 2000);
  if (!/^Bearer\s+\S+$/i.test(authorization)) return false;
  const upstream = await env.PANGLIMA_CORE.fetch(new Request(
    "https://panglima.internal/v1/admin/participants",
    { headers: { authorization, accept: "application/json" } }
  ));
  return upstream.ok;
}

function publicRow(row) {
  return {
    participantId: row.participant_id,
    owner: row.owner_name,
    email: row.email,
    business: row.business_name,
    completionDate: row.completion_date,
    diagnosis: row.diagnosis_answered + "/" + row.diagnosis_total,
    actions: row.actions_completed + "/" + row.actions_total,
    status: row.status,
    mentorNotes: row.mentor_notes || "",
    submittedAt: row.submitted_at,
    verifiedAt: row.verified_at || null,
    rejectedAt: row.rejected_at || null,
    dispatchedAt: row.dispatched_at || null,
    dispatchError: row.dispatch_error || "",
    dispatchAttempts: Number(row.dispatch_attempts) || 0
  };
}

async function listCompletions(request, env) {
  if (!await adminAuthorized(request, env)) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const result = await env.CERTIFICATE_DB.prepare(
    "SELECT participant_id, owner_name, email, business_name, completion_date, diagnosis_answered, diagnosis_total, " +
    "actions_completed, actions_total, status, mentor_notes, submitted_at, updated_at, verified_at, rejected_at, " +
    "dispatched_at, dispatch_error, dispatch_attempts FROM certificate_completions " +
    "ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END, updated_at DESC LIMIT 250"
  ).all();
  return response({ ok: true, webhookConfigured: webhookConfigured(env), completions: (result.results || []).map(publicRow) });
}

async function verifyCompletion(request, env) {
  if (!await adminAuthorized(request, env)) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Data verifikasi tidak valid.", 400);
  const participantId = cleanText(body.participantId, 80);
  const mentorNotes = cleanText(body.mentorNotes, 500);
  if (!PARTICIPANT_ID_PATTERN.test(participantId)) return failure("INVALID_PARTICIPANT", "Peserta tidak valid.", 400);
  const current = await completionRow(env, participantId);
  if (!current) return failure("COMPLETION_NOT_FOUND", "Data penyelesaian belum ditemukan.", 404);
  const verifiedAt = current.verified_at || new Date().toISOString();
  await env.CERTIFICATE_DB.prepare(
    "UPDATE certificate_completions SET status = 'verified', mentor_notes = ?, verified_at = ?, rejected_at = NULL, updated_at = ? " +
    "WHERE participant_id = ?"
  ).bind(mentorNotes, verifiedAt, new Date().toISOString(), participantId).run();
  await recordEvent(env, participantId, "verified", { mentorNotes });
  const dispatch = await dispatchCompletion(env, participantId, "approve");
  return response({ ok: true, certificate: publicRow(await completionRow(env, participantId)), dispatch });
}

async function rejectCompletion(request, env) {
  if (!await adminAuthorized(request, env)) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Data penolakan tidak valid.", 400);
  const participantId = cleanText(body.participantId, 80);
  const mentorNotes = cleanText(body.mentorNotes, 500);
  if (!PARTICIPANT_ID_PATTERN.test(participantId) || !mentorNotes) {
    return failure("REJECTION_REASON_REQUIRED", "Peserta dan alasan penolakan wajib diisi.", 400);
  }
  const existing = await completionRow(env, participantId);
  if (!existing) return failure("COMPLETION_NOT_FOUND", "Data penyelesaian belum ditemukan.", 404);
  const now = new Date().toISOString();
  await env.CERTIFICATE_DB.prepare(
    "UPDATE certificate_completions SET status = 'rejected', mentor_notes = ?, rejected_at = ?, " +
    "verified_at = NULL, dispatched_at = NULL, updated_at = ? WHERE participant_id = ?"
  ).bind(mentorNotes, now, now, participantId).run();
  await recordEvent(env, participantId, "rejected", { mentorNotes });
  const dispatch = await dispatchCompletion(env, participantId, "reject");
  return response({ ok: true, certificate: publicRow(await completionRow(env, participantId)), dispatch });
}

async function retryDispatch(request, env) {
  if (!await adminAuthorized(request, env)) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const body = await requestBody(request);
  const participantId = cleanText(body && body.participantId, 80);
  const existing = PARTICIPANT_ID_PATTERN.test(participantId) ? await completionRow(env, participantId) : null;
  if (!existing || existing.status !== "verified") {
    return failure("NOT_VERIFIED", "Hanya sertifikat terverifikasi yang dapat dikirim ulang.", 409);
  }
  if (existing.dispatch_error) {
    await env.CERTIFICATE_DB.prepare(
      "UPDATE certificate_completions SET dispatched_at = NULL WHERE participant_id = ?"
    ).bind(participantId).run();
  }
  const dispatch = await dispatchCompletion(env, participantId, "approve");
  return response({ ok: dispatch.status !== "failed", dispatch, certificate: publicRow(await completionRow(env, participantId)) }, dispatch.status === "failed" ? 502 : 200);
}

function certificateVerificationPage(url) {
  const hasCredentialId = url.searchParams.has("id");
  const credentialId = cleanText(url.searchParams.get("id"), 80);
  if (hasCredentialId && PARTICIPANT_ID_PATTERN.test(credentialId)) {
    return new Response(null, {
      status: 302,
      headers: {
        location: "https://credsverse.com/credentials/" + credentialId.toLowerCase(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      }
    });
  }

  const invalidCredential = hasCredentialId;
  const error = invalidCredential
    ? '<p class="error" role="alert">Credential ID belum sesuai. Masukkan 36 karakter ID yang tercetak pada sertifikat.</p>'
    : "";
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light"><title>Verifikasi Sertifikat | Panglima UMKM</title>
<style>:root{color-scheme:light;--maroon:#751621;--maroon-deep:#451019;--gold:#c49745;--ink:#261d1c;--muted:#716663}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px 18px;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:radial-gradient(ellipse at 20% 0%,#fff4e4 0,transparent 45%),linear-gradient(150deg,#f8f4ef,#fff 56%,#f5eee8)}.card{width:min(100%,590px);overflow:hidden;background:#fff;border:1px solid #eadfd5;border-radius:24px;box-shadow:0 22px 72px #4b191719}.band{height:9px;background:linear-gradient(90deg,var(--maroon-deep),var(--maroon),var(--gold))}.content{padding:42px 40px 36px}.eyebrow{margin:0 0 18px;color:var(--maroon);font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.seal{width:58px;height:58px;display:grid;place-items:center;border:1px solid #e9d7bd;border-radius:18px;background:#fffaf2;color:var(--gold);font-size:30px;font-weight:700}h1{margin:19px 0 8px;font-size:clamp(28px,6vw,39px);line-height:1.15;letter-spacing:-.04em}.intro{margin:0 0 28px;color:var(--muted)}label{display:block;margin:0 0 8px;font-size:14px;font-weight:700}input{width:100%;height:54px;padding:0 14px;border:1px solid #d8ceca;border-radius:11px;color:var(--ink);font:14px ui-monospace,SFMono-Regular,Consolas,monospace}input:focus{outline:3px solid #c4974540;border-color:var(--gold)}button{width:100%;height:52px;margin-top:14px;border:0;border-radius:11px;background:var(--maroon);color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer}button:hover{background:var(--maroon-deep)}.hint{margin:12px 0 0;color:var(--muted);font-size:13px}.error{margin:12px 0 0;padding:12px 14px;border:1px solid #f2c6c8;border-radius:9px;background:#fff5f5;color:#a3222b;font-size:13px}.footer{margin-top:29px;padding-top:20px;border-top:1px solid #eee8e3;color:var(--muted);font-size:13px}.footer strong{color:var(--maroon)}@media(max-width:480px){.content{padding:34px 24px 28px}.card{border-radius:19px}input{font-size:12px}}</style></head>
<body><main class="card"><div class="band"></div><section class="content"><p class="eyebrow">UMKM Naik Kelas</p><div class="seal" aria-hidden="true">✓</div><h1>Verifikasi Sertifikat</h1><p class="intro">Pastikan keaslian sertifikat program <strong>Panglima UMKM</strong> melalui halaman kredensial resmi.</p><form method="get" action="/verifikasi"><label for="credential-id">Credential ID pada sertifikat</label><input id="credential-id" name="id" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="36" maxlength="36" pattern="[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required><button type="submit">Periksa Keaslian Sertifikat</button>${error}<p class="hint">Credential ID adalah kode unik yang tercetak pada masing-masing sertifikat.</p></form><p class="footer">Hasil pemeriksaan akan dibuka langsung pada halaman resmi <strong>Certifier / Credsverse</strong>.</p></section></main></body></html>`;
  return new Response(html, {
    status: invalidCredential ? 400 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY"
    }
  });
}

function adminPage() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Sertifikat Panglima</title>
<style>body{font:15px system-ui,sans-serif;background:#f8f5f1;color:#211b18;margin:0;padding:22px}.shell{max-width:1180px;margin:auto}.card{background:#fff;border:1px solid #e7dfd8;border-radius:16px;padding:18px;margin:14px 0}h1{color:#831d28}label{display:block;font-weight:700;margin:8px 0}input,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d8d0c8;border-radius:9px}button{padding:9px 12px;border:0;border-radius:8px;background:#831d28;color:#fff;font-weight:700;margin:3px}.secondary{background:#6b625b}.danger{background:#a33}.muted{color:#746b65}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1000px}th,td{text-align:left;padding:9px;border-bottom:1px solid #eee;vertical-align:top}.pending{color:#9a6700}.verified{color:#177245}.rejected{color:#a33}.status{white-space:pre-wrap}</style></head><body><main class="shell"><h1>Verifikasi Sertifikat Panglima</h1><p class="muted">Layanan terpisah. Data affiliate, referral, dan komisi tidak diakses.</p><section class="card"><label for="token">Token admin Panglima</label><input id="token" type="password" autocomplete="off"><button id="load">Muat data</button><p id="message" class="status"></p></section><section class="card scroll"><table><thead><tr><th>Peserta</th><th>Tanggal selesai</th><th>Progres</th><th>Status</th><th>Catatan mentor</th><th>Aksi</th></tr></thead><tbody id="rows"></tbody></table></section></main>
<script nonce="${nonce}">const el=id=>document.getElementById(id);let items=[];const headers=()=>({'content-type':'application/json','authorization':'Bearer '+el('token').value.trim()});function cell(row,text,cls){const td=document.createElement('td');td.textContent=text;if(cls)td.className=cls;row.appendChild(td);return td}function message(text){el('message').textContent=text}async function api(path,body){const result=await fetch(path,{method:body?'POST':'GET',headers:headers(),body:body?JSON.stringify(body):undefined});const data=await result.json();if(!result.ok||!data.ok)throw Error(data.message||'Permintaan gagal');return data}function render(){const body=el('rows');body.replaceChildren();items.forEach(item=>{const row=document.createElement('tr');cell(row,item.owner+'\n'+item.email+'\n'+item.business);cell(row,item.completionDate);cell(row,'Diagnosis '+item.diagnosis+'\nAksi '+item.actions);cell(row,item.status+(item.dispatchedAt?' · terkirim':'')+(item.dispatchError?' · gagal kirim':''),item.status);const notes=cell(row,'');const area=document.createElement('textarea');area.rows=3;area.value=item.mentorNotes||'';notes.appendChild(area);const actions=cell(row,'');const verify=document.createElement('button');verify.textContent='Verifikasi';verify.addEventListener('click',()=>act('/v1/admin/verify',item,area.value));actions.appendChild(verify);const reject=document.createElement('button');reject.textContent='Tolak';reject.className='danger';reject.addEventListener('click',()=>act('/v1/admin/reject',item,area.value));actions.appendChild(reject);if(item.status==='verified'&&!item.dispatchedAt){const retry=document.createElement('button');retry.textContent='Kirim ulang';retry.className='secondary';retry.addEventListener('click',()=>act('/v1/admin/retry-dispatch',item,area.value));actions.appendChild(retry)}body.appendChild(row)})}async function load(){try{message('Memuat...');const data=await api('/v1/admin/completions');items=data.completions;render();message(items.length+' data · webhook '+(data.webhookConfigured?'aktif':'belum dikonfigurasi'))}catch(error){message(error.message)}}async function act(path,item,notes){if(path.includes('reject')&&!notes.trim()){message('Alasan penolakan wajib diisi.');return}try{message('Memproses '+item.owner+'...');await api(path,{participantId:item.participantId,mentorNotes:notes});await load()}catch(error){message(error.message)}}el('load').addEventListener('click',load);</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return response({
          ok: true,
          service: "panglima-certificate-api",
          ready: Boolean(env.CERTIFICATE_DB && env.PANGLIMA_DEVICE_DB && env.PANGLIMA_CORE),
          webhookConfigured: webhookConfigured(env),
          certifierConfigured: certifierConfigured(env),
          certificateEligibility: { diagnosis: "40/40", actionsMinimum: "24/30" },
          affiliateConnected: false
        });
      }
      if (request.method === "GET" && url.pathname === "/verifikasi") return certificateVerificationPage(url);
      if (request.method === "GET" && url.pathname === "/admin") return adminPage();
      if (request.method === "POST" && url.pathname === "/v1/completion") return await submitCompletion(request, env, ctx);
      if (request.method === "POST" && url.pathname === "/v1/certificate") return await certificateLink(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/completions") return await listCompletions(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/verify") return await verifyCompletion(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/reject") return await rejectCompletion(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/retry-dispatch") return await retryDispatch(request, env);
      return failure("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
    } catch (error) {
      console.error("Certificate service error", { path: url.pathname, message: cleanText(error && error.message || error, 500) });
      return failure("SERVICE_ERROR", "Layanan sertifikat sedang tidak tersedia.", 500);
    }
  }
};
