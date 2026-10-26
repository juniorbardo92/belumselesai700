export const rendererLibraryHtml = `
      <section id="library" class="panel library-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">CONTENT LIBRARY</p><h2>Draft siap dirender</h2></div>
          <span id="library-count" class="badge">0 draft</span>
        </div>
        <div id="content-library" class="content-list" aria-live="polite">
          <p class="loading-copy">Memuat draft…</p>
        </div>
      </section>`;

export const rendererQueueHtml = `
          <div id="render-queue" class="queue-list" aria-live="polite">
            <p class="loading-copy">Memuat antrean…</p>
          </div>`;

export const rendererStyles = `
.library-panel{margin-bottom:22px}.content-list,.queue-list{display:grid;gap:11px;margin-top:20px}.content-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px;border:1px solid var(--line);border-radius:12px;background:#fff}.content-row strong,.content-row small,.queue-item strong,.queue-item small{display:block}.content-row strong,.queue-item strong{font-size:13px}.content-row small,.queue-item small{margin-top:5px;color:var(--muted);font-size:11px}.content-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:6px}.content-meta small{margin-top:0}.content-status{padding:4px 7px;border-radius:999px;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.05em;background:#eee;color:#625b55}.content-status.approved{background:#e5f6ee;color:#176b49}.content-status.draft,.content-status.review{background:#fff0c9;color:#7c5610}.row-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.secondary,.approval-button{padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--red);font-weight:750;cursor:pointer}.approval-button{border-color:#b9dcca;color:#176b49;background:#f2fbf7}.approval-button.revoke{border-color:#edc6bb;color:#8c2118;background:#fff7f5}.secondary:disabled,.approval-button:disabled{opacity:.5;cursor:not-allowed}.loading-copy{margin:0;color:var(--muted);font-size:12px}.job-status{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#eee;color:#625b55}.job-status.running,.job-status.queued{background:#fff0c9;color:#7c5610}.job-status.completed{background:#e5f6ee;color:#176b49}.job-status.failed{background:#fbe2df;color:#8c2118}.preview-grid{display:grid;grid-template-columns:repeat(5,minmax(70px,1fr));gap:8px;margin-top:12px}.preview-grid a{display:block}.preview-grid img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#eadfcf}.queue-item{padding:15px;border:1px solid var(--line);border-radius:12px;background:#fff}.queue-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.queue-links{display:flex;gap:10px;margin-top:10px}.queue-links a{color:var(--red);font-size:11px;font-weight:750}.error-copy{color:#9e1b13!important}
`;

export const rendererScript = `
const rendererFormatDate=(value)=>{try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value))}catch{return value||'—'}};
const rendererSetStatus=(ok,text)=>{const dot=document.getElementById('renderer-dot');const label=document.getElementById('renderer-status');if(dot)dot.className='status-dot '+(ok?'ok':'error');if(label)label.textContent=text};
const rendererReadJson=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||('Status '+response.status));return data};
const rendererLibrary=document.getElementById('content-library');
const rendererLibraryCount=document.getElementById('library-count');
const rendererQueue=document.getElementById('render-queue');
let rendererReady=false;

async function loadRendererStatus(){
  try{
    const data=await rendererReadJson(await fetch('/api/status',{headers:{Accept:'application/json'}}));
    rendererReady=Boolean(data.renderer&&data.renderer.configured);
    rendererSetStatus(rendererReady,rendererReady?'GitHub aktif':'Token belum ada');
  }catch{
    rendererReady=false;
    rendererSetStatus(false,'Belum tersedia');
  }
}

async function loadRendererLibrary(){
  if(!rendererLibrary||!rendererLibraryCount)return;
  try{
    const data=await rendererReadJson(await fetch('/api/content',{headers:{Accept:'application/json'}}));
    rendererLibrary.replaceChildren();
    rendererLibraryCount.textContent=data.items.length+' draft';
    if(data.items.length===0){
      const empty=document.createElement('p');empty.className='loading-copy';empty.textContent='Belum ada draft yang siap dirender.';rendererLibrary.append(empty);return;
    }
    for(const item of data.items){
      const row=document.createElement('article');row.className='content-row';
      const copy=document.createElement('div');
      const title=document.createElement('strong');title.textContent=item.title;
      const metaWrap=document.createElement('div');metaWrap.className='content-meta';
      const meta=document.createElement('small');meta.textContent=rendererFormatDate(item.createdAt)+' · revisi '+item.version+' · '+item.slideCount+' slide · '+item.assetCount+' aset';
      const contentStatus=document.createElement('span');contentStatus.className='content-status '+item.status;contentStatus.textContent=item.status;
      metaWrap.append(meta,contentStatus);copy.append(title,metaWrap);
      const actions=document.createElement('div');actions.className='row-actions';
      const button=document.createElement('button');button.className='secondary';button.type='button';button.dataset.contentId=item.id;button.textContent='Render carousel';
      button.disabled=!rendererReady||!item.renderable;
      button.title=!rendererReady?'Tambahkan GITHUB_ACTIONS_TOKEN di Worker':(!item.renderable?'Struktur carousel belum valid':'Render ke Instagram dan TikTok');
      const edit=document.createElement('button');edit.className='edit-content-trigger';edit.type='button';edit.dataset.editContentId=item.id;edit.textContent='Edit isi';edit.disabled=item.status==='approved';edit.title=edit.disabled?'Tarik persetujuan sebelum mengubah isi':'Edit judul dan teks setiap slide';
      const design=document.createElement('button');design.className='design-trigger';design.type='button';design.dataset.designContentId=item.id;design.textContent='Atur desain';design.disabled=item.status==='approved';design.title=design.disabled?'Tarik persetujuan sebelum mengubah desain':'Atur gaya, warna, huruf, gambar, dan logo';
      const approval=document.createElement('button');approval.className='approval-button'+(item.status==='approved'?' revoke':'');approval.type='button';approval.dataset.approvalContentId=item.id;approval.dataset.approvalAction=item.status==='approved'?'revoke':'approve';approval.textContent=item.status==='approved'?'Tarik persetujuan':'Setujui konten';
      approval.disabled=item.status!=='approved'&&!item.approvalReady;
      approval.title=approval.disabled?'Render carousel harus selesai sebelum disetujui':(item.status==='approved'?'Kembalikan konten menjadi draft':'Izinkan masuk tahap Publisher');
      actions.append(edit,design,button,approval);row.append(copy,actions);rendererLibrary.append(row);
    }
  }catch(error){
    rendererLibrary.replaceChildren();
    const message=document.createElement('p');message.className='loading-copy error-copy';message.textContent=error instanceof Error?error.message:'Draft gagal dimuat.';rendererLibrary.append(message);
  }
}

async function startRendererJob(contentItemId,button){
  button.disabled=true;button.textContent='Mengantrekan…';
  try{
    const data=await rendererReadJson(await fetch('/api/render-jobs',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({contentItemId})}));
    button.textContent='Masuk antrean';
    await Promise.all([loadRendererJobs(),loadRendererStatus()]);
    if(data.githubUrl)window.open(data.githubUrl,'_blank','noopener');
  }catch(error){
    button.disabled=false;button.textContent='Render carousel';
    window.alert(error instanceof Error?error.message:'Renderer gagal dimulai.');
  }
}

rendererLibrary?.addEventListener('click',(event)=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  const approval=target.closest('button[data-approval-content-id]');
  if(approval instanceof HTMLButtonElement&&approval.dataset.approvalContentId&&approval.dataset.approvalAction){
    void updateContentApproval(approval.dataset.approvalContentId,approval.dataset.approvalAction,approval);return;
  }
  const button=target.closest('button[data-content-id]');
  if(!(button instanceof HTMLButtonElement)||!button.dataset.contentId)return;
  void startRendererJob(button.dataset.contentId,button);
});

async function updateContentApproval(contentItemId,action,button){
  const original=button.textContent;button.disabled=true;button.textContent=action==='approve'?'Menyetujui…':'Menarik…';
  try{
    await rendererReadJson(await fetch('/api/content/'+encodeURIComponent(contentItemId)+'/approval',{method:'PATCH',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action})}));
    await loadRendererLibrary();
  }catch(error){
    button.disabled=false;button.textContent=original;window.alert(error instanceof Error?error.message:'Persetujuan gagal diproses.');
  }
}

function addRendererPreview(container,assets){
  const images=assets.filter((asset)=>asset.platform==='instagram').slice(0,5);
  if(images.length===0)return;
  const grid=document.createElement('div');grid.className='preview-grid';
  for(const asset of images){
    const link=document.createElement('a');link.href=asset.public_url;link.target='_blank';link.rel='noopener';
    const image=document.createElement('img');image.src=asset.public_url;image.alt='Preview slide carousel';image.loading='lazy';
    link.append(image);grid.append(link);
  }
  container.append(grid);
}

async function loadRendererJobs(){
  if(!rendererQueue)return;
  try{
    const data=await rendererReadJson(await fetch('/api/render-jobs',{headers:{Accept:'application/json'}}));
    rendererQueue.replaceChildren();
    if(data.jobs.length===0){
      const empty=document.createElement('p');empty.className='loading-copy';empty.textContent='Belum ada pekerjaan render.';rendererQueue.append(empty);return;
    }
    for(const job of data.jobs){
      const item=document.createElement('article');item.className='queue-item';
      const head=document.createElement('div');head.className='queue-item-head';
      const copy=document.createElement('div');
      const title=document.createElement('strong');title.textContent=job.title;
      const meta=document.createElement('small');meta.textContent=rendererFormatDate(job.createdAt)+(job.error?' · '+job.error:'');
      if(job.error)meta.className='error-copy';
      copy.append(title,meta);
      const status=document.createElement('span');status.className='job-status '+job.status;status.textContent=job.status;
      head.append(copy,status);item.append(head);
      if(job.githubUrl||job.status==='completed'){
        const links=document.createElement('div');links.className='queue-links';
        if(job.githubUrl){const link=document.createElement('a');link.href=job.githubUrl;link.target='_blank';link.rel='noopener';link.textContent='GitHub Actions';links.append(link)}
        if(job.status==='completed'){const manifest=document.createElement('a');manifest.href=job.manifestUrl;manifest.target='_blank';manifest.rel='noopener';manifest.textContent='Manifest R2';links.append(manifest)}
        item.append(links);
      }
      if(job.status==='completed')addRendererPreview(item,job.assets||[]);
      rendererQueue.append(item);
    }
  }catch(error){
    rendererQueue.replaceChildren();
    const message=document.createElement('p');message.className='loading-copy error-copy';message.textContent=error instanceof Error?error.message:'Antrean gagal dimuat.';rendererQueue.append(message);
  }
}

async function bootstrapRenderer(){
  await loadRendererStatus();
  await Promise.all([loadRendererLibrary(),loadRendererJobs()]);
}
void bootstrapRenderer();
setInterval(()=>{void Promise.all([loadRendererLibrary(),loadRendererJobs()])},15000);

const generationStatus=document.getElementById('content-form-status');
if(generationStatus){
  new MutationObserver(()=>{if(generationStatus.textContent&&generationStatus.textContent.includes('berhasil'))void loadRendererLibrary()}).observe(generationStatus,{childList:true,subtree:true});
}
`;
