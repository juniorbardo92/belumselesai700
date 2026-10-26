export const draftEditorHtml = `
  <dialog id="draft-editor" class="draft-editor-dialog" aria-labelledby="draft-editor-title">
    <form id="draft-editor-form" method="dialog">
      <div class="draft-editor-head">
        <div>
          <p class="eyebrow">CONTENT EDITOR</p>
          <h2 id="draft-editor-title">Edit isi draft</h2>
          <small id="draft-editor-meta">—</small>
        </div>
        <button id="draft-editor-close" class="draft-editor-close" type="button" aria-label="Tutup">×</button>
      </div>
      <div class="draft-editor-body">
        <label>Judul konten
          <input id="draft-edit-title" type="text" maxlength="240" autocomplete="off">
        </label>
        <div class="draft-editor-grid">
          <label>Slide
            <select id="draft-edit-slide"></select>
          </label>
          <label>Judul slide
            <input id="draft-edit-headline" type="text" maxlength="240" autocomplete="off">
            <small id="draft-edit-headline-note"></small>
          </label>
        </div>
        <label>Isi slide
          <textarea id="draft-edit-body" rows="8"></textarea>
          <small id="draft-edit-counter">0 karakter</small>
        </label>
        <p class="draft-editor-safety">
          Perubahan disimpan sebagai revisi draft. Render lama dibatalkan, render ulang dan persetujuan manusia tetap wajib.
        </p>
        <p id="draft-editor-status" class="form-status" role="status"></p>
      </div>
      <div class="draft-editor-actions">
        <button id="draft-editor-cancel" class="secondary" type="button">Batal</button>
        <button id="draft-editor-save" class="primary" type="button">Simpan isi</button>
      </div>
    </form>
  </dialog>`;

export const draftEditorStyles = `
.edit-content-trigger{padding:9px 12px;border:1px solid #d6c4a7;border-radius:9px;background:#fff;color:#5f4219;font-weight:750;cursor:pointer}.edit-content-trigger:disabled{opacity:.5;cursor:not-allowed}.draft-editor-dialog{width:min(820px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:1px solid var(--line);border-radius:18px;background:var(--paper);color:var(--ink);box-shadow:0 30px 90px rgba(30,18,10,.32)}.draft-editor-dialog::backdrop{background:rgba(30,20,14,.64);backdrop-filter:blur(3px)}.draft-editor-dialog form{margin:0}.draft-editor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid var(--line)}.draft-editor-head h2{margin:0;font-family:Georgia,serif;font-size:25px}.draft-editor-head small{display:block;margin-top:6px;color:var(--muted)}.draft-editor-close{width:38px;height:38px;border:1px solid var(--line);border-radius:50%;background:#fff;color:var(--red);font-size:25px;cursor:pointer}.draft-editor-body{display:grid;gap:16px;padding:24px;max-height:calc(100vh - 190px);overflow:auto}.draft-editor-body label{font-size:11px;font-weight:800;color:var(--ink)}.draft-editor-body input,.draft-editor-body select,.draft-editor-body textarea{display:block;width:100%;margin-top:7px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.draft-editor-body textarea{resize:vertical;line-height:1.55}.draft-editor-body input:focus,.draft-editor-body select:focus,.draft-editor-body textarea:focus{outline:2px solid rgba(158,27,19,.2);border-color:var(--red)}.draft-editor-body input[readonly]{background:#f4efe6;color:var(--muted)}.draft-editor-body label small{display:block;margin-top:5px;color:var(--muted);font-size:10px;font-weight:500}.draft-editor-grid{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr);gap:12px}.draft-editor-safety{margin:0;padding:12px 13px;border:1px solid #ead3a1;border-radius:10px;background:#fff8e8;color:#76582d;font-size:11px;line-height:1.55}.draft-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;border-top:1px solid var(--line);background:#fffaf4}.draft-editor-actions .primary{cursor:pointer}@media(max-width:620px){.draft-editor-grid{grid-template-columns:1fr}.draft-editor-body,.draft-editor-head,.draft-editor-actions{padding:16px}}
`;

export const draftEditorScript = `
const draftEditorDialog=document.getElementById('draft-editor');
const draftEditorStatus=document.getElementById('draft-editor-status');
const draftEditTitle=document.getElementById('draft-edit-title');
const draftEditSlide=document.getElementById('draft-edit-slide');
const draftEditHeadline=document.getElementById('draft-edit-headline');
const draftEditHeadlineNote=document.getElementById('draft-edit-headline-note');
const draftEditBody=document.getElementById('draft-edit-body');
const draftEditCounter=document.getElementById('draft-edit-counter');
let draftEditorState=null;
let draftEditorCurrent=1;

const draftEditorRead=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false){const error=new Error(data.error||('Status '+response.status));error.code=data.code;throw error}return data};
const draftEditorSlide=()=>draftEditorState?.content.slides.find((slide)=>slide.number===draftEditorCurrent)||null;

function draftEditorCapture(){
  if(!draftEditorState)return;
  const slide=draftEditorSlide();
  if(!slide)return;
  slide.body=String(draftEditBody.value||'');
  if(slide.headlineEditable)slide.headline=String(draftEditHeadline.value||'');
}

function draftEditorUpdateCounter(){
  if(!draftEditorState)return;
  const maximum=draftEditorState.content.limits.body;
  draftEditCounter.textContent=draftEditBody.value.length+' / '+maximum+' karakter';
}

function draftEditorRenderSlide(){
  const slide=draftEditorSlide();
  if(!slide)return;
  draftEditHeadline.value=slide.headline;
  draftEditHeadline.readOnly=!slide.headlineEditable;
  draftEditHeadlineNote.textContent=slide.headlineEditable?'Judul slide dapat diedit.':'Judul slide mengikuti struktur utas dan tidak dapat diedit.';
  draftEditBody.maxLength=draftEditorState.content.limits.body;
  draftEditBody.value=slide.body;
  draftEditorUpdateCounter();
}

function draftEditorBuildOptions(){
  draftEditSlide.replaceChildren();
  for(const slide of draftEditorState.content.slides){
    const option=document.createElement('option');
    option.value=String(slide.number);
    option.textContent='Slide '+slide.number+' — '+slide.headline.slice(0,42);
    draftEditSlide.append(option);
  }
}

async function draftEditorOpen(contentItemId){
  try{
    draftEditorStatus.textContent='Memuat isi draft…';
    const data=await draftEditorRead(await fetch('/api/content/'+encodeURIComponent(contentItemId)+'/draft',{headers:{Accept:'application/json'}}));
    if(!data.editable)throw new Error('Tarik persetujuan sebelum mengubah isi.');
    draftEditorState=data;
    draftEditorCurrent=data.content.slides[0].number;
    draftEditTitle.value=data.content.title;
    draftEditTitle.maxLength=data.content.limits.title;
    document.getElementById('draft-editor-meta').textContent='Revisi '+data.content.version+' · '+data.content.slides.length+' slide · '+data.content.platform;
    draftEditorBuildOptions();
    draftEditSlide.value=String(draftEditorCurrent);
    draftEditorRenderSlide();
    draftEditorStatus.textContent='';
    draftEditorDialog.showModal();
  }catch(error){
    draftEditorStatus.textContent='';
    window.alert(error instanceof Error?error.message:'Editor isi gagal dibuka.');
  }
}

document.addEventListener('click',(event)=>{
  const target=event.target instanceof Element?event.target.closest('button[data-edit-content-id]'):null;
  if(target instanceof HTMLButtonElement&&target.dataset.editContentId)void draftEditorOpen(target.dataset.editContentId);
});
draftEditSlide?.addEventListener('change',()=>{
  draftEditorCapture();
  draftEditorCurrent=Number(draftEditSlide.value);
  draftEditorRenderSlide();
});
draftEditBody?.addEventListener('input',draftEditorUpdateCounter);
document.getElementById('draft-editor-close')?.addEventListener('click',()=>draftEditorDialog.close());
document.getElementById('draft-editor-cancel')?.addEventListener('click',()=>draftEditorDialog.close());
document.getElementById('draft-editor-save')?.addEventListener('click',async()=>{
  if(!draftEditorState)return;
  draftEditorCapture();
  const button=document.getElementById('draft-editor-save');
  button.disabled=true;
  draftEditorStatus.textContent='Menyimpan revisi…';
  try{
    const content=draftEditorState.content;
    const payload={
      expectedVersion:content.version,
      title:String(draftEditTitle.value||''),
      slides:content.slides.map((slide)=>({number:slide.number,headline:slide.headline,body:slide.body}))
    };
    const data=await draftEditorRead(await fetch('/api/content/'+encodeURIComponent(content.id)+'/draft',{
      method:'PATCH',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload)
    }));
    draftEditorState=data;
    draftEditorStatus.textContent=data.unchanged?'Tidak ada perubahan isi.':'Isi tersimpan sebagai revisi '+data.content.version+'. Render ulang wajib.';
    if(typeof loadRendererLibrary==='function')await loadRendererLibrary();
    if(typeof loadRendererJobs==='function')await loadRendererJobs();
    setTimeout(()=>draftEditorDialog.close(),1000);
  }catch(error){
    draftEditorStatus.textContent=error instanceof Error?error.message:'Isi draft gagal disimpan.';
  }finally{
    button.disabled=false;
  }
});
`;
