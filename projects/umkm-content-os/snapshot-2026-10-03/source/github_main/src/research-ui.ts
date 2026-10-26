export const researchHtml = `
      <section id="research" class="panel research-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">RESEARCH / KOL AUDIT</p><h2>Audit akun publik</h2></div>
          <span class="badge">Read-only</span>
        </div>
        <p id="research-config-status" class="loading-copy research-config-status">Mengecek Research API…</p>
        <form id="research-form" class="research-form" hidden>
          <label for="research-platform">Platform
            <select id="research-platform" name="platform">
              <option value="threads">Threads — aktif</option>
              <option value="instagram" disabled>Instagram — menunggu API/integrasi</option>
              <option value="tiktok" disabled>TikTok — akun belum dibuat</option>
            </select>
          </label>
          <label for="research-username">Username publik
            <input id="research-username" name="username" maxlength="64" required placeholder="Contoh: meta atau @meta" autocomplete="off">
          </label>
          <div class="form-actions">
            <button id="research-submit" class="primary" type="submit">Audit akun</button>
            <p id="research-form-status" class="form-status" role="status"></p>
          </div>
        </form>
        <div id="research-result" class="research-result" hidden aria-live="polite"></div>
      </section>`;

export const researchStyles = `
.research-panel{margin:0 0 22px}.research-config-status{margin:14px 0 0}.research-form{display:grid;grid-template-columns:.75fr 1.25fr auto;gap:14px;align-items:end;margin-top:18px}.research-form label{font-size:12px;font-weight:800;color:var(--ink)}.research-form select,.research-form input{display:block;width:100%;margin-top:7px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.research-form select:focus,.research-form input:focus{outline:2px solid rgba(158,27,19,.2);border-color:var(--red)}.research-form .form-actions{display:flex;align-items:end;gap:10px}.research-result{margin-top:22px;padding-top:20px;border-top:1px solid var(--line)}.research-profile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.research-profile-head h3{margin:0;font-family:Georgia,serif;font-size:20px}.research-profile-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.research-verified{padding:5px 8px;border-radius:999px;background:#e5f6ee;color:#176b49;font-size:10px;font-weight:800}.research-stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:16px}.research-stat{padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff}.research-stat span,.research-stat small{display:block;color:var(--muted)}.research-stat span{font-size:10px;text-transform:uppercase;letter-spacing:.06em}.research-stat strong{display:block;margin-top:5px;font-family:Georgia,serif;font-size:20px}.research-content-heading{margin:22px 0 10px;font-family:Georgia,serif;font-size:17px}.research-content-list{display:grid;gap:8px}.research-content-item{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}.research-content-item strong,.research-content-item small{display:block}.research-content-item strong{font-size:12px}.research-content-item small{margin-top:4px;color:var(--muted);font-size:10px}.research-content-item a{color:var(--red);font-size:10px;font-weight:800;white-space:nowrap}.research-note-list{display:grid;gap:4px;margin:16px 0 0;padding:0 0 0 18px;color:var(--muted);font-size:11px;line-height:1.5}.research-empty{margin:0;color:var(--muted);font-size:12px}.research-error{color:var(--red)!important}@media(max-width:900px){.research-form{grid-template-columns:1fr 1fr}.research-form .form-actions{grid-column:1/-1}.research-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:560px){.research-form,.research-stat-grid{grid-template-columns:1fr}.research-form .form-actions{grid-column:auto}.research-content-item{display:block}.research-content-item a{display:inline-block;margin-top:8px}}
`;

export const researchScript = `
const researchReadJson=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||("Status "+response.status));return data};
const researchFormatNumber=(value)=>value===null||value===undefined?"N/A":new Intl.NumberFormat("id-ID").format(value);
const researchFormatDate=(value)=>{try{return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(value))}catch{return value||"N/A"}};
const researchConfigStatus=document.getElementById("research-config-status");
const researchForm=document.getElementById("research-form");
const researchPlatform=document.getElementById("research-platform");
const researchUsername=document.getElementById("research-username");
const researchSubmit=document.getElementById("research-submit");
const researchFormStatus=document.getElementById("research-form-status");
const researchResult=document.getElementById("research-result");

function researchSetConfig(text,error=false){if(!researchConfigStatus)return;researchConfigStatus.textContent=text;researchConfigStatus.className="loading-copy research-config-status"+(error?" error-copy":"")}
function researchStat(label,value){const item=document.createElement("article");item.className="research-stat";const name=document.createElement("span");name.textContent=label;const number=document.createElement("strong");number.textContent=researchFormatNumber(value);item.append(name,number);return item}

function researchRender(data){
  if(!researchResult)return;
  researchResult.replaceChildren();researchResult.hidden=false;
  const profile=data.profile||{};const head=document.createElement("div");head.className="research-profile-head";
  const copy=document.createElement("div");const title=document.createElement("h3");title.textContent=profile.name||("@"+data.username);const username=document.createElement("p");username.textContent="@"+(profile.username||data.username)+" · Threads";copy.append(title,username);head.append(copy);
  if(profile.verified===true){const verified=document.createElement("span");verified.className="research-verified";verified.textContent="Verified";head.append(verified)}
  researchResult.append(head);
  const stats=profile.statistic||{};const statGrid=document.createElement("div");statGrid.className="research-stat-grid";for(const [label,value] of [["Followers",stats.followers],["Views",stats.views],["Likes",stats.likes],["Replies",stats.replies],["Reposts",stats.reposts]])statGrid.append(researchStat(label,value));researchResult.append(statGrid);
  const heading=document.createElement("h4");heading.className="research-content-heading";heading.textContent="Konten publik terbaru yang dikembalikan API";researchResult.append(heading);
  const list=document.createElement("div");list.className="research-content-list";const items=Array.isArray(data.recentContent)?data.recentContent:[];
  if(items.length===0){const empty=document.createElement("p");empty.className="research-empty";empty.textContent=data.contentStatus==="too_large"?"Profil berhasil diaudit, tetapi halaman konten Repliz melewati batas aman 2 MB.":data.contentStatus==="unavailable"?"Daftar konten belum tersedia pada akses Repliz ini.":"Tidak ada konten publik yang dikembalikan.";list.append(empty)}
  for(const item of items){const row=document.createElement("article");row.className="research-content-item";const itemCopy=document.createElement("div");const itemTitle=document.createElement("strong");itemTitle.textContent=item.title||"Tanpa judul";const itemMeta=document.createElement("small");itemMeta.textContent=[item.type,item.createdAt?researchFormatDate(item.createdAt):""].filter(Boolean).join(" · ");itemCopy.append(itemTitle,itemMeta);row.append(itemCopy);if(item.url){const link=document.createElement("a");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Buka";row.append(link)}list.append(row)}
  researchResult.append(list);
  const notes=document.createElement("ul");notes.className="research-note-list";for(const note of Array.isArray(data.notes)?data.notes:[]){const item=document.createElement("li");item.textContent=note;notes.append(item)}researchResult.append(notes);
}

async function loadResearchStatus(){
  try{const data=await researchReadJson(await fetch("/api/research/status",{headers:{Accept:"application/json"}}));if(!data.configured){researchSetConfig("Credential Repliz belum tersedia untuk Research.",true);return}researchSetConfig("Research Threads aktif dalam mode read-only. Data yang tidak tersedia tidak ditebak.");if(researchForm)researchForm.hidden=false}
  catch(error){researchSetConfig(error instanceof Error?error.message:"Research belum tersedia.",true)}
}

researchForm?.addEventListener("submit",async(event)=>{
  event.preventDefault();const username=String(researchUsername?.value||"").trim();if(!username)return;
  if(researchSubmit){researchSubmit.disabled=true;researchSubmit.textContent="Mengaudit…"}if(researchFormStatus)researchFormStatus.textContent="";if(researchResult)researchResult.hidden=true;
  try{const query=new URLSearchParams({platform:String(researchPlatform?.value||"threads"),username});const data=await researchReadJson(await fetch("/api/research/kols?"+query.toString(),{headers:{Accept:"application/json"}}));researchRender(data);if(researchFormStatus)researchFormStatus.textContent="Audit selesai. Tidak ada tindakan engagement yang dikirim."}
  catch(error){if(researchFormStatus)researchFormStatus.textContent=error instanceof Error?error.message:"Audit Threads gagal."}
  finally{if(researchSubmit){researchSubmit.disabled=false;researchSubmit.textContent="Audit akun"}}
});

void loadResearchStatus();
`;
