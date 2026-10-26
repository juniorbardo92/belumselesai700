type AdminEnv={DB:D1Database};
type Row=Record<string,unknown>;

const BRAND_ID='brand-umkm-naik-kelas';
const MAX_BODY_BYTES=16_384;
const CSRF_COOKIE='monetization_csrf';
const OFFER_TYPES=['own_product','affiliate','lead_generation','service','app_install','free_lead_magnet'] as const;
const GOALS=['none','awareness','traffic','lead','affiliate','own_product','app_install','service'] as const;

class AdminInputError extends Error{}

function h(value:unknown):string{return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function clean(value:unknown,max=500):string|null{if(typeof value!=='string')return null;const result=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim();return result?result.slice(0,max):null;}
function integer(value:unknown,fallback=0):number{const parsed=Number(value);return Number.isFinite(parsed)?Math.round(parsed):fallback;}
function safeDestination(value:string|null):boolean{
  if(!value)return false;
  try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password;}catch{return false;}
}
function uid(prefix:string):string{return `${prefix}-${crypto.randomUUID()}`;}
function option(value:string,label:string,current?:unknown):string{return `<option value="${h(value)}"${String(current??'')===value?' selected':''}>${h(label)}</option>`;}
function hidden(action:string,csrf:string):string{return `<input type="hidden" name="action" value="${h(action)}"><input type="hidden" name="csrf" value="${h(csrf)}">`;}

function secureEqual(left:string,right:string):boolean{
  if(left.length!==right.length)return false;
  let difference=0;
  for(let index=0;index<left.length;index+=1)difference|=left.charCodeAt(index)^right.charCodeAt(index);
  return difference===0;
}

function cookieValue(request:Request,name:string):string|null{
  const cookies=request.headers.get('Cookie')??'';
  for(const pair of cookies.split(';')){
    const [key,...parts]=pair.trim().split('=');
    if(key===name)return parts.join('=');
  }
  return null;
}

function csrfToken(request:Request):string{
  const existing=cookieValue(request,CSRF_COOKIE);
  return existing&&/^[a-f0-9]{64}$/.test(existing)?existing:(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','');
}

function responseHeaders(csrf?:string):Headers{
  const headers=new Headers({
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  });
  if(csrf)headers.set('Set-Cookie',`${CSRF_COOKIE}=${csrf}; Path=/monetization; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`);
  return headers;
}

function errorResponse(message:string,status=400):Response{
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Setup gagal</title><style>body{font:16px system-ui;max-width:760px;margin:50px auto;padding:20px;background:#f5f0e7;color:#1b1612}a{color:#9e1b13}</style><h1>Setup tidak disimpan</h1><p>${h(message)}</p><p><a href="/monetization?view=setup">Kembali ke setup monetisasi</a></p>`,{status,headers:responseHeaders()});
}

function redirectResult(code:string):Response{return new Response(null,{status:303,headers:{Location:`/monetization?view=setup&result=${encodeURIComponent(code)}`,'Cache-Control':'no-store'}});}

async function relationError(env:AdminEnv,contentId:string|null,campaignId:string|null,offerId:string|null):Promise<string|null>{
  const statements:D1PreparedStatement[]=[];
  if(contentId)statements.push(env.DB.prepare(`SELECT id FROM content_items WHERE id=?1 AND brand_id=?2`).bind(contentId,BRAND_ID));
  if(campaignId)statements.push(env.DB.prepare(`SELECT id,offer_id FROM monetization_campaigns WHERE id=?1 AND brand_id=?2`).bind(campaignId,BRAND_ID));
  if(offerId)statements.push(env.DB.prepare(`SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(offerId,BRAND_ID));
  const results=statements.length?await env.DB.batch<Row>(statements):[];
  let index=0;
  if(contentId&&!results[index++]?.results[0])return 'Content tidak valid untuk brand ini.';
  const campaign=campaignId?results[index++]?.results[0]:null;
  if(campaignId&&!campaign)return 'Campaign tidak valid untuk brand ini.';
  if(offerId&&!results[index++]?.results[0])return 'Offer tidak valid untuk brand ini.';
  if(campaign&&offerId&&campaign.offer_id&&String(campaign.offer_id)!==offerId)return 'Offer tidak sama dengan offer milik campaign.';
  return null;
}

async function resolveAdminRelations(env:AdminEnv,contentId:string|null,campaignId:string|null,offerId:string|null,requireMappedContent:boolean):Promise<{error:string|null;offerId:string|null}>{
  const statements:D1PreparedStatement[]=[];
  if(contentId)statements.push(env.DB.prepare(`SELECT c.id,cm.offer_id mapped_offer_id,cm.campaign_id mapped_campaign_id
    FROM content_items c LEFT JOIN content_monetization cm ON cm.content_item_id=c.id
    WHERE c.id=?1 AND c.brand_id=?2`).bind(contentId,BRAND_ID));
  if(campaignId)statements.push(env.DB.prepare(`SELECT id,offer_id FROM monetization_campaigns WHERE id=?1 AND brand_id=?2`).bind(campaignId,BRAND_ID));
  if(offerId)statements.push(env.DB.prepare(`SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(offerId,BRAND_ID));
  const results=statements.length?await env.DB.batch<Row>(statements):[];
  let index=0;
  const content=contentId?results[index++]?.results[0]:null;
  if(contentId&&!content)return {error:'Content tidak valid untuk brand ini.',offerId};
  const campaign=campaignId?results[index++]?.results[0]:null;
  if(campaignId&&!campaign)return {error:'Campaign tidak valid untuk brand ini.',offerId};
  if(offerId&&!results[index++]?.results[0])return {error:'Offer tidak valid untuk brand ini.',offerId};
  const campaignOffer=clean(campaign?.offer_id,100);
  if(campaignOffer&&offerId&&campaignOffer!==offerId)return {error:'Offer tidak sama dengan offer milik campaign.',offerId};
  const effectiveOffer=offerId??campaignOffer;
  if(requireMappedContent&&content){
    const mappedCampaign=clean(content.mapped_campaign_id,100),mappedOffer=clean(content.mapped_offer_id,100);
    if(!mappedCampaign&&!mappedOffer)return {error:'Mapping monetisasi content harus dibuat sebelum tracked link.',offerId:effectiveOffer};
    if(mappedCampaign!==campaignId)return {error:'Campaign tracked link tidak sama dengan mapping content.',offerId:effectiveOffer};
    if(mappedOffer!==effectiveOffer)return {error:'Offer tracked link tidak sama dengan mapping content.',offerId:effectiveOffer};
  }
  return {error:null,offerId:effectiveOffer};
}

function auditStatement(env:AdminEnv,operation:string,entityId:string,metadata:Row={}):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
    VALUES ('admin',?1,'success',?2,?3)`).bind(operation,entityId,
      JSON.stringify({...metadata,actor:'server-admin-route',identityPersisted:false,edgeAccessPolicyExpected:true}));
}

function required(params:URLSearchParams,key:string,max:number):string{
  const value=clean(params.get(key),max);
  if(!value)throw new AdminInputError(`${key} wajib diisi.`);
  return value;
}

async function createOffer(params:URLSearchParams,env:AdminEnv):Promise<string>{
  const name=required(params,'name',160);
  const type=required(params,'type',40);
  if(!OFFER_TYPES.includes(type as typeof OFFER_TYPES[number]))throw new AdminInputError('Tipe offer tidak valid.');
  const destination=clean(params.get('destination_url'),2000);
  if(destination&&!safeDestination(destination))throw new AdminInputError('Destination offer harus URL HTTPS tanpa credentials.');
  const id=uid('off');
  await env.DB.batch([env.DB.prepare(`INSERT INTO monetization_offers
    (id,brand_id,name,type,destination_url,price_amount,estimated_margin_amount,status,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8)`).bind(
      id,BRAND_ID,name,type,destination,Math.max(0,integer(params.get('price_amount'))),
      Math.max(0,integer(params.get('estimated_margin_amount'))),JSON.stringify({createdBy:'server_admin_setup',defaultStatus:'draft'})
    ),auditStatement(env,'offer_create',id,{status:'draft'})]);
  return 'offer-created';
}

async function createCampaign(params:URLSearchParams,env:AdminEnv):Promise<string>{
  const name=required(params,'name',160);
  const objective=required(params,'objective',80);
  const offerId=clean(params.get('offer_id'),100);
  const invalid=await relationError(env,null,null,offerId);if(invalid)throw new AdminInputError(invalid);
  const id=uid('cam');
  await env.DB.batch([env.DB.prepare(`INSERT INTO monetization_campaigns
    (id,brand_id,name,objective,offer_id,status,metadata_json) VALUES (?1,?2,?3,?4,?5,'draft',?6)`)
    .bind(id,BRAND_ID,name,objective,offerId,JSON.stringify({createdBy:'server_admin_setup',defaultStatus:'draft'})),
    auditStatement(env,'campaign_create',id,{status:'draft',offerId})]);
  return 'campaign-created';
}

async function mapContent(params:URLSearchParams,env:AdminEnv):Promise<string>{
  const contentId=required(params,'content_id',100);
  const campaignId=clean(params.get('campaign_id'),100);
  const offerId=clean(params.get('offer_id'),100);
  const relation=await resolveAdminRelations(env,contentId,campaignId,offerId,false);if(relation.error)throw new AdminInputError(relation.error);
  const goal=required(params,'goal',40);
  if(!GOALS.includes(goal as typeof GOALS[number]))throw new AdminInputError('Goal monetisasi tidak valid.');
  const destination=clean(params.get('destination_url'),2000);
  if(destination&&!safeDestination(destination))throw new AdminInputError('Destination content harus URL HTTPS tanpa credentials.');
  const existing=await env.DB.prepare(`SELECT content_item_id FROM content_monetization WHERE content_item_id=?1`).bind(contentId).first();
  if(existing)throw new AdminInputError('Content ini sudah memiliki mapping. Gunakan API edit eksplisit agar mapping produksi tidak tertimpa.');
  await env.DB.batch([env.DB.prepare(`INSERT INTO content_monetization
    (content_item_id,monetization_goal,offer_id,campaign_id,cta_text,commercial_score,destination_url,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(
        contentId,goal,relation.offerId,campaignId,clean(params.get('cta_text'),800),
        Math.max(0,Math.min(100,integer(params.get('commercial_score')))),destination,
        JSON.stringify({updatedBy:'server_admin_setup',contentLifecycleChanged:false})
      ),auditStatement(env,'content_mapping_create',contentId,{goal,campaignId,offerId:relation.offerId,contentLifecycleChanged:false})]);
  return 'content-mapped';
}

async function createLink(params:URLSearchParams,env:AdminEnv):Promise<string>{
  const slug=required(params,'slug',80).toLowerCase();
  if(!/^[a-z0-9][a-z0-9_-]{3,79}$/.test(slug))throw new AdminInputError('Slug harus 4–80 karakter a-z, angka, _ atau -.');
  const destination=required(params,'destination_url',2000);
  if(!safeDestination(destination))throw new AdminInputError('Destination link harus URL HTTPS tanpa credentials.');
  const contentId=clean(params.get('content_id'),100),campaignId=clean(params.get('campaign_id'),100),offerId=clean(params.get('offer_id'),100);
  const relation=await resolveAdminRelations(env,contentId,campaignId,offerId,Boolean(contentId));if(relation.error)throw new AdminInputError(relation.error);
  const id=uid('lnk');
  try{
    await env.DB.batch([env.DB.prepare(`INSERT INTO monetization_tracked_links
      (id,slug,brand_id,content_item_id,campaign_id,offer_id,platform,destination_url,status,metadata_json)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'paused',?9)`).bind(
        id,slug,BRAND_ID,contentId,campaignId,relation.offerId,clean(params.get('platform'),40),destination,
        JSON.stringify({createdBy:'server_admin_setup',defaultStatus:'paused',requiresExplicitActivation:true})
      ),auditStatement(env,'tracked_link_create',id,{slug,status:'paused',contentId,campaignId,offerId:relation.offerId})]);
  }catch(error){if(error instanceof Error&&error.message.toLowerCase().includes('unique'))throw new AdminInputError('Slug sudah digunakan.');throw error;}
  return 'link-created-paused';
}

async function setStatus(params:URLSearchParams,env:AdminEnv,kind:'offer'|'campaign'|'link'):Promise<string>{
  const id=required(params,'id',100),status=required(params,'status',20);
  const allowed=kind==='offer'?['draft','active','paused','archived']:kind==='campaign'?['draft','active','paused','completed','archived']:['active','paused','archived'];
  if(!allowed.includes(status))throw new AdminInputError('Status tidak valid.');
  const table=kind==='offer'?'monetization_offers':kind==='campaign'?'monetization_campaigns':'monetization_tracked_links';
  const current=await env.DB.prepare(`SELECT id FROM ${table} WHERE id=?1 AND brand_id=?2`).bind(id,BRAND_ID).first();
  if(!current)throw new AdminInputError(`${kind} tidak ditemukan.`);
  if(kind==='link'&&status==='active'){
    const link=await env.DB.prepare(`SELECT l.id,lo.status link_offer_status,c.status campaign_status,co.status campaign_offer_status,
      l.offer_id,c.offer_id campaign_offer_id,l.campaign_id,l.content_item_id,
      cm.campaign_id mapped_campaign_id,cm.offer_id mapped_offer_id
      FROM monetization_tracked_links l
      LEFT JOIN monetization_offers lo ON lo.id=l.offer_id AND lo.brand_id=l.brand_id
      LEFT JOIN monetization_campaigns c ON c.id=l.campaign_id AND c.brand_id=l.brand_id
      LEFT JOIN monetization_offers co ON co.id=c.offer_id AND co.brand_id=l.brand_id
      LEFT JOIN content_monetization cm ON cm.content_item_id=l.content_item_id
      WHERE l.id=?1 AND l.brand_id=?2`).bind(id,BRAND_ID).first<Row>();
    if(!link)throw new AdminInputError('Tracked link tidak ditemukan.');
    if(link.offer_id&&link.link_offer_status!=='active')throw new AdminInputError('Aktifkan offer sebelum tracked link.');
    if(link.campaign_id&&link.campaign_status!=='active')throw new AdminInputError('Aktifkan campaign sebelum tracked link.');
    if(link.campaign_offer_id&&link.campaign_offer_status!=='active')throw new AdminInputError('Aktifkan offer milik campaign sebelum tracked link.');
    if(link.offer_id&&link.campaign_offer_id&&link.offer_id!==link.campaign_offer_id)throw new AdminInputError('Relasi offer tracked link dan campaign tidak konsisten.');
    if(link.content_item_id&&!link.mapped_campaign_id&&!link.mapped_offer_id)throw new AdminInputError('Mapping monetisasi content wajib ada sebelum tracked link diaktifkan.');
    if(link.content_item_id&&link.mapped_campaign_id!==link.campaign_id)throw new AdminInputError('Campaign tracked link tidak sama dengan mapping content.');
    const effectiveOffer=link.offer_id??link.campaign_offer_id??null;
    if(link.content_item_id&&link.mapped_offer_id!==effectiveOffer)throw new AdminInputError('Offer tracked link tidak sama dengan mapping content.');
  }
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE ${table} SET status=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND brand_id=?3`).bind(id,status,BRAND_ID),
    auditStatement(env,`${kind}_status_update`,id,{status})
  ]);
  if(Number(results[0]?.meta.changes??0)!==1)throw new AdminInputError(`${kind} tidak ditemukan.`);
  return `${kind}-status-updated`;
}

export async function handleMonetizationAdminPost(request:Request,env:AdminEnv):Promise<Response>{
  const url=new URL(request.url);
  if(request.headers.get('Origin')!==url.origin)return errorResponse('Origin request tidak valid.',403);
  if(request.headers.get('Sec-Fetch-Site')!=='same-origin')return errorResponse('Form hanya dapat dikirim dari dashboard yang sama.',403);
  const contentType=(request.headers.get('Content-Type')??'').toLowerCase();
  if(!contentType.startsWith('application/x-www-form-urlencoded'))return errorResponse('Content-Type form tidak didukung.',415);
  const declared=Number(request.headers.get('Content-Length')??0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)return errorResponse('Payload form terlalu besar.',413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return errorResponse('Payload form terlalu besar.',413);
  const params=new URLSearchParams(raw);
  const supplied=params.get('csrf')??'',expected=cookieValue(request,CSRF_COOKIE)??'';
  if(!expected||!supplied||!secureEqual(supplied,expected))return errorResponse('Sesi form kedaluwarsa. Muat ulang halaman setup.',403);
  try{
    const action=params.get('action');
    const result=action==='create_offer'?await createOffer(params,env)
      :action==='create_campaign'?await createCampaign(params,env)
      :action==='map_content'?await mapContent(params,env)
      :action==='create_link'?await createLink(params,env)
      :action==='set_offer_status'?await setStatus(params,env,'offer')
      :action==='set_campaign_status'?await setStatus(params,env,'campaign')
      :action==='set_link_status'?await setStatus(params,env,'link')
      :null;
    if(!result)return errorResponse('Action admin tidak dikenal.');
    return redirectResult(result);
  }catch(error){
    if(error instanceof AdminInputError)return errorResponse(error.message,400);
    console.error(JSON.stringify({message:'monetization_admin_write_failed',error:error instanceof Error?error.message:'unknown'}));
    return errorResponse('Setup gagal disimpan. Muat ulang halaman dan coba kembali.',500);
  }
}

function entityOptions(rows:Row[],kind:'offer'|'campaign'|'content',selected?:unknown):string{
  const prefix='<option value="">— tidak dipilih —</option>';
  return prefix+rows.map((row)=>{
    const label=kind==='content'?`${row.title??row.id} · ${row.platform??'—'} · ${row.status??'—'}`:`${row.name??row.id} · ${row.status??'—'}`;
    return option(String(row.id),String(label),selected);
  }).join('');
}

function statusForm(kind:'offer'|'campaign'|'link',row:Row,csrf:string):string{
  const values=kind==='offer'?['draft','active','paused','archived']:kind==='campaign'?['draft','active','paused','completed','archived']:['active','paused','archived'];
  return `<form method="post" action="/monetization" class="inline">${hidden(`set_${kind}_status`,csrf)}<input type="hidden" name="id" value="${h(row.id)}"><select name="status">${values.map((value)=>option(value,value,row.status)).join('')}</select><button type="submit">Simpan</button></form>`;
}

export async function renderMonetizationSetup(request:Request,env:AdminEnv):Promise<Response>{
  const csrf=csrfToken(request);
  const [offersResult,campaignsResult,contentResult,linksResult]=await env.DB.batch<Row>([
    env.DB.prepare(`SELECT id,name,type,status,destination_url,updated_at FROM monetization_offers WHERE brand_id=?1 ORDER BY updated_at DESC LIMIT 100`).bind(BRAND_ID),
    env.DB.prepare(`SELECT id,name,objective,offer_id,status,updated_at FROM monetization_campaigns WHERE brand_id=?1 ORDER BY updated_at DESC LIMIT 100`).bind(BRAND_ID),
    env.DB.prepare(`SELECT c.id,c.title,c.platform,c.status,cm.monetization_goal,cm.offer_id,cm.campaign_id
      FROM content_items c LEFT JOIN content_monetization cm ON cm.content_item_id=c.id
      WHERE c.brand_id=?1 ORDER BY c.created_at DESC LIMIT 120`).bind(BRAND_ID),
    env.DB.prepare(`SELECT id,slug,content_item_id,campaign_id,offer_id,platform,destination_url,status,updated_at
      FROM monetization_tracked_links WHERE brand_id=?1 ORDER BY updated_at DESC LIMIT 100`).bind(BRAND_ID)
  ]);
  const offers=(offersResult?.results??[]) as Row[],campaigns=(campaignsResult?.results??[]) as Row[];
  const contents=(contentResult?.results??[]) as Row[];
  const unmappedContents=contents.filter((row)=>!row.monetization_goal),mappedContents=contents.filter((row)=>Boolean(row.monetization_goal));
  const links=(linksResult?.results??[]) as Row[];
  const resultCode=new URL(request.url).searchParams.get('result');
  const resultMessages:Record<string,string>={
    'offer-created':'Offer dibuat sebagai draft.','campaign-created':'Campaign dibuat sebagai draft.',
    'content-mapped':'Mapping content disimpan tanpa mengubah lifecycle content.','link-created-paused':'Tracked link dibuat dalam status paused.',
    'offer-status-updated':'Status offer diperbarui.','campaign-status-updated':'Status campaign diperbarui.','link-status-updated':'Status tracked link diperbarui.'
  };
  const notice=resultCode&&resultMessages[resultCode]?`<div class="notice">${h(resultMessages[resultCode])}</div>`:'';
  const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup Monetisasi · Content OS</title><style>
:root{--bg:#f5f0e7;--paper:#fffaf0;--ink:#1b1612;--muted:#756d64;--red:#9e1b13;--green:#23845b;--line:#e7d9c2}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}main{max-width:1220px;margin:auto;padding:30px 20px 60px}a{color:var(--red)}h1,h2{font-family:Georgia,serif}.lead{color:var(--muted);line-height:1.6}.notice{padding:13px 15px;background:#e5f3eb;color:var(--green);border:1px solid #badfca;border-radius:10px;margin:16px 0}.steps{display:grid;grid-template-columns:1fr 1fr;gap:15px}.panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;margin-top:15px}.panel h2{margin:0 0 13px;font-size:20px}.form{display:grid;grid-template-columns:1fr 1fr;gap:11px}.form label{font-size:12px;font-weight:750}.form input,.form select,.inline select{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}.wide{grid-column:1/-1}.actions{grid-column:1/-1}.actions button,.inline button{padding:10px 13px;border:0;border-radius:8px;background:var(--red);color:#fff;font-weight:750}.hint{font-size:12px;color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 7px;border-bottom:1px solid var(--line);vertical-align:top}.inline{display:flex;align-items:end;gap:6px}.inline select{margin:0}.inline button{padding:8px}.scroll{overflow:auto}.footer{margin-top:18px;color:var(--muted);font-size:12px}@media(max-width:850px){.steps{grid-template-columns:1fr}}@media(max-width:560px){.form{grid-template-columns:1fr}.wide,.actions{grid-column:auto}}</style></head><body><main>
<a href="/monetization">← Revenue Command Center</a><h1>Setup Monetisasi</h1><p class="lead">Alur aman: buat Offer (draft) → Campaign (draft) → mapping Content → tracked link (paused). Aktivasi dilakukan terpisah. Halaman ini berjalan server-side di path Cloudflare Access yang sama; tidak ada bearer token di browser dan tidak ada perubahan pada renderer, approval, atau Repliz.</p>${notice}
<div class="steps"><section class="panel"><h2>1. Buat Offer</h2><form method="post" action="/monetization" class="form">${hidden('create_offer',csrf)}<label>Nama<input name="name" maxlength="160" required></label><label>Tipe<select name="type">${OFFER_TYPES.map((value)=>option(value,value)).join('')}</select></label><label class="wide">Destination URL<input type="url" name="destination_url" maxlength="2000"></label><label>Harga (IDR)<input type="number" min="0" name="price_amount" value="0"></label><label>Estimasi margin<input type="number" min="0" name="estimated_margin_amount" value="0"></label><div class="actions"><button type="submit">Buat sebagai draft</button></div></form></section>
<section class="panel"><h2>2. Buat Campaign</h2><form method="post" action="/monetization" class="form">${hidden('create_campaign',csrf)}<label>Nama<input name="name" maxlength="160" required></label><label>Objective<input name="objective" maxlength="80" required></label><label class="wide">Offer<select name="offer_id">${entityOptions(offers,'offer')}</select></label><div class="actions"><button type="submit">Buat sebagai draft</button></div></form></section>
<section class="panel"><h2>3. Mapping Content</h2><form method="post" action="/monetization" class="form">${hidden('map_content',csrf)}<label class="wide">Content belum dimonetisasi<select name="content_id" required>${entityOptions(unmappedContents,'content')}</select></label><label>Goal<select name="goal">${GOALS.map((value)=>option(value,value)).join('')}</select></label><label>Commercial score<input type="number" min="0" max="100" name="commercial_score" value="0"></label><label>Offer<select name="offer_id">${entityOptions(offers,'offer')}</select></label><label>Campaign<select name="campaign_id">${entityOptions(campaigns,'campaign')}</select></label><label class="wide">CTA text<input name="cta_text" maxlength="800"></label><label class="wide">Destination URL<input type="url" name="destination_url" maxlength="2000"></label><div class="actions"><button type="submit">Simpan mapping baru</button></div></form></section>
<section class="panel"><h2>4. Buat Tracked Link</h2><form method="post" action="/monetization" class="form">${hidden('create_link',csrf)}<label>Slug<input name="slug" minlength="4" maxlength="80" pattern="[a-z0-9][a-z0-9_-]{3,79}" required></label><label>Platform<input name="platform" maxlength="40" placeholder="instagram"></label><label class="wide">Destination URL<input type="url" name="destination_url" maxlength="2000" required></label><label>Content yang sudah mapped<select name="content_id">${entityOptions(mappedContents,'content')}</select></label><label>Campaign<select name="campaign_id">${entityOptions(campaigns,'campaign')}</select></label><label class="wide">Offer<select name="offer_id">${entityOptions(offers,'offer')}</select></label><p class="hint wide">Link selalu dibuat paused. Jika content dipilih, campaign/offer harus sama dengan mapping content. Aktifkan setelah seluruh parent active.</p><div class="actions"><button type="submit">Buat paused</button></div></form></section></div>
<section class="panel"><h2>Status Offer</h2><div class="scroll"><table><thead><tr><th>Offer</th><th>Tipe</th><th>Status</th><th>Ubah</th></tr></thead><tbody>${offers.map((row)=>`<tr><td>${h(row.name)}<br><span class="hint">${h(row.id)}</span></td><td>${h(row.type)}</td><td>${h(row.status)}</td><td>${statusForm('offer',row,csrf)}</td></tr>`).join('')||'<tr><td colspan="4">Belum ada offer.</td></tr>'}</tbody></table></div></section>
<section class="panel"><h2>Status Campaign</h2><div class="scroll"><table><thead><tr><th>Campaign</th><th>Objective</th><th>Status</th><th>Ubah</th></tr></thead><tbody>${campaigns.map((row)=>`<tr><td>${h(row.name)}<br><span class="hint">${h(row.id)}</span></td><td>${h(row.objective)}</td><td>${h(row.status)}</td><td>${statusForm('campaign',row,csrf)}</td></tr>`).join('')||'<tr><td colspan="4">Belum ada campaign.</td></tr>'}</tbody></table></div></section>
<section class="panel"><h2>Status Tracked Link</h2><div class="scroll"><table><thead><tr><th>Slug</th><th>Mapping</th><th>Status</th><th>Ubah</th></tr></thead><tbody>${links.map((row)=>`<tr><td>go.umkmnaikkelas.id/go/${h(row.slug)}</td><td>${h(row.content_item_id||'—')}<br><span class="hint">${h(row.campaign_id||'—')} · ${h(row.offer_id||'—')}</span></td><td>${h(row.status)}</td><td>${statusForm('link',row,csrf)}</td></tr>`).join('')||'<tr><td colspan="4">Belum ada tracked link.</td></tr>'}</tbody></table></div></section>
<div class="footer">Additive-only · default aman draft/paused · tidak ada delete action · Rendered ${h(new Date().toISOString())}</div></main></body></html>`;
  return new Response(html,{status:200,headers:responseHeaders(csrf)});
}
