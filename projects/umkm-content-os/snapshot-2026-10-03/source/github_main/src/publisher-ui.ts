export const publisherHtml = `
      <section id="publisher-panel" class="panel publisher-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">PUBLISHER</p><h2>Repliz full automation</h2></div>
          <span id="publisher-mode" class="badge">Tanpa approval manusia</span>
        </div>
        <p id="publisher-config-status" class="loading-copy publisher-config-status">Memeriksa konfigurasi Repliz…</p>
        <div id="publisher-jobs" class="publisher-jobs" aria-live="polite">
          <p class="loading-copy">Belum ada pekerjaan autopilot.</p>
        </div>
      </section>`;

export const publisherStyles = `
.publisher-panel{margin:0 0 22px}.publisher-config-status{margin:14px 0 0}.publisher-form{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:14px;align-items:end;margin-top:18px}.publisher-form label{font-size:12px;font-weight:800;color:var(--ink)}.publisher-form select,.publisher-form input{display:block;width:100%;margin-top:7px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.publisher-form select:focus,.publisher-form input:focus{outline:2px solid rgba(158,27,19,.2);border-color:var(--red)}.publisher-form .form-actions{grid-column:1/-1}.publisher-jobs{display:grid;gap:10px;margin-top:20px}.publisher-job{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:#fff}.publisher-job strong,.publisher-job small{display:block}.publisher-job strong{font-size:12px}.publisher-job small{margin-top:5px;color:var(--muted);font-size:11px}.publisher-job-status{padding:5px 8px;border-radius:999px;background:#e5f6ee;color:#176b49;font-size:9px;font-weight:850;text-transform:uppercase;white-space:nowrap}.publisher-job-status.error,.publisher-job-status.blocked{background:#fbe2df;color:#8c2118}@media(max-width:900px){.publisher-form{grid-template-columns:1fr 1fr}.publisher-form label:first-child,.publisher-form .form-actions{grid-column:1/-1}}@media(max-width:560px){.publisher-form{grid-template-columns:1fr}.publisher-form label,.publisher-form .form-actions{grid-column:1/-1}.publisher-job{display:block}.publisher-job-status{display:inline-block;margin-top:10px}}
`;

export const publisherScript = `
const publisherReadJson=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||("Status "+response.status));return data};
const publisherForm=document.getElementById("publisher-form");
const publisherStatus=document.getElementById("publisher-config-status");
const publisherContent=document.getElementById("publisher-content");
const publisherAccount=document.getElementById("publisher-account");
const publisherSchedule=document.getElementById("publisher-schedule");
const publisherSubmit=document.getElementById("publisher-submit");
const publisherFormStatus=document.getElementById("publisher-form-status");
const publisherJobs=document.getElementById("publisher-jobs");
const publisherFormatDate=(value)=>{try{return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(value))}catch{return value||"—"}};
const publisherSetStatus=(text,error=false)=>{if(!publisherStatus)return;publisherStatus.textContent=text;publisherStatus.className="loading-copy publisher-config-status"+(error?" error-copy":"")};

function publisherSetDefaultSchedule(){
  if(!publisherSchedule)return;
  const date=new Date(Date.now()+60*60*1000);
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  publisherSchedule.value=local;
}

async function loadPublisherContent(){
  if(!publisherContent)return;
  const data=await publisherReadJson(await fetch("/api/content",{headers:{Accept:"application/json"}}));
  publisherContent.replaceChildren();
  const approved=data.items.filter((item)=>item.status==="approved");
  for(const item of approved){
    const option=document.createElement("option");option.value=item.id;option.textContent=item.title+" · "+item.assetCount+" aset";publisherContent.append(option);
  }
  if(approved.length===0){const option=document.createElement("option");option.value="";option.textContent="Belum ada konten approved";publisherContent.append(option)}
  publisherContent.disabled=approved.length===0;
}

async function loadPublisherAccounts(){
  if(!publisherAccount)return;
  const data=await publisherReadJson(await fetch("/api/publisher/accounts",{headers:{Accept:"application/json"}}));
  publisherAccount.replaceChildren();
  const accounts=data.accounts.filter((account)=>account.isConnected&&account.supported);
  for(const account of accounts){
    const option=document.createElement("option");option.value=account.id;option.textContent=(account.name||account.username||account.id)+" · "+account.type;publisherAccount.append(option);
  }
  if(accounts.length===0){const option=document.createElement("option");option.value="";option.textContent="Belum ada akun yang didukung";publisherAccount.append(option)}
  publisherAccount.disabled=accounts.length===0;
  if(publisherSubmit)publisherSubmit.disabled=accounts.length===0||publisherContent?.disabled===true;
}

async function loadPublisherJobs(){
  if(!publisherJobs)return;
  try{
    const data=await publisherReadJson(await fetch("/api/publisher/jobs",{headers:{Accept:"application/json"}}));
    publisherJobs.replaceChildren();
    if(data.jobs.length===0){const empty=document.createElement("p");empty.className="loading-copy";empty.textContent="Belum ada draft Publisher.";publisherJobs.append(empty);return}
    for(const job of data.jobs){
      const item=document.createElement("article");item.className="publisher-job";
      const copy=document.createElement("div");const title=document.createElement("strong");title.textContent=job.title;const meta=document.createElement("small");meta.textContent=job.platform+" · "+publisherFormatDate(job.scheduleAt);copy.append(title,meta);
      const status=document.createElement("span");status.className="publisher-job-status "+job.status;status.textContent=job.status;item.append(copy,status);publisherJobs.append(item);
    }
  }catch(error){publisherJobs.replaceChildren();const message=document.createElement("p");message.className="loading-copy error-copy";message.textContent=error instanceof Error?error.message:"Riwayat Publisher gagal dimuat.";publisherJobs.append(message)}
}

async function bootstrapPublisher(){
  try{
    const data=await publisherReadJson(await fetch("/api/publisher/status",{headers:{Accept:"application/json"}}));
    if(!data.configured){publisherSetStatus("Repliz belum dikonfigurasi; autopilot akan berhenti sebelum penjadwalan.");await loadPublisherJobs();return}
    publisherSetStatus("Repliz terhubung. Render, QA, routing brand, dan penjadwalan berjalan otomatis.");
    await loadPublisherJobs();
  }catch(error){publisherSetStatus(error instanceof Error?error.message:"Publisher belum tersedia.",true);await loadPublisherJobs()}
}

publisherForm?.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(!publisherContent?.value||!publisherAccount?.value||!publisherSchedule?.value)return;
  if(publisherSubmit){publisherSubmit.disabled=true;publisherSubmit.textContent="Mengirim draft…"}
  if(publisherFormStatus)publisherFormStatus.textContent="";
  try{
    const scheduleAt=new Date(publisherSchedule.value).toISOString();
    const data=await publisherReadJson(await fetch("/api/publisher/drafts",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({contentItemId:publisherContent.value,accountId:publisherAccount.value,scheduleAt})}));
    if(publisherFormStatus)publisherFormStatus.textContent="Draft Repliz tersimpan. Tidak dipublikasikan otomatis.";
    if(data.isDraft)await loadPublisherJobs();
  }catch(error){if(publisherFormStatus)publisherFormStatus.textContent=error instanceof Error?error.message:"Draft Publisher gagal dibuat."}
  finally{if(publisherSubmit){publisherSubmit.disabled=false;publisherSubmit.textContent="Kirim sebagai Draft Repliz"}}
});

void bootstrapPublisher();
`;
