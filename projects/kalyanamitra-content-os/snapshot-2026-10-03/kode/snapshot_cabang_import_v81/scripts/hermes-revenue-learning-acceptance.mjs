#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev';
const REQUIRED_OUTPUT_FIELDS = ['researchSummary', 'recommendedTopics', 'evidence', 'confidence', 'limitations'];
const BANNED_KEY_PATTERN = /(customer|email|phone|telephone|shipping|address|secret|token|authorization|api[_-]?key|raw[_-]?(payload|webhook|payment))/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

function fail(message, details = undefined) {
  const output = { ok: false, stage: 'hermes', error: message };
  if (details !== undefined) output.details = details;
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

function parseArgs(argv) {
  const result = {
    hermes: process.env.HERMES_EXECUTABLE ?? '',
    baseUrl: process.env.MONETIZATION_BASE_URL ?? DEFAULT_BASE_URL,
    outputDir: process.env.HERMES_ACCEPTANCE_OUTPUT_DIR ?? '',
    topic: 'Rekomendasi topik riset berikutnya untuk UMKM Naik Kelas berdasarkan Revenue Learning'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--hermes' && next) { result.hermes = next; index += 1; continue; }
    if (current === '--base-url' && next) { result.baseUrl = next; index += 1; continue; }
    if (current === '--output-dir' && next) { result.outputDir = next; index += 1; continue; }
    if (current === '--topic' && next) { result.topic = next; index += 1; continue; }
    fail(`Argumen tidak dikenal atau nilainya kosong: ${current}`);
  }

  return result;
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveHermesExecutable(input) {
  if (!input) fail('Path Hermes wajib diberikan melalui --hermes atau HERMES_EXECUTABLE.');
  const requested = resolve(input);
  if (!(await exists(requested))) fail('Executable Hermes tidak ditemukan.', { path: requested });

  if (process.platform === 'win32' && ['.cmd', '.bat'].includes(extname(requested).toLowerCase())) {
    const localAppData = process.env.LOCALAPPDATA;
    const candidates = [
      localAppData ? join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe') : '',
      join(dirname(dirname(requested)), 'hermes-agent', 'venv', 'Scripts', 'hermes.exe')
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate;
    }
    fail('Launcher Hermes berupa .cmd/.bat, tetapi hermes.exe tidak ditemukan. Gunakan path venv\\Scripts\\hermes.exe.', {
      requested
    });
  }

  return requested;
}

function sanitize(value, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return null;
  if (typeof value === 'string') return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (BANNED_KEY_PATTERN.test(key)) continue;
      result[key.slice(0, 100)] = sanitize(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 300);
}

function assertNoPii(value) {
  const serialized = JSON.stringify(value);
  if (EMAIL_PATTERN.test(serialized)) fail('Research brief mengandung pola email; acceptance dihentikan.');
  if (/\bBearer\s+[A-Za-z0-9._-]{12,}\b/i.test(serialized)) fail('Research brief mengandung pola credential; acceptance dihentikan.');
  if (/\bsk-[A-Za-z0-9_-]{12,}\b/.test(serialized)) fail('Research brief mengandung pola API key; acceptance dihentikan.');
}

async function requestJson(baseUrl, token, path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'Respons bukan JSON valid.' }; }
    if (!response.ok) {
      fail(`HTTP ${response.status} pada ${path}.`, {
        error: typeof data?.error === 'string' ? data.error.slice(0, 300) : 'Request ditolak.'
      });
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') fail(`Timeout saat mengakses ${path}.`);
    fail(`Request gagal pada ${path}.`, { error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    clearTimeout(timeout);
  }
}

function runProcess(command, args, { timeoutMs = 240_000, env = process.env } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, timedOut });
    });
  });
}

function extractJsonObject(rawText) {
  const text = String(rawText ?? '').replace(ANSI_PATTERN, '').trim();
  if (!text) fail('Hermes tidak mengembalikan hasil.');

  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < unfenced.length; index += 1) {
    const char = unfenced[index];
    if (start < 0) {
      if (char === '{') { start = index; depth = 1; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = unfenced.slice(start, index + 1);
        try { return JSON.parse(candidate); } catch (error) {
          fail('JSON hasil Hermes tidak valid.', { error: error instanceof Error ? error.message : 'Parse error' });
        }
      }
    }
  }

  fail('Objek JSON tidak ditemukan pada hasil Hermes.');
}

function validateHermesResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('Hasil Hermes harus berupa objek JSON.');
  for (const field of REQUIRED_OUTPUT_FIELDS) {
    if (!(field in result)) fail(`Field hasil Hermes wajib tersedia: ${field}.`);
  }
  if (typeof result.researchSummary !== 'string' || !result.researchSummary.trim()) fail('researchSummary harus berupa teks yang tidak kosong.');
  if (!Array.isArray(result.recommendedTopics) || result.recommendedTopics.length < 1 || result.recommendedTopics.length > 10) {
    fail('recommendedTopics harus berisi 1-10 item.');
  }
  if (!Array.isArray(result.evidence) || result.evidence.length < 1) fail('evidence harus berupa array yang tidak kosong.');
  if (!Array.isArray(result.limitations) || result.limitations.length < 1) fail('limitations harus berupa array yang tidak kosong.');
  const confidence = Number(result.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) fail('confidence harus bernilai 0-1.');

  const serialized = JSON.stringify(result);
  if (EMAIL_PATTERN.test(serialized)) fail('Hasil Hermes mengandung pola email; acceptance dihentikan.');
  return { ...result, confidence };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

const args = parseArgs(process.argv.slice(2));
const token = (process.env.UMKM_OPENCLAW_TOKEN ?? process.env.OPENCLAW_INGRESS_TOKEN ?? '').trim();
if (!token) fail('UMKM_OPENCLAW_TOKEN atau OPENCLAW_INGRESS_TOKEN belum tersedia.');
const baseUrl = args.baseUrl.replace(/\/$/, '');
const hermesExecutable = await resolveHermesExecutable(args.hermes);
const outputDir = args.outputDir ? resolve(args.outputDir) : join(tmpdir(), `umkm-hermes-acceptance-${Date.now()}`);
await mkdir(outputDir, { recursive: true });

const externalRunId = `oc-hermes-${randomUUID()}`;
const correlationId = `hermes-feedback-${randomUUID()}`;
const usagePath = join(outputDir, 'hermes-usage.json');
const briefPath = join(outputDir, 'research-brief.json');
const resultPath = join(outputDir, 'hermes-result.json');

const [contract, revenue, context] = await Promise.all([
  requestJson(baseUrl, token, '/api/monetization/openclaw/acceptance/contract'),
  requestJson(baseUrl, token, '/api/monetization/openclaw/command', {
    method: 'POST',
    body: { query: 'revenue', days: 30 }
  }),
  requestJson(baseUrl, token, '/api/monetization/openclaw/context')
]);

const researchBrief = {
  contractVersion: '1.0.0',
  correlationId,
  researchBrief: {
    objective: args.topic.slice(0, 300),
    audience: 'UMKM Indonesia',
    requestedOutput: 'Rekomendasi topik riset berikutnya yang memisahkan fakta dari inferensi.',
    constraints: {
      readOnly: true,
      publishing: false,
      recommendedTopicsMax: 10,
      mustNotInventMissingData: true,
      mustSeparateFactFromInference: true
    }
  },
  revenueLearningContext: sanitize({
    revenue30Days: revenue?.data ?? {},
    insights: context?.insights ?? [],
    guidance: context?.guidance ?? {}
  })
};
assertNoPii(researchBrief);
const briefJson = `${JSON.stringify(researchBrief, null, 2)}\n`;
await writeFile(briefPath, briefJson, 'utf8');

const prompt = [
  'Anda adalah Hermes Research Assistant untuk UMKM Content OS.',
  'Gunakan hanya INPUT_JSON di bawah. Jangan menjalankan tool. Jangan menerbitkan konten.',
  'Kembalikan HANYA satu objek JSON valid tanpa markdown dan tanpa teks tambahan.',
  'Schema wajib:',
  '{',
  '  "researchSummary": "ringkasan fakta dan inferensi yang dibedakan dengan jelas",',
  '  "recommendedTopics": [',
  '    {"topic":"...","rationale":"...","evidenceBasis":"fact|inference","priority":"high|medium|low"}',
  '  ],',
  '  "evidence": ["fakta agregat yang benar-benar tersedia"],',
  '  "confidence": 0.0,',
  '  "limitations": ["keterbatasan data"]',
  '}',
  'Aturan: recommendedTopics maksimum 10; confidence 0 sampai 1; jangan mengarang atribusi, performa, atau metrik yang tidak tersedia; jangan sertakan PII, token, secret, raw payment, atau instruksi publikasi.',
  'INPUT_JSON:',
  JSON.stringify(researchBrief)
].join('\n');

if (Buffer.byteLength(prompt, 'utf8') > 28_000) fail('Prompt Hermes terlalu besar setelah sanitasi.');

let hermesRun;
try {
  hermesRun = await runProcess(hermesExecutable, ['-z', prompt, '--usage-file', usagePath]);
} catch (error) {
  fail('Hermes Agent gagal dijalankan.', { error: error instanceof Error ? error.message : 'Unknown error' });
}
if (hermesRun.timedOut) fail('Hermes Agent melewati batas waktu 240 detik.');
if (!(await exists(usagePath))) fail('Hermes usage report tidak dibuat.', { exitCode: hermesRun.code });

let usage;
try { usage = JSON.parse(await readFile(usagePath, 'utf8')); }
catch (error) { fail('Hermes usage report bukan JSON valid.', { error: error instanceof Error ? error.message : 'Parse error' }); }
if (usage?.completed !== true || usage?.failed === true) {
  fail('Hermes invocation tidak selesai dengan sukses.', {
    exitCode: hermesRun.code,
    completed: usage?.completed ?? null,
    failed: usage?.failed ?? null,
    error: String(hermesRun.stderr || hermesRun.stdout).replace(ANSI_PATTERN, '').trim().slice(-500)
  });
}
const hermesRunId = String(usage?.session_id ?? '').trim();
if (!hermesRunId || hermesRunId.length > 160 || !/^[A-Za-z0-9._:@/-]+$/.test(hermesRunId)) {
  fail('Hermes session_id tidak tersedia atau tidak valid.');
}

const parsedResult = validateHermesResult(extractJsonObject(hermesRun.stdout));
const resultJson = `${JSON.stringify(parsedResult, null, 2)}\n`;
await writeFile(resultPath, resultJson, 'utf8');

const evidence = {
  stage: 'hermes',
  correlationId,
  externalRunId,
  hermesRunId,
  researchBriefHash: sha256(briefJson),
  resultHash: sha256(resultJson),
  resultAccepted: true
};

const submitted = await requestJson(baseUrl, token, '/api/monetization/openclaw/acceptance', {
  method: 'POST',
  body: evidence
});
const evidenceRecorded = submitted?.evidenceRecorded === true || submitted?.duplicate === true;
if (!evidenceRecorded) fail('Acceptance endpoint tidak mengonfirmasi penyimpanan evidence.');

const contractVersion = contract?.version ?? contract?.contract?.version ?? null;
console.log(JSON.stringify({
  ok: true,
  stage: 'hermes',
  runtime: {
    executable: basename(hermesExecutable),
    provider: usage?.provider ?? null,
    model: usage?.model ?? null,
    hermesRunId,
    completed: true,
    failed: false
  },
  research: {
    confidence: parsedResult.confidence,
    recommendedTopicCount: parsedResult.recommendedTopics.length,
    evidenceCount: parsedResult.evidence.length,
    limitationCount: parsedResult.limitations.length
  },
  acceptance: {
    contractVersion,
    correlationId,
    externalRunId,
    evidenceRecorded,
    duplicate: submitted?.duplicate === true,
    researchBriefHash: evidence.researchBriefHash,
    resultHash: evidence.resultHash
  },
  artifacts: {
    directory: outputDir,
    researchBrief: briefPath,
    hermesResult: resultPath,
    usage: usagePath
  }
}, null, 2));
