import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const integrationRoot = join(repoRoot, 'integrations', 'openclaw');
const packageRoot = join(integrationRoot, 'skills', 'umkm');
const clientPath = join(packageRoot, 'common', 'umkm-monetization.mjs');
const installerPath = join(integrationRoot, 'install-skills.sh');
const manifestPath = join(integrationRoot, 'manifest.json');
const configPath = join(integrationRoot, 'openclaw.config.fragment.json5');
const installGuidePath = join(integrationRoot, 'INSTALL.md');
const expectedSkills = ['revenue', 'profit', 'offers', 'content', 'health', 'learning', 'research'];
const fakeToken = 'local-acceptance-token-never-log';

function runProcess(command, args, { env = {}, cwd = repoRoot } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

function runClient(args, env = {}) {
  return runProcess(process.execPath, [clientPath, ...args], { env });
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md harus memiliki frontmatter YAML.');
  const block = match[1];
  const field = (name) => block.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
  return {
    name: field('name'),
    description: field('description'),
    userInvocable: field('user-invocable'),
    metadata: field('metadata')
  };
}

async function validateManifestAndInstallerContract() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'umkm-content-os-monetization');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.status, 'install-ready');
  assert.equal(manifest.transport, 'openclaw');
  assert.equal(manifest.singleBot, true);
  assert.equal(manifest.directTelegramWebhook, false);
  assert.equal(manifest.publishing, false);
  assert.deepEqual(manifest.requiredEnvironment, ['UMKM_OPENCLAW_TOKEN']);
  assert.deepEqual(manifest.optionalEnvironment, ['UMKM_MONETIZATION_BASE_URL']);
  assert.deepEqual(manifest.skills, expectedSkills);
  assert.deepEqual(manifest.allowedResearchPlatforms, ['threads', 'instagram']);
  assert.equal(manifest.evidencePolicy?.identifiersStoredAs, 'sha256-prefix');
  assert.equal(manifest.evidencePolicy?.piiStored, false);

  const config = await readFile(configPath, 'utf8');
  assert.match(config, /text:\s*true/);
  assert.match(config, /nativeSkills:\s*"auto"/);
  assert.match(config, /channels:\s*\{/);
  assert.match(config, /telegram:\s*\{/);

  const guide = await readFile(installGuidePath, 'utf8');
  assert.match(guide, /sha256sum -c umkm-openclaw-integration-v1\.0\.0\.tar\.gz\.sha256/);
  assert.match(guide, /sha256sum -c SHA256SUMS/);
  assert.match(guide, /bash install-skills\.sh/);
  assert.match(guide, /Telegram\s*\n→ OpenClaw skill/);
  assert.match(guide, /HTTP 410/);

  await access(installerPath);
}

async function validateSkillFiles() {
  await access(clientPath);
  const directories = (await readdir(packageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== 'common')
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, [...expectedSkills].sort(), 'Daftar skill tidak sesuai kontrak final.');

  const allText = [
    await readFile(manifestPath, 'utf8'),
    await readFile(configPath, 'utf8'),
    await readFile(installGuidePath, 'utf8'),
    await readFile(installerPath, 'utf8')
  ];
  for (const skill of expectedSkills) {
    const skillPath = join(packageRoot, skill, 'SKILL.md');
    const markdown = await readFile(skillPath, 'utf8');
    const frontmatter = parseFrontmatter(markdown);
    assert.equal(frontmatter.name, skill, `${skill}: name frontmatter tidak sesuai.`);
    assert.ok(frontmatter.description?.length >= 20, `${skill}: description terlalu pendek.`);
    assert.equal(frontmatter.userInvocable, 'true', `${skill}: harus user-invocable.`);
    assert.ok(frontmatter.metadata?.includes('UMKM_OPENCLAW_TOKEN'), `${skill}: env gate belum dideklarasikan.`);
    assert.ok(frontmatter.metadata?.includes('"node"'), `${skill}: node binary gate belum dideklarasikan.`);
    assert.ok(markdown.includes('../common/umkm-monetization.mjs'), `${skill}: deterministic client tidak direferensikan.`);
    assert.ok(!markdown.includes('command-dispatch: tool'), `${skill}: tidak boleh mendeklarasikan tool yang belum diregistrasi.`);
    allText.push(markdown);
  }

  const client = await readFile(clientPath, 'utf8');
  allText.push(client);
  const combined = allText.join('\n');
  assert.ok(!/OPENCLAW_INGRESS_TOKEN\s*=\s*[^<\s]/i.test(combined), 'Nilai ingress token tidak boleh ada di package.');
  assert.ok(!/UMKM_OPENCLAW_TOKEN\s*=\s*[^<\s]/i.test(combined), 'Nilai UMKM token tidak boleh ada di package.');
  assert.ok(!/LYNK_WEBHOOK_SECRET\s*=\s*[^<\s]/i.test(combined), 'Nilai Lynk secret tidak boleh ada di package.');
}

async function validateInstaller() {
  const workspace = await mkdtemp(join(tmpdir(), 'umkm-openclaw-workspace-'));
  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await runProcess('bash', [installerPath], { env: { OPENCLAW_WORKSPACE: workspace } });
      assert.equal(result.code, 0, `Installer attempt ${attempt} gagal: ${result.stderr}`);
      assert.match(result.stdout, /OPENCLAW_SKILLS_INSTALLED=/);
      assert.match(result.stdout, /REQUIRED_ENV=UMKM_OPENCLAW_TOKEN/);
    }

    const installedRoot = join(workspace, 'skills', 'umkm');
    const installedClient = join(installedRoot, 'common', 'umkm-monetization.mjs');
    await access(installedClient);
    assert.equal((await stat(installedClient)).mode & 0o777, 0o700, 'Deterministic client harus mode 700.');

    for (const skill of expectedSkills) {
      const installedSkill = join(installedRoot, skill, 'SKILL.md');
      await access(installedSkill);
      assert.equal((await stat(installedSkill)).mode & 0o777, 0o600, `${skill}: SKILL.md harus mode 600.`);
      assert.equal(await readFile(installedSkill, 'utf8'), await readFile(join(packageRoot, skill, 'SKILL.md'), 'utf8'));
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function withServer(run) {
  const requests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/api/monetization/openclaw/context') {
        response.end(JSON.stringify({ ok: true, insights: [], guidance: {} }));
      } else if (request.url === '/api/monetization/openclaw/research') {
        response.end(JSON.stringify({ ok: true, research: { id: 'research-run-test', status: 'waiting_provider' } }));
      } else {
        response.end(JSON.stringify({ ok: true, type: 'acceptance', data: { gross: 5000, net: 5000, profit: 5000, transactions: 1 } }));
      }
    });
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run({ baseUrl: `http://127.0.0.1:${address.port}`, requests });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function validateClient() {
  const missing = await runClient(['revenue'], { UMKM_OPENCLAW_TOKEN: '', UMKM_MONETIZATION_BASE_URL: '' });
  assert.equal(missing.code, 3, 'Client harus fail-closed ketika token tidak tersedia.');
  assert.match(missing.stderr, /UMKM_OPENCLAW_TOKEN belum tersedia/);

  await withServer(async ({ baseUrl, requests }) => {
    const env = { UMKM_OPENCLAW_TOKEN: fakeToken, UMKM_MONETIZATION_BASE_URL: baseUrl };

    const revenue = await runClient(['revenue', '--interface', 'agent', '--days', '30'], env);
    assert.equal(revenue.code, 0, revenue.stderr);
    assert.equal(JSON.parse(revenue.stdout).ok, true);

    const learning = await runClient(['learning', '--interface', 'agent'], env);
    assert.equal(learning.code, 0, learning.stderr);
    assert.equal(JSON.parse(learning.stdout).ok, true);

    const research = await runClient([
      'research', '--interface', 'telegram', '--platform', 'threads', '--lookback', '7',
      '--topic', 'Strategi arus kas untuk UMKM', '--keyword', 'arus kas'
    ], env);
    assert.equal(research.code, 0, research.stderr);
    assert.equal(JSON.parse(research.stdout).ok, true);

    assert.equal(requests.length, 3);
    const [revenueRequest, learningRequest, researchRequest] = requests;
    assert.equal(revenueRequest.method, 'POST');
    assert.equal(revenueRequest.url, '/api/monetization/openclaw/command');
    assert.equal(revenueRequest.headers.authorization, `Bearer ${fakeToken}`);
    assert.equal(revenueRequest.headers['x-openclaw-interface'], 'agent');
    assert.match(revenueRequest.headers['x-openclaw-run-id'] ?? '', /^[0-9a-f-]{36}$/i);
    assert.equal(JSON.parse(revenueRequest.body).query, 'revenue');
    assert.equal(JSON.parse(revenueRequest.body).days, 30);

    assert.equal(learningRequest.method, 'GET');
    assert.equal(learningRequest.url, '/api/monetization/openclaw/context');

    assert.equal(researchRequest.method, 'POST');
    assert.equal(researchRequest.url, '/api/monetization/openclaw/research');
    assert.equal(researchRequest.headers['x-openclaw-interface'], 'telegram');
    const researchBody = JSON.parse(researchRequest.body);
    assert.equal(researchBody.topic, 'Strategi arus kas untuk UMKM');
    assert.equal(researchBody.platform, 'threads');
    assert.equal(researchBody.lookbackDays, 7);
    assert.equal(researchBody.useRevenueLearning, true);
    assert.deepEqual(researchBody.keywords, ['arus kas']);

    for (const result of [revenue, learning, research]) {
      assert.ok(!result.stdout.includes(fakeToken), 'Token tidak boleh muncul di stdout.');
      assert.ok(!result.stderr.includes(fakeToken), 'Token tidak boleh muncul di stderr.');
    }
  });

  const invalid = await runClient(
    ['research', '--platform', 'x', '--topic', 'Strategi arus kas untuk UMKM'],
    { UMKM_OPENCLAW_TOKEN: fakeToken, UMKM_MONETIZATION_BASE_URL: 'http://127.0.0.1:9' }
  );
  assert.equal(invalid.code, 1, 'Platform research yang tidak didukung harus ditolak sebelum request.');
  assert.match(invalid.stderr, /threads atau instagram/);
}

await validateManifestAndInstallerContract();
await validateSkillFiles();
await validateInstaller();
await validateClient();
console.log('OPENCLAW_SKILL_PACKAGE_TESTS=PASS');
