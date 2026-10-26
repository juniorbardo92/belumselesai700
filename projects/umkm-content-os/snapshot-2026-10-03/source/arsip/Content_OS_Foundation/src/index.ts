type CountRow = { total: number };

type DashboardStatus = {
  ok: true;
  service: string;
  phase: string;
  checkedAt: string;
  database: {
    ok: true;
    counts: Record<string, number>;
  };
  storage: {
    ok: true;
    bucket: string;
    objectsSampled: number;
  };
};

const SERVICE_NAME = "UMKM Content OS";
const PHASE = "Foundation";

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

function json(data: unknown, status = 200): Response {
  return response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function countTable(env: Env, table: string): Promise<number> {
  const allowed = new Set(["brands", "topics", "content_items", "render_jobs", "assets", "activity_logs"]);
  if (!allowed.has(table)) throw new Error("Unknown table");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<CountRow>();
  return Number(row?.total ?? 0);
}

async function getStatus(env: Env): Promise<DashboardStatus> {
  const [brands, topics, content, renderJobs, assets, activityLogs, media] = await Promise.all([
    countTable(env, "brands"),
    countTable(env, "topics"),
    countTable(env, "content_items"),
    countTable(env, "render_jobs"),
    countTable(env, "assets"),
    countTable(env, "activity_logs"),
    env.MEDIA.list({ limit: 1 })
  ]);

  return {
    ok: true,
    service: SERVICE_NAME,
    phase: PHASE,
    checkedAt: new Date().toISOString(),
    database: {
      ok: true,
      counts: { brands, topics, content, renderJobs, assets, activityLogs }
    },
    storage: {
      ok: true,
      bucket: "umkm-content-media",
      objectsSampled: media.objects.length
    }
  };
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Command center privat untuk produksi dan distribusi konten UMKM Naik Kelas.">
  <title>UMKM Content OS</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <div class="shell">
    <aside class="sidebar" aria-label="Navigasi utama">
      <a class="brand" href="/" aria-label="UMKM Content OS">
        <span class="seal" aria-hidden="true">策</span>
        <span><strong>Content OS</strong><small>UMKM Naik Kelas</small></span>
      </a>
      <nav>
        <a class="active" href="#dashboard">Dashboard</a>
        <a href="#research">Riset Topik</a>
        <a href="#library">Content Library</a>
        <a href="#calendar">Kalender</a>
        <a href="#carousel">Carousel Studio</a>
        <a href="#publisher">Publisher</a>
        <a href="#analytics">Analytics</a>
      </nav>
      <div class="sidebar-note">
        <span class="pulse"></span>
        <div><strong>Foundation aktif</strong><small>Mode semi-otomatis</small></div>
      </div>
    </aside>

    <main id="dashboard">
      <header class="topbar">
        <div>
          <p class="eyebrow">CONTENT COMMAND CENTER</p>
          <h1>Selamat pagi, Panglima.</h1>
          <p class="subtitle">Diagnosis dulu, strategi kemudian.</p>
        </div>
        <button class="primary" type="button" disabled title="Aktif pada fase Content Engine">+ Buat Konten</button>
      </header>

      <section class="status-strip" aria-live="polite">
        <div><span id="worker-dot" class="status-dot pending"></span><strong>Worker</strong><small id="worker-status">Memeriksa…</small></div>
        <div><span id="db-dot" class="status-dot pending"></span><strong>Database</strong><small id="db-status">Memeriksa…</small></div>
        <div><span id="r2-dot" class="status-dot pending"></span><strong>Media R2</strong><small id="r2-status">Memeriksa…</small></div>
        <div class="last-check"><small>Pemeriksaan terakhir</small><strong id="checked-at">—</strong></div>
      </section>

      <section class="metric-grid" aria-label="Ringkasan konten">
        <article class="metric"><span>Topik</span><strong id="metric-topics">—</strong><small>ide dalam database</small></article>
        <article class="metric"><span>Draft</span><strong id="metric-content">—</strong><small>konten tersimpan</small></article>
        <article class="metric"><span>Antrean Render</span><strong id="metric-jobs">—</strong><small>pekerjaan carousel</small></article>
        <article class="metric"><span>Aset Media</span><strong id="metric-assets">—</strong><small>file terdaftar</small></article>
      </section>

      <section class="work-grid">
        <article class="panel queue-panel">
          <div class="panel-heading">
            <div><p class="eyebrow">ALUR PRODUKSI</p><h2>Antrean hari ini</h2></div>
            <span class="badge">Fondasi</span>
          </div>
          <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">◎</div>
            <h3>Mesin siap, antrean masih kosong</h3>
            <p>Integrasi DeepSeek akan mengisi topik, draft, dan struktur carousel pada fase berikutnya.</p>
          </div>
        </article>

        <article class="panel roadmap-panel">
          <div class="panel-heading"><div><p class="eyebrow">STATUS IMPLEMENTASI</p><h2>Fondasi sistem</h2></div></div>
          <ol class="roadmap">
            <li class="done"><span>1</span><div><strong>Resource terisolasi</strong><small>Worker, D1, dan R2</small></div></li>
            <li class="current"><span>2</span><div><strong>Content Engine</strong><small>DeepSeek + output terstruktur</small></div></li>
            <li><span>3</span><div><strong>Renderer</strong><small>GitHub Actions + carousel</small></div></li>
            <li><span>4</span><div><strong>Publisher</strong><small>Repliz + lintas platform</small></div></li>
          </ol>
        </article>
      </section>

      <section class="module-grid" aria-label="Modul Content OS">
        <article id="research"><span class="module-number">01</span><h3>Riset Topik</h3><p>Tren, RSS, kompetitor, dan pertanyaan audiens.</p></article>
        <article id="library"><span class="module-number">02</span><h3>Content Library</h3><p>Satu sumber untuk caption, thread, artikel, dan slide.</p></article>
        <article id="carousel"><span class="module-number">03</span><h3>Carousel Studio</h3><p>Preview Instagram 4:5 dan TikTok 9:16.</p></article>
        <article id="publisher"><span class="module-number">04</span><h3>Publisher</h3><p>Jadwal, pengiriman, retry, dan URL posting.</p></article>
      </section>
    </main>
  </div>
  <script src="/assets/app.js" defer></script>
</body>
</html>`;
}

const styles = `
:root{--red:#9e1b13;--red-dark:#6f120d;--gold:#c69a3d;--cream:#f5e9d1;--paper:#fffaf0;--ink:#1b1612;--muted:#756d64;--line:#e7d9c2;--green:#23845b;--shadow:0 18px 50px rgba(65,35,17,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f0e7;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:248px minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;padding:28px 20px;background:linear-gradient(165deg,#20140e 0%,#3a1510 58%,#67160f 100%);color:#fff;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;margin:0 8px 34px}.brand strong,.brand small{display:block}.brand strong{font-family:Georgia,serif;font-size:21px}.brand small{margin-top:3px;color:#d9b97e;font-size:12px;letter-spacing:.03em}.seal{width:42px;height:42px;border:1px solid #e5bd66;border-radius:50%;display:grid;place-items:center;background:#8c2118;color:#f4d58a;font-family:serif;font-size:23px;box-shadow:inset 0 0 0 3px #5d140f}.sidebar nav{display:grid;gap:6px}.sidebar nav a{color:#dfcfc8;text-decoration:none;padding:11px 14px;border-radius:10px;font-size:14px;border:1px solid transparent}.sidebar nav a:hover,.sidebar nav a:focus-visible{border-color:rgba(225,188,105,.35);color:#fff;outline:none}.sidebar nav a.active{background:linear-gradient(90deg,rgba(198,154,61,.24),rgba(198,154,61,.06));border-color:rgba(225,188,105,.25);color:#fff}.sidebar-note{margin-top:auto;padding:14px;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.05)}.sidebar-note strong,.sidebar-note small{display:block}.sidebar-note strong{font-size:13px}.sidebar-note small{color:#cdbab2;font-size:11px;margin-top:3px}.pulse{width:9px;height:9px;border-radius:50%;background:#61d59e;box-shadow:0 0 0 6px rgba(97,213,158,.12)}main{padding:42px clamp(24px,4vw,64px) 64px;max-width:1500px;width:100%;margin:0 auto}.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:28px}.eyebrow{margin:0 0 7px;color:var(--red);font-size:11px;letter-spacing:.16em;font-weight:800}.topbar h1{margin:0;font-family:Georgia,serif;font-size:clamp(30px,4vw,46px);font-weight:600}.subtitle{margin:8px 0 0;color:var(--muted)}button.primary{padding:12px 18px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--red),var(--red-dark));color:#fff;font-weight:750;box-shadow:0 10px 24px rgba(158,27,19,.2)}button.primary:disabled{opacity:.55;cursor:not-allowed}.status-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(190px,.8fr);background:#201711;color:#fff;border-radius:16px;overflow:hidden;box-shadow:var(--shadow);margin-bottom:22px}.status-strip>div{padding:17px 20px;display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;border-right:1px solid rgba(255,255,255,.1)}.status-strip>div:last-child{border-right:0}.status-strip strong,.status-strip small{display:block}.status-strip strong{font-size:13px}.status-strip small{color:#c9bbb1;font-size:11px;margin-top:2px}.status-dot{grid-row:1/3;width:9px;height:9px;border-radius:50%;background:#a39a93}.status-dot.ok{background:#55d092;box-shadow:0 0 0 5px rgba(85,208,146,.12)}.status-dot.error{background:#f0645b}.last-check{grid-template-columns:1fr!important}.last-check strong{font-size:12px;color:#efd79f}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:22px}.metric{padding:22px;background:rgba(255,250,240,.88);border:1px solid var(--line);border-radius:15px;box-shadow:0 8px 28px rgba(74,46,25,.045)}.metric span,.metric small{display:block;color:var(--muted)}.metric span{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;margin:10px 0 3px;font-family:Georgia,serif;font-size:36px}.metric small{font-size:11px}.work-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:18px;margin-bottom:22px}.panel{background:var(--paper);border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow);padding:24px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.panel h2{margin:0;font-family:Georgia,serif;font-size:23px}.badge{font-size:11px;font-weight:800;color:var(--red);background:#f5ddd5;border:1px solid #edc6bb;padding:6px 9px;border-radius:999px}.empty-state{min-height:250px;display:grid;place-items:center;align-content:center;text-align:center;padding:30px}.empty-icon{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#f5e6cd;color:var(--red);font-size:25px}.empty-state h3{margin:14px 0 6px;font-size:16px}.empty-state p{max-width:470px;margin:0;color:var(--muted);font-size:13px;line-height:1.65}.roadmap{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:16px}.roadmap li{display:flex;gap:12px;align-items:center;color:#948b83}.roadmap li>span{width:31px;height:31px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:12px;font-weight:800;background:#fff}.roadmap strong,.roadmap small{display:block}.roadmap strong{font-size:13px}.roadmap small{font-size:11px;margin-top:3px}.roadmap .done{color:var(--green)}.roadmap .done>span{border-color:#a6d8c2;background:#eaf7f1}.roadmap .current{color:var(--red)}.roadmap .current>span{border-color:#e5aca1;background:#f9e7e2}.module-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.module-grid article{position:relative;min-height:160px;padding:22px;background:#fffaf0;border:1px solid var(--line);border-radius:15px;overflow:hidden}.module-grid article:after{content:"";position:absolute;right:-30px;bottom:-40px;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,rgba(198,154,61,.18),transparent 68%)}.module-number{color:var(--gold);font-family:Georgia,serif;font-size:13px;font-weight:700}.module-grid h3{margin:24px 0 8px;font-family:Georgia,serif;font-size:18px}.module-grid p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}@media(max-width:1050px){.shell{grid-template-columns:88px minmax(0,1fr)}.sidebar{padding:24px 14px}.brand{justify-content:center;margin-inline:0}.brand span:last-child,.sidebar nav a,.sidebar-note div{font-size:0}.sidebar nav a:before{content:"•";font-size:22px;display:grid;place-items:center}.sidebar-note{justify-content:center}.metric-grid,.module-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.shell{display:block}.sidebar{position:static;width:100%;height:auto;padding:14px 18px;flex-direction:row;align-items:center;gap:10px}.brand{margin:0 auto 0 0}.brand span:last-child{display:block}.sidebar nav{display:none}.sidebar-note{margin:0;padding:10px}.sidebar-note div{display:none}.topbar{align-items:center}.topbar h1{font-size:30px}.status-strip{grid-template-columns:1fr 1fr}.status-strip>div:nth-child(2){border-right:0}.status-strip>div{border-bottom:1px solid rgba(255,255,255,.1)}.metric-grid{grid-template-columns:1fr 1fr}.work-grid{grid-template-columns:1fr}.module-grid{grid-template-columns:1fr 1fr}main{padding:28px 16px 50px}}@media(max-width:480px){.metric-grid,.module-grid,.status-strip{grid-template-columns:1fr}.status-strip>div{border-right:0}.topbar{display:block}.topbar button{margin-top:18px}.metric{padding:18px}}
`;

const appScript = `
const setStatus=(id,ok,text)=>{document.getElementById(id+'-dot').className='status-dot '+(ok?'ok':'error');document.getElementById(id+'-status').textContent=text};
const setMetric=(id,value)=>{document.getElementById(id).textContent=new Intl.NumberFormat('id-ID').format(value||0)};
async function loadStatus(){
  try{
    const response=await fetch('/api/status',{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Status '+response.status);
    const data=await response.json();
    setStatus('worker',true,'Aktif');
    setStatus('db',data.database.ok,'D1 terhubung');
    setStatus('r2',data.storage.ok,'R2 terhubung');
    setMetric('metric-topics',data.database.counts.topics);
    setMetric('metric-content',data.database.counts.content);
    setMetric('metric-jobs',data.database.counts.renderJobs);
    setMetric('metric-assets',data.database.counts.assets);
    document.getElementById('checked-at').textContent=new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(data.checkedAt));
  }catch(error){
    setStatus('worker',false,'Perlu pemeriksaan');
    setStatus('db',false,'Belum tersedia');
    setStatus('r2',false,'Belum tersedia');
    document.getElementById('checked-at').textContent='Gagal memuat';
  }
}
loadStatus();
`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8c2118"/><circle cx="32" cy="32" r="25" fill="none" stroke="#e5bd66" stroke-width="2"/><text x="32" y="42" text-anchor="middle" font-size="29" fill="#f4d58a" font-family="serif">策</text></svg>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/status") {
        return json(await getStatus(env));
      }

      if (request.method === "GET" && url.pathname === "/assets/styles.css") {
        return response(styles, {
          headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        return response(appScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      if (request.method === "GET" && url.pathname === "/favicon.svg") {
        return response(favicon, {
          headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" }
        });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return response(dashboardHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ message: "request_failed", error: message, path: url.pathname }));
      return json({ ok: false, error: "Content OS belum siap. Silakan coba kembali." }, 500);
    }
  }
} satisfies ExportedHandler<Env>;

