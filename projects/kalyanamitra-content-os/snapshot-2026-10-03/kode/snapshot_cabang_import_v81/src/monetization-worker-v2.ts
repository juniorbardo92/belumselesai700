import baseWorker from './monetization-worker';
import {
  attributionReport,
  funnelAnalytics,
  ingestAffiliateConversion,
  ingestLynkWebhook,
  listReconciliations,
  runReconciliation,
  upsertProviderMapping
} from './monetization-attribution';

type Env = {
  DB: D1Database;
  MONETIZATION_INGEST_TOKEN?: string;
  LYNK_WEBHOOK_SECRET?: string;
};

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
function authorized(request: Request, env: Env): boolean {
  if (!env.MONETIZATION_INGEST_TOKEN) return true;
  return request.headers.get('Authorization') === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/api/monetization/provider-mappings') {
        if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
        const result = await upsertProviderMapping(request, env); return json(result.body, result.status);
      }
      if (request.method === 'POST' && url.pathname === '/api/monetization/webhooks/lynk') {
        const result = await ingestLynkWebhook(request, env); return json(result.body, result.status);
      }
      if (request.method === 'POST' && url.pathname === '/api/monetization/affiliate/conversions') {
        if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
        const result = await ingestAffiliateConversion(request, env); return json(result.body, result.status);
      }
      if (request.method === 'GET' && url.pathname === '/api/monetization/funnel') {
        const result = await funnelAnalytics(env, url); return json(result.body, result.status);
      }
      if (request.method === 'GET' && url.pathname === '/api/monetization/attribution') {
        const result = await attributionReport(env, url); return json(result.body, result.status);
      }
      if (request.method === 'POST' && url.pathname === '/api/monetization/reconciliation') {
        if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
        const result = await runReconciliation(request, env); return json(result.body, result.status);
      }
      if (request.method === 'GET' && url.pathname === '/api/monetization/reconciliation') {
        const result = await listReconciliations(env); return json(result.body, result.status);
      }
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: 'monetization_v2_request_failed', path: url.pathname, error: error instanceof Error ? error.message : 'unknown' }));
      return json({ ok: false, error: 'Monetization Engine gagal memproses request.' }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
