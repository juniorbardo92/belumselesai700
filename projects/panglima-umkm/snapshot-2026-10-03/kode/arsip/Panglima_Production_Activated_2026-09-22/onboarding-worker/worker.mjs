const TEXT_ENCODER = new TextEncoder();
const GOOGLE_USERINFO_URLS = Object.freeze([
  'https://openidconnect.googleapis.com/v1/userinfo',
  'https://www.googleapis.com/oauth2/v3/userinfo'
]);
const SIMULATION_TRANSACTION_PATTERN =
  /^TEST-PANGLIMA-[A-Z0-9]{6,32}(?:-[A-Z0-9]{4,32})?$/;
const MAX_BODY_BYTES = 8192;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;
const REQUEST_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const TOKEN_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const TOKEN_REQUEST_MAX_PER_WINDOW = 3;
const TOKEN_REQUEST_BATCH_MAX = 10;
const MODULES = Object.freeze({
  property: 'Modul Agen Properti',
  insurance: 'Modul Agen Asuransi',
  mlm: 'Modul Mitra MLM / Direct Selling'
});

const RESPONSE_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS
  });
}

function failure(code, message, status) {
  return json({ ok: false, code, message }, status);
}

function cleanText(value, maximum) {
  return String(value == null ? '' : value)
    .trim()
    .slice(0, maximum);
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase();
}

function isSimulationTransactionId(value) {
  return SIMULATION_TRANSACTION_PATTERN.test(String(value || ''));
}

function moduleCode(value) {
  const code = cleanText(value, 24).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MODULES, code) ? code : '';
}

function entitlementStatement(database, participantId, transactionId, code, now) {
  if (!code) return null;
  return database.prepare(
    'INSERT INTO panglima_module_entitlements ' +
      '(participant_id, transaction_id, module_code, source_variant, granted_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(participant_id, module_code) DO UPDATE SET ' +
      'transaction_id = excluded.transaction_id, source_variant = excluded.source_variant, ' +
      'updated_at = excluded.updated_at'
  ).bind(participantId, transactionId, code, MODULES[code], now, now);
}

function configured(env) {
  return Boolean(
    env.PANGLIMA_APP_DB &&
    /^[0-9]{10,30}$/.test(String(env.PANGLIMA_ALLOWED_GOOGLE_SUB || '')) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(env.PANGLIMA_ALLOWED_GOOGLE_EMAIL || '')
    ) &&
    String(env.PANGLIMA_PRODUCT_NAME || '').trim()
  );
}

async function authenticateGoogle(request, env) {
  const authorization = String(request.headers.get('authorization') || '');
  const match = /^Bearer ([A-Za-z0-9._~+/-]{20,4096})$/.exec(authorization);

  if (!match) {
    return failure('GOOGLE_AUTH_REQUIRED', 'Token OAuth Google wajib diisi.', 401);
  }

  let googleResponse = null;
  for (const url of GOOGLE_USERINFO_URLS) {
    try {
      const candidate = await fetch(url, {
        method: 'GET',
        headers: { authorization: 'Bearer ' + match[1] },
        redirect: 'follow'
      });
      googleResponse = candidate;
      if (candidate.ok) break;
    } catch (_) {
      // Coba endpoint resmi Google berikutnya bila subrequest pertama gagal.
    }
  }

  if (!googleResponse) {
    return failure(
      'GOOGLE_AUTH_UNAVAILABLE',
      'Verifikasi identitas Google sedang tidak tersedia.',
      503
    );
  }

  if (!googleResponse.ok) {
    return failure('GOOGLE_TOKEN_INVALID', 'Token OAuth Google tidak valid.', 401);
  }

  let identity;
  try {
    identity = await googleResponse.json();
  } catch (_) {
    return failure(
      'GOOGLE_AUTH_INVALID_RESPONSE',
      'Respons identitas Google tidak dapat dibaca.',
      502
    );
  }

  const verified = identity.email_verified === true ||
    identity.email_verified === 'true';
  const expectedSub = String(env.PANGLIMA_ALLOWED_GOOGLE_SUB || '');
  const expectedEmail = normalizeEmail(env.PANGLIMA_ALLOWED_GOOGLE_EMAIL);

  if (
    !verified ||
    String(identity.sub || '') !== expectedSub ||
    normalizeEmail(identity.email) !== expectedEmail
  ) {
    return failure(
      'GOOGLE_ACCOUNT_NOT_ALLOWED',
      'Akun Google ini tidak diizinkan untuk onboarding Panglima.',
      403
    );
  }

  return { sub: expectedSub, email: expectedEmail };
}

async function readBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return failure('BODY_TOO_LARGE', 'Ukuran permintaan terlalu besar.', 413);
  }

  const raw = await request.text();
  if (TEXT_ENCODER.encode(raw).byteLength > MAX_BODY_BYTES) {
    return failure('BODY_TOO_LARGE', 'Ukuran permintaan terlalu besar.', 413);
  }

  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return failure('INVALID_BODY', 'Data onboarding tidak valid.', 400);
    }
    return body;
  } catch (_) {
    return failure('INVALID_BODY', 'Data onboarding tidak valid.', 400);
  }
}

function validateIssuePayload(body, env) {
  const transactionId = cleanText(body.transactionId, 128);
  const email = normalizeEmail(body.email);
  const owner = cleanText(body.owner, 80);
  const business = cleanText(body.business, 100);
  const product = cleanText(body.product, 180);
  const requestedModule = cleanText(body.moduleCode, 24).toLowerCase();
  const selectedModule = moduleCode(requestedModule);

  if (!/^[A-Za-z0-9._-]{8,128}$/.test(transactionId)) {
    return failure('INVALID_TRANSACTION_ID', 'ID transaksi tidak valid.', 400);
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return failure('INVALID_BUYER_EMAIL', 'Email pembeli tidak valid.', 400);
  }
  if (!owner || !business) {
    return failure(
      'INCOMPLETE_PROFILE',
      'Nama lengkap dan nama usaha wajib diisi.',
      400
    );
  }
  if (normalizeText(product) !== normalizeText(env.PANGLIMA_PRODUCT_NAME)) {
    return failure(
      'PRODUCT_NOT_ELIGIBLE',
      'Produk ini tidak berhak menerima token Panglima.',
      403
    );
  }

  if (requestedModule && !selectedModule) {
    return failure(
      'INVALID_MODULE_VARIANT',
      'Jalur modul Panglima tidak dikenali.',
      400
    );
  }

  return {
    transactionId,
    email,
    owner,
    business,
    product,
    moduleCode: selectedModule
  };
}

function tokenString() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let suffix = '';

  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }

  return 'PANGLIMA-' + suffix;
}

async function tokenDigest(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(value))
  );
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function digestHex(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(String(value)))
  );
  return Array.from(bytes, function(byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

async function findFulfillment(database, transactionId) {
  return database.prepare(
    'SELECT f.transaction_id, f.participant_id, f.buyer_email, f.product_name, ' +
      'f.status AS fulfillment_status, f.email_sent_at, p.owner_name, ' +
      'p.business_name, p.status AS participant_status, p.daily_limit ' +
      'FROM panglima_onboarding_fulfillments f ' +
      'JOIN panglima_participants p ON p.id = f.participant_id ' +
      'WHERE f.transaction_id = ? LIMIT 1'
  ).bind(transactionId).first();
}

async function findEntitlementForTransaction(database, transactionId) {
  return database.prepare(
    'SELECT participant_id, transaction_id, module_code FROM panglima_module_entitlements ' +
      'WHERE transaction_id = ? LIMIT 1'
  ).bind(transactionId).first();
}

async function findFulfillmentByEmail(database, email, product) {
  return database.prepare(
    'SELECT f.transaction_id, f.participant_id, f.buyer_email, f.product_name, ' +
      'f.status AS fulfillment_status, f.email_sent_at, p.owner_name, ' +
      'p.business_name, p.status AS participant_status, p.daily_limit ' +
      'FROM panglima_onboarding_fulfillments f ' +
      'JOIN panglima_participants p ON p.id = f.participant_id ' +
      'WHERE lower(f.buyer_email) = ? AND lower(f.product_name) = ? ' +
      "AND p.status = 'active' ORDER BY f.created_at DESC LIMIT 1"
  ).bind(normalizeEmail(email), normalizeText(product)).first();
}

function tokenRequestAccepted() {
  return json({
    ok: true,
    status: 'REQUEST_ACCEPTED',
    message:
      'Jika email pembelian dan PRE-TEST cocok, token akan dikirim ke email maksimal 5 menit. Periksa juga folder Spam atau Promosi.'
  }, 202);
}

async function acceptTokenRequest(request, env) {
  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }

  const email = normalizeEmail(body.email);
  const deviceId = cleanText(body.deviceId, 64).toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return failure('INVALID_EMAIL', 'Masukkan email pembelian yang valid.', 400);
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return failure(
      'DEVICE_REQUIRED',
      'Perangkat belum dapat diverifikasi. Gunakan APK resmi terbaru.',
      400
    );
  }

  const database = env.PANGLIMA_APP_DB;
  const [emailHash, deviceHash] = await Promise.all([
    digestHex('panglima-token-email-v1:' + email),
    digestHex('panglima-token-device-v1:' + deviceId)
  ]);
  const cutoff = new Date(Date.now() - TOKEN_REQUEST_WINDOW_MS).toISOString();
  const recent = await database.prepare(
    'SELECT COUNT(*) AS request_count FROM panglima_token_requests ' +
      'WHERE (email_hash = ? OR device_hash = ?) AND requested_at >= ?'
  ).bind(emailHash, deviceHash, cutoff).first();

  if (Number(recent && recent.request_count || 0) >= TOKEN_REQUEST_MAX_PER_WINDOW) {
    return tokenRequestAccepted();
  }

  const fulfillment = await findFulfillmentByEmail(
    database,
    email,
    env.PANGLIMA_PRODUCT_NAME
  );
  if (!fulfillment) {
    return tokenRequestAccepted();
  }

  const pending = await database.prepare(
    'SELECT request_id FROM panglima_token_requests ' +
      "WHERE transaction_id = ? AND status IN ('PENDING', 'PROCESSING') " +
      'AND requested_at >= ? ORDER BY requested_at DESC LIMIT 1'
  ).bind(fulfillment.transaction_id, cutoff).first();
  if (pending) {
    return tokenRequestAccepted();
  }

  const now = new Date().toISOString();
  await database.prepare(
    'INSERT INTO panglima_token_requests ' +
      '(request_id, transaction_id, participant_id, buyer_email, email_hash, ' +
      "device_hash, status, attempts, requested_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    fulfillment.transaction_id,
    fulfillment.participant_id,
    email,
    emailHash,
    deviceHash,
    now,
    now
  ).run();

  console.log(JSON.stringify({
    message: 'panglima-token-request-queued',
    transactionId: fulfillment.transaction_id,
    requestedAt: now
  }));
  return tokenRequestAccepted();
}

async function listTokenRequests(env, body) {
  const requestedLimit = Math.floor(Number(body.limit) || TOKEN_REQUEST_BATCH_MAX);
  const limit = Math.max(1, Math.min(TOKEN_REQUEST_BATCH_MAX, requestedLimit));
  const result = await env.PANGLIMA_APP_DB.prepare(
    'SELECT r.request_id, r.transaction_id, r.participant_id, r.buyer_email, ' +
      'r.attempts, r.requested_at, f.product_name, p.owner_name, p.business_name ' +
      'FROM panglima_token_requests r ' +
      'JOIN panglima_onboarding_fulfillments f ON f.transaction_id = r.transaction_id ' +
      'JOIN panglima_participants p ON p.id = r.participant_id ' +
      "WHERE r.status IN ('PENDING', 'FAILED') AND r.attempts < 3 " +
      "AND p.status = 'active' ORDER BY r.requested_at ASC LIMIT ?"
  ).bind(limit).all();

  return json({
    ok: true,
    requests: (result.results || []).map(function(item) {
      return {
        requestId: item.request_id,
        transactionId: item.transaction_id,
        participantId: item.participant_id,
        email: normalizeEmail(item.buyer_email),
        attempts: Number(item.attempts) || 0,
        requestedAt: item.requested_at,
        product: item.product_name,
        owner: item.owner_name,
        business: item.business_name
      };
    })
  });
}

async function issueRequestedToken(env, body) {
  const requestId = cleanText(body.requestId, 80);
  const requestedModule = cleanText(body.moduleCode, 24).toLowerCase();
  const selectedModule = moduleCode(requestedModule);
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return failure('INVALID_TOKEN_REQUEST', 'Permintaan token tidak valid.', 400);
  }
  if (requestedModule && !selectedModule) {
    return failure('INVALID_MODULE_VARIANT', 'Varian modul Panglima tidak dikenali.', 400);
  }

  const database = env.PANGLIMA_APP_DB;
  const item = await database.prepare(
    'SELECT r.request_id, r.transaction_id, r.participant_id, r.buyer_email, ' +
      'r.status AS request_status, r.attempts, f.product_name, ' +
      'p.owner_name, p.business_name, p.status AS participant_status, p.daily_limit ' +
      'FROM panglima_token_requests r ' +
      'JOIN panglima_onboarding_fulfillments f ON f.transaction_id = r.transaction_id ' +
      'JOIN panglima_participants p ON p.id = r.participant_id ' +
      'WHERE r.request_id = ? LIMIT 1'
  ).bind(requestId).first();

  if (!item || item.participant_status !== 'active') {
    return failure('TOKEN_REQUEST_NOT_FOUND', 'Permintaan token tidak ditemukan.', 404);
  }
  if (item.request_status === 'SENT') {
    return json({ ok: true, status: 'TOKEN_EMAIL_SENT' });
  }
  if (Number(item.attempts || 0) >= 3) {
    return failure('TOKEN_REQUEST_LIMIT', 'Batas pengiriman ulang telah tercapai.', 409);
  }
  if (normalizeText(item.product_name) !== normalizeText(env.PANGLIMA_PRODUCT_NAME)) {
    return failure('PRODUCT_NOT_ELIGIBLE', 'Produk ini tidak berhak menerima token Panglima.', 403);
  }

  const accessCode = tokenString();
  const now = new Date().toISOString();
  const statements = [
    database.prepare(
      'UPDATE panglima_participants SET access_code_hash = ? WHERE id = ?'
    ).bind(await tokenDigest(accessCode), item.participant_id),
    database.prepare(
      "UPDATE panglima_token_requests SET status = 'PROCESSING', attempts = attempts + 1, " +
        'updated_at = ?, error_code = NULL WHERE request_id = ?'
    ).bind(now, requestId),
    database.prepare(
      "UPDATE panglima_onboarding_fulfillments SET status = 'TOKEN_ISSUED', " +
        'updated_at = ? WHERE transaction_id = ?'
    ).bind(now, item.transaction_id)
  ];
  const entitlement = entitlementStatement(
    database,
    item.participant_id,
    item.transaction_id,
    selectedModule,
    now
  );
  if (entitlement) statements.push(entitlement);
  await database.batch(statements);

  return json({
    ok: true,
    status: 'TOKEN_ISSUED',
    requestId: requestId,
    transactionId: item.transaction_id,
    email: normalizeEmail(item.buyer_email),
    participant: {
      id: item.participant_id,
      owner: item.owner_name,
      business: item.business_name,
      dailyLimit: Number(item.daily_limit),
      module: selectedModule ? {
        code: selectedModule,
        title: MODULES[selectedModule]
      } : null
    },
    accessCode: accessCode
  });
}

async function confirmRequestedToken(env, body) {
  const requestId = cleanText(body.requestId, 80);
  const transactionId = cleanText(body.transactionId, 128);
  const participantId = cleanText(body.participantId, 80);
  const email = normalizeEmail(body.email);
  if (
    !REQUEST_ID_PATTERN.test(requestId) ||
    !/^[A-Za-z0-9._-]{8,128}$/.test(transactionId) ||
    !REQUEST_ID_PATTERN.test(participantId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return failure('INVALID_CONFIRMATION', 'Data konfirmasi pengiriman tidak valid.', 400);
  }

  const database = env.PANGLIMA_APP_DB;
  const item = await database.prepare(
    'SELECT request_id FROM panglima_token_requests ' +
      'WHERE request_id = ? AND transaction_id = ? AND participant_id = ? ' +
      'AND lower(buyer_email) = ? LIMIT 1'
  ).bind(requestId, transactionId, participantId, email).first();
  if (!item) {
    return failure('TOKEN_REQUEST_NOT_FOUND', 'Permintaan token tidak ditemukan.', 404);
  }

  const now = new Date().toISOString();
  await database.batch([
    database.prepare(
      "UPDATE panglima_onboarding_fulfillments SET status = 'TOKEN_EMAIL_SENT', " +
        'email_sent_at = ?, updated_at = ? WHERE transaction_id = ?'
    ).bind(now, now, transactionId),
    database.prepare(
      "UPDATE panglima_token_requests SET status = 'SENT', processed_at = ?, " +
        'updated_at = ?, error_code = NULL WHERE request_id = ?'
    ).bind(now, now, requestId)
  ]);

  return json({ ok: true, status: 'TOKEN_EMAIL_SENT', emailSentAt: now });
}

async function failRequestedToken(env, body) {
  const requestId = cleanText(body.requestId, 80);
  const errorCode = cleanText(body.errorCode, 80).toUpperCase() || 'DELIVERY_FAILED';
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return failure('INVALID_TOKEN_REQUEST', 'Permintaan token tidak valid.', 400);
  }
  await env.PANGLIMA_APP_DB.prepare(
    "UPDATE panglima_token_requests SET status = 'FAILED', " +
      "attempts = CASE WHEN status = 'PROCESSING' THEN attempts ELSE attempts + 1 END, " +
      'error_code = ?, updated_at = ? WHERE request_id = ?'
  ).bind(errorCode, new Date().toISOString(), requestId).run();
  return json({ ok: true, status: 'TOKEN_REQUEST_RETRY_SCHEDULED' });
}

function fulfillmentMismatch(existing, payload) {
  return (
    normalizeEmail(existing.buyer_email) !== payload.email ||
    normalizeText(existing.product_name) !== normalizeText(payload.product) ||
    normalizeText(existing.owner_name) !== normalizeText(payload.owner) ||
    normalizeText(existing.business_name) !== normalizeText(payload.business)
  );
}

async function issueToken(env, identity, payload) {
  const database = env.PANGLIMA_APP_DB;
  const existing = await findFulfillment(database, payload.transactionId);
  const now = new Date().toISOString();

  if (existing) {
    if (fulfillmentMismatch(existing, payload)) {
      return failure(
        'FULFILLMENT_IDENTITY_MISMATCH',
        'Transaksi ini sudah terhubung ke profil lain.',
        409
      );
    }
    if (existing.participant_status !== 'active') {
      return failure('PARTICIPANT_NOT_ACTIVE', 'Akses peserta tidak aktif.', 409);
    }
    const currentEntitlement = await findEntitlementForTransaction(
      database,
      payload.transactionId
    );
    if (
      currentEntitlement &&
      payload.moduleCode &&
      currentEntitlement.module_code !== payload.moduleCode
    ) {
      return failure(
        'MODULE_VARIANT_MISMATCH',
        'Jalur transaksi ini sudah terhubung ke modul lain.',
        409
      );
    }
    const effectiveModule = currentEntitlement && currentEntitlement.module_code ||
      payload.moduleCode;
    if (existing.fulfillment_status === 'TOKEN_EMAIL_SENT') {
      const entitlement = entitlementStatement(
        database,
        existing.participant_id,
        payload.transactionId,
        effectiveModule,
        now
      );
      if (entitlement) await entitlement.run();
      return json({
        ok: true,
        status: 'TOKEN_EMAIL_SENT',
        participant: {
          id: existing.participant_id,
          owner: existing.owner_name,
          business: existing.business_name,
          dailyLimit: Number(existing.daily_limit),
          module: effectiveModule ? {
            code: effectiveModule,
            title: MODULES[effectiveModule]
          } : null
        },
        emailSentAt: existing.email_sent_at
      });
    }

    const retryToken = tokenString();
    const statements = [
      database.prepare(
        'UPDATE panglima_participants SET access_code_hash = ? WHERE id = ?'
      ).bind(await tokenDigest(retryToken), existing.participant_id),
      database.prepare(
        'UPDATE panglima_onboarding_fulfillments SET updated_at = ? ' +
          'WHERE transaction_id = ?'
      ).bind(now, payload.transactionId)
    ];
    const entitlement = entitlementStatement(
      database,
      existing.participant_id,
      payload.transactionId,
      effectiveModule,
      now
    );
    if (entitlement) statements.push(entitlement);
    await database.batch(statements);

    return json({
      ok: true,
      status: 'TOKEN_ISSUED',
      participant: {
        id: existing.participant_id,
        owner: existing.owner_name,
        business: existing.business_name,
        dailyLimit: Number(existing.daily_limit),
        module: effectiveModule ? {
          code: effectiveModule,
          title: MODULES[effectiveModule]
        } : null
      },
      accessCode: retryToken
    });
  }

  const participantId = crypto.randomUUID();
  const accessCode = tokenString();
  const tokenHash = await tokenDigest(accessCode);

  try {
    const statements = [
      database.prepare(
        'INSERT INTO panglima_participants ' +
          '(id, owner_name, business_name, access_code_hash, status, daily_limit, created_at) ' +
          "VALUES (?, ?, ?, ?, 'active', 3, ?)"
      ).bind(participantId, payload.owner, payload.business, tokenHash, now),
      database.prepare(
        'INSERT INTO panglima_onboarding_fulfillments ' +
          '(transaction_id, participant_id, buyer_email, product_name, status, ' +
          'created_at, updated_at, created_by_google_sub) ' +
          "VALUES (?, ?, ?, ?, 'TOKEN_ISSUED', ?, ?, ?)"
      ).bind(
        payload.transactionId,
        participantId,
        payload.email,
        payload.product,
        now,
        now,
        identity.sub
      )
    ];
    const entitlement = entitlementStatement(
      database,
      participantId,
      payload.transactionId,
      payload.moduleCode,
      now
    );
    if (entitlement) statements.push(entitlement);
    await database.batch(statements);
  } catch (error) {
    if (/unique|constraint/i.test(String(error && error.message || ''))) {
      return failure(
        'FULFILLMENT_CONFLICT',
        'Transaksi sedang diproses; silakan jalankan ulang.',
        409
      );
    }
    throw error;
  }

  return json({
    ok: true,
    status: 'TOKEN_ISSUED',
    participant: {
      id: participantId,
      owner: payload.owner,
      business: payload.business,
      dailyLimit: 3,
      module: payload.moduleCode ? {
        code: payload.moduleCode,
        title: MODULES[payload.moduleCode]
      } : null
    },
    accessCode
  }, 201);
}

async function confirmDelivery(env, body) {
  const transactionId = cleanText(body.transactionId, 128);
  const participantId = cleanText(body.participantId, 80);
  const email = normalizeEmail(body.email);

  if (
    !/^[A-Za-z0-9._-]{8,128}$/.test(transactionId) ||
    !/^[a-f0-9-]{36}$/i.test(participantId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return failure(
      'INVALID_CONFIRMATION',
      'Data konfirmasi pengiriman tidak valid.',
      400
    );
  }

  const existing = await findFulfillment(env.PANGLIMA_APP_DB, transactionId);
  if (
    !existing ||
    existing.participant_id !== participantId ||
    normalizeEmail(existing.buyer_email) !== email
  ) {
    return failure(
      'FULFILLMENT_NOT_FOUND',
      'Transaksi atau peserta tidak sesuai.',
      404
    );
  }

  if (existing.fulfillment_status === 'TOKEN_EMAIL_SENT') {
    return json({
      ok: true,
      status: 'TOKEN_EMAIL_SENT',
      emailSentAt: existing.email_sent_at
    });
  }

  const now = new Date().toISOString();
  await env.PANGLIMA_APP_DB.prepare(
    "UPDATE panglima_onboarding_fulfillments SET status = 'TOKEN_EMAIL_SENT', " +
      'email_sent_at = ?, updated_at = ? WHERE transaction_id = ?'
  ).bind(now, now, transactionId).run();

  return json({ ok: true, status: 'TOKEN_EMAIL_SENT', emailSentAt: now });
}

function validateSimulationOwnership(identity, body) {
  const transactionId = cleanText(body.transactionId, 128);
  const email = normalizeEmail(body.email);

  if (!isSimulationTransactionId(transactionId)) {
    return failure(
      'SIMULATION_TRANSACTION_REQUIRED',
      'Simulasi hanya menerima ID transaksi TEST-PANGLIMA.',
      403
    );
  }

  if (email !== identity.email) {
    return failure(
      'SIMULATION_EMAIL_NOT_ALLOWED',
      'Simulasi hanya boleh memakai email akun Google admin.',
      403
    );
  }

  return { transactionId, email };
}

async function cleanupSimulation(env, identity, body) {
  const ownership = validateSimulationOwnership(identity, body);
  if (ownership instanceof Response) {
    return ownership;
  }

  const participantId = cleanText(body.participantId, 80);
  if (!/^[a-f0-9-]{36}$/i.test(participantId)) {
    return failure(
      'INVALID_SIMULATION_PARTICIPANT',
      'Participant ID simulasi tidak valid.',
      400
    );
  }

  const existing = await findFulfillment(
    env.PANGLIMA_APP_DB,
    ownership.transactionId
  );

  if (
    !existing ||
    existing.participant_id !== participantId ||
    normalizeEmail(existing.buyer_email) !== ownership.email
  ) {
    return failure(
      'SIMULATION_NOT_FOUND',
      'Data simulasi tidak ditemukan atau tidak cocok dengan akun admin.',
      404
    );
  }

  await env.PANGLIMA_APP_DB.batch([
    env.PANGLIMA_APP_DB.prepare(
      'DELETE FROM panglima_consultations WHERE participant_id = ?'
    ).bind(participantId),
    env.PANGLIMA_APP_DB.prepare(
      'DELETE FROM panglima_module_entitlements WHERE participant_id = ?'
    ).bind(participantId),
    env.PANGLIMA_APP_DB.prepare(
      'DELETE FROM panglima_onboarding_fulfillments ' +
        'WHERE transaction_id = ? AND participant_id = ? AND buyer_email = ?'
    ).bind(ownership.transactionId, participantId, ownership.email),
    env.PANGLIMA_APP_DB.prepare(
      'DELETE FROM panglima_participants WHERE id = ?'
    ).bind(participantId)
  ]);

  return json({
    ok: true,
    status: 'SIMULATION_CLEANED',
    transactionId: ownership.transactionId,
    participantId: participantId
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (request.method === 'GET' && pathname === '/health') {
      return json({
        ok: true,
        service: 'panglima-pretest-onboarding',
        authentication: 'google-oauth',
        ready: configured(env),
        tokenRequestReady: configured(env)
      });
    }

    if (request.method === 'POST' && pathname === '/v1/onboarding/request-token') {
      if (!configured(env)) {
        return failure('NOT_CONFIGURED', 'Layanan permintaan token belum siap.', 503);
      }
      try {
        return await acceptTokenRequest(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          message: 'panglima-token-request-error',
          error: String(error && error.message || 'unknown_error').slice(0, 220)
        }));
        return failure(
          'TOKEN_REQUEST_UNAVAILABLE',
          'Permintaan token belum dapat diproses. Silakan coba lagi.',
          500
        );
      }
    }

    if (request.method === 'GET' && pathname === '/v1/onboarding/whoami') {
      if (!configured(env)) {
        return failure('NOT_CONFIGURED', 'Worker onboarding belum siap.', 503);
      }

      const identity = await authenticateGoogle(request, env);
      if (identity instanceof Response) {
        return identity;
      }

      return json({
        ok: true,
        account: identity.email,
        authentication: 'google-oauth'
      });
    }

    const supportedPostRoutes = [
      '/v1/onboarding/issue',
      '/v1/onboarding/confirm',
      '/v1/onboarding/requests/list',
      '/v1/onboarding/requests/issue',
      '/v1/onboarding/requests/confirm',
      '/v1/onboarding/requests/fail',
      '/v1/onboarding/test/issue',
      '/v1/onboarding/test/confirm',
      '/v1/onboarding/test/cleanup'
    ];

    if (request.method !== 'POST' || !supportedPostRoutes.includes(pathname)) {
      return failure('NOT_FOUND', 'Endpoint tidak ditemukan.', 404);
    }

    if (!configured(env)) {
      return failure('NOT_CONFIGURED', 'Worker onboarding belum siap.', 503);
    }

    const identity = await authenticateGoogle(request, env);
    if (identity instanceof Response) {
      return identity;
    }

    const body = await readBody(request);
    if (body instanceof Response) {
      return body;
    }

    if (pathname === '/v1/onboarding/test/cleanup') {
      return cleanupSimulation(env, identity, body);
    }

    if (pathname === '/v1/onboarding/requests/list') {
      return listTokenRequests(env, body);
    }
    if (pathname === '/v1/onboarding/requests/issue') {
      return issueRequestedToken(env, body);
    }
    if (pathname === '/v1/onboarding/requests/confirm') {
      return confirmRequestedToken(env, body);
    }
    if (pathname === '/v1/onboarding/requests/fail') {
      return failRequestedToken(env, body);
    }

    const simulationRoute = pathname.startsWith('/v1/onboarding/test/');
    if (simulationRoute) {
      const ownership = validateSimulationOwnership(identity, body);
      if (ownership instanceof Response) {
        return ownership;
      }
    } else if (isSimulationTransactionId(body.transactionId)) {
      return failure(
        'SIMULATION_ROUTE_REQUIRED',
        'Transaksi simulasi wajib menggunakan endpoint khusus pengujian.',
        403
      );
    }

    if (
      pathname === '/v1/onboarding/confirm' ||
      pathname === '/v1/onboarding/test/confirm'
    ) {
      return confirmDelivery(env, body);
    }

    const payload = validateIssuePayload(body, env);
    if (payload instanceof Response) {
      return payload;
    }

    return issueToken(env, identity, payload);
  }
};
