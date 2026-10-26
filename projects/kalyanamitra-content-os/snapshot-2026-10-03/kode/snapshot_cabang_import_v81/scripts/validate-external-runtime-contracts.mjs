import { readFile } from 'node:fs/promises';

const openApi = JSON.parse(await readFile('integrations/openclaw/monetization-engine.openapi.json', 'utf8'));
const telegram = JSON.parse(await readFile('integrations/openclaw/telegram-command-routing.json', 'utf8'));
const hermes = JSON.parse(await readFile('integrations/hermes/revenue-research-feedback-contract.json', 'utf8'));
const workerV9 = await readFile('src/monetization-worker-v9.ts', 'utf8');
const workerV10 = await readFile('src/monetization-worker-v10.ts', 'utf8');
const workerV11 = await readFile('src/monetization-worker-v11.ts', 'utf8');
const workerV12 = await readFile('src/monetization-worker-v12.ts', 'utf8');
const workerV13 = await readFile('src/monetization-worker-v13.ts', 'utf8');
const workerV14 = await readFile('src/monetization-worker-v14.ts', 'utf8');
const boundedAttribution = await readFile('src/monetization-bounded-attribution.ts', 'utf8');
const acceptance = await readFile('src/monetization-external-acceptance.ts', 'utf8');
const wrangler = JSON.parse(await readFile('wrangler.monetization.jsonc', 'utf8'));

function check(name, condition) {
  if (!condition) throw new Error(`External runtime contract validation failed: ${name}`);
  console.log(`PASS: ${name}`);
}

const operations = Object.values(openApi.paths ?? {})
  .flatMap((path) => Object.values(path ?? {}))
  .map((operation) => operation?.operationId)
  .filter(Boolean);

check('OpenAPI 3.1 contract', openApi.openapi === '3.1.0');
check('OpenClaw bearer security', openApi.components?.securitySchemes?.openClawBearer?.scheme === 'bearer');
check('command operation', operations.includes('monetizationCommand'));
check('learning context operation', operations.includes('getRevenueLearningContext'));
check('Telegram manifest operation', operations.includes('getTelegramCommandManifest'));
check('research start operation', operations.includes('startRevenueInformedResearch'));
check('research job operation', operations.includes('getResearchJob'));
check('acceptance contract operation', operations.includes('getExternalAcceptanceContract'));
check('acceptance submit operation', operations.includes('submitExternalAcceptanceEvidence'));

const expectedCommands = ['/revenue', '/profit', '/offers', '/content', '/health', '/learning'];
const actualCommands = (telegram.commands ?? []).map((item) => item.command);
check('Telegram orchestrator is OpenClaw', telegram.orchestrator === 'openclaw');
check('Telegram single bot', telegram.singleBot === true);
check('Telegram read-only', telegram.readOnly === true);
check('Telegram publishing disabled', telegram.publishing === false);
check('Telegram command set', expectedCommands.every((command) => actualCommands.includes(command)) && actualCommands.length === expectedCommands.length);
check('Telegram acceptance after reply', telegram.acceptance?.afterSuccessfulReply?.operationId === 'submitExternalAcceptanceEvidence');

check('Hermes research role', hermes.assistantRole === 'research');
check('Hermes orchestrated by OpenClaw', hermes.orchestrator === 'openclaw');
check('Hermes read-only', hermes.readOnly === true);
check('Hermes publishing disabled', hermes.publishing === false);
check('Hermes uses Revenue Learning context', hermes.sourceOperationId === 'getRevenueLearningContext');
check('Hermes acceptance uses SHA-256', hermes.acceptance?.hashAlgorithm === 'SHA-256');
check('Hermes result must be accepted', hermes.acceptance?.payload?.resultAccepted === true);

check('Worker v14 selected', wrangler.main === 'src/monetization-worker-v14.ts');
check('Worker v14 composes v13', workerV14.includes('monetizationWorkerV13'));
check('Worker v14 exposes constrained APK install telemetry', workerV14.includes("/api/monetization/app/install") && workerV14.includes('publicPanglimaInstall'));
check('Worker v14 restricts public telemetry keys', workerV14.includes("ALLOWED_KEYS=new Set(['appInstanceId','appVersion'])") && workerV14.includes('Object.keys(parsed).some'));
check('Worker v14 requires pseudonymous SHA-256-shaped app instance', workerV14.includes('APP_INSTANCE_PATTERN=/^[a-f0-9]{64}$/'));
check('Worker v14 delegates app event persistence through normalized ingestion', workerV14.includes("eventType:'app_install'") && workerV14.includes('ingestAppEvent'));
check('Worker v14 public telemetry refuses financial semantics', workerV14.includes('financialFieldsAccepted:false') && workerV14.includes('piiExpected:false'));
check('Worker v14 does not require or expose monetization bearer on public install route', !workerV14.includes('Bearer ${env.MONETIZATION_INGEST_TOKEN}') && !workerV14.includes('Authorization'));
check('Worker v13 composes v12', workerV13.includes('monetizationWorkerV12'));
check('Worker v13 bounds Lynk attribution to new non-duplicate webhook revenue', workerV13.includes("/api/monetization/webhooks/lynk") && workerV13.includes('parsed.duplicate!==false') && workerV13.includes('upgradeBoundedLynkAttribution'));
check('Bounded attribution requires exact one matching click', boundedAttribution.includes('touches.length!==1') && boundedAttribution.includes('candidateCount:1'));
check('Bounded attribution labels inference explicitly', boundedAttribution.includes("inference:true") && boundedAttribution.includes("exactVisitorMatch:false") && boundedAttribution.includes('bounded_unique_direct_match'));
check('Bounded attribution uses 60 minute window', boundedAttribution.includes('WINDOW_MINUTES=60'));
check('Worker v12 composes v11 and acceptance routes', workerV12.includes('monetizationWorkerV11') && workerV12.includes('handleExternalAcceptanceRoute'));
check('Worker v11 delegates existing v10 behavior', workerV11.includes('monetizationWorkerV10'));
check('Worker v11 has bounded async research queue', workerV11.includes('openclaw_research_retry') && workerV11.includes('MAX_RETRY_ATTEMPTS=4'));
check('Worker v11 has protected research job polling', workerV11.includes('/research-jobs') && workerV11.includes('verifyOpenClaw'));
check('Worker v10 retains Revenue-informed research bridge', workerV10.includes('/api/monetization/openclaw/research'));
check('Acceptance contract route implemented', acceptance.includes('/api/monetization/openclaw/acceptance/contract'));
check('Acceptance submission route implemented', acceptance.includes('/api/monetization/openclaw/acceptance'));
check('Evidence status route implemented', acceptance.includes('/api/monetization/external-acceptance/status'));
check('Acceptance evidence is privacy-safe', acceptance.includes('piiStored:false') && acceptance.includes('sha256-prefix'));
check('Direct Telegram remains disabled through v8 delegation', workerV9.includes('monetizationWorkerV8'));

const serialized = JSON.stringify({ openApi, telegram, hermes });
const forbiddenLiteralPatterns = [
  /Bearer\s+[A-Za-z0-9_-]{24,}/,
  /bot\d{6,}:[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{16,}/,
  /customer@/i,
  /jetnusa/i,
  /varashoil108@gmail\.com/i
];
check('No embedded credential or known customer PII', forbiddenLiteralPatterns.every((pattern) => !pattern.test(serialized)));

console.log('External runtime integration contracts are structurally valid.');
