export const analyticsHtml = `
      <section id="analytics" class="panel analytics-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">ANALYTICS</p><h2>Pantauan produksi</h2></div>
          <span class="badge">Read-only</span>
        </div>
        <p id="analytics-note" class="loading-copy analytics-note">Membaca metrik internal dari D1…</p>
        <div id="analytics-summary" class="analytics-summary" aria-live="polite">
          <article class="analytics-stat"><span>Approved</span><strong>—</strong><small>siap masuk Publisher</small></article>
          <article class="analytics-stat"><span>Render selesai</span><strong>—</strong><small>job carousel completed</small></article>
          <article class="analytics-stat"><span>Aset media</span><strong>—</strong><small>terdaftar di D1/R2</small></article>
          <article class="analytics-stat"><span>Draft Repliz</span><strong>—</strong><small>tidak dipublikasikan otomatis</small></article>
        </div>
        <div class="analytics-columns">
          <div>
            <h3>Draft Repliz per platform</h3>
            <div id="analytics-platforms" class="analytics-platforms"><p class="loading-copy">Memuat…</p></div>
          </div>
          <div>
            <h3>Aktivitas terakhir</h3>
            <div id="analytics-activity" class="analytics-activity" aria-live="polite"><p class="loading-copy">Memuat…</p></div>
          </div>
        </div>
      </section>`;

export const analyticsStyles = `
.analytics-panel{margin:0 0 22px}.analytics-note{margin:14px 0 0;line-height:1.55}.analytics-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:20px}.analytics-stat{padding:15px;border:1px solid var(--line);border-radius:11px;background:#fff}.analytics-stat span,.analytics-stat small{display:block;color:var(--muted)}.analytics-stat span{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.analytics-stat strong{display:block;margin:8px 0 3px;font-family:Georgia,serif;font-size:28px}.analytics-stat small{font-size:10px}.analytics-columns{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:22px;margin-top:24px}.analytics-columns h3{margin:0 0 10px;font-family:Georgia,serif;font-size:17px}.analytics-platforms{display:grid;gap:8px}.analytics-platform{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:12px}.analytics-platform strong{font-family:Georgia,serif;font-size:20px;color:var(--red)}.analytics-activity{display:grid;gap:8px;max-height:260px;overflow:auto;padding-right:3px}.analytics-event{padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}.analytics-event-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.analytics-event strong{font-size:11px}.analytics-event small{color:var(--muted);font-size:10px}.analytics-event p{margin:6px 0 0;color:var(--muted);font-size:11px;line-height:1.45}.analytics-event-status{padding:4px 7px;border-radius:999px;background:#e5f6ee;color:#176b49;font-size:9px;font-weight:800;text-transform:uppercase;white-space:nowrap}.analytics-event-status.error,.analytics-event-status.failed{background:#fbe2df;color:#8c2118}.analytics-event-meta{margin-top:6px;color:var(--red)!important}@media(max-width:900px){.analytics-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-columns{grid-template-columns:1fr}}@media(max-width:480px){.analytics-summary{grid-template-columns:1fr}}
`;

export const analyticsScript = `
const analyticsReadJson=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||("Status "+response.status));return data};
const analyticsFormatDate=(value)=>{try{return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(value))}catch{return value||"—"}};
const analyticsNote=document.getElementById("analytics-note");
const analyticsSummary=document.getElementById("analytics-summary");
const analyticsPlatforms=document.getElementById("analytics-platforms");
const analyticsActivity=document.getElementById("analytics-activity");
const analyticsLabels={"publisher.draft_submitted":"Draft Publisher","approval.updated":"Approval","renderer.job_started":"Render dimulai","renderer.job_completed":"Render selesai","renderer.job_failed":"Render gagal","content.generated":"Draft dibuat","system.bootstrap":"Sistem"};
const analyticsRenderCount=(value)=>new Intl.NumberFormat("id-ID").format(Number(value||0));

function analyticsRenderSummary(summary){
  if(!analyticsSummary)return;
  const values=[summary.approvedContent,summary.renderCompleted,summary.assets,summary.publisherDrafts];
  [...analyticsSummary.querySelectorAll(".analytics-stat strong")].forEach((element,index)=>{element.textContent=analyticsRenderCount(values[index])});
}

function analyticsRenderPlatforms(counts){
  if(!analyticsPlatforms)return;
  analyticsPlatforms.replaceChildren();
  for(const platform of ["instagram","threads","tiktok"]){
    const row=document.createElement("div");row.className="analytics-platform";
    const label=document.createElement("span");label.textContent=platform;
    const count=document.createElement("strong");count.textContent=analyticsRenderCount(counts?.[platform]);
    row.append(label,count);analyticsPlatforms.append(row);
  }
}

function analyticsRenderActivity(items){
  if(!analyticsActivity)return;
  analyticsActivity.replaceChildren();
  if(!items.length){const empty=document.createElement("p");empty.className="loading-copy";empty.textContent="Belum ada aktivitas.";analyticsActivity.append(empty);return}
  for(const item of items){
    const row=document.createElement("article");row.className="analytics-event";
    const head=document.createElement("div");head.className="analytics-event-head";
    const title=document.createElement("strong");title.textContent=analyticsLabels[item.eventType]||item.eventType;
    const status=document.createElement("span");status.className="analytics-event-status "+(item.status||"");status.textContent=item.status||"—";
    const date=document.createElement("small");date.textContent=analyticsFormatDate(item.createdAt);
    head.append(title,date,status);row.append(head);
    const message=document.createElement("p");message.textContent=item.message||"Aktivitas Content OS";row.append(message);
    const meta=[item.title,item.platform,item.isDraft===true?"draft-only":"",item.scheduleAt?"jadwal "+analyticsFormatDate(item.scheduleAt):""].filter(Boolean).join(" · ");
    if(meta){const detail=document.createElement("p");detail.className="analytics-event-meta";detail.textContent=meta;row.append(detail)}
    analyticsActivity.append(row);
  }
}

async function loadAnalytics(){
  try{
    const data=await analyticsReadJson(await fetch("/api/analytics",{headers:{Accept:"application/json"}}));
    analyticsRenderSummary(data.summary||{});analyticsRenderPlatforms(data.draftsByPlatform||{});analyticsRenderActivity(Array.isArray(data.recentActivity)?data.recentActivity:[]);
    if(analyticsNote)analyticsNote.textContent=data.note||"Analytics internal aktif dalam mode read-only.";
  }catch(error){
    if(analyticsNote)analyticsNote.textContent=error instanceof Error?error.message:"Analytics belum tersedia.";
    if(analyticsPlatforms)analyticsPlatforms.replaceChildren();
    if(analyticsActivity){analyticsActivity.replaceChildren();const message=document.createElement("p");message.className="loading-copy error-copy";message.textContent="Riwayat aktivitas gagal dimuat.";analyticsActivity.append(message)}
  }
}

void loadAnalytics();
setInterval(()=>{void loadAnalytics()},30000);
`;
