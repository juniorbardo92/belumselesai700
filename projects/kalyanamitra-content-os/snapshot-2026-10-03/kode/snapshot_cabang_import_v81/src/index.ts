import { generateContent, getAiRuntimeStatus } from "./content-engine";
import { getAnalyticsSnapshot } from "./analytics-engine";
import { updateContentApproval } from "./approval-engine";
import { auditThreadsUser, getResearchRuntimeStatus } from "./research-engine";
import {
  createTopicResearchRun,
  getTopicResearchRun,
  getTopicResearchRuntimeStatus,
  listTopicResearchRuns
} from "./topic-research-engine";
import {
  getAutomationRuntimeStatus,
  listAutomationRuns,
  receiveAutomationEvent,
  triggerAutomation
} from "./automation-engine";
import {
  createPublisherDraft,
  getPublisherRuntimeStatus,
  listPublisherAccounts,
  listPublisherJobs
} from "./publisher-engine";
import { getRendererRuntimeStatus, listRenderableContent, listRenderJobs, startRenderJob } from "./render-engine";
import { getContentDesign, resolveContentSlides, saveContentDesign, uploadDesignAsset } from "./design-engine";
import { publisherHtml, publisherScript, publisherStyles } from "./publisher-ui";
import { analyticsHtml, analyticsScript, analyticsStyles } from "./analytics-ui";
import { researchHtml, researchScript, researchStyles } from "./research-ui";
import { topicResearchHtml, topicResearchScript, topicResearchStyles } from "./topic-research-ui";
import { rendererLibraryHtml, rendererQueueHtml, rendererScript, rendererStyles } from "./renderer-ui";
import { designStudioHtml, designStudioScript, designStudioStyles } from "./design-ui";
import { getDraftContent, updateDraftContent } from "./draft-editor";
import { draftEditorHtml, draftEditorScript, draftEditorStyles } from "./draft-editor-ui";
import { confirmContentPackImport, dryRunContentPackImport } from "./content-pack-import";
import {
  contentPackImportHtml,
  contentPackImportScript,
  contentPackImportStyles
} from "./content-pack-ui";

export {
  fingerprintContentPackDraft,
  validateContentPackDocument
} from "./content-pack-import";

export { resolveContentSlides };
export { applyDraftContentEdit } from "./draft-editor";

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
  ai: {
    configured: boolean;
    enabled: boolean;
    model: string;
  };
  renderer: {
    configured: boolean;
    repository: string;
    workflow: string;
  };
  publisher: {
    configured: boolean;
    provider: "Repliz";
    mode: "draft-only";
    supportedPlatforms: Array<"instagram" | "tiktok" | "threads">;
  };
};

const SERVICE_NAME = "UMKM Content OS";
const PHASE = "Topic/Viral Research framework read-only · Research/KOL audit read-only · Publisher draft-only";

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data: https://media.umkmnaikkelas.id; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
    },
    ai: getAiRuntimeStatus(env),
    renderer: getRendererRuntimeStatus(env),
    publisher: getPublisherRuntimeStatus(env)
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
        <a href="#content-pack-import">Impor Kalyanamitra</a>
        <a href="#topic-research">Riset Topik</a>
        <a href="#research">Audit Akun</a>
        <a href="#library">Content Library</a>
        <a href="#calendar">Kalender</a>
        <a href="#carousel">Carousel Studio</a>
        <a href="#publisher-panel">Publisher</a>
        <a href="#analytics">Analytics</a>
      </nav>
      <div class="sidebar-note">
        <span class="pulse"></span>
        <div><strong>Publisher draft-only</strong><small>Approval tetap wajib</small></div>
      </div>
    </aside>

    <main id="dashboard">
      <header class="topbar">
        <div>
          <p class="eyebrow">CONTENT COMMAND CENTER</p>
          <h1>Selamat pagi, Panglima.</h1>
          <p class="subtitle">Diagnosis dulu, strategi kemudian.</p>
        </div>
        <button id="create-content-button" class="primary" type="button">+ Buat Konten</button>
      </header>

      <section class="status-strip" aria-live="polite">
        <div><span id="worker-dot" class="status-dot pending"></span><strong>Worker</strong><small id="worker-status">Memeriksa…</small></div>
        <div><span id="db-dot" class="status-dot pending"></span><strong>Database</strong><small id="db-status">Memeriksa…</small></div>
        <div><span id="r2-dot" class="status-dot pending"></span><strong>Media R2</strong><small id="r2-status">Memeriksa…</small></div>
        <div><span id="renderer-dot" class="status-dot pending"></span><strong>Renderer</strong><small id="renderer-status">Memeriksa…</small></div>
        <div class="last-check"><small>Pemeriksaan terakhir</small><strong id="checked-at">—</strong></div>
      </section>

      <section id="create-panel" class="panel create-panel" hidden>
        <div class="panel-heading">
          <div><p class="eyebrow">CONTENT ENGINE</p><h2>Buat draft konten</h2></div>
          <span class="badge">DeepSeek</span>
        </div>
        <form id="content-form" class="content-form">
          <label for="content-topic">Topik
            <input id="content-topic" name="topic" minlength="8" maxlength="300" required placeholder="Contoh: Omzet ramai tetapi kas tetap kosong">
          </label>
          <label for="content-angle">Sudut pembahasan <span>(opsional)</span>
            <textarea id="content-angle" name="angle" maxlength="500" rows="3" placeholder="Contoh: diagnosis margin, stok, dan arus kas untuk owner pemula"></textarea>
          </label>
          <fieldset>
            <legend>Platform tujuan</legend>
            <div class="platform-options">
              <label><input type="checkbox" name="platforms" value="linkedin" checked> LinkedIn</label>
              <label><input type="checkbox" name="platforms" value="threads" checked> Threads</label>
              <label><input type="checkbox" name="platforms" value="x" checked> X</label>
              <label><input type="checkbox" name="platforms" value="instagram" checked> Instagram</label>
              <label><input type="checkbox" name="platforms" value="tiktok" checked> TikTok</label>
            </div>
          </fieldset>
          <div class="form-actions">
            <button class="primary" type="submit">Generate draft</button>
            <p id="content-form-status" class="form-status" role="status"></p>
          </div>
        </form>
        <pre id="content-result" class="content-result" hidden></pre>
      </section>

${contentPackImportHtml}

${rendererLibraryHtml}

${topicResearchHtml}

${researchHtml}

${publisherHtml}

${analyticsHtml}

${draftEditorHtml}

${designStudioHtml}

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
            <span class="badge">Approval gate</span>
          </div>
${rendererQueueHtml}
        </article>

        <article class="panel roadmap-panel">
          <div class="panel-heading"><div><p class="eyebrow">STATUS IMPLEMENTASI</p><h2>Fondasi sistem</h2></div></div>
          <ol class="roadmap">
            <li class="done"><span>1</span><div><strong>Resource terisolasi</strong><small>Worker, D1, dan R2</small></div></li>
            <li class="done"><span>2</span><div><strong>Content Engine</strong><small>DeepSeek + output terstruktur</small></div></li>
            <li class="done"><span>3</span><div><strong>Renderer</strong><small>GitHub Actions + carousel</small></div></li>
            <li class="done"><span>4</span><div><strong>Approval</strong><small>Persetujuan manusia wajib</small></div></li>
            <li class="done"><span>5</span><div><strong>Publisher</strong><small>Repliz draft-only, tanpa auto-publish</small></div></li>
            <li class="done"><span>6</span><div><strong>Analytics</strong><small>Ringkasan internal read-only dari D1</small></div></li>
            <li class="current"><span>7</span><div><strong>KOL Audit</strong><small>Research Threads read-only</small></div></li>
          </ol>
        </article>
      </section>

      <section class="module-grid" aria-label="Modul Content OS">
        <article id="research-overview"><span class="module-number">01</span><h3>Riset Topik</h3><p>Tren, RSS, kompetitor, dan pertanyaan audiens.</p></article>
        <article id="library-overview"><span class="module-number">02</span><h3>Content Library</h3><p>Satu sumber untuk caption, thread, artikel, dan slide.</p></article>
        <article id="carousel"><span class="module-number">03</span><h3>Carousel Studio</h3><p>Preview Instagram 4:5 dan TikTok 9:16.</p></article>
        <article id="publisher-overview"><span class="module-number">04</span><h3>Publisher</h3><p>Draft Repliz setelah approval; publikasi tetap manual.</p></article>
        <article id="analytics-overview"><span class="module-number">05</span><h3>Analytics</h3><p>Riwayat produksi dan draft tanpa mengambil tindakan publikasi.</p></article>
        <article id="kol-audit-overview"><span class="module-number">06</span><h3>KOL Audit</h3><p>Audit profil Threads publik tanpa like, komentar, DM, atau publikasi.</p></article>
        <article id="topic-research-overview"><span class="module-number">07</span><h3>Pola Konten</h3><p>Keyword, akun relevan, dan alasan pola copy berpotensi bekerja berdasarkan data publik.</p></article>
      </section>
    </main>
  </div>
  <script src="/assets/app.js" defer></script>
  <script src="/assets/renderer.js" defer></script>
  <script src="/assets/draft-editor.js" defer></script>
  <script src="/assets/design.js" defer></script>
  <script src="/assets/publisher.js" defer></script>
  <script src="/assets/analytics.js" defer></script>
  <script src="/assets/research.js" defer></script>
  <script src="/assets/topic-research.js" defer></script>
  <script src="/assets/content-pack-import.js" defer></script>
</body>
</html>`;
}

const styles = `
:root{--red:#9e1b13;--red-dark:#6f120d;--gold:#c69a3d;--cream:#f5e9d1;--paper:#fffaf0;--ink:#1b1612;--muted:#756d64;--line:#e7d9c2;--green:#23845b;--shadow:0 18px 50px rgba(65,35,17,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f0e7;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:248px minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;padding:28px 20px;background:linear-gradient(165deg,#20140e 0%,#3a1510 58%,#67160f 100%);color:#fff;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;margin:0 8px 34px}.brand strong,.brand small{display:block}.brand strong{font-family:Georgia,serif;font-size:21px}.brand small{margin-top:3px;color:#d9b97e;font-size:12px;letter-spacing:.03em}.seal{width:42px;height:42px;border:1px solid #e5bd66;border-radius:50%;display:grid;place-items:center;background:#8c2118;color:#f4d58a;font-family:serif;font-size:23px;box-shadow:inset 0 0 0 3px #5d140f}.sidebar nav{display:grid;gap:6px}.sidebar nav a{color:#dfcfc8;text-decoration:none;padding:11px 14px;border-radius:10px;font-size:14px;border:1px solid transparent}.sidebar nav a:hover,.sidebar nav a:focus-visible{border-color:rgba(225,188,105,.35);color:#fff;outline:none}.sidebar nav a.active{background:linear-gradient(90deg,rgba(198,154,61,.24),rgba(198,154,61,.06));border-color:rgba(225,188,105,.25);color:#fff}.sidebar-note{margin-top:auto;padding:14px;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.05)}.sidebar-note strong,.sidebar-note small{display:block}.sidebar-note strong{font-size:13px}.sidebar-note small{color:#cdbab2;font-size:11px;margin-top:3px}.pulse{width:9px;height:9px;border-radius:50%;background:#61d59e;box-shadow:0 0 0 6px rgba(97,213,158,.12)}main{padding:42px clamp(24px,4vw,64px) 64px;max-width:1500px;width:100%;margin:0 auto}.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:28px}.eyebrow{margin:0 0 7px;color:var(--red);font-size:11px;letter-spacing:.16em;font-weight:800}.topbar h1{margin:0;font-family:Georgia,serif;font-size:clamp(30px,4vw,46px);font-weight:600}.subtitle{margin:8px 0 0;color:var(--muted)}button.primary{padding:12px 18px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--red),var(--red-dark));color:#fff;font-weight:750;box-shadow:0 10px 24px rgba(158,27,19,.2)}button.primary:disabled{opacity:.55;cursor:not-allowed}.status-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(190px,.8fr);background:#201711;color:#fff;border-radius:16px;overflow:hidden;box-shadow:var(--shadow);margin-bottom:22px}.status-strip>div{padding:17px 20px;display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;border-right:1px solid rgba(255,255,255,.1)}.status-strip>div:last-child{border-right:0}.status-strip strong,.status-strip small{display:block}.status-strip strong{font-size:13px}.status-strip small{color:#c9bbb1;font-size:11px;margin-top:2px}.status-dot{grid-row:1/3;width:9px;height:9px;border-radius:50%;background:#a39a93}.status-dot.ok{background:#55d092;box-shadow:0 0 0 5px rgba(85,208,146,.12)}.status-dot.error{background:#f0645b}.last-check{grid-template-columns:1fr!important}.last-check strong{font-size:12px;color:#efd79f}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:22px}.metric{padding:22px;background:rgba(255,250,240,.88);border:1px solid var(--line);border-radius:15px;box-shadow:0 8px 28px rgba(74,46,25,.045)}.metric span,.metric small{display:block;color:var(--muted)}.metric span{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;margin:10px 0 3px;font-family:Georgia,serif;font-size:36px}.metric small{font-size:11px}.work-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:18px;margin-bottom:22px}.panel{background:var(--paper);border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow);padding:24px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.panel h2{margin:0;font-family:Georgia,serif;font-size:23px}.badge{font-size:11px;font-weight:800;color:var(--red);background:#f5ddd5;border:1px solid #edc6bb;padding:6px 9px;border-radius:999px}.empty-state{min-height:250px;display:grid;place-items:center;align-content:center;text-align:center;padding:30px}.empty-icon{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#f5e6cd;color:var(--red);font-size:25px}.empty-state h3{margin:14px 0 6px;font-size:16px}.empty-state p{max-width:470px;margin:0;color:var(--muted);font-size:13px;line-height:1.65}.roadmap{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:16px}.roadmap li{display:flex;gap:12px;align-items:center;color:#948b83}.roadmap li>span{width:31px;height:31px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:12px;font-weight:800;background:#fff}.roadmap strong,.roadmap small{display:block}.roadmap strong{font-size:13px}.roadmap small{font-size:11px;margin-top:3px}.roadmap .done{color:var(--green)}.roadmap .done>span{border-color:#a6d8c2;background:#eaf7f1}.roadmap .current{color:var(--red)}.roadmap .current>span{border-color:#e5aca1;background:#f9e7e2}.module-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.module-grid article{position:relative;min-height:160px;padding:22px;background:#fffaf0;border:1px solid var(--line);border-radius:15px;overflow:hidden}.module-grid article:after{content:"";position:absolute;right:-30px;bottom:-40px;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,rgba(198,154,61,.18),transparent 68%)}.module-number{color:var(--gold);font-family:Georgia,serif;font-size:13px;font-weight:700}.module-grid h3{margin:24px 0 8px;font-family:Georgia,serif;font-size:18px}.module-grid p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.create-panel{margin-bottom:22px}.content-form{display:grid;gap:16px;margin-top:22px}.content-form label,.content-form legend{font-size:12px;font-weight:800;color:var(--ink)}.content-form label>span{font-weight:500;color:var(--muted)}.content-form input[type="text"],.content-form input:not([type]),.content-form textarea{display:block;width:100%;margin-top:7px;padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px;resize:vertical}.content-form input:focus,.content-form textarea:focus{outline:2px solid rgba(158,27,19,.2);border-color:var(--red)}.content-form fieldset{border:1px solid var(--line);border-radius:11px;padding:13px}.content-form fieldset label{display:inline-flex;align-items:center;gap:7px;margin:10px 18px 0 0;font-size:12px;font-weight:600;color:var(--muted)}.platform-options{display:flex;flex-wrap:wrap}.form-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.form-status{margin:0;color:var(--muted);font-size:12px}.content-result{max-height:430px;overflow:auto;margin:20px 0 0;padding:16px;border-radius:12px;background:#241811;color:#f7e8c7;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}\n@media(max-width:1050px){.shell{grid-template-columns:88px minmax(0,1fr)}.sidebar{padding:24px 14px}.brand{justify-content:center;margin-inline:0}.brand span:last-child,.sidebar nav a,.sidebar-note div{font-size:0}.sidebar nav a:before{content:"•";font-size:22px;display:grid;place-items:center}.sidebar-note{justify-content:center}.metric-grid,.module-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.shell{display:block}.sidebar{position:static;width:100%;height:auto;padding:14px 18px;flex-direction:row;align-items:center;gap:10px}.brand{margin:0 auto 0 0}.brand span:last-child{display:block}.sidebar nav{display:none}.sidebar-note{margin:0;padding:10px}.sidebar-note div{display:none}.topbar{align-items:center}.topbar h1{font-size:30px}.status-strip{grid-template-columns:1fr 1fr}.status-strip>div:nth-child(2){border-right:0}.status-strip>div{border-bottom:1px solid rgba(255,255,255,.1)}.metric-grid{grid-template-columns:1fr 1fr}.work-grid{grid-template-columns:1fr}.module-grid{grid-template-columns:1fr 1fr}main{padding:28px 16px 50px}}@media(max-width:480px){.metric-grid,.module-grid,.status-strip{grid-template-columns:1fr}.status-strip>div{border-right:0}.topbar{display:block}.topbar button{margin-top:18px}.metric{padding:18px}}
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
const createButton=document.getElementById('create-content-button');
const createPanel=document.getElementById('create-panel');
const contentForm=document.getElementById('content-form');
const contentFormStatus=document.getElementById('content-form-status');
const contentResult=document.getElementById('content-result');
createButton?.addEventListener('click',()=>{
  if(!createPanel)return;
  createPanel.hidden=!createPanel.hidden;
  if(!createPanel.hidden)document.getElementById('content-topic')?.focus();
});
contentForm?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(!contentFormStatus||!contentResult)return;
  const form=new FormData(contentForm);
  const topic=String(form.get('topic')||'').trim();
  const angle=String(form.get('angle')||'').trim();
  const platforms=[...document.querySelectorAll('input[name="platforms"]:checked')].map((input)=>input.value);
  contentFormStatus.textContent='Membuat draft…';
  contentResult.hidden=true;
  if(platforms.length===0){
    contentFormStatus.textContent='Pilih minimal satu platform.';
    return;
  }
  try{
    const response=await fetch('/api/content/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({topic,angle:angle||undefined,platforms})
    });
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Draft gagal dibuat.');
    contentFormStatus.textContent='Draft berhasil dibuat dan disimpan di D1.';
    contentResult.textContent=JSON.stringify(data.content,null,2);
    contentResult.hidden=false;
  }catch(error){
    contentFormStatus.textContent=error instanceof Error?error.message:'Draft gagal dibuat.';
  }
});

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

      if (request.method === "GET" && url.pathname === "/api/analytics") {
        return json(await getAnalyticsSnapshot(env));
      }

      if (request.method === "GET" && url.pathname === "/api/research/status") {
        return json({ ok: true, ...getResearchRuntimeStatus(env) });
      }

      if (request.method === "GET" && url.pathname === "/api/research/kols") {
        const result = await auditThreadsUser(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/topic-research/status") {
        return json({ ok: true, ...getTopicResearchRuntimeStatus(env) });
      }

      if (request.method === "POST" && url.pathname === "/api/topic-research/runs") {
        const result = await createTopicResearchRun(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/topic-research/runs") {
        const result = await listTopicResearchRuns(env);
        return json(result.body, result.status);
      }

      const topicResearchRunMatch = url.pathname.match(/^\/api\/topic-research\/runs\/([^/]+)$/);
      if (request.method === "GET" && topicResearchRunMatch?.[1]) {
        const result = await getTopicResearchRun(decodeURIComponent(topicResearchRunMatch[1]), env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/automation/status") {
        return json({ ok: true, ...getAutomationRuntimeStatus(env) });
      }

      if (request.method === "POST" && url.pathname === "/api/automation/trigger") {
        const result = await triggerAutomation(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "POST" && url.pathname === "/api/automation/events") {
        const result = await receiveAutomationEvent(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/automation/runs") {
        const result = await listAutomationRuns(env);
        return json(result.body, result.status);
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/api/content-packs/dry-run" ||
          url.pathname === "/webhook/umkm-content-os/content-packs/dry-run")
      ) {
        const result = await dryRunContentPackImport(request, env);
        return json(result.body, result.status);
      }

      const contentPackConfirmMatch = url.pathname.match(
        /^\/(?:api|webhook\/umkm-content-os)\/content-packs\/([^/]+)\/confirm$/
      );
      if (request.method === "POST" && contentPackConfirmMatch?.[1]) {
        const result = await confirmContentPackImport(
          request,
          env,
          decodeURIComponent(contentPackConfirmMatch[1])
        );
        return json(result.body, result.status);
      }

      if (request.method === "POST" && url.pathname === "/api/content/generate") {
        const result = await generateContent(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/content") {
        const result = await listRenderableContent(env);
        return json(result.body, result.status);
      }

      const draftEditMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/draft$/);
      if (request.method === "GET" && draftEditMatch?.[1]) {
        const result = await getDraftContent(env, decodeURIComponent(draftEditMatch[1]));
        return json(result.body, result.status);
      }
      if (request.method === "PATCH" && draftEditMatch?.[1]) {
        const result = await updateDraftContent(request, env, decodeURIComponent(draftEditMatch[1]));
        return json(result.body, result.status);
      }

      const approvalMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/approval$/);
      if (request.method === "PATCH" && approvalMatch?.[1]) {
        const result = await updateContentApproval(request, env, approvalMatch[1]);
        return json(result.body, result.status);
      }

      const designMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/design$/);
      if (request.method === "GET" && designMatch?.[1]) {
        const result = await getContentDesign(env, designMatch[1]);
        return json(result.body, result.status);
      }
      if (request.method === "PUT" && designMatch?.[1]) {
        const result = await saveContentDesign(request, env, designMatch[1]);
        return json(result.body, result.status);
      }

      const designAssetMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/design\/assets$/);
      if (request.method === "POST" && designAssetMatch?.[1]) {
        const result = await uploadDesignAsset(request, env, designAssetMatch[1]);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/render-jobs") {
        const result = await listRenderJobs(env);
        return json(result.body, result.status);
      }

      if (request.method === "POST" && url.pathname === "/api/render-jobs") {
        const result = await startRenderJob(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/publisher/status") {
        return json({ ok: true, ...getPublisherRuntimeStatus(env) });
      }

      if (request.method === "GET" && url.pathname === "/api/publisher/accounts") {
        const result = await listPublisherAccounts(env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/api/publisher/jobs") {
        const result = await listPublisherJobs(env);
        return json(result.body, result.status);
      }

      if (request.method === "POST" && url.pathname === "/api/publisher/drafts") {
        const result = await createPublisherDraft(request, env);
        return json(result.body, result.status);
      }

      if (request.method === "GET" && url.pathname === "/assets/styles.css") {
        return response(styles + rendererStyles + draftEditorStyles + designStudioStyles + publisherStyles + analyticsStyles + researchStyles + topicResearchStyles + contentPackImportStyles, {
          headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        return response(appScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/renderer.js") {
        return response(rendererScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/draft-editor.js") {
        return response(draftEditorScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/design.js") {
        return response(designStudioScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/publisher.js") {
        return response(publisherScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/analytics.js") {
        return response(analyticsScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/research.js") {
        return response(researchScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/topic-research.js") {
        return response(topicResearchScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
        });
      }

      if (request.method === "GET" && url.pathname === "/assets/content-pack-import.js") {
        return response(contentPackImportScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }
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
