import { readFile, readdir } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decoder = new TextDecoder();
const candidateBuild = await build({
  entryPoints: [join(root, 'src/monetization-worker-v15.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'silent'
});
const candidateScript = decoder.decode(candidateBuild.outputFiles[0].contents);

const routerScript = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__conflicted/')) {
      url.pathname = url.pathname.slice('/__conflicted'.length);
      return env.CONFLICTED.fetch(new Request(url.toString(), request));
    }
    if (url.pathname === '/__sql') {
      const input = await request.json();
      try {
        if (input.exec) return Response.json(await env.DB.exec(input.exec));
        const statement = env.DB.prepare(input.sql);
        return Response.json(await (input.params?.length ? statement.bind(...input.params) : statement).all());
      } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }
    return env.CANDIDATE.fetch(request);
  }
};`;

const contentOsStub = `export default { async fetch() { return new Response(null, { status: 204 }); } };`;
const options = convertV4MiniflareOptions({
  compatibilityDate: '2026-08-26',
  compatibilityFlags: ['nodejs_compat'],
  workers: [
    {
      name: 'router',
      script: routerScript,
      modules: true,
      d1Databases: { DB: 'test-db' },
      serviceBindings: { CANDIDATE: 'candidate', CONFLICTED: 'candidate-conflicted' }
    },
    {
      name: 'candidate',
      script: candidateScript,
      modules: true,
      d1Databases: { DB: 'test-db' },
      serviceBindings: { CONTENT_OS: 'content-os' },
      bindings: {
        MONETIZATION_INGEST_TOKEN: 'test-token',
        MONETIZATION_QUALITY_TOKEN: 'quality-test-token',
        LYNK_WEBHOOK_SECRET: 'lynk-test-secret',
        APP_RECEIPT_SECRET: 'regression-only-app-receipt-secret'
      }
    },
    {
      name: 'candidate-conflicted',
      script: candidateScript,
      modules: true,
      d1Databases: { DB: 'test-db' },
      serviceBindings: { CONTENT_OS: 'content-os' },
      bindings: {
        MONETIZATION_INGEST_TOKEN: 'collision-test-token',
        MONETIZATION_QUALITY_TOKEN: 'collision-test-token',
        LYNK_WEBHOOK_SECRET: 'lynk-test-secret',
        APP_RECEIPT_SECRET: 'collision-test-token'
      }
    },
    { name: 'content-os', script: contentOsStub, modules: true }
  ]
});

const mf = new Miniflare(options);
const checks = [];
const number = (value) => Number(value ?? 0);
const check = (name, ok, details = {}) => {
  checks.push({ name, ok, details });
  console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(details));
};
const lynkSignature = (payload, secret = 'lynk-test-secret') =>
  createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

async function rawSql(input) {
  const response = await mf.dispatchFetch('https://test/__sql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  return JSON.parse(text);
}

async function query(sql, params = []) {
  return (await rawSql({ sql, params })).results;
}

async function exec(sql) {
  const normalized = sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/^PRAGMA foreign_keys\s*=\s*ON;\s*/im, '')
    .replace(/\s+/g, ' ');
  return rawSql({ exec: normalized });
}

async function api(path, { method = 'GET', body, auth = true, authToken, headers: suppliedHeaders = {} } = {}) {
  const headers = { ...suppliedHeaders };
  if (auth) headers.authorization = `Bearer ${authToken ?? (path.startsWith('/api/monetization/quality/') ? 'quality-test-token' : 'test-token')}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await mf.dispatchFetch(`https://test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, location: response.headers.get('location') };
}

try {
  const migrations = (await readdir(join(root, 'database/migrations')))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const migration of migrations) {
    await exec(await readFile(join(root, 'database/migrations', migration), 'utf8'));
  }

  await rawSql({
    sql: `INSERT INTO topics(id,brand_id,title,source_type,status) VALUES (?1,?2,?3,'manual','approved')`,
    params: ['topic-test', 'brand-umkm-naik-kelas', 'Topic test']
  });
  await rawSql({
    sql: `INSERT INTO content_items(id,topic_id,brand_id,format,platform,title,body_json,status)
      VALUES (?1,?2,?3,'thread','instagram',?4,'{}','approved')`,
    params: ['content-test', 'topic-test', 'brand-umkm-naik-kelas', 'Content test']
  });

  let result = await api('/api/monetization/version', { auth: false });
  check(
    'candidate reports all runtime secret domains present and distinct',
    result.status === 200 && result.data?.securityConfiguration?.allSecretsPresentAndDistinct === true,
    result
  );
  result = await api('/__conflicted/api/monetization/version', { auth: false });
  check(
    'candidate reports collided runtime secret domains as unsafe',
    result.status === 200 && result.data?.securityConfiguration?.allSecretsPresentAndDistinct === false &&
      result.data?.securityConfiguration?.qualityTokenIsolated === false &&
      result.data?.securityConfiguration?.appReceiptSecretIsolated === false,
    result
  );

  result = await api('/api/monetization/offers', {
    method: 'POST',
    body: {
      id: 'off-aff', name: 'Affiliate', type: 'affiliate',
      destinationUrl: 'https://example.com/a', status: 'active'
    }
  });
  check('create offer', result.status === 201, result);

  result = await api('/api/monetization/campaigns', {
    method: 'POST',
    body: { id: 'cam-aff', name: 'Campaign', objective: 'sale', offerId: 'off-aff', status: 'active' }
  });
  check('create campaign', result.status === 201, result);

  result = await api('/api/monetization/content/content-test', {
    method: 'PUT',
    body: {
      monetizationGoal: 'affiliate', offerId: 'off-aff', campaignId: 'cam-aff',
      ctaText: 'Lihat penawaran', commercialScore: 90, destinationUrl: 'https://example.com/a'
    }
  });
  check(
    'content monetization graph is mapped before link activation',
    result.status === 200 && result.data?.monetization?.offer_id === 'off-aff' &&
      result.data?.monetization?.campaign_id === 'cam-aff',
    result
  );

  result = await api('/api/monetization/links', {
    method: 'POST',
    body: {
      slug: 'test-aff', contentItemId: 'content-test', campaignId: 'cam-aff', offerId: 'off-aff',
      destinationUrl: 'https://example.com/a', status: 'active', platform: 'instagram'
    }
  });
  const linkId = result.data?.link?.id;
  check('create tracked link', result.status === 201 && typeof linkId === 'string', result);

  result = await api('/go/test-aff', { auth: false });
  check('active link redirects', result.status === 302 && result.location === 'https://example.com/a', result);

  result = await api('/api/monetization/campaigns/cam-aff', { method: 'PATCH', body: { status: 'paused' } });
  check('pause campaign', result.status === 200 && result.data?.campaign?.status === 'paused', result);
  result = await api('/go/test-aff', { auth: false });
  check('paused campaign blocks redirect', result.status === 404, result);
  await api('/api/monetization/campaigns/cam-aff', { method: 'PATCH', body: { status: 'active' } });

  result = await api('/api/monetization/offers/off-aff', { method: 'PATCH', body: { status: 'paused' } });
  check('pause offer', result.status === 200 && result.data?.offer?.status === 'paused', result);
  result = await api('/go/test-aff', { auth: false });
  check('paused offer blocks redirect', result.status === 404, result);
  await api('/api/monetization/offers/off-aff', { method: 'PATCH', body: { status: 'active' } });

  result = await api(`/api/monetization/links/${linkId}`, { method: 'PATCH', body: { status: 'paused' } });
  check('pause tracked link', result.status === 200 && result.data?.link?.status === 'paused', result);
  result = await api('/go/test-aff', { auth: false });
  check('paused tracked link blocks redirect', result.status === 404, result);
  await api(`/api/monetization/links/${linkId}`, { method: 'PATCH', body: { status: 'active' } });
  result = await api(`/api/monetization/links/${linkId}`, {
    method: 'PATCH', body: { destinationUrl: 'https://example.com/b' }
  });
  check('active destination mutation is blocked', result.status === 409, result);

  result = await api('/api/monetization/events', {
    method: 'POST',
    body: {
      id: 'evt-auto-quality', eventType: 'click', source: 'regression-unverified',
      contentItemId: 'content-test', campaignId: 'cam-aff', offerId: 'off-aff',
      idempotencyKey: 'evt-auto-quality'
    }
  });
  check('event ingest succeeds', result.status === 201 && result.data?.eventId === 'evt-auto-quality', result);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      id: 'rev-valid', transactionId: 'trx-valid', eventType: 'sale', source: 'manual-test',
      contentItemId: 'content-test', campaignId: 'cam-aff', offerId: 'off-aff',
      grossAmount: 20000, feeAmount: 1000, costAmount: 5000,
      netAmount: 19000, marginAmount: 14000, status: 'confirmed', idempotencyKey: 'valid'
    }
  });
  check(
    'valid gross/net/margin is accepted',
    result.status === 201 && result.data?.netAmount === 19000 && result.data?.marginAmount === 14000,
    result
  );

  result = await api('/api/monetization/quality/revenue_event/rev-valid', {
    method: 'PUT',
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'manual',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'regression-suite'
    }
  });
  check(
    'verified quality requires reason',
    result.status === 400 && String(result.data?.error ?? '').includes('reason wajib'),
    result
  );
  let rows = await query(`SELECT data_class,verification_status FROM monetization_record_quality
    WHERE record_type='revenue_event' AND record_id='rev-valid'`);
  check(
    'failed quality promotion leaves unknown overlay intact',
    rows[0]?.data_class === 'unknown' && rows[0]?.verification_status === 'unverified',
    rows[0]
  );

  result = await api('/api/monetization/quality/revenue_event/rev-valid', {
    method: 'PUT',
    body: {
      dataClass: 'acceptance', verificationStatus: 'verified', amountBasis: 'manual',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'regression-suite',
      reason: 'Acceptance fixture is intentionally excluded from production metrics.'
    }
  });
  check(
    'quality promotion with evidence and reason succeeds',
    result.status === 200 && result.data?.quality?.data_class === 'acceptance' && result.data?.quality?.verification_status === 'verified',
    result
  );

  result = await api('/api/monetization/quality/revenue_event/rev-valid', {
    method: 'PUT', auth: false, body: { dataClass: 'production', verificationStatus: 'verified' }
  });
  check('quality write rejects unauthenticated request', result.status === 401, result);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      eventType: 'sale', source: 'manual-test', grossAmount: 20000, feeAmount: 1000,
      costAmount: 5000, netAmount: 19001, marginAmount: 14001,
      status: 'confirmed', idempotencyKey: 'bad-net'
    }
  });
  check('net invariant mismatch is rejected', result.status === 400, result);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      eventType: 'sale', source: 'manual-test', grossAmount: 20000, feeAmount: 1000,
      costAmount: 5000, netAmount: 19000, marginAmount: 14001,
      status: 'confirmed', idempotencyKey: 'bad-margin'
    }
  });
  check('margin invariant mismatch is rejected', result.status === 400, result);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      eventType: 'sale', source: 'manual-test', grossAmount: 'not-a-number',
      feeAmount: 0, costAmount: 0, status: 'confirmed', idempotencyKey: 'bad-number'
    }
  });
  check('invalid numeric amount is rejected', result.status === 400, result);
  rows = await query(`SELECT COUNT(*) total FROM monetization_revenue_events WHERE idempotency_key='bad-number'`);
  check('invalid numeric amount is not persisted', number(rows[0]?.total) === 0, rows[0]);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      eventType: 'sale', source: 'manual-test', grossAmount: 10000, feeAmount: 500,
      costAmount: 1000, netAmount: 9500, marginAmount: 8500,
      status: 'not-a-real-status', idempotencyKey: 'bad-status'
    }
  });
  check('invalid revenue status is rejected', result.status === 400, result);
  rows = await query(`SELECT COUNT(*) total FROM monetization_revenue_events WHERE idempotency_key='bad-status'`);
  check('invalid revenue status is not persisted', number(rows[0]?.total) === 0, rows[0]);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      id: 'rev-unverified', transactionId: 'trx-unverified', eventType: 'sale', source: 'unverified-test',
      contentItemId: 'content-test', campaignId: 'cam-aff', offerId: 'off-aff',
      grossAmount: 999999, feeAmount: 0, costAmount: 0,
      netAmount: 999999, marginAmount: 999999, status: 'confirmed', idempotencyKey: 'unverified-revenue'
    }
  });
  check('unverified isolation fixture is ingested', result.status === 201, result);

  const raceBase = {
    provider: 'network-race-test', transactionId: 'trx-life-race', commissionAmount: 18000,
    feeAmount: 1000, costAmount: 2000, currency: 'IDR', offerId: 'off-aff',
    contentItemId: 'content-test', visitorId: 'visitor-race-pending', externalReference: 'race-pending'
  };
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...raceBase, status: 'pending' }
  });
  const raceRevenueId = result.data?.revenueEventId;
  check(
    'concurrent lifecycle fixture starts pending',
    result.status === 201 && result.data?.duplicate === false && typeof raceRevenueId === 'string',
    result
  );
  result = await api(`/api/monetization/quality/revenue_event/${encodeURIComponent(raceRevenueId)}`, {
    method: 'PUT',
    headers: { 'X-Correlation-Id': 'race-pending-production-verify' },
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'provider_reported',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'race-pending-regression',
      reason: 'Pending callback provenance verified before concurrent terminal callbacks.'
    }
  });
  check(
    'pending race fixture is verified before mutation',
    result.status === 200 && result.data?.quality?.data_class === 'production' &&
      result.data?.quality?.verification_status === 'verified',
    result
  );
  const raceTerminals = [
    { ...raceBase, status: 'confirmed', commissionAmount: 21000, visitorId: 'visitor-race-a', externalReference: 'race-terminal-a' },
    { ...raceBase, status: 'confirmed', commissionAmount: 31000, visitorId: 'visitor-race-b', externalReference: 'race-terminal-b' }
  ];
  const raceResponses = await Promise.all(raceTerminals.map((body) =>
    api('/api/monetization/affiliate/conversions', { method: 'POST', body })));
  const classifiedRace = raceResponses.map((response, index) => ({ response, index }));
  const raceWinners = classifiedRace.filter(({ response }) =>
    response.status === 200 && response.data?.updated === true && response.data?.duplicate === false);
  const raceLosers = classifiedRace.filter(({ response }) =>
    response.status === 200 && response.data?.updated === false && response.data?.duplicate === true);
  const raceWinner = raceWinners[0];
  const expectedWinner = raceWinner ? raceTerminals[raceWinner.index] : null;
  check(
    'concurrent pending promotion has exactly one winner',
    raceWinners.length === 1 && raceLosers.length === 1 &&
      raceResponses.every((response) => response.data?.revenueEventId === raceRevenueId),
    raceResponses
  );
  rows = await query(`SELECT r.status,r.gross_amount,r.fee_amount,r.cost_amount,r.net_amount,r.margin_amount,
    r.external_reference,r.metadata_json revenue_metadata,a.visitor_id attribution_visitor,
    q.data_class,q.verification_status,q.metadata_json quality_metadata
    FROM monetization_revenue_events r
    LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    LEFT JOIN monetization_record_quality q ON q.record_type='revenue_event' AND q.record_id=r.id
    WHERE r.source='network-race-test' AND r.transaction_id='trx-life-race'`);
  const raceRow = rows[0];
  const raceRevenueMetadata = JSON.parse(raceRow?.revenue_metadata ?? '{}');
  const raceQualityMetadata = JSON.parse(raceRow?.quality_metadata ?? '{}');
  check(
    'losing terminal callback cannot overwrite winner economics or attribution',
    rows.length === 1 && expectedWinner !== null && raceRow?.status === 'confirmed' &&
      number(raceRow?.gross_amount) === expectedWinner.commissionAmount &&
      number(raceRow?.fee_amount) === expectedWinner.feeAmount && number(raceRow?.cost_amount) === expectedWinner.costAmount &&
      number(raceRow?.net_amount) === expectedWinner.commissionAmount - expectedWinner.feeAmount &&
      number(raceRow?.margin_amount) === expectedWinner.commissionAmount - expectedWinner.feeAmount - expectedWinner.costAmount &&
      raceRow?.external_reference === expectedWinner.externalReference && raceRow?.attribution_visitor === expectedWinner.visitorId &&
      typeof raceRevenueMetadata.lifecycleMutationId === 'string',
    raceRow
  );
  check(
    'winning lifecycle mutation invalidates quality exactly to unknown',
    raceRow?.data_class === 'unknown' && raceRow?.verification_status === 'unverified' &&
      raceQualityMetadata.invalidatedAutomatically === true,
    raceRow
  );
  rows = await query(`SELECT previous_data_class,previous_verification_status,new_data_class,
    new_verification_status,correlation_id FROM monetization_record_quality_history
    WHERE record_type='revenue_event' AND record_id=?1 AND actor_type='system_lifecycle'`, [raceRevenueId]);
  check(
    'losing callback creates no second lifecycle invalidation history',
    rows.length === 1 && rows[0]?.previous_data_class === 'production' &&
      rows[0]?.previous_verification_status === 'verified' && rows[0]?.new_data_class === 'unknown' &&
      rows[0]?.new_verification_status === 'unverified' &&
      rows[0]?.correlation_id === 'network-race-test:affiliate_commission:trx-life-race',
    rows
  );

  const attributionVisitor = 'visitor-attribution-quality';
  result = await api('/api/monetization/events', {
    method: 'POST',
    body: {
      id: 'evt-attribution-quality', eventType: 'click', source: 'attribution-quality-test',
      visitorId: attributionVisitor, contentItemId: 'content-test', campaignId: 'cam-aff',
      offerId: 'off-aff', idempotencyKey: 'evt-attribution-quality'
    }
  });
  check('attribution quality fixture event is ingested unknown', result.status === 201, result);
  const setAttributionEventQuality = (dataClass, verificationStatus, correlationId) =>
    api('/api/monetization/quality/event/evt-attribution-quality', {
      method: 'PUT', headers: { 'X-Correlation-Id': correlationId },
      body: dataClass === 'production' ? {
        dataClass, verificationStatus, evidenceRef: 'attribution-touchpoint-regression',
        reason: 'Touchpoint identity and provenance verified for attribution dependency regression.'
      } : {
        dataClass, verificationStatus,
        reason: 'Touchpoint deliberately downgraded to verify fail-closed revenue scope.'
      }
    });
  result = await setAttributionEventQuality('production', 'verified', 'attribution-event-initial-verify');
  check('attribution touchpoint can be explicitly verified', result.status === 200, result);
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST',
    body: {
      provider: 'network-attribution-quality', transactionId: 'trx-attribution-quality',
      commissionAmount: 9000, feeAmount: 1000, costAmount: 2000, currency: 'IDR', status: 'confirmed',
      offerId: 'off-aff', contentItemId: 'content-test', visitorId: attributionVisitor
    }
  });
  const attributionRevenueId = result.data?.revenueEventId;
  check(
    'verified touchpoint is bound into provider attribution',
    result.status === 201 && typeof attributionRevenueId === 'string' &&
      result.data?.attribution?.first_event_id === 'evt-attribution-quality' &&
      result.data?.attribution?.last_event_id === 'evt-attribution-quality',
    result
  );
  result = await setAttributionEventQuality('unknown', 'unverified', 'attribution-event-pre-promotion-downgrade');
  check('attribution touchpoint downgrade is recorded', result.status === 200, result);
  result = await api(`/api/monetization/quality/revenue_event/${encodeURIComponent(attributionRevenueId)}`, {
    method: 'PUT',
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'provider_reported',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'attribution-revenue-regression',
      reason: 'Revenue provenance is complete only while attributed touchpoints remain trusted.'
    }
  });
  check(
    'revenue promotion fails closed when attributed touchpoint is unverified',
    result.status === 400 && String(result.data?.error ?? '').includes('Attribution touchpoint wajib'),
    result
  );
  result = await setAttributionEventQuality('production', 'verified', 'attribution-event-reverify');
  check('attribution touchpoint can be reverified with evidence', result.status === 200, result);
  result = await api(`/api/monetization/quality/revenue_event/${encodeURIComponent(attributionRevenueId)}`, {
    method: 'PUT',
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'provider_reported',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'attribution-revenue-regression',
      reason: 'Revenue and bound attribution evidence are jointly verified.'
    }
  });
  check('revenue promotion succeeds with current attribution evidence', result.status === 200, result);
  result = await api('/api/monetization/attribution?days=30');
  check(
    'verified attributed revenue enters reporting scope',
    result.status === 200 && result.data?.byContent?.some((row) =>
      row.content_item_id === 'content-test' && number(row.net_revenue) === 8000),
    result.data
  );
  result = await setAttributionEventQuality('unknown', 'unverified', 'attribution-event-post-promotion-downgrade');
  check('post-promotion touchpoint downgrade is recorded', result.status === 200, result);
  result = await api('/api/monetization/attribution?days=30');
  check(
    'touchpoint downgrade removes dependent revenue from verified reporting scope',
    result.status === 200 && !result.data?.byContent?.some((row) => number(row.net_revenue) === 8000),
    result.data
  );

  const affiliateBase = {
    provider: 'network-test', transactionId: 'trx-life', commissionAmount: 12000,
    feeAmount: 1000, costAmount: 2000, currency: 'IDR',
    offerId: 'off-aff', contentItemId: 'content-test'
  };
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...affiliateBase, status: 'pending' }
  });
  const lifecycleOriginalId = result.data?.revenueEventId;
  check('affiliate pending is inserted', result.status === 201 && result.data?.duplicate === false, result);

  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...affiliateBase, status: 'confirmed', commissionAmount: 15000 }
  });
  check(
    'pending is promoted to confirmed idempotently',
    result.status === 200 && result.data?.updated === true && result.data?.duplicate === false && result.data?.revenueEventId === lifecycleOriginalId,
    result
  );
  rows = await query(`SELECT COUNT(*) total,MAX(status) status,MAX(gross_amount) gross,
    MAX(net_amount) net,MAX(margin_amount) margin FROM monetization_revenue_events
    WHERE source='network-test' AND transaction_id='trx-life'`);
  check(
    'pending to confirmed keeps one ledger row',
    number(rows[0]?.total) === 1 && rows[0]?.status === 'confirmed' &&
      number(rows[0]?.gross) === 15000 && number(rows[0]?.net) === 14000 && number(rows[0]?.margin) === 12000,
    rows[0]
  );

  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...affiliateBase, status: 'rejected', commissionAmount: 15000 }
  });
  const reversalId = result.data?.revenueEventId;
  check(
    'confirmed to rejected creates reversal',
    result.status === 200 && result.data?.updated === true && result.data?.duplicate === false && reversalId !== lifecycleOriginalId,
    result
  );
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...affiliateBase, status: 'rejected', commissionAmount: 15000 }
  });
  check(
    'repeated rejected callback reuses reversal',
    result.status === 200 && result.data?.updated === false && result.data?.duplicate === true && result.data?.revenueEventId === reversalId,
    result
  );
  rows = await query(`SELECT COUNT(*) total,
    SUM(CASE WHEN event_type='chargeback' AND status='refunded' THEN 1 ELSE 0 END) reversals,
    COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) margin
    FROM monetization_revenue_events WHERE source='network-test' AND transaction_id='trx-life'`);
  check(
    'transaction lifecycle has one reversal and zero net total',
    number(rows[0]?.total) === 2 && number(rows[0]?.reversals) === 1 &&
      number(rows[0]?.gross) === 0 && number(rows[0]?.net) === 0 && number(rows[0]?.margin) === 0,
    rows[0]
  );

  rows = await query(`SELECT record_type,record_id,data_class,verification_status,reason,metadata_json
    FROM monetization_record_quality WHERE record_id IN (?1,?2,?3,?4) ORDER BY record_id`, [
    'evt-auto-quality', 'rev-unverified', lifecycleOriginalId, reversalId
  ]);
  const automaticQuality = new Map(rows.map((row) => [row.record_id, {
    ...row,
    metadata: JSON.parse(row.metadata_json)
  }]));
  const createdAutomatically = ['evt-auto-quality', 'rev-unverified', reversalId]
    .every((id) => automaticQuality.get(id)?.data_class === 'unknown' &&
      automaticQuality.get(id)?.verification_status === 'unverified' &&
      automaticQuality.get(id)?.metadata?.createdAutomatically === true &&
      typeof automaticQuality.get(id)?.reason === 'string');
  const invalidatedOriginal = automaticQuality.get(lifecycleOriginalId);
  check(
    'new rows are created unknown while mutated provider original is invalidated unknown',
    createdAutomatically && invalidatedOriginal?.data_class === 'unknown' &&
      invalidatedOriginal?.verification_status === 'unverified' &&
      invalidatedOriginal?.metadata?.invalidatedAutomatically === true &&
      typeof invalidatedOriginal?.reason === 'string',
    rows
  );

  const lossAffiliate = {
    provider: 'network-loss-test', transactionId: 'trx-loss', commissionAmount: 10000,
    feeAmount: 1000, costAmount: 12000, currency: 'IDR',
    offerId: 'off-aff', contentItemId: 'content-test'
  };
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...lossAffiliate, status: 'confirmed' }
  });
  check('loss-making affiliate commission is accepted', result.status === 201, result);
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST', body: { ...lossAffiliate, status: 'rejected' }
  });
  check('loss-making affiliate rejection creates reversal', result.status === 200 && result.data?.updated === true, result);
  rows = await query(`SELECT event_type,status,gross_amount,fee_amount,cost_amount,net_amount,margin_amount
    FROM monetization_revenue_events WHERE source='network-loss-test' AND transaction_id='trx-loss'
    ORDER BY CASE WHEN event_type='chargeback' THEN 1 ELSE 0 END`);
  check(
    'loss-making reversal preserves gross/net/margin algebra',
    rows.length === 2 && number(rows[0]?.gross_amount) === 10000 && number(rows[0]?.fee_amount) === 1000 &&
      number(rows[0]?.cost_amount) === 12000 && number(rows[0]?.net_amount) === 9000 &&
      number(rows[0]?.margin_amount) === -3000 && rows[1]?.event_type === 'chargeback' &&
      rows[1]?.status === 'refunded' && number(rows[1]?.gross_amount) === -10000 &&
      number(rows[1]?.fee_amount) === -1000 && number(rows[1]?.cost_amount) === -12000 &&
      number(rows[1]?.net_amount) === -9000 && number(rows[1]?.margin_amount) === 3000 &&
      rows.reduce((sum, row) => sum + number(row.margin_amount), 0) === 0,
    rows
  );

  await rawSql({
    sql: `INSERT INTO monetization_events
      (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,idempotency_key,metadata_json)
      VALUES ('evt-legacy-no-quality','click',?1,?2,?3,?4,'legacy-import','instagram','legacy-event','{}')`,
    params: ['brand-umkm-naik-kelas', 'content-test', 'cam-aff', 'off-aff']
  });
  await rawSql({
    sql: `INSERT INTO monetization_revenue_events
      (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,
       gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,idempotency_key,metadata_json)
      VALUES ('rev-legacy-no-quality','trx-legacy','sale','legacy-import',?1,?2,?3,?4,
       777777,0,0,777777,777777,'IDR','confirmed','legacy-revenue','{}')`,
    params: ['brand-umkm-naik-kelas', 'content-test', 'cam-aff', 'off-aff']
  });
  await rawSql({
    sql: `INSERT INTO monetization_learning_insights
      (id,brand_id,scope,statement,evidence_json,confidence,status)
      VALUES ('ins-legacy-no-quality',?1,'content','Legacy insight fixture.','{}',0.5,'active')`,
    params: ['brand-umkm-naik-kelas']
  });
  result = await api('/api/monetization/quality/review?limit=100');
  check(
    'legacy rows without overlays are visible in quality review queue',
    result.status === 200 && result.data?.dataScope === 'unclassified-review-queue' &&
      result.data?.rawMetadataIncluded === false &&
      result.data?.events?.some((row) => row.id === 'evt-legacy-no-quality' && row.data_class === 'unknown' && row.verification_status === 'unverified') &&
      result.data?.revenueEvents?.some((row) => row.id === 'rev-legacy-no-quality' && row.data_class === 'unknown' && row.verification_status === 'unverified') &&
      result.data?.learningInsights?.some((row) => row.id === 'ins-legacy-no-quality' && row.data_class === 'unknown' && row.verification_status === 'unverified'),
    result.data
  );

  for (let index = 1; index <= 4; index += 1) {
    await rawSql({
      sql: `INSERT INTO monetization_events
        (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,idempotency_key,metadata_json)
        VALUES (?1,'click',?2,?3,?4,?5,'fanout-test','instagram',?6,'{}')`,
      params: [
        `evt-fan-${index}`, 'brand-umkm-naik-kelas', 'content-test', 'cam-aff', 'off-aff', `fan:${index}`
      ]
    });
    await rawSql({
      sql: `INSERT INTO monetization_record_quality
        (record_type,record_id,data_class,verification_status,evidence_ref,reason)
        VALUES ('event',?1,'production','verified','regression-suite','Verified production fan-out fixture.')`,
      params: [`evt-fan-${index}`]
    });
  }

  const amounts = [75000, 125000, 200000];
  for (let index = 0; index < amounts.length; index += 1) {
    const gross = amounts[index];
    const fee = Math.round(gross * 0.05);
    const cost = Math.round(gross * 0.2);
    const net = gross - fee;
    const margin = net - cost;
    const id = `rev-fan-${index + 1}`;
    await rawSql({
      sql: `INSERT INTO monetization_revenue_events
        (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,
         gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,idempotency_key,metadata_json)
        VALUES (?1,?2,'sale','fanout-test',?3,?4,?5,?6,?7,?8,?9,?10,?11,'IDR','confirmed',?12,?13)`,
      params: [
        id, `trx-fan-${index + 1}`, 'brand-umkm-naik-kelas', 'content-test', 'cam-aff', 'off-aff',
        gross, fee, cost, net, margin, `fan-rev:${index + 1}`,
        JSON.stringify({ financialCompleteness: { fee: 'reported', cost: 'reported' } })
      ]
    });
    await rawSql({
      sql: `INSERT INTO monetization_record_quality
        (record_type,record_id,data_class,verification_status,fee_status,cost_status,evidence_ref,reason)
        VALUES ('revenue_event',?1,'production','verified','actual','actual','regression-suite',
          'Verified production fan-out fixture.')`,
      params: [id]
    });
  }

  result = await api('/api/monetization/learning/dataset?days=30');
  const dataset = result.data?.dataset;
  const contentRow = dataset?.contents?.find((row) => row.content_id === 'content-test');
  check(
    'learning content aggregate has no SQL fan-out',
    result.status === 200 && number(contentRow?.clicks) === 4 && number(contentRow?.revenue_events) === 3 &&
      number(contentRow?.net_revenue) === 380000 && number(contentRow?.contribution_margin) === 300000,
    contentRow
  );
  check(
    'learning overview uses verified production only',
    dataset?.dataScope === 'verified-production' && number(dataset?.overview?.revenue_events) === 3 &&
      number(dataset?.overview?.gross) === 400000 && number(dataset?.overview?.net) === 380000 &&
      number(dataset?.overview?.contribution_margin) === 300000,
    { dataScope: dataset?.dataScope, overview: dataset?.overview }
  );
  check(
    'learning remains advisory below evidence threshold',
    dataset?.dataQuality?.decisionMode === 'advisory' && dataset?.dataQuality?.actionable === false &&
      number(dataset?.dataQuality?.confidenceCap) === 0.25,
    dataset?.dataQuality
  );

  result = await api('/api/monetization/summary?days=30');
  check(
    'summary returns exact verified production totals',
    result.status === 200 && result.data?.dataScope === 'verified-production' &&
      number(result.data?.funnel?.clicks) === 4 && number(result.data?.revenue?.events) === 3 &&
      number(result.data?.revenue?.gross) === 400000 && number(result.data?.revenue?.net) === 380000 &&
      number(result.data?.revenue?.contributionMarginRecorded) === 300000,
    result.data
  );

  result = await api('/api/monetization/operations?days=30');
  check(
    'operations returns exact verified production totals',
    result.status === 200 && result.data?.dataScope === 'verified-production' &&
      number(result.data?.traffic?.clicks) === 4 && number(result.data?.revenue?.transactions) === 3 &&
      number(result.data?.revenue?.gross) === 400000 && number(result.data?.revenue?.net) === 380000 &&
      number(result.data?.revenue?.contributionMarginRecorded) === 300000,
    result.data
  );

  result = await api('/api/monetization/maintenance/aggregate', {
    method: 'POST', body: { days: 30, correlationId: 'regression-production-snapshot' }
  });
  check(
    'materialized snapshot isolates verified production',
    result.status === 200 && result.data?.dataScope === 'verified-production' &&
      number(result.data?.totals?.clicks) === 4 && number(result.data?.totals?.confirmed_transactions) === 3 &&
      number(result.data?.totals?.reversals) === 0 && number(result.data?.totals?.net_revenue) === 380000 &&
      number(result.data?.totals?.contribution_margin) === 300000,
    result.data
  );

  result = await api('/api/monetization/daily-analytics?days=30');
  check(
    'daily snapshot reads exact verified totals',
    result.status === 200 && result.data?.materializationRequired === false &&
      result.data?.freshness?.stale === false && result.data?.freshness?.maxAgeSeconds === 900 &&
      result.data?.dataScope === 'verified-production' && number(result.data?.totals?.clicks) === 4 &&
      number(result.data?.totals?.confirmed_transactions) === 3 && number(result.data?.totals?.reversals) === 0 &&
      number(result.data?.totals?.gross_revenue) === 400000 && number(result.data?.totals?.net_revenue) === 380000 &&
      number(result.data?.totals?.contribution_margin) === 300000,
    result.data
  );

  await rawSql({
    sql: `UPDATE monetization_record_quality SET
      data_class='production',verification_status='verified',evidence_ref='partial-lifecycle-fixture',
      reason='Intentional partial lifecycle state for regression coverage.'
      WHERE record_type='revenue_event' AND record_id=?1`,
    params: [lifecycleOriginalId]
  });
  result = await api('/api/monetization/summary?days=30');
  check(
    'partially verified lifecycle remains outside verified scope',
    result.status === 200 && number(result.data?.revenue?.events) === 3 &&
      number(result.data?.revenue?.gross) === 400000 && number(result.data?.revenue?.net) === 380000,
    result.data?.revenue
  );

  result = await api(`/api/monetization/quality/revenue_event/${lifecycleOriginalId}`, {
    method: 'PUT',
    headers: { 'X-Correlation-Id': 'lifecycle-production-verify' },
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'provider_reported',
      feeStatus: 'actual', costStatus: 'actual', evidenceRef: 'provider-lifecycle-regression',
      reason: 'Original and reversal were jointly reconciled as one production lifecycle.'
    }
  });
  check('quality promotion validates and projects the complete lifecycle', result.status === 200, result);
  rows = await query(`SELECT record_id,data_class,verification_status,fee_status,cost_status
    FROM monetization_record_quality WHERE record_type='revenue_event' AND record_id IN (?1,?2)
    ORDER BY record_id`, [lifecycleOriginalId, reversalId]);
  check(
    'both lifecycle members become verified production together',
    rows.length === 2 && rows.every((row) => row.data_class === 'production' &&
      row.verification_status === 'verified' && row.fee_status === 'actual' && row.cost_status === 'actual'),
    rows
  );

  result = await api('/api/monetization/summary?days=30');
  check(
    'complete verified lifecycle enters scope without changing net economics',
    result.status === 200 && number(result.data?.revenue?.events) === 5 &&
      number(result.data?.revenue?.gross) === 400000 && number(result.data?.revenue?.net) === 380000 &&
      number(result.data?.revenue?.contributionMarginRecorded) === 300000,
    result.data?.revenue
  );
  result = await api('/api/monetization/operations?days=30');
  check(
    'operations uses the same lifecycle-complete verified scope',
    result.status === 200 && number(result.data?.revenue?.transactions) === 5 &&
      number(result.data?.revenue?.gross) === 400000 && number(result.data?.revenue?.net) === 380000 &&
      number(result.data?.revenue?.contributionMarginRecorded) === 300000,
    result.data?.revenue
  );

  rows = await query(`SELECT record_id,previous_data_class,previous_verification_status,previous_metadata_json,
    new_data_class,new_verification_status,new_metadata_json,actor_type,correlation_id,metadata_json
    FROM monetization_record_quality_history WHERE record_type='revenue_event'
      AND record_id IN (?1,?2) ORDER BY created_at,id`, [lifecycleOriginalId, reversalId]);
  const systemHistory = rows.filter((row) => row.record_id === lifecycleOriginalId && row.actor_type === 'system_lifecycle');
  const operatorHistory = rows.filter((row) => row.actor_type === 'quality_token_operator' &&
    row.correlation_id === 'lifecycle-production-verify');
  check(
    'quality history preserves automatic invalidation snapshots',
    systemHistory.length === 2 && systemHistory.every((row) =>
      row.previous_data_class !== null && row.previous_verification_status !== null &&
      typeof row.previous_metadata_json === 'string' && row.new_data_class === 'unknown' &&
      row.new_verification_status === 'unverified' && typeof row.new_metadata_json === 'string'),
    systemHistory
  );
  check(
    'quality history records both lifecycle projection updates with one correlation id',
    operatorHistory.length === 2 && new Set(operatorHistory.map((row) => row.record_id)).size === 2 &&
      operatorHistory.every((row) => row.new_data_class === 'production' && row.new_verification_status === 'verified' &&
        JSON.parse(row.metadata_json).lifecycleProjectionSize === 2),
    operatorHistory
  );
  rows = await query(`SELECT COUNT(*) total,MAX(actor_type) actor,MAX(new_data_class) data_class,
    MAX(new_verification_status) verification_status FROM monetization_record_quality_history
    WHERE record_type='revenue_event' AND record_id='rev-valid'`);
  check(
    'ordinary quality promotion also has append-only history',
    number(rows[0]?.total) === 1 && rows[0]?.actor === 'quality_token_operator' &&
      rows[0]?.data_class === 'acceptance' && rows[0]?.verification_status === 'verified',
    rows[0]
  );
  let historyUpdateBlocked = false;
  let historyDeleteBlocked = false;
  try {
    await rawSql({
      sql: `UPDATE monetization_record_quality_history SET reason='tampered'
        WHERE record_type='revenue_event' AND record_id='rev-valid'`
    });
  } catch { historyUpdateBlocked = true; }
  try {
    await rawSql({
      sql: `DELETE FROM monetization_record_quality_history
        WHERE record_type='revenue_event' AND record_id='rev-valid'`
    });
  } catch { historyDeleteBlocked = true; }
  rows = await query(`SELECT COUNT(*) total,MAX(reason) reason FROM monetization_record_quality_history
    WHERE record_type='revenue_event' AND record_id='rev-valid'`);
  check(
    'database triggers enforce append-only quality history',
    historyUpdateBlocked && historyDeleteBlocked && number(rows[0]?.total) === 1 &&
      rows[0]?.reason === 'Acceptance fixture is intentionally excluded from production metrics.',
    { historyUpdateBlocked, historyDeleteBlocked, row: rows[0] }
  );

  result = await api('/api/monetization/daily-analytics?days=30');
  check(
    'daily analytics exposes stale snapshot after verified source changes',
    result.status === 200 && result.data?.materializationRequired === true &&
      result.data?.freshness?.stale === true && result.data?.freshness?.reasons?.includes('source_changed') &&
      result.data?.freshness?.sourceFingerprintMatches === false &&
      result.data?.freshness?.automaticMaterializationEnabled === false,
    result.data
  );

  result = await api('/api/monetization/quality/review?limit=5', { authToken: 'test-token' });
  check('ordinary ingest token cannot access quality review', result.status === 401, result);

  result = await api('/api/monetization/revenue', {
    method: 'POST',
    body: {
      eventType: 'sale', source: 'currency-test', transactionId: 'trx-usd',
      grossAmount: 100, feeAmount: 0, costAmount: 0, currency: 'USD',
      status: 'confirmed', idempotencyKey: 'currency-usd'
    }
  });
  check('generic non-IDR revenue is rejected', result.status === 400, result);
  result = await api('/api/monetization/affiliate/conversions', {
    method: 'POST',
    body: { provider: 'currency-test', transactionId: 'trx-aff-usd', commissionAmount: 100, currency: 'USD', status: 'confirmed' }
  });
  check('provider non-IDR revenue is rejected', result.status === 400, result);
  rows = await query(`SELECT COUNT(*) total FROM monetization_revenue_events WHERE source='currency-test'`);
  check('rejected non-IDR revenue is not persisted', number(rows[0]?.total) === 0, rows[0]);

  result = await api('/api/monetization/provider-mappings', {
    method: 'POST',
    body: { provider: 'lynk', externalType: 'product', externalId: 'lynk-product-test',
      offerId: 'off-aff', campaignId: 'cam-aff', contentItemId: 'content-test' }
  });
  check('create Lynk product mapping', result.status === 200, result);
  const realLynkPayload = (event, refId, grandTotal, includeItems = true) => ({
    event,
    data: {
      message_action: 'SUCCESS',
      message_data: {
        refId,
        totals: { grandTotal, fee: 100 },
        ...(includeItems ? { items: [{ uuid: 'lynk-product-test', qty: 1, price: grandTotal }] } : {}),
        createdAt: new Date().toISOString()
      }
    }
  });
  const hmacLynkSale = realLynkPayload('payment.received', 'trx-lynk-hmac', 1400);
  result = await api('/api/monetization/webhooks/lynk', {
    method: 'POST', auth: false,
    headers: { 'X-Monetization-Signature': `sha256=${lynkSignature(hmacLynkSale)}` },
    body: hmacLynkSale
  });
  check(
    'HMAC-authenticated nested Lynk sale is normalized',
    result.status === 200 && result.data?.ok === true && result.data?.duplicate === false &&
      typeof result.data?.revenueEventId === 'string' && result.data?.ignored !== true,
    result
  );
  rows = await query(`SELECT status,gross_amount,net_amount FROM monetization_revenue_events
    WHERE source='lynk' AND transaction_id='trx-lynk-hmac'`);
  check(
    'HMAC nested Lynk sale writes canonical revenue once',
    rows.length === 1 && rows[0]?.status === 'confirmed' && number(rows[0]?.gross_amount) === 1400 &&
      number(rows[0]?.net_amount) === 1300,
    rows
  );
  const malformedHmacLynk = realLynkPayload('payment.refunded', 'trx-lynk-hmac-malformed', 'bad', false);
  result = await api('/api/monetization/webhooks/lynk', {
    method: 'POST', auth: false,
    headers: { 'X-Monetization-Signature': `sha256=${lynkSignature(malformedHmacLynk)}` },
    body: malformedHmacLynk
  });
  check(
    'HMAC-authenticated malformed known Lynk callback fails closed',
    result.status === 400 && result.data?.ok === false,
    result
  );
  rows = await query(`SELECT COUNT(*) total FROM monetization_revenue_events
    WHERE source='lynk' AND transaction_id='trx-lynk-hmac-malformed'`);
  check('malformed HMAC Lynk callback writes no revenue', number(rows[0]?.total) === 0, rows[0]);

  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: realLynkPayload('payment.received', 'trx-lynk-full', 1000)
  });
  check('real nested Lynk sale is normalized', result.status === 200 && result.data?.ok === true, result);
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: realLynkPayload('payment.refunded', 'trx-lynk-full', 1000, false)
  });
  check('full nested Lynk refund inherits original dimensions', result.status === 200 && result.data?.ok === true, result);
  rows = await query(`SELECT COUNT(*) total,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,
    COUNT(DISTINCT COALESCE(content_item_id,'')) contents,COUNT(DISTINCT COALESCE(campaign_id,'')) campaigns,
    COUNT(DISTINCT COALESCE(offer_id,'')) offers FROM monetization_revenue_events
    WHERE source='lynk' AND transaction_id='trx-lynk-full'`);
  check(
    'full Lynk lifecycle nets to zero with one direct dimension graph',
    number(rows[0]?.total) === 2 && number(rows[0]?.gross) === 0 && number(rows[0]?.net) === 0 &&
      number(rows[0]?.contents) === 1 && number(rows[0]?.campaigns) === 1 && number(rows[0]?.offers) === 1,
    rows[0]
  );
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: realLynkPayload('payment.received', 'trx-lynk-partial', 1000)
  });
  check('second real nested Lynk sale is normalized', result.status === 200 && result.data?.ok === true, result);
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: realLynkPayload('payment.refunded', 'trx-lynk-partial', 600, false)
  });
  check('ambiguous partial Lynk refund is quarantined', result.status === 400, result);
  rows = await query(`SELECT COUNT(*) total,COALESCE(SUM(gross_amount),0) gross FROM monetization_revenue_events
    WHERE source='lynk' AND transaction_id='trx-lynk-partial'`);
  check('partial Lynk refund is not silently persisted', number(rows[0]?.total) === 1 && number(rows[0]?.gross) === 1000, rows[0]);

  const malformedLynkPayload = realLynkPayload('payment.refunded', 'trx-lynk-malformed', 'bad', false);
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: malformedLynkPayload
  });
  check('known Lynk lifecycle with malformed money fails closed', result.status === 400 && result.data?.ok === false, result);
  rows = await query(`SELECT COUNT(*) total FROM monetization_revenue_events WHERE source='lynk' AND transaction_id='trx-lynk-malformed'`);
  check('malformed known Lynk callback writes no revenue', number(rows[0]?.total) === 0, rows[0]);
  rows = await query(`SELECT status,error_message,metadata_json FROM monetization_integration_logs
    WHERE provider='lynk' AND operation='webhook_normalization' ORDER BY created_at DESC,id DESC LIMIT 1`);
  check(
    'malformed known Lynk callback leaves sanitized error evidence',
    rows[0]?.status === 'error' && typeof rows[0]?.error_message === 'string' &&
      JSON.parse(rows[0]?.metadata_json ?? '{}').rawPayloadStored === false,
    rows[0]
  );

  const noFeeLynkPayload = (event, refId, grandTotal, includeItems = true) => ({
    event,
    data: {
      message_action: 'SUCCESS',
      message_data: {
        refId,
        totals: { grandTotal },
        ...(includeItems ? { items: [{ uuid: 'lynk-product-test', qty: 1, price: grandTotal - 100 }] } : {}),
        createdAt: new Date().toISOString()
      }
    }
  });
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: noFeeLynkPayload('payment.received', 'trx-lynk-no-fee', 900)
  });
  check('real Lynk sale accepts absent provisional fee and authoritative grand total', result.status === 200 && result.data?.ok === true, result);
  const noFeeLynkSaleId = result.data?.revenueEventId;
  result = await api(`/api/monetization/quality/revenue_event/${encodeURIComponent(noFeeLynkSaleId)}`, {
    method: 'PUT',
    headers: { 'X-Correlation-Id': 'lynk-no-fee-production-verify' },
    body: {
      dataClass: 'production', verificationStatus: 'verified', amountBasis: 'provider_reported',
      feeStatus: 'unknown', costStatus: 'unknown', evidenceRef: 'lynk-no-fee-regression',
      reason: 'Regression fixture verifies the sale identity while retaining provisional fee and cost semantics.'
    }
  });
  check('provisional Lynk sale can be explicitly verified without claiming fee completeness', result.status === 200, result);
  result = await api('/api/monetization/maintenance/aggregate', {
    method: 'POST', body: { days: 30, correlationId: 'regression-before-direct-refund' }
  });
  check('fresh snapshot is materialized before direct refund', result.status === 200, result);
  result = await api('/api/monetization/daily-analytics?days=30');
  check(
    'snapshot fingerprint is current immediately before direct refund',
    result.status === 200 && result.data?.materializationRequired === false &&
      result.data?.freshness?.sourceFingerprintMatches === true,
    result.data
  );
  result = await api('/api/monetization/webhooks/lynk?token=lynk-test-secret', {
    method: 'POST', auth: false, body: noFeeLynkPayload('payment.refunded', 'trx-lynk-no-fee', 900, false)
  });
  check('real Lynk full refund without fee or items inherits original economics', result.status === 200 && result.data?.ok === true, result);
  result = await api('/api/monetization/daily-analytics?days=30');
  check(
    'direct refund invalidates snapshot freshness immediately',
    result.status === 200 && result.data?.materializationRequired === true &&
      result.data?.freshness?.stale === true && result.data?.freshness?.reasons?.includes('source_changed') &&
      result.data?.freshness?.sourceFingerprintMatches === false,
    result.data
  );
  rows = await query(`SELECT COUNT(*) total,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(fee_amount),0) fee,
    COALESCE(SUM(net_amount),0) net,MAX(json_extract(metadata_json,'$.financialCompleteness.fee')) fee_status,
    MAX(CASE WHEN event_type='sale' THEN json_extract(metadata_json,'$.providerItemTotalDelta') END) item_delta
    FROM monetization_revenue_events WHERE source='lynk' AND transaction_id='trx-lynk-no-fee'`);
  check(
    'no-fee Lynk lifecycle nets to zero and records provisional evidence',
    number(rows[0]?.total) === 2 && number(rows[0]?.gross) === 0 && number(rows[0]?.fee) === 0 &&
      number(rows[0]?.net) === 0 && rows[0]?.fee_status === 'unknown' && number(rows[0]?.item_delta) === 100,
    rows[0]
  );

  const appHeaders = { 'X-Panglima-Client': 'panglima-umkm-android' };
  result = await api('/__conflicted/api/monetization/quality/review', {
    auth: false, headers: { Authorization: 'Bearer collision-test-token' }
  });
  check('quality token collision with ingest token fails closed', result.status === 401, result);
  result = await api('/__conflicted/api/monetization/app/install', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { appInstanceId: 'cd'.repeat(32), appVersion: 'secret-collision-test' }
  });
  check(
    'receipt secret collision disables receipt issuance',
    result.status === 201 && result.data?.handoffAvailable === false && result.data?.installReceipt === null &&
      number(result.data?.installReceiptTtlSeconds) === 0,
    result
  );
  const rawAppInstanceId = `  ${'AB'.repeat(32)}  `;
  const normalizedAppInstanceId = 'ab'.repeat(32);
  const rawAppVersion = ' 2.0.0+42 ';
  result = await api('/api/monetization/app/install', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { appInstanceId: rawAppInstanceId, appVersion: rawAppVersion }
  });
  const installEventId = result.data?.eventId;
  const installReceipt = result.data?.installReceipt;
  check(
    'app install normalizes identity and issues signed receipt',
    result.status === 201 && result.data?.duplicate === false && typeof installEventId === 'string' &&
      result.data?.handoffAvailable === true && typeof installReceipt === 'string' &&
      installReceipt.startsWith('v1.') && result.data?.installReceiptTtlSeconds === 86400,
    result
  );
  const receiptParts = typeof installReceipt === 'string' ? installReceipt.split('.') : [];
  let receiptProof = {};
  try {
    receiptProof = JSON.parse(Buffer.from(receiptParts[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    receiptProof = {};
  }
  check(
    'receipt payload binds normalized identity, version, install event, and expiry',
    receiptParts.length === 3 && receiptProof.v === 1 && receiptProof.brandId === 'brand-umkm-naik-kelas' &&
      receiptProof.appInstanceId === normalizedAppInstanceId && receiptProof.appVersion === '2.0.0+42' &&
      receiptProof.eventId === installEventId && number(receiptProof.exp) > Math.floor(Date.now() / 1000),
    receiptProof
  );
  rows = await query(`SELECT e.event_type,e.source,e.platform,e.visitor_id,e.idempotency_key,e.metadata_json,
    q.data_class,q.verification_status,q.reason,q.metadata_json quality_metadata
    FROM monetization_events e LEFT JOIN monetization_record_quality q
      ON q.record_type='event' AND q.record_id=e.id WHERE e.id=?1`, [installEventId]);
  const installRow = rows[0] ?? {};
  check(
    'normalized install evidence and unknown quality overlay are persisted',
    installRow.event_type === 'app_install' && installRow.source === 'apk' && installRow.platform === 'app' &&
      installRow.visitor_id === normalizedAppInstanceId &&
      installRow.idempotency_key === `panglima-install:${normalizedAppInstanceId}:2.0.0+42` &&
      JSON.parse(installRow.metadata_json).appVersion === '2.0.0+42' &&
      installRow.data_class === 'unknown' && installRow.verification_status === 'unverified' &&
      JSON.parse(installRow.quality_metadata).createdAutomatically === true,
    installRow
  );

  const handoffBody = {
    appInstanceId: rawAppInstanceId,
    appVersion: rawAppVersion,
    offerId: 'off-aff',
    installReceipt
  };
  const tamperedReceipt = typeof installReceipt === 'string'
    ? `${installReceipt.slice(0, -1)}${installReceipt.endsWith('a') ? 'b' : 'a'}`
    : 'v1.invalid.invalid';
  result = await api('/api/monetization/app/handoff', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { ...handoffBody, installReceipt: tamperedReceipt }
  });
  check('tampered install receipt is rejected', result.status === 401, result);
  rows = await query(`SELECT COUNT(*) total FROM monetization_events
    WHERE idempotency_key=?1`, [`apk-handoff:${installEventId}:off-aff`]);
  check('tampered receipt creates no handoff event', number(rows[0]?.total) === 0, rows[0]);

  const concurrentHandoffs = await Promise.all([
    api('/api/monetization/app/handoff', {
      method: 'POST', auth: false, headers: appHeaders, body: handoffBody
    }),
    api('/api/monetization/app/handoff', {
      method: 'POST', auth: false, headers: appHeaders, body: handoffBody
    })
  ]);
  const handoffStatuses = concurrentHandoffs.map((item) => item.status).sort((left, right) => left - right);
  const handoffIds = new Set(concurrentHandoffs.map((item) => item.data?.eventId));
  const handoffEventId = concurrentHandoffs[0]?.data?.eventId;
  check(
    'concurrent handoff is idempotent',
    handoffStatuses[0] === 200 && handoffStatuses[1] === 201 && handoffIds.size === 1 &&
      concurrentHandoffs.filter((item) => item.data?.duplicate === false).length === 1 &&
      concurrentHandoffs.filter((item) => item.data?.duplicate === true).length === 1,
    concurrentHandoffs
  );
  rows = await query(`SELECT e.id,e.event_type,e.source,e.platform,e.visitor_id,e.offer_id,e.idempotency_key,e.metadata_json,
    q.data_class,q.verification_status,q.reason,q.metadata_json quality_metadata
    FROM monetization_events e LEFT JOIN monetization_record_quality q
      ON q.record_type='event' AND q.record_id=e.id WHERE e.idempotency_key=?1`,
  [`apk-handoff:${installEventId}:off-aff`]);
  const handoffRow = rows[0] ?? {};
  check(
    'concurrent handoff persists one normalized event and one unknown overlay',
    rows.length === 1 && handoffRow.id === handoffEventId && handoffRow.event_type === 'affiliate_click' &&
      handoffRow.source === 'apk' && handoffRow.platform === 'app' && handoffRow.visitor_id === normalizedAppInstanceId &&
      handoffRow.offer_id === 'off-aff' && JSON.parse(handoffRow.metadata_json).destinationHost === 'example.com' &&
      JSON.parse(handoffRow.metadata_json).appVersion === '2.0.0+42' &&
      handoffRow.data_class === 'unknown' && handoffRow.verification_status === 'unverified' &&
      JSON.parse(handoffRow.quality_metadata).createdAutomatically === true,
    rows
  );
  rows = await query(`SELECT id,visitor_id,offer_id,platform,touch_type,event_id,metadata_json
    FROM monetization_touchpoints WHERE event_id=?1`, [handoffEventId]);
  check(
    'concurrent handoff creates exactly one normalized touchpoint',
    rows.length === 1 && rows[0]?.id === `tch-${handoffEventId}` &&
      rows[0]?.visitor_id === normalizedAppInstanceId && rows[0]?.offer_id === 'off-aff' &&
      rows[0]?.platform === 'app' && rows[0]?.touch_type === 'click' &&
      JSON.parse(rows[0]?.metadata_json).source === 'event_hook_v15',
    rows
  );

  result = await api('/api/monetization/app/handoff', {
    method: 'POST', auth: false, headers: appHeaders, body: handoffBody
  });
  check(
    'handoff replay returns canonical event',
    result.status === 200 && result.data?.duplicate === true && result.data?.eventId === handoffEventId,
    result
  );
  rows = await query(`SELECT
    (SELECT COUNT(*) FROM monetization_events WHERE idempotency_key=?1) events,
    (SELECT COUNT(*) FROM monetization_touchpoints WHERE event_id=?2) touchpoints,
    (SELECT COUNT(*) FROM monetization_touchpoints WHERE event_id=?3) install_touchpoints`, [
    `apk-handoff:${installEventId}:off-aff`, handoffEventId, installEventId
  ]);
  check(
    'touchpoint replay remains exactly once and install is not a touchpoint',
    number(rows[0]?.events) === 1 && number(rows[0]?.touchpoints) === 1 && number(rows[0]?.install_touchpoints) === 0,
    rows[0]
  );

  result = await api('/api/monetization/app/handoff', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { ...handoffBody, appVersion: '2.0.1' }
  });
  check('old receipt cannot be rebound to upgraded app version', result.status === 401, result);

  result = await api('/api/monetization/app/install', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { appInstanceId: rawAppInstanceId, appVersion: ' 2.0.1 ' }
  });
  const upgradedInstallId = result.data?.eventId;
  const upgradedReceipt = result.data?.installReceipt;
  check(
    'app version upgrade gets a distinct install event and receipt',
    result.status === 201 && result.data?.duplicate === false && upgradedInstallId !== installEventId &&
      typeof upgradedReceipt === 'string' && upgradedReceipt !== installReceipt,
    result
  );
  result = await api('/api/monetization/app/install', {
    method: 'POST', auth: false, headers: appHeaders,
    body: { appInstanceId: normalizedAppInstanceId, appVersion: '2.0.1' }
  });
  check(
    'upgraded install replay is idempotent',
    result.status === 200 && result.data?.duplicate === true && result.data?.eventId === upgradedInstallId,
    result
  );
  result = await api('/api/monetization/app/handoff', {
    method: 'POST', auth: false, headers: appHeaders,
    body: {
      appInstanceId: normalizedAppInstanceId, appVersion: '2.0.1', offerId: 'off-aff',
      installReceipt: upgradedReceipt
    }
  });
  check(
    'upgraded receipt authorizes a distinct version-bound handoff',
    result.status === 201 && result.data?.duplicate === false && result.data?.eventId !== handoffEventId,
    result
  );
} catch (error) {
  console.error('UNEXPECTED', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  const failed = checks.filter((item) => !item.ok);
  console.log('RESULT', JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.map((item) => item.name)
  }));
  if (failed.length > 0) process.exitCode = 1;
  await mf.dispose();
}
