const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const MAX_BODY_BYTES = 16000;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;
const PARTICIPANT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_DEVICES_PER_PARTICIPANT = 2;
const MODULES = Object.freeze({
  property: Object.freeze({ title: "Modul Agen Properti", keyBinding: "PANGLIMA_MODULE_KEY_PROPERTY" }),
  insurance: Object.freeze({ title: "Modul Agen Asuransi", keyBinding: "PANGLIMA_MODULE_KEY_INSURANCE" }),
  mlm: Object.freeze({ title: "Modul Mitra MLM / Direct Selling", keyBinding: "PANGLIMA_MODULE_KEY_MLM" })
});

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY"
});

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function failure(code, message, status) {
  return response({ ok: false, code, message }, status);
}

function cleanText(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function knownModule(value) {
  const code = cleanText(value, 24).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MODULES, code) ? code : "";
}

async function participantModule(env, participantId, requestedCode) {
  const code = knownModule(requestedCode);
  const sql = code
    ? "SELECT module_code FROM panglima_module_entitlements WHERE participant_id = ? AND module_code = ? LIMIT 1"
    : "SELECT module_code FROM panglima_module_entitlements WHERE participant_id = ? ORDER BY granted_at DESC LIMIT 1";
  const statement = env.PANGLIMA_APP_DB.prepare(sql);
  const item = code
    ? await statement.bind(participantId, code).first()
    : await statement.bind(participantId).first();
  const entitledCode = knownModule(item && item.module_code);
  return entitledCode ? { code: entitledCode, title: MODULES[entitledCode].title } : null;
}

async function requestBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return null;
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    const text = await request.text();
    if (!text || TEXT_ENCODER.encode(text).byteLength > MAX_BODY_BYTES) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (_) {
    return null;
  }
}

function participantFromSession(sessionToken) {
  if (typeof sessionToken !== "string" || sessionToken.length > 1000) return null;
  const sections = sessionToken.split(".");
  if (sections.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(sections[0])) return null;

  try {
    const normalized = sections[0].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    const payload = JSON.parse(TEXT_DECODER.decode(bytes));
    if (!PARTICIPANT_ID_PATTERN.test(String(payload.pid || ""))) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.pid;
  } catch (_) {
    return null;
  }
}

async function hashDevice(deviceId) {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", TEXT_ENCODER.encode("panglima-device-license-v1:" + deviceId.toLowerCase())
  ));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function sameHash(left, right) {
  if (!DEVICE_ID_PATTERN.test(String(left || "")) || !DEVICE_ID_PATTERN.test(String(right || ""))) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function callCore(env, path, body, incomingRequest) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  const address = incomingRequest.headers.get("cf-connecting-ip");
  if (address) headers.set("cf-connecting-ip", address);
  return env.PANGLIMA_CORE.fetch(new Request("https://panglima.internal" + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }));
}

async function readCoreResult(upstream) {
  const length = Number(upstream.headers.get("content-length") || 0);
  if (length > 32000) return null;
  try {
    const raw = await upstream.text();
    if (TEXT_ENCODER.encode(raw).byteLength > 32000) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function activate(request, env) {
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Permintaan aktivasi tidak valid.", 400);

  const accessCode = cleanText(body.accessCode, 64).toUpperCase();
  const deviceId = cleanText(body.deviceId, 64);
  if (!/^[A-Z0-9-]{10,64}$/.test(accessCode)) {
    return failure("INVALID_CODE", "Kode akses peserta belum sesuai.", 401);
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure("DEVICE_REQUIRED", "Perangkat belum dapat diverifikasi. Gunakan APK resmi terbaru.", 400);
  }

  const upstream = await callCore(env, "/v1/activate", { accessCode }, request);
  const result = await readCoreResult(upstream);
  if (!result) return failure("UPSTREAM_UNAVAILABLE", "Layanan peserta belum tersedia.", 502);
  if (!upstream.ok || result.ok !== true) return response(result, upstream.status);

  const participantId = participantFromSession(result.sessionToken);
  if (!participantId || !result.participant) {
    return failure("INVALID_PARTICIPANT", "Profil resmi peserta belum dapat diverifikasi.", 502);
  }

  const profile = await env.PANGLIMA_DEVICE_DB.prepare(
    "SELECT owner_name, business_name, business_type, source FROM panglima_pretest_profiles WHERE participant_id = ? LIMIT 1"
  ).bind(participantId).first();

  const owner = cleanText(profile && profile.owner_name || result.participant.owner, 80);
  const business = cleanText(profile && profile.business_name || result.participant.business, 100);
  const businessType = cleanText(profile && profile.business_type || "", 80);
  const profileSource = profile ? "pretest" : "registered";
  if (!owner || !business) return failure("PROFILE_MISSING", "Profil resmi peserta belum tersedia.", 403);

  const now = new Date().toISOString();
  const deviceHash = await hashDevice(deviceId);
  const license = await env.PANGLIMA_DEVICE_DB.prepare(
    "INSERT INTO panglima_device_licenses " +
    "(participant_id, device_hash, owner_name, business_name, business_type, profile_source, activated_at, last_seen_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(participant_id) DO UPDATE SET " +
    "owner_name = excluded.owner_name, business_name = excluded.business_name, " +
    "business_type = excluded.business_type, profile_source = excluded.profile_source, " +
    "device_hash_2 = CASE " +
    "WHEN panglima_device_licenses.device_hash = excluded.device_hash THEN panglima_device_licenses.device_hash_2 " +
    "WHEN panglima_device_licenses.device_hash_2 = excluded.device_hash THEN panglima_device_licenses.device_hash_2 " +
    "WHEN panglima_device_licenses.device_hash_2 IS NULL THEN excluded.device_hash " +
    "ELSE panglima_device_licenses.device_hash_2 END, " +
    "activated_at_2 = CASE WHEN panglima_device_licenses.device_hash <> excluded.device_hash " +
    "AND panglima_device_licenses.device_hash_2 IS NULL THEN excluded.activated_at " +
    "ELSE panglima_device_licenses.activated_at_2 END, " +
    "last_seen_at = CASE WHEN panglima_device_licenses.device_hash = excluded.device_hash " +
    "THEN excluded.last_seen_at ELSE panglima_device_licenses.last_seen_at END, " +
    "last_seen_at_2 = CASE WHEN panglima_device_licenses.device_hash <> excluded.device_hash " +
    "AND (panglima_device_licenses.device_hash_2 = excluded.device_hash OR panglima_device_licenses.device_hash_2 IS NULL) " +
    "THEN excluded.last_seen_at ELSE panglima_device_licenses.last_seen_at_2 END " +
    "WHERE panglima_device_licenses.device_hash = excluded.device_hash " +
    "OR panglima_device_licenses.device_hash_2 = excluded.device_hash " +
    "OR panglima_device_licenses.device_hash_2 IS NULL " +
    "RETURNING participant_id"
  ).bind(participantId, deviceHash, owner, business, businessType, profileSource, now, now).first();

  if (!license) {
    return failure("DEVICE_LOCKED", "Kode peserta sudah digunakan pada maksimal 2 perangkat. Hubungi pendamping.", 403);
  }

  const module = await participantModule(env, participantId, "");
  const participant = {
    owner,
    business,
    type: businessType,
    profileSource,
    deviceBound: true,
    maxDevicesPerParticipant: MAX_DEVICES_PER_PARTICIPANT,
    dailyLimit: Math.max(0, Number(result.participant.dailyLimit) || 0),
    remainingToday: Math.max(0, Number(result.participant.remainingToday) || 0)
  };
  if (module) participant.module = module;

  return response({
    ok: true,
    sessionToken: result.sessionToken,
    participant
  });
}

async function moduleKey(request, env) {
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Permintaan modul tidak valid.", 400);

  const deviceId = cleanText(body.deviceId, 64);
  const requestedCode = knownModule(body.moduleCode);
  const participantId = participantFromSession(body.sessionToken);
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure("DEVICE_REQUIRED", "Perangkat belum dapat diverifikasi.", 400);
  }
  if (!participantId) {
    return failure("SESSION_EXPIRED", "Sesi peserta berakhir. Aktifkan kembali kode akses.", 401);
  }
  if (!requestedCode) {
    return failure("INVALID_MODULE", "Modul yang diminta tidak dikenali.", 400);
  }
  // Legacy APKs omit assetVersion and keep their existing PDF/workbook key.
  // The revised APK explicitly requests a separate key for its new assets.
  const assetVersion = body.assetVersion === undefined ? 1 : body.assetVersion;
  if (assetVersion !== 1 && assetVersion !== 2) {
    return failure("INVALID_ASSET_VERSION", "Versi modul tidak dikenali.", 400);
  }

  const deviceHash = await hashDevice(deviceId);
  const license = await env.PANGLIMA_DEVICE_DB.prepare(
    "SELECT participant_id, device_hash, device_hash_2 FROM panglima_device_licenses " +
    "WHERE participant_id = ? AND (device_hash = ? OR device_hash_2 = ?) LIMIT 1"
  ).bind(participantId, deviceHash, deviceHash).first();
  if (!license) {
    return failure("DEVICE_LOCKED", "Modul ini tidak berlaku untuk perangkat tersebut.", 403);
  }

  const module = await participantModule(env, participantId, requestedCode);
  if (!module) {
    return failure("MODULE_NOT_ENTITLED", "Varian pembelian Anda tidak mencakup modul ini.", 403);
  }

  const binding = MODULES[requestedCode].keyBinding + (assetVersion === 2 ? "_V2" : "");
  const key = cleanText(env[binding], 64);
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) {
    return failure("MODULE_KEY_UNAVAILABLE", "Kunci modul belum tersedia.", 503);
  }

  const seenAt = new Date().toISOString();
  await env.PANGLIMA_DEVICE_DB.prepare(
    "UPDATE panglima_device_licenses SET " +
    "last_seen_at = CASE WHEN device_hash = ? THEN ? ELSE last_seen_at END, " +
    "last_seen_at_2 = CASE WHEN device_hash_2 = ? THEN ? ELSE last_seen_at_2 END " +
    "WHERE participant_id = ? AND (device_hash = ? OR device_hash_2 = ?)"
  ).bind(deviceHash, seenAt, deviceHash, seenAt, participantId, deviceHash, deviceHash).run();

  return response({ ok: true, module, key, algorithm: "AES-256-GCM", format: "PGLM1",
    assetVersion });
}

async function consultation(request, env) {
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Permintaan konsultasi tidak valid.", 400);

  const deviceId = cleanText(body.deviceId, 64);
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure("DEVICE_REQUIRED", "Perangkat belum dapat diverifikasi. Gunakan APK resmi terbaru.", 400);
  }

  const participantId = participantFromSession(body.sessionToken);
  if (!participantId) return failure("SESSION_EXPIRED", "Sesi peserta berakhir. Aktifkan kembali kode akses.", 401);

  const deviceHash = await hashDevice(deviceId);
  const license = await env.PANGLIMA_DEVICE_DB.prepare(
    "SELECT participant_id, device_hash, device_hash_2, owner_name, business_name, business_type " +
    "FROM panglima_device_licenses WHERE participant_id = ? AND (device_hash = ? OR device_hash_2 = ?) LIMIT 1"
  ).bind(participantId, deviceHash, deviceHash).first();
  if (!license) {
    return failure("DEVICE_LOCKED", "Sesi peserta tidak berlaku untuk perangkat ini.", 403);
  }

  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? Object.assign({}, body.context)
    : {};
  context.profile = Object.assign({}, context.profile || {}, {
    owner: license.owner_name,
    business: license.business_name,
    type: license.business_type
  });

  const upstream = await callCore(env, "/v1/consultation", {
    sessionToken: body.sessionToken,
    question: cleanText(body.question, 600),
    context
  }, request);
  const result = await readCoreResult(upstream);
  if (!result) return failure("UPSTREAM_UNAVAILABLE", "Layanan AI Panglima belum tersedia.", 502);

  if (upstream.ok && result.ok === true) {
    const seenAt = new Date().toISOString();
    await env.PANGLIMA_DEVICE_DB.prepare(
      "UPDATE panglima_device_licenses SET " +
      "last_seen_at = CASE WHEN device_hash = ? THEN ? ELSE last_seen_at END, " +
      "last_seen_at_2 = CASE WHEN device_hash_2 = ? THEN ? ELSE last_seen_at_2 END " +
      "WHERE participant_id = ? AND (device_hash = ? OR device_hash_2 = ?)"
    ).bind(deviceHash, seenAt, deviceHash, seenAt, participantId, deviceHash, deviceHash).run();
  }
  return response(result, upstream.status);
}

async function authorizeAdmin(request, env) {
  const authorization = cleanText(request.headers.get("authorization"), 2000);
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const upstream = await env.PANGLIMA_CORE.fetch(new Request(
    "https://panglima.internal/v1/admin/participants",
    { headers: { authorization, accept: "application/json" } }
  ));
  if (!upstream.ok) return null;
  const data = await readCoreResult(upstream);
  return data && data.ok === true && Array.isArray(data.participants) ? data.participants : null;
}

async function adminParticipants(request, env) {
  const participants = await authorizeAdmin(request, env);
  if (!participants) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);

  const [profiles, licenses] = await Promise.all([
    env.PANGLIMA_DEVICE_DB.prepare(
      "SELECT participant_id, owner_name, business_name, business_type, email, source FROM panglima_pretest_profiles LIMIT 200"
    ).all(),
    env.PANGLIMA_DEVICE_DB.prepare(
      "SELECT participant_id, device_hash, device_hash_2, activated_at, activated_at_2, last_seen_at, last_seen_at_2 " +
      "FROM panglima_device_licenses LIMIT 200"
    ).all()
  ]);
  const profileMap = new Map((profiles.results || []).map(item => [item.participant_id, item]));
  const licenseMap = new Map((licenses.results || []).map(item => [item.participant_id, item]));

  return response({ ok: true, participants: participants.map(item => {
    const profile = profileMap.get(item.id);
    const license = licenseMap.get(item.id);
    return {
      id: item.id,
      owner: profile && profile.owner_name || item.owner,
      business: profile && profile.business_name || item.business,
      type: profile && profile.business_type || "",
      email: profile && profile.email || "",
      profileSource: profile ? "pretest" : "registered",
      deviceBound: Boolean(license),
      deviceCount: license ? (license.device_hash_2 ? 2 : 1) : 0,
      deviceHint: license ? license.device_hash.slice(0, 8) : "",
      deviceHints: license ? [license.device_hash, license.device_hash_2].filter(Boolean).map(value => value.slice(0, 8)) : [],
      activatedAt: license && license.activated_at || null,
      lastSeenAt: license && (license.last_seen_at_2 > license.last_seen_at ? license.last_seen_at_2 : license.last_seen_at) || null
    };
  }) });
}

async function saveProfile(request, env) {
  const participants = await authorizeAdmin(request, env);
  if (!participants) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const body = await requestBody(request);
  if (!body) return failure("INVALID_BODY", "Data profil PRE-TEST tidak valid.", 400);

  const participantId = cleanText(body.participantId, 36);
  const businessType = cleanText(body.businessType, 80);
  const email = cleanText(body.email, 160).toLowerCase();
  const participant = participants.find(item => item.id === participantId);
  if (!participant || !businessType || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return failure("INVALID_PROFILE", "Peserta, jenis usaha, dan email PRE-TEST harus valid.", 400);
  }

  const now = new Date().toISOString();
  await env.PANGLIMA_DEVICE_DB.prepare(
    "INSERT INTO panglima_pretest_profiles " +
    "(participant_id, owner_name, business_name, business_type, email, source, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, 'pretest', ?, ?) " +
    "ON CONFLICT(participant_id) DO UPDATE SET owner_name = excluded.owner_name, " +
    "business_name = excluded.business_name, business_type = excluded.business_type, " +
    "email = excluded.email, source = 'pretest', updated_at = excluded.updated_at"
  ).bind(participantId, participant.owner, participant.business, businessType, email, now, now).run();

  return response({ ok: true, participant: {
    id: participantId, owner: participant.owner, business: participant.business, type: businessType, email
  } });
}

async function resetDevice(request, env) {
  const participants = await authorizeAdmin(request, env);
  if (!participants) return failure("ADMIN_UNAUTHORIZED", "Token admin tidak sesuai.", 401);
  const body = await requestBody(request);
  const participantId = cleanText(body && body.participantId, 36);
  if (!PARTICIPANT_ID_PATTERN.test(participantId) || !participants.some(item => item.id === participantId)) {
    return failure("INVALID_PARTICIPANT", "Peserta tidak ditemukan.", 400);
  }

  const result = await env.PANGLIMA_DEVICE_DB.prepare(
    "DELETE FROM panglima_device_licenses WHERE participant_id = ?"
  ).bind(participantId).run();
  return response({ ok: true, participantId, deviceReleased: Number(result.meta && result.meta.changes || 0) > 0 });
}

function adminPage() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Profil & Perangkat Panglima</title>
<style>body{font:15px system-ui,sans-serif;background:#f8f5f1;color:#211b18;margin:0;padding:24px}.shell{max-width:980px;margin:auto}.card{background:#fff;border:1px solid #eae3dc;border-radius:18px;padding:20px;margin:14px 0}h1{color:#831d28}label{display:block;font-weight:650;margin:14px 0 6px}input,select,button{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d8cec5;border-radius:10px;font:inherit}button{background:#831d28;color:white;border:0;cursor:pointer}.small{width:auto;padding:7px 10px}.muted{color:#746a64}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;border-bottom:1px solid #eee;padding:10px}.ok{color:#137547}.pending{color:#9a6200}</style></head>
<body><main class="shell"><h1>Admin Profil PRE-TEST & Kunci Perangkat</h1><p class="muted">Lapisan pengaman terpisah. Worker AI, webhook, dan affiliate tidak diubah.</p>
<section class="card"><label for="secret">Token admin AI Panglima yang sudah ada</label><input id="secret" type="password" autocomplete="off"><button id="load" type="button" style="margin-top:14px">Muat Peserta & Status Perangkat</button><p id="message" class="muted"></p></section>
<section class="card"><h2>Profil PRE-TEST</h2><label for="participant">Peserta</label><select id="participant"></select><label for="businessType">Jenis usaha dari PRE-TEST</label><input id="businessType" maxlength="80"><label for="email">Email peserta</label><input id="email" type="email" maxlength="160"><button id="save" type="button" style="margin-top:14px">Simpan Profil PRE-TEST</button></section>
<section class="card"><h2>Perangkat peserta (maksimal 2)</h2><div class="scroll"><table><thead><tr><th>Peserta</th><th>Usaha</th><th>Jenis Usaha</th><th>Profil</th><th>Perangkat</th><th>Aksi</th></tr></thead><tbody id="rows"></tbody></table></div></section></main>
<script nonce="${nonce}">const el=id=>document.getElementById(id);let items=[];function headers(){return {'content-type':'application/json','authorization':'Bearer '+el('secret').value.trim()}}function message(text){el('message').textContent=text}function cell(row,text,className){const node=document.createElement('td');node.textContent=text;if(className)node.className=className;row.appendChild(node);return node}function render(){const body=el('rows');const select=el('participant');body.replaceChildren();select.replaceChildren();items.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.owner+' — '+item.business;select.appendChild(option);const row=document.createElement('tr');cell(row,item.owner);cell(row,item.business);cell(row,item.type||'Belum tersedia');cell(row,item.profileSource==='pretest'?'PRE-TEST':'Registrasi',item.profileSource==='pretest'?'ok':'pending');cell(row,item.deviceBound?'Aktif '+item.deviceCount+'/2 ('+item.deviceHints.join(', ')+')':'Belum aktif',item.deviceBound?'ok':'pending');const action=cell(row,'');if(item.deviceBound){const button=document.createElement('button');button.type='button';button.className='small';button.textContent='Lepas semua perangkat';button.addEventListener('click',()=>release(item));action.appendChild(button)}body.appendChild(row)});sync()}function sync(){const item=items.find(value=>value.id===el('participant').value);el('businessType').value=item&&item.type||'';el('email').value=item&&item.email||''}async function load(){message('Memeriksa token admin...');try{const result=await fetch('/v1/admin/licenses',{headers:headers()});const data=await result.json();if(!result.ok||!data.ok)throw Error(data.message||'Gagal memuat peserta');items=data.participants;render();message(items.length+' peserta berhasil dimuat.')}catch(error){message(error.message)}}async function save(){try{const result=await fetch('/v1/admin/profiles',{method:'POST',headers:headers(),body:JSON.stringify({participantId:el('participant').value,businessType:el('businessType').value,email:el('email').value})});const data=await result.json();if(!result.ok||!data.ok)throw Error(data.message||'Gagal menyimpan profil');await load();message('Profil PRE-TEST berhasil disimpan.')}catch(error){message(error.message)}}async function release(item){if(!confirm('Lepas semua perangkat untuk '+item.owner+'? Maksimal dua perangkat berikutnya dapat diaktifkan kembali.'))return;try{const result=await fetch('/v1/admin/reset-device',{method:'POST',headers:headers(),body:JSON.stringify({participantId:item.id})});const data=await result.json();if(!result.ok||!data.ok)throw Error(data.message||'Gagal melepas kunci');await load();message('Kunci perangkat '+item.owner+' berhasil dilepas.')}catch(error){message(error.message)}}el('load').addEventListener('click',load);el('save').addEventListener('click',save);el('participant').addEventListener('change',sync);</script></body></html>`;

  return new Response(html, { headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return response({
        ok: true,
        service: "panglima-device-api",
        ready: Boolean(env.PANGLIMA_CORE && env.PANGLIMA_DEVICE_DB && env.PANGLIMA_APP_DB),
        oneDevicePerParticipant: false,
        maxDevicesPerParticipant: MAX_DEVICES_PER_PARTICIPANT,
        moduleEntitlements: true,
        affiliateConnected: false
      });
    }

    if (!env.PANGLIMA_CORE || !env.PANGLIMA_DEVICE_DB || !env.PANGLIMA_APP_DB) {
      return failure("NOT_CONFIGURED", "Pengaman perangkat belum selesai dikonfigurasi.", 503);
    }

    try {
      if (request.method === "GET" && url.pathname === "/admin") return adminPage();
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") return await adminParticipants(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/profiles") return await saveProfile(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/reset-device") return await resetDevice(request, env);
      if (request.method === "POST" && url.pathname === "/v1/activate") return await activate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/module-key") return await moduleKey(request, env);
      if (request.method === "POST" && url.pathname === "/v1/consultation") return await consultation(request, env);
      return failure("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
    } catch (error) {
      console.error(JSON.stringify({
        message: "panglima-device-worker-error",
        path: url.pathname,
        error: String(error && error.message || "unknown_error").slice(0, 220)
      }));
      return failure("INTERNAL_ERROR", "Layanan perangkat sedang tidak tersedia.", 500);
    }
  }
};
