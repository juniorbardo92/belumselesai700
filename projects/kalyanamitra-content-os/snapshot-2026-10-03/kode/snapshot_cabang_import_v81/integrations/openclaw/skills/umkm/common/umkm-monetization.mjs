#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev';
const ALLOWED_OPERATIONS = new Set(['revenue', 'profit', 'offers', 'content', 'health', 'learning', 'research', 'research-status']);
const ALLOWED_INTERFACES = new Set(['agent', 'telegram', 'web']);
const ALLOWED_PLATFORMS = new Set(['threads', 'instagram']);
const RESEARCH_JOB_PATTERN = /^research-job-[0-9a-f-]{36}$/i;

class CliExit extends Error {
  constructor(code) {
    super(`CLI exit ${code}`);
    this.name = 'CliExit';
    this.code = code;
  }
}

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  throw new CliExit(code);
}

function parseArgs(argv) {
  const result = {
    operation: argv[0] ?? '',
    interface: 'agent',
    days: 30,
    platform: 'threads',
    lookbackDays: 7,
    topic: '',
    keywords: [],
    jobId: ''
  };

  for (let index = 1; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--interface' && next) { result.interface = next; index += 1; continue; }
    if (current === '--days' && next) { result.days = Number(next); index += 1; continue; }
    if (current === '--platform' && next) { result.platform = next; index += 1; continue; }
    if (current === '--lookback' && next) { result.lookbackDays = Number(next); index += 1; continue; }
    if (current === '--topic' && next) { result.topic = next; index += 1; continue; }
    if (current === '--keyword' && next) { result.keywords.push(next); index += 1; continue; }
    if (current === '--job-id' && next) { result.jobId = next; index += 1; continue; }
    if (result.operation === 'research' && !current.startsWith('--')) {
      result.topic = [result.topic, current].filter(Boolean).join(' ');
      continue;
    }
    if (result.operation === 'research-status' && !current.startsWith('--') && !result.jobId) {
      result.jobId = current;
      continue;
    }
    fail(`Argumen tidak dikenal: ${current}`);
  }
  return result;
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

async function requestJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { ok: false, error: 'Respons bukan JSON valid.', rawStatus: response.status };
    }
    if (!response.ok) {
      console.error(JSON.stringify({ ok: false, httpStatus: response.status, response: body }));
      throw new CliExit(response.status === 401 ? 3 : 2);
    }
    return body;
  } catch (error) {
    if (error instanceof CliExit) throw error;
    const message = error instanceof Error ? error.message : 'Request gagal.';
    fail(message, 2);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ALLOWED_OPERATIONS.has(args.operation)) {
    fail('Operasi harus revenue, profit, offers, content, health, learning, research, atau research-status.');
  }
  if (!ALLOWED_INTERFACES.has(args.interface)) fail('Interface harus agent, telegram, atau web.');
  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 365) fail('Days harus integer 1-365.');

  const token = process.env.UMKM_OPENCLAW_TOKEN?.trim();
  if (!token) fail('UMKM_OPENCLAW_TOKEN belum tersedia pada environment OpenClaw.', 3);
  const baseUrl = (process.env.UMKM_MONETIZATION_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const runId = randomUUID();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-OpenClaw-Run-Id': runId,
    'X-Correlation-Id': runId,
    'X-OpenClaw-Interface': args.interface,
    'User-Agent': 'umkm-content-os-openclaw-skill/1.1'
  };

  let result;
  if (args.operation === 'learning') {
    result = await requestJson(`${baseUrl}/api/monetization/openclaw/context`, { method: 'GET', headers });
  } else if (args.operation === 'research') {
    const topic = cleanText(args.topic, 300);
    if (topic.length < 8) fail('Topik research minimal 8 karakter.');
    if (!ALLOWED_PLATFORMS.has(args.platform)) fail('Platform research hanya threads atau instagram.');
    if (!Number.isInteger(args.lookbackDays) || args.lookbackDays < 1 || args.lookbackDays > 30) {
      fail('Lookback harus integer 1-30.');
    }
    result = await requestJson(`${baseUrl}/api/monetization/openclaw/research`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic,
        keywords: args.keywords.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 12),
        platform: args.platform,
        lookbackDays: args.lookbackDays,
        useRevenueLearning: true
      })
    });
  } else if (args.operation === 'research-status') {
    const jobId = cleanText(args.jobId, 80);
    if (!RESEARCH_JOB_PATTERN.test(jobId)) fail('Research job ID tidak valid.');
    result = await requestJson(
      `${baseUrl}/api/monetization/openclaw/research-jobs/${encodeURIComponent(jobId)}`,
      { method: 'GET', headers }
    );
  } else {
    const query = args.operation === 'offers' ? 'offer' : args.operation;
    result = await requestJson(`${baseUrl}/api/monetization/openclaw/command`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, days: args.days })
    });
  }

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  if (error instanceof CliExit) {
    process.exitCode = error.code;
    return;
  }
  const message = error instanceof Error ? error.message : 'Client gagal.';
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 2;
});
