export const contentPackImportHtml = `
<section id="content-pack-import" class="panel content-pack-import-panel">
  <div class="panel-heading">
    <div>
      <p class="eyebrow">KALYANAMITRA IMPORTER</p>
      <h2>Impor draft dari skill manual</h2>
    </div>
    <span class="badge">Draft-only</span>
  </div>
  <p class="content-pack-intro">
    Hanya menerima <code>*.content-pack.json</code>. Idea Inbox dan Viral Research Pack adalah bahan
    perencanaan dan akan ditolak. Dry-run tidak membuat konten; impor baru berjalan setelah konfirmasi admin.
  </p>
  <form id="content-pack-import-form" class="content-pack-form">
    <label for="content-pack-file">Content pack JSON
      <input id="content-pack-file" name="contentPack" type="file" accept="application/json,.json" required>
    </label>
    <div class="content-pack-credentials">
      <label for="content-pack-admin">Telegram admin ID
        <input id="content-pack-admin" name="adminId" inputmode="numeric" autocomplete="off" required
          pattern="[0-9]{3,24}" placeholder="Contoh: 123456789">
      </label>
      <label for="content-pack-token">Importer token
        <input id="content-pack-token" name="token" type="password" autocomplete="off" required
          minlength="24" placeholder="Tidak disimpan di browser">
      </label>
    </div>
    <div class="form-actions">
      <button id="content-pack-dry-run" class="primary" type="submit">Jalankan dry-run</button>
      <button id="content-pack-confirm" class="secondary" type="button" hidden>Konfirmasi impor draft</button>
      <p id="content-pack-status" class="form-status" role="status" aria-live="polite"></p>
    </div>
  </form>
  <div id="content-pack-report" class="content-pack-report" hidden>
    <div class="content-pack-metrics">
      <span><small>Draft diterima</small><strong data-pack-metric="received">0</strong></span>
      <span><small>Valid baru</small><strong data-pack-metric="valid">0</strong></span>
      <span><small>Duplikat</small><strong data-pack-metric="duplicates">0</strong></span>
      <span><small>Perlu review sumber</small><strong data-pack-metric="sourceReview">0</strong></span>
      <span><small>Ditolak</small><strong data-pack-metric="rejected">0</strong></span>
    </div>
    <pre id="content-pack-details" class="content-pack-details"></pre>
  </div>
  <p class="content-pack-safety"><strong>Pengaman tetap:</strong> status draft, approval manusia wajib, tanpa panggilan DeepSeek, renderer, Repliz, penjadwalan, atau publikasi.</p>
</section>`;

export const contentPackImportStyles = `
.content-pack-import-panel{margin-bottom:22px}.content-pack-intro{max-width:880px;color:var(--muted);font-size:13px;line-height:1.65}.content-pack-intro code{padding:2px 5px;border-radius:5px;background:#f1e5d0;color:var(--red-dark)}.content-pack-form{display:grid;gap:16px;margin-top:18px}.content-pack-form label{font-size:12px;font-weight:800}.content-pack-form input{display:block;width:100%;margin-top:7px;padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.content-pack-form input:focus{outline:2px solid rgba(158,27,19,.2);border-color:var(--red)}.content-pack-credentials{display:grid;grid-template-columns:minmax(180px,.6fr) minmax(260px,1.4fr);gap:14px}.secondary{padding:11px 17px;border:1px solid var(--red);border-radius:10px;background:#fff;color:var(--red-dark);font-weight:750}.secondary:disabled{opacity:.55;cursor:not-allowed}.content-pack-report{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:12px;background:#fff}.content-pack-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.content-pack-metrics span{padding:12px;border-radius:10px;background:#f7efe2}.content-pack-metrics small,.content-pack-metrics strong{display:block}.content-pack-metrics small{color:var(--muted);font-size:10px;line-height:1.35}.content-pack-metrics strong{margin-top:5px;font-family:Georgia,serif;font-size:23px}.content-pack-details{max-height:280px;overflow:auto;margin:14px 0 0;padding:13px;border-radius:9px;background:#241811;color:#f7e8c7;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}.content-pack-safety{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.55}@media(max-width:760px){.content-pack-credentials{grid-template-columns:1fr}.content-pack-metrics{grid-template-columns:1fr 1fr}}
`;

export const contentPackImportScript = `
(()=>{
  const form=document.getElementById('content-pack-import-form');
  const fileInput=document.getElementById('content-pack-file');
  const adminInput=document.getElementById('content-pack-admin');
  const tokenInput=document.getElementById('content-pack-token');
  const dryRunButton=document.getElementById('content-pack-dry-run');
  const confirmButton=document.getElementById('content-pack-confirm');
  const status=document.getElementById('content-pack-status');
  const report=document.getElementById('content-pack-report');
  const details=document.getElementById('content-pack-details');
  let pending=null;

  const metric=(name,value)=>{
    const element=document.querySelector('[data-pack-metric="'+name+'"]');
    if(element)element.textContent=new Intl.NumberFormat('id-ID').format(Number(value||0));
  };
  const show=(payload)=>{
    if(!report||!details)return;
    metric('received',payload.drafts_received);
    metric('valid',payload.valid??payload.created);
    metric('duplicates',payload.duplicates);
    metric('sourceReview',payload.source_review_required);
    metric('rejected',payload.rejected);
    const safe={...payload};
    delete safe.confirmation_token;
    details.textContent=JSON.stringify(safe,null,2);
    report.hidden=false;
  };
  const setBusy=(busy)=>{
    if(dryRunButton)dryRunButton.disabled=busy;
    if(confirmButton)confirmButton.disabled=busy;
  };
  const readJson=async(response)=>{
    try{return await response.json()}catch{return {ok:false,error:'Content OS mengembalikan respons yang tidak valid.'}}
  };
  const clearPending=()=>{
    pending=null;
    if(confirmButton)confirmButton.hidden=true;
  };

  fileInput?.addEventListener('change',clearPending);
  adminInput?.addEventListener('input',clearPending);
  tokenInput?.addEventListener('input',clearPending);

  form?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    clearPending();
    const file=fileInput?.files?.[0];
    const adminId=String(adminInput?.value||'').trim();
    const token=String(tokenInput?.value||'').trim();
    if(!file||!file.name.toLowerCase().endsWith('.content-pack.json')){
      if(status)status.textContent='Pilih file dengan akhiran .content-pack.json.';
      return;
    }
    if(file.size>8*1024*1024){
      if(status)status.textContent='Ukuran file maksimal 8 MB.';
      return;
    }
    if(!/^\\d{3,24}$/.test(adminId)||token.length<24){
      if(status)status.textContent='Admin ID atau token belum valid.';
      return;
    }
    setBusy(true);
    if(status)status.textContent='Memvalidasi dan memeriksa duplikat…';
    try{
      const raw=await file.text();
      const response=await fetch('/api/content-packs/dry-run',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/json',
          'X-OpenClaw-Token':token,
          'X-Content-OS-Admin':'telegram:'+adminId,
          'X-Content-Pack-Filename':file.name
        },
        body:raw,
        credentials:'same-origin',
        cache:'no-store',
        redirect:'error'
      });
      const payload=await readJson(response);
      show(payload);
      if(!response.ok||!payload.ok)throw new Error(payload.error||'Dry-run ditolak.');
      pending={importId:payload.import_id,confirmationToken:payload.confirmation_token,adminId,token};
      if(tokenInput)tokenInput.value='';
      if(confirmButton)confirmButton.hidden=false;
      if(status)status.textContent='Dry-run lolos. Periksa ringkasan lalu konfirmasi dalam 15 menit.';
    }catch(error){
      if(status)status.textContent=error instanceof Error?error.message:'Dry-run gagal.';
    }finally{
      setBusy(false);
    }
  });

  confirmButton?.addEventListener('click',async()=>{
    if(!pending){
      if(status)status.textContent='Jalankan dry-run terlebih dahulu.';
      return;
    }
    if(!window.confirm('Impor semua item valid sebagai DRAFT? Tindakan ini tidak memublikasikan atau menjadwalkan konten.'))return;
    setBusy(true);
    if(status)status.textContent='Mengimpor draft secara transaksional…';
    try{
      const response=await fetch('/api/content-packs/'+encodeURIComponent(pending.importId)+'/confirm',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/json',
          'X-OpenClaw-Token':pending.token,
          'X-Content-OS-Admin':'telegram:'+pending.adminId
        },
        body:JSON.stringify({confirmation_token:pending.confirmationToken}),
        credentials:'same-origin',
        cache:'no-store',
        redirect:'error'
      });
      const payload=await readJson(response);
      show(payload);
      if(!response.ok||!payload.ok)throw new Error(payload.error||'Konfirmasi ditolak.');
      if(status)status.textContent='Selesai: '+Number(payload.created||0)+' draft baru; '+Number(payload.duplicates||0)+' duplikat dilewati.';
      clearPending();
      if(tokenInput)tokenInput.value='';
    }catch(error){
      if(status)status.textContent=error instanceof Error?error.message:'Konfirmasi gagal.';
    }finally{
      setBusy(false);
    }
  });
})();
`;
