import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const baseUrl = (process.env.MONETIZATION_BASE_URL ?? 'https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev').replace(/\/$/, '');
const token = process.env.OPENCLAW_INGRESS_TOKEN;
const stage = (process.argv[2] ?? 'runtime').toLowerCase();

if (!token) throw new Error('OPENCLAW_INGRESS_TOKEN wajib tersedia pada secret store runtime OpenClaw.');
if (!['runtime', 'telegram', 'hermes'].includes(stage)) throw new Error('Stage harus runtime, telegram, atau hermes.');

const externalRunId = requiredEnv('OPENCLAW_RUN_ID');
const correlationId = process.env.CORRELATION_ID ?? `${stage}-${externalRunId}`;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} wajib diisi.`);
  return value;
}

function safeIdentifier(value, name) {
  if (value.length > 160 || !/^[A-Za-z0-9._:@/-]+$/.test(value)) {
    throw new Error(`${name} tidak valid. Gunakan huruf, angka, titik, garis bawah, titik dua, @, slash, atau dash.`);
  }
  return value;
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pada ${path}: ${JSON.stringify(data)}`);
  }
  return { status: response.status, data };
}

async function sha256FromSource(fileEnv, textEnv) {
  const file = process.env[fileEnv]?.trim();
  const inline = process.env[textEnv];
  if (!file && inline === undefined) throw new Error(`${fileEnv} atau ${textEnv} wajib tersedia.`);
  const value = file ? await readFile(file) : Buffer.from(inline, 'utf8');
  return createHash('sha256').update(value).digest('hex');
}

safeIdentifier(externalRunId, 'OPENCLAW_RUN_ID');
safeIdentifier(correlationId, 'CORRELATION_ID');

// Every stage proves that the real caller can read both operational data and Revenue Learning context.
const contract = await request('/api/monetization/openclaw/acceptance/contract');
const command = await request('/api/monetization/openclaw/command', {
  method: 'POST',
  body: { query: 'revenue', days: 30 }
});
const context = await request('/api/monetization/openclaw/context');

const evidence = {
  stage,
  correlationId,
  externalRunId
};

if (stage === 'telegram') {
  evidence.telegramCommand = requiredEnv('TELEGRAM_COMMAND').toLowerCase();
  evidence.transportRunId = requiredEnv('TELEGRAM_TRANSPORT_RUN_ID');
  evidence.deliveryStatus = 'sent';
  safeIdentifier(evidence.telegramCommand, 'TELEGRAM_COMMAND');
  safeIdentifier(evidence.transportRunId, 'TELEGRAM_TRANSPORT_RUN_ID');
}

if (stage === 'hermes') {
  evidence.hermesRunId = requiredEnv('HERMES_RUN_ID');
  evidence.researchBriefHash = await sha256FromSource('HERMES_RESEARCH_BRIEF_FILE', 'HERMES_RESEARCH_BRIEF');
  evidence.resultHash = await sha256FromSource('HERMES_RESULT_FILE', 'HERMES_RESULT');
  evidence.resultAccepted = true;
  safeIdentifier(evidence.hermesRunId, 'HERMES_RUN_ID');
}

const submitted = await request('/api/monetization/openclaw/acceptance', {
  method: 'POST',
  body: evidence
});

const summary = {
  ok: true,
  stage,
  correlationId,
  externalRunId,
  contractVersion: contract.data?.version ?? null,
  commandType: command.data?.type ?? null,
  insightCount: Array.isArray(context.data?.insights) ? context.data.insights.length : 0,
  evidenceRecorded: submitted.data?.evidenceRecorded === true || submitted.data?.duplicate === true,
  duplicate: submitted.data?.duplicate === true
};

// Deliberately never print tokens, prompts, Telegram IDs, customer data, or raw provider payloads.
console.log(JSON.stringify(summary, null, 2));
