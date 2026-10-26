import './topic-research-resilience';
import contentOsWorker from './index';
import { handleMonetizationAdminPost, renderMonetizationSetup } from './monetization-admin-server';
import { renderMonetizationDashboard } from './monetization-dashboard-server';
import { cloudflareAccessAuthorized } from './cloudflare-access-jwt';

type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  OPENCLAW_INGRESS_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_POLICY_AUD?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

function monetizationUnavailable(correlationId:string):Response{
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Monetisasi sementara tidak tersedia</title><style>body{font:16px system-ui;max-width:760px;margin:50px auto;padding:20px;background:#f5f0e7;color:#1b1612}a{color:#9e1b13}</style><h1>Monetisasi sementara tidak tersedia</h1><p>Data tidak diubah. Coba muat ulang beberapa saat lagi.</p><p><small>Correlation ID: ${correlationId}</small></p><p><a href="/">Kembali ke Content OS</a></p>`,{
    status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'30',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}
  });
}

function openClawAuthorized(request: Request, env: Env): boolean {
  return Boolean(env.OPENCLAW_INGRESS_TOKEN) && request.headers.get('Authorization') === `Bearer ${env.OPENCLAW_INGRESS_TOKEN}`;
}

async function activeDashboard(request: Request, env: Env): Promise<Response> {
  const original = await contentOsWorker.fetch(request, env as never);
  if (!original.ok) return original;
  const contentType = original.headers.get('Content-Type') ?? '';
  if (!contentType.includes('text/html')) return original;

  const html = (await original.text())
    .replace(/\s*<label><input type="checkbox" name="platforms" value="linkedin" checked> LinkedIn<\/label>/g, '')
    .replace(/\s*<label><input type="checkbox" name="platforms" value="x" checked> X<\/label>/g, '');
  const headers = new Headers(original.headers);
  headers.set('Content-Length', String(new TextEncoder().encode(html).byteLength));
  return new Response(html, { status: original.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/monetization' && (request.method === 'GET' || request.method === 'POST')) {
      if (!(await cloudflareAccessAuthorized(request, env))) {
        return new Response('Forbidden', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      }
    }

    if (request.method === 'GET' && url.pathname === '/monetization') {
      try{
        if (url.searchParams.get('view') === 'setup') return await renderMonetizationSetup(request, env);
        return await renderMonetizationDashboard(request, env);
      }catch(error){
        const correlationId=`mon-ui-${crypto.randomUUID()}`;
        console.error(JSON.stringify({message:'monetization_render_failed',correlationId,error:error instanceof Error?error.message:'unknown'}));
        return monetizationUnavailable(correlationId);
      }
    }

    if (request.method === 'POST' && url.pathname === '/monetization') {
      try{return await handleMonetizationAdminPost(request, env);}
      catch(error){
        const correlationId=`mon-admin-${crypto.randomUUID()}`;
        console.error(JSON.stringify({message:'monetization_admin_failed',correlationId,error:error instanceof Error?error.message:'unknown'}));
        return monetizationUnavailable(correlationId);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/internal/openclaw/verify') {
      if (!openClawAuthorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
      return json({ ok: true, principal: 'openclaw', capability: 'monetization-command' });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return activeDashboard(request, env);
    }

    return contentOsWorker.fetch(request, env as never);
  }
} satisfies ExportedHandler<Env>;
