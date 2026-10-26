import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL;
const token = process.env.MONETIZATION_INGEST_TOKEN;
const contentId = process.env.ACCEPTANCE_CONTENT_ID;
const runTag = process.env.RUN_TAG;
const slug = process.env.ACCEPTANCE_SLUG;

for (const [name, value] of Object.entries({ baseUrl, token, contentId, runTag, slug })) {
  if (!value) throw new Error(`Missing ${name}`);
}

const offerId = `${runTag}-offer`;
const campaignId = `${runTag}-campaign`;
const experimentId = `${runTag}-experiment`;
const provider = `${runTag}-affiliate`;
const externalOfferId = `${runTag}-external-offer`;
const visitorId = `${runTag}-visitor`;
const sessionId = `${runTag}-session`;
const transactionId = `${runTag}-affiliate-trx`;
const manualTransactionId = `${runTag}-manual-trx`;
const report = { runTag, contentId, checks: [] };

function check(name, condition, details = undefined) {
  if (!condition) throw new Error(`Acceptance failed: ${name}${details ? ` — ${JSON.stringify(details)}` : ''}`);
  report.checks.push({ name, status: 'pass', details });
}

async function api(path, { method = 'GET', body, auth = true, redirect = 'follow', headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data, text };
}

const now = Date.now();
const iso = (offsetSeconds) => new Date(now + offsetSeconds * 1000).toISOString();

// Offer CRUD
{
  const { response, data } = await api('/api/monetization/offers', {
    method: 'POST',
    body: {
      id: offerId,
      name: `[ACCEPTANCE] ${runTag}`,
      type: 'affiliate',
      destinationUrl: 'https://example.com/acceptance',
      status: 'active',
      commissionType: 'fixed',
      commissionValue: 12345,
      metadata: { acceptanceTag: runTag }
    }
  });
  check('offer create', response.status === 201 && data?.ok === true && data?.offer?.id === offerId, { status: response.status, data });

  const patched = await api(`/api/monetization/offers/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    body: { description: 'Acceptance-updated offer', status: 'active', metadata: { acceptanceTag: runTag, patched: true } }
  });
  check('offer update', patched.response.status === 200 && patched.data?.offer?.description === 'Acceptance-updated offer', { status: patched.response.status, data: patched.data });
}

// Campaign
{
  const { response, data } = await api('/api/monetization/campaigns', {
    method: 'POST',
    body: {
      id: campaignId,
      name: `[ACCEPTANCE] ${runTag}`,
      objective: 'affiliate-conversion',
      offerId,
      status: 'active',
      metadata: { acceptanceTag: runTag }
    }
  });
  check('campaign create', response.status === 201 && data?.campaign?.id === campaignId, { status: response.status, data });
}

// Content monetization metadata on an existing unmonetized content item; cleanup is handled by workflow.
{
  const saved = await api(`/api/monetization/content/${encodeURIComponent(contentId)}`, {
    method: 'PUT',
    body: {
      monetizationGoal: 'affiliate',
      offerId,
      campaignId,
      ctaId: `${runTag}-cta`,
      ctaText: 'Lihat rekomendasi acceptance',
      commercialScore: 91,
      destinationUrl: 'https://example.com/acceptance',
      metadata: { acceptanceTag: runTag }
    }
  });
  check('content monetization save', saved.response.status === 200 && saved.data?.monetization?.offer_id === offerId && saved.data?.monetization?.campaign_id === campaignId, { status: saved.response.status, data: saved.data });

  const got = await api(`/api/monetization/content/${encodeURIComponent(contentId)}`);
  check('content monetization read', got.response.status === 200 && got.data?.monetization?.commercial_score === 91, { status: got.response.status, data: got.data });
}

// Tracked link and redirect
let trackedLinkId;
{
  const made = await api('/api/monetization/links', {
    method: 'POST',
    body: {
      slug,
      destinationUrl: 'https://example.com/acceptance',
      contentItemId: contentId,
      campaignId,
      offerId,
      ctaId: `${runTag}-cta`,
      platform: 'instagram',
      metadata: { acceptanceTag: runTag }
    }
  });
  trackedLinkId = made.data?.link?.id;
  check('tracked link create', made.response.status === 201 && Boolean(trackedLinkId), { status: made.response.status, data: made.data });

  const redirectResult = await api(`/go/${encodeURIComponent(slug)}`, {
    auth: false,
    redirect: 'manual',
    headers: { 'X-Visitor-Id': visitorId, 'X-Session-Id': sessionId, 'User-Agent': `acceptance/${runTag}` }
  });
  check('tracked redirect', redirectResult.response.status === 302 && redirectResult.response.headers.get('location') === 'https://example.com/acceptance', { status: redirectResult.response.status, location: redirectResult.response.headers.get('location') });
}

// Event ingestion + idempotency + funnel stages
const commonEvent = { contentItemId: contentId, campaignId, offerId, trackedLinkId, source: 'acceptance', platform: 'instagram', visitorId, sessionId, currency: 'IDR' };
for (const [idx, eventType] of ['impression', 'landing_view', 'lead', 'checkout'].entries()) {
  const result = await api('/api/monetization/events', {
    method: 'POST',
    body: { ...commonEvent, eventType, idempotencyKey: `${runTag}:${eventType}`, occurredAt: iso(-20 + idx), metadata: { acceptanceTag: runTag } }
  });
  check(`event ${eventType}`, result.response.status === 201 && result.data?.ok === true && result.data?.duplicate === false, { status: result.response.status, data: result.data });
}

{
  const payload = { ...commonEvent, eventType: 'click', idempotencyKey: `${runTag}:idem-click`, occurredAt: iso(-10), metadata: { acceptanceTag: runTag, idempotencyTest: true } };
  const first = await api('/api/monetization/events', { method: 'POST', body: payload });
  const second = await api('/api/monetization/events', { method: 'POST', body: payload });
  check('event idempotency first', first.response.status === 201 && first.data?.duplicate === false, { status: first.response.status, data: first.data });
  check('event idempotency duplicate', second.response.status === 200 && second.data?.duplicate === true, { status: second.response.status, data: second.data });
}

// Provider mapping
{
  const mapped = await api('/api/monetization/provider-mappings', {
    method: 'POST',
    body: {
      id: `${runTag}-mapping`,
      provider,
      externalType: 'offer',
      externalId: externalOfferId,
      offerId,
      campaignId,
      contentItemId: contentId,
      metadata: { acceptanceTag: runTag }
    }
  });
  check('provider mapping', mapped.response.status === 200 && mapped.data?.mapping?.offer_id === offerId, { status: mapped.response.status, data: mapped.data });
}

// Affiliate conversion → Revenue Ledger → attribution
let affiliateRevenueEventId;
{
  const payload = {
    provider,
    transactionId,
    commissionAmount: 12345,
    currency: 'IDR',
    status: 'confirmed',
    externalOfferId,
    subId: visitorId,
    occurredAt: iso(0),
    acceptanceTag: runTag
  };
  const first = await api('/api/monetization/affiliate/conversions', { method: 'POST', body: payload });
  affiliateRevenueEventId = first.data?.revenueEventId;
  check('affiliate conversion ingest', first.response.status === 201 && Boolean(affiliateRevenueEventId), { status: first.response.status, data: first.data });
  check('affiliate attribution', ['attributed', 'partial'].includes(first.data?.attribution?.attribution_status), { attribution: first.data?.attribution });

  const duplicate = await api('/api/monetization/affiliate/conversions', { method: 'POST', body: payload });
  check('affiliate idempotency', duplicate.response.status === 200 && duplicate.data?.duplicate === true && duplicate.data?.revenueEventId === affiliateRevenueEventId, { status: duplicate.response.status, data: duplicate.data });
}

// Direct Revenue Ledger calculations + idempotency
{
  const payload = {
    transactionId: manualTransactionId,
    eventType: 'sale',
    source: `${runTag}-manual`,
    contentItemId: contentId,
    campaignId,
    offerId,
    grossAmount: 20000,
    feeAmount: 1000,
    costAmount: 5000,
    currency: 'IDR',
    status: 'confirmed',
    idempotencyKey: `${runTag}:manual-revenue`,
    occurredAt: iso(1),
    metadata: { acceptanceTag: runTag }
  };
  const first = await api('/api/monetization/revenue', { method: 'POST', body: payload });
  check('revenue ledger calculation', first.response.status === 201 && first.data?.grossAmount === 20000 && first.data?.netAmount === 19000 && first.data?.marginAmount === 14000, { status: first.response.status, data: first.data });
  const duplicate = await api('/api/monetization/revenue', { method: 'POST', body: payload });
  check('revenue ledger idempotency', duplicate.response.status === 200 && duplicate.data?.duplicate === true, { status: duplicate.response.status, data: duplicate.data });
}

// Funnel + attribution reports
{
  const funnel = await api('/api/monetization/funnel?days=30');
  check('funnel analytics', funnel.response.status === 200 && funnel.data?.counts?.clicks >= 1 && funnel.data?.counts?.leads >= 1 && funnel.data?.counts?.checkouts >= 1 && funnel.data?.revenue?.transactions >= 2, { status: funnel.response.status, data: funnel.data });

  const attribution = await api('/api/monetization/attribution?days=30');
  const statuses = Array.isArray(attribution.data?.attributionStatus) ? attribution.data.attributionStatus : [];
  check('attribution report', attribution.response.status === 200 && statuses.some((row) => ['attributed', 'partial'].includes(row.attribution_status)), { status: attribution.response.status, statuses });
}

// Reconciliation should match exactly for the isolated affiliate source.
{
  const rec = await api('/api/monetization/reconciliation', {
    method: 'POST',
    body: {
      source: provider,
      periodStart: iso(-3600),
      periodEnd: iso(3600),
      externalTransactionCount: 1,
      externalGrossAmount: 12345,
      metadata: { acceptanceTag: runTag }
    }
  });
  check('revenue reconciliation matched', rec.response.status === 201 && rec.data?.reconciliation?.status === 'matched' && rec.data?.reconciliation?.delta?.transactions === 0 && rec.data?.reconciliation?.delta?.gross === 0, { status: rec.response.status, data: rec.data });
}

// Experiment engine
{
  const created = await api('/api/monetization/experiments', {
    method: 'POST',
    body: {
      id: experimentId,
      hypothesis: `Acceptance hypothesis ${runTag}`,
      variable: 'cta',
      primaryMetric: 'contribution_profit',
      status: 'running',
      variantA: { cta: 'A' },
      variantB: { cta: 'B' }
    }
  });
  check('experiment create', created.response.status === 201 && created.data?.experiment?.id === experimentId, { status: created.response.status, data: created.data });
  const completed = await api(`/api/monetization/experiments/${encodeURIComponent(experimentId)}/complete`, { method: 'POST', body: { winner: 'a', result: { acceptanceTag: runTag } } });
  check('experiment complete', completed.response.status === 200 && completed.data?.experiment?.status === 'completed' && completed.data?.experiment?.winner === 'a', { status: completed.response.status, data: completed.data });
}

// Operational surfaces
{
  const operations = await api('/api/monetization/operations?days=30');
  check('operations snapshot', operations.response.status === 200 && operations.data?.ok === true && operations.data?.revenue?.transactions >= 2, { status: operations.response.status, data: operations.data });

  const command = await api('/api/monetization/command', { method: 'POST', body: { query: 'profit', days: 30 } });
  check('operations command', command.response.status === 200 && command.data?.ok === true && command.data?.type === 'revenue', { status: command.response.status, data: command.data });

  const dashboard = await api('/dashboard', { auth: false });
  check('dashboard surface', dashboard.response.status === 200 && typeof dashboard.data === 'string' && dashboard.data.includes('MONETIZATION ENGINE v1.0'), { status: dashboard.response.status });
}

// Learning remains a separate gated acceptance after core transactional data is verified.
{
  const learning = await api('/api/monetization/learning/status');
  check('learning status endpoint', learning.response.status === 200 && learning.data?.configured === true, { status: learning.response.status, data: learning.data });
  report.learningStatus = learning.data;
}

report.finishedAt = new Date().toISOString();
report.summary = { passed: report.checks.length, failed: 0, affiliateRevenueEventId };
await writeFile('monetization-functional-acceptance-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
