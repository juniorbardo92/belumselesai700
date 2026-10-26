export const designStudioHtml = `
  <dialog id="design-studio" class="design-dialog" aria-labelledby="design-title">
    <form id="design-form" method="dialog">
      <div class="design-dialog-head">
        <div><p class="eyebrow">INSTAGRAM DESIGN STUDIO</p><h2 id="design-title">Atur desain carousel</h2><small id="design-content-title">—</small></div>
        <button id="design-close" class="design-close" type="button" aria-label="Tutup">×</button>
      </div>
      <div class="design-layout">
        <div class="design-controls">
          <label>Gaya desain
            <select id="design-preset">
              <option value="brand">Brand merah–emas</option>
              <option value="minimalist">Minimalis</option>
              <option value="elegant">Elegan</option>
              <option value="bold">Bold</option>
              <option value="editorial">Editorial</option>
            </select>
          </label>
          <fieldset class="design-fieldset"><legend>Warna</legend>
            <div class="design-color-grid">
              <label>Latar <input id="design-background" type="color"></label>
              <label>Utama <input id="design-primary" type="color"></label>
              <label>Aksen <input id="design-accent" type="color"></label>
              <label>Teks <input id="design-text" type="color"></label>
            </div>
          </fieldset>
          <div class="design-two-columns">
            <label>Huruf judul<select id="design-heading-font"><option value="classic">Klasik</option><option value="modern">Modern</option><option value="editorial">Editorial</option><option value="rounded">Rounded</option></select></label>
            <label>Huruf isi<select id="design-body-font"><option value="sans">Sans</option><option value="classic">Klasik</option><option value="modern">Modern</option></select></label>
          </div>
          <fieldset class="design-fieldset"><legend>Logo</legend>
            <label class="design-file">Ganti logo <input id="design-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <div class="design-two-columns">
              <label>Posisi<select id="design-logo-position"><option value="top-right">Kanan atas</option><option value="top-left">Kiri atas</option><option value="bottom-right">Kanan bawah</option><option value="bottom-left">Kiri bawah</option></select></label>
              <label>Ukuran<select id="design-logo-size"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select></label>
            </div>
            <button id="design-default-logo" class="design-link-button" type="button">Gunakan logo/segel bawaan</button>
          </fieldset>
          <fieldset class="design-fieldset"><legend>Gambar per slide</legend>
            <label>Slide<select id="design-slide-select"></select></label>
            <label class="design-file">Pilih gambar <input id="design-slide-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <label>Layout<select id="design-image-layout"><option value="right">Gambar di kanan</option><option value="background">Latar penuh</option></select></label>
            <button id="design-remove-image" class="design-link-button" type="button">Hapus gambar dari slide ini</button>
          </fieldset>
          <p id="design-status" class="form-status" role="status"></p>
        </div>
        <div class="design-preview-column">
          <div class="design-preview-toolbar"><strong>Preview Instagram 4:5</strong><small id="design-preview-page">—</small></div>
          <div id="design-preview" class="design-preview-card">
            <div class="design-preview-image" hidden></div><div class="design-preview-overlay"></div>
            <div class="design-preview-top"><span class="design-preview-brand">Merek</span><span class="design-preview-logo">—</span></div>
            <div class="design-preview-copy"><small>CATATAN PENTING</small><h3>Preview desain</h3><p>Pilih konten dari Content Library.</p><i></i></div>
            <div class="design-preview-footer"><span>UMKM Naik Kelas</span><span>01 / 01</span></div>
          </div>
          <p class="design-note">Gambar/logo maksimal 5 MB: PNG, JPG, atau WebP. Perubahan desain harus dirender ulang sebelum approval.</p>
        </div>
      </div>
      <div class="design-dialog-actions">
        <button id="design-cancel" class="secondary" type="button">Batal</button>
        <button id="design-save" class="primary" type="button">Simpan desain</button>
      </div>
    </form>
  </dialog>`;

export const designStudioStyles = `
.design-trigger{padding:9px 12px;border:1px solid #d5b66e;border-radius:9px;background:#fff9e9;color:#75510d;font-weight:750;cursor:pointer}.design-trigger:disabled{opacity:.5;cursor:not-allowed}.design-dialog{width:min(1160px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:1px solid var(--line);border-radius:18px;background:var(--paper);color:var(--ink);box-shadow:0 30px 90px rgba(30,18,10,.32)}.design-dialog::backdrop{background:rgba(30,20,14,.64);backdrop-filter:blur(3px)}.design-dialog form{margin:0}.design-dialog-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid var(--line)}.design-dialog-head h2{margin:0;font-family:Georgia,serif;font-size:25px}.design-dialog-head small{display:block;margin-top:6px;color:var(--muted)}.design-close{width:38px;height:38px;border:1px solid var(--line);border-radius:50%;background:#fff;color:var(--red);font-size:25px;cursor:pointer}.design-layout{display:grid;grid-template-columns:minmax(330px,.82fr) minmax(390px,1.18fr);gap:24px;padding:24px;max-height:calc(100vh - 190px);overflow:auto}.design-controls{display:grid;gap:14px}.design-controls label,.design-fieldset legend{font-size:11px;font-weight:800;color:var(--ink)}.design-controls select,.design-file input{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font:inherit;font-size:12px}.design-fieldset{margin:0;padding:13px;border:1px solid var(--line);border-radius:11px}.design-fieldset>label+label{margin-top:10px}.design-two-columns,.design-color-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.design-color-grid input{display:block;width:100%;height:42px;margin-top:6px;padding:3px;border:1px solid var(--line);border-radius:8px;background:#fff}.design-link-button{margin-top:10px;padding:0;border:0;background:none;color:var(--red);font-size:11px;font-weight:750;cursor:pointer}.design-preview-column{position:sticky;top:0;align-self:start}.design-preview-toolbar{display:flex;justify-content:space-between;margin-bottom:10px;font-size:12px}.design-preview-toolbar small{color:var(--muted)}.design-preview-card{--design-bg:#fffaf0;--design-primary:#9e1b13;--design-accent:#c69a3d;--design-text:#1b1612;--design-heading:Georgia,serif;--design-body:Arial,sans-serif;position:relative;isolation:isolate;width:min(100%,540px);aspect-ratio:4/5;margin:auto;overflow:hidden;border-radius:12px;background:linear-gradient(150deg,var(--design-bg),color-mix(in srgb,var(--design-bg),var(--design-accent) 22%));color:var(--design-text);box-shadow:0 16px 45px rgba(56,31,15,.14);padding:7.5% 7%}.design-preview-card:after{content:"";position:absolute;inset:2.4%;border:1px solid color-mix(in srgb,var(--design-primary),transparent 72%);border-radius:10px;z-index:-1}.design-preview-image{position:absolute;z-index:-3;background-position:center;background-size:cover}.design-preview-image.right{right:6%;top:25%;width:34%;height:50%;border-radius:10px}.design-preview-image.background{inset:0}.design-preview-overlay{position:absolute;z-index:-2;inset:0;display:none;background:linear-gradient(90deg,color-mix(in srgb,var(--design-bg),transparent 4%) 8%,color-mix(in srgb,var(--design-bg),transparent 16%) 62%,color-mix(in srgb,var(--design-bg),transparent 56%))}.design-preview-card.has-background .design-preview-overlay{display:block}.design-preview-top,.design-preview-footer{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:2;color:var(--design-primary);font:800 9px/1 var(--design-body);letter-spacing:.12em;text-transform:uppercase}.design-preview-logo{width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:var(--design-primary);color:var(--design-accent);border:1px solid var(--design-accent);font:17px/1 Georgia,serif;letter-spacing:0;background-position:center;background-size:contain;background-repeat:no-repeat}.design-preview-logo.custom{color:transparent;background-color:transparent;border:0}.design-preview-copy{position:relative;z-index:1;margin:27% 0 20%}.design-preview-card.has-right .design-preview-copy{max-width:58%}.design-preview-copy small{color:var(--design-primary);font:800 9px/1 var(--design-body);letter-spacing:.1em}.design-preview-copy h3{margin:12px 0 0;color:var(--design-primary);font:700 clamp(27px,4.2vw,50px)/1.04 var(--design-heading);letter-spacing:-.035em}.design-preview-copy p{margin:16px 0 0;color:var(--design-text);font:400 clamp(12px,1.6vw,19px)/1.42 var(--design-body)}.design-preview-copy i{display:block;width:58px;height:5px;margin-top:18px;border-radius:8px;background:var(--design-accent)}.design-preview-footer{position:absolute;left:7%;right:7%;bottom:7%}.design-note{margin:12px auto 0;max-width:540px;color:var(--muted);font-size:11px;line-height:1.55}.design-dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;border-top:1px solid var(--line);background:#fffaf4}.design-dialog-actions .primary{cursor:pointer}@media(max-width:850px){.design-layout{grid-template-columns:1fr}.design-preview-column{position:static}.design-dialog{max-height:calc(100vh - 16px)}.design-layout{max-height:calc(100vh - 175px)}}@media(max-width:520px){.design-two-columns,.design-color-grid{grid-template-columns:1fr}.design-layout{padding:16px}.design-dialog-head,.design-dialog-actions{padding:16px}}
`;

export const designStudioScript = `
const designDialog=document.getElementById('design-studio');
const designForm=document.getElementById('design-form');
const designStatus=document.getElementById('design-status');
const designPreset=document.getElementById('design-preset');
const designSlideSelect=document.getElementById('design-slide-select');
const designPreview=document.getElementById('design-preview');
let designState=null;

const designPresetValues={
  brand:{background:'#fffaf0',primary:'#9e1b13',accent:'#c69a3d',text:'#1b1612',heading:'classic',body:'sans'},
  minimalist:{background:'#ffffff',primary:'#181818',accent:'#b9b9b9',text:'#252525',heading:'modern',body:'sans'},
  elegant:{background:'#f7f1e7',primary:'#272018',accent:'#a98145',text:'#342c24',heading:'classic',body:'classic'},
  bold:{background:'#f4d52a',primary:'#161616',accent:'#e7482a',text:'#161616',heading:'rounded',body:'modern'},
  editorial:{background:'#f4f0e8',primary:'#1e2732',accent:'#9b2f2a',text:'#242424',heading:'editorial',body:'classic'}
};
const designFontMap={classic:'Georgia,serif',modern:'Trebuchet MS,Arial,sans-serif',editorial:'Times New Roman,Georgia,serif',rounded:'Arial Rounded MT Bold,Arial,sans-serif',sans:'Arial,Helvetica,sans-serif'};
const designEl=(id)=>document.getElementById(id);
const designRead=async(response)=>{const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||('Status '+response.status));return data};
const designCurrentSlide=()=>designState?.content.slides.find((slide)=>String(slide.number)===String(designSlideSelect?.value))||designState?.content.slides[0];

function designApplyInputs(){
  if(!designState)return;const value=designState.design;
  designPreset.value=value.preset;designEl('design-background').value=value.colors.background;designEl('design-primary').value=value.colors.primary;designEl('design-accent').value=value.colors.accent;designEl('design-text').value=value.colors.text;
  const usesBrandLogo=!value.logo.url&&Boolean(designState.content.brand?.logoUrl);
  designEl('design-heading-font').value=value.fonts.heading;designEl('design-body-font').value=value.fonts.body;designEl('design-logo-position').value=usesBrandLogo?designState.content.brand.logoPosition:value.logo.position;designEl('design-logo-size').value=usesBrandLogo?designState.content.brand.logoSize:value.logo.size;
  designSlideSelect.replaceChildren();for(const slide of designState.content.slides){const option=document.createElement('option');option.value=String(slide.number);option.textContent='Slide '+slide.number+' — '+slide.headline.slice(0,42);designSlideSelect.append(option)}
  designSyncSlideControls();designUpdatePreview();
}

function designSyncSlideControls(){const number=String(designSlideSelect.value);const config=designState?.design.slides[number];designEl('design-image-layout').value=config?.layout||'right'}

function designUpdatePreview(){
  if(!designState||!designPreview)return;const slide=designCurrentSlide();if(!slide)return;
  const style=designPreview.style;style.setProperty('--design-bg',designEl('design-background').value);style.setProperty('--design-primary',designEl('design-primary').value);style.setProperty('--design-accent',designEl('design-accent').value);style.setProperty('--design-text',designEl('design-text').value);style.setProperty('--design-heading',designFontMap[designEl('design-heading-font').value]);style.setProperty('--design-body',designFontMap[designEl('design-body-font').value]);
  const brand=designState.content.brand;designPreview.querySelector('.design-preview-brand').textContent=brand.label;designPreview.querySelector('.design-preview-copy small').textContent=slide.type==='hook'?brand.hookEyebrow.toUpperCase():designState.content.title;designPreview.querySelector('.design-preview-copy h3').textContent=slide.headline;designPreview.querySelector('.design-preview-copy p').textContent=slide.body;designPreview.querySelector('.design-preview-footer span:first-child').textContent=designState.content.title;designPreview.querySelector('.design-preview-footer span:last-child').textContent=String(slide.number).padStart(2,'0')+' / '+String(designState.content.slides.length).padStart(2,'0');designEl('design-preview-page').textContent='Slide '+slide.number;
  const imageBox=designPreview.querySelector('.design-preview-image');const config=designState.design.slides[String(slide.number)];const layout=config?.layout||'right';designPreview.classList.toggle('has-right',Boolean(config?.imageUrl)&&layout==='right');designPreview.classList.toggle('has-background',Boolean(config?.imageUrl)&&layout==='background');imageBox.className='design-preview-image '+layout;imageBox.hidden=!config?.imageUrl;imageBox.style.backgroundImage=config?.imageUrl?'url("'+config.imageUrl.replaceAll('"','')+'")':'';
  const logo=designPreview.querySelector('.design-preview-logo');const logoUrl=designState.design.logo.url||brand.logoUrl;logo.classList.toggle('custom',Boolean(logoUrl));logo.style.backgroundImage=logoUrl?'url("'+logoUrl.replaceAll('"','')+'")':'';logo.textContent=logoUrl?'':brand.fallbackMark;const sizes={small:'25px',medium:'31px',large:'40px'};logo.style.width=sizes[designEl('design-logo-size').value]||sizes.medium;logo.style.height=logo.style.width;
}

async function designOpen(contentItemId){
  try{designStatus.textContent='Memuat desain…';const data=await designRead(await fetch('/api/content/'+encodeURIComponent(contentItemId)+'/design',{headers:{Accept:'application/json'}}));designState=data;designEl('design-content-title').textContent=data.content.title;designApplyInputs();designStatus.textContent='';designDialog.showModal()}catch(error){window.alert(error instanceof Error?error.message:'Design Studio gagal dibuka.')}
}

document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest('button[data-design-content-id]'):null;if(target instanceof HTMLButtonElement&&target.dataset.designContentId)void designOpen(target.dataset.designContentId)});
designEl('design-close')?.addEventListener('click',()=>designDialog.close());designEl('design-cancel')?.addEventListener('click',()=>designDialog.close());
designSlideSelect?.addEventListener('change',()=>{designSyncSlideControls();designUpdatePreview()});
designForm?.addEventListener('input',(event)=>{if(event.target instanceof HTMLInputElement&&event.target.type==='file')return;designUpdatePreview()});
designPreset?.addEventListener('change',()=>{const preset=designPresetValues[designPreset.value];if(!preset)return;designEl('design-background').value=preset.background;designEl('design-primary').value=preset.primary;designEl('design-accent').value=preset.accent;designEl('design-text').value=preset.text;designEl('design-heading-font').value=preset.heading;designEl('design-body-font').value=preset.body;designUpdatePreview()});
designEl('design-image-layout')?.addEventListener('change',()=>{if(!designState)return;const number=String(designSlideSelect.value);const existing=designState.design.slides[number]||{assetId:null,imageUrl:null};designState.design.slides[number]={...existing,layout:designEl('design-image-layout').value};designUpdatePreview()});
designEl('design-remove-image')?.addEventListener('click',()=>{if(!designState)return;const number=String(designSlideSelect.value);designState.design.slides[number]={assetId:null,imageUrl:null,layout:designEl('design-image-layout').value};designUpdatePreview()});
designEl('design-default-logo')?.addEventListener('click',()=>{if(!designState)return;designState.design.logo.assetId=null;designState.design.logo.url=null;designUpdatePreview()});

async function designUpload(file,kind,slide){
  if(!file)return null;if(file.size>5*1024*1024)throw new Error('Gambar maksimal 5 MB.');
  const params=new URLSearchParams({kind});if(slide)params.set('slide',String(slide));
  return designRead(await fetch('/api/content/'+encodeURIComponent(designState.content.id)+'/design/assets?'+params,{method:'POST',headers:{'Content-Type':file.type,Accept:'application/json'},body:file}));
}
designEl('design-logo-file')?.addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;try{designStatus.textContent='Mengunggah logo…';const data=await designUpload(file,'logo');designState.design.logo.assetId=data.asset.id;designState.design.logo.url=data.asset.url;designStatus.textContent='Logo siap. Simpan desain untuk menerapkan.';designUpdatePreview()}catch(error){designStatus.textContent=error instanceof Error?error.message:'Logo gagal diunggah.'}event.target.value=''});
designEl('design-slide-file')?.addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;const number=Number(designSlideSelect.value);try{designStatus.textContent='Mengunggah gambar slide…';const data=await designUpload(file,'slide_image',number);designState.design.slides[String(number)]={assetId:data.asset.id,imageUrl:data.asset.url,layout:designEl('design-image-layout').value};designStatus.textContent='Gambar siap. Simpan desain untuk menerapkan.';designUpdatePreview()}catch(error){designStatus.textContent=error instanceof Error?error.message:'Gambar gagal diunggah.'}event.target.value=''});

designEl('design-save')?.addEventListener('click',async()=>{
  if(!designState)return;const button=designEl('design-save');button.disabled=true;designStatus.textContent='Menyimpan desain…';
  const slides={};for(const [number,item] of Object.entries(designState.design.slides)){if(item.assetId)slides[number]={assetId:item.assetId,layout:item.layout||'right'}}
  const payload={preset:designPreset.value,colors:{background:designEl('design-background').value,primary:designEl('design-primary').value,accent:designEl('design-accent').value,text:designEl('design-text').value},fonts:{heading:designEl('design-heading-font').value,body:designEl('design-body-font').value},logo:{assetId:designState.design.logo.assetId||null,position:designEl('design-logo-position').value,size:designEl('design-logo-size').value},slides};
  try{await designRead(await fetch('/api/content/'+encodeURIComponent(designState.content.id)+'/design',{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)}));designStatus.textContent='Desain tersimpan. Render carousel ulang sebelum approval.';if(typeof loadRendererLibrary==='function')await loadRendererLibrary();setTimeout(()=>designDialog.close(),700)}catch(error){designStatus.textContent=error instanceof Error?error.message:'Desain gagal disimpan.'}finally{button.disabled=false}
});
`;
