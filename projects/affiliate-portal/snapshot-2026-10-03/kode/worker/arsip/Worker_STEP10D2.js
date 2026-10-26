/*
=========================================================
PANGLIMA UMKM — CLOUDFLARE WORKER
STEP 10B-1
Webhook Lynk + Affiliate Portal Proxy
=========================================================

MEMPERTAHANKAN:
- Lynk payment.received webhook
- Query token untuk transaksi nyata
- Merchant Key / signature diagnostic
- Forward webhook ke Google Apps Script
- Lynk Test URL tetap HTTP 200

MENAMBAHKAN:
- POST /portal untuk Portal Affiliate
- CORS hanya untuk domain resmi UMKM Naik Kelas
- Tidak membutuhkan query token untuk /portal
- Tidak pernah log OTP / session token / Merchant Key
=========================================================
*/

const WORKER_VERSION = "10D2-PORTAL-RESPONSE-FIX";

const PORTAL_ALLOWED_ORIGINS = new Set([
  "https://umkmnaikkelas.id",
  "https://www.umkmnaikkelas.id",
]);

const PORTAL_ALLOWED_ACTIONS = new Set([
  "portal_request_otp",
  "portal_verify_otp",
  "portal_dashboard",
  "portal_logout",
  "admin_request_otp",
  "admin_verify_otp",
  "admin_dashboard",
  "admin_update_affiliate_status",
  "admin_logout",
]);


/* =========================================================
   RESPONSE HELPERS
   ========================================================= */

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function portalCorsHeaders(origin) {
  const allowed = PORTAL_ALLOWED_ORIGINS.has(origin);

  return {
    ...(allowed
      ? {
          "Access-Control-Allow-Origin": origin,
        }
      : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function isPortalOriginAllowed(request) {
  const origin = request.headers.get("origin") || "";

  // Server-to-server / manual HTTP tester boleh tanpa Origin.
  if (!origin) return true;

  // Portal Admin yang disajikan langsung oleh Worker
  // melakukan POST same-origin ke /portal.
  const workerOrigin = new URL(request.url).origin;

  if (origin === workerOrigin) {
    return true;
  }

  return PORTAL_ALLOWED_ORIGINS.has(origin);
}


/* =========================================================
   LYNK PAYLOAD HELPERS
   ========================================================= */

function getEventType(body) {
  return String(
    body?.event ||
    body?.type ||
    body?.eventType ||
    body?.event_type ||
    body?.message?.action ||
    body?.data?.event ||
    body?.data?.message?.action ||
    body?.data?.message_action ||
    ""
  ).toLowerCase();
}

function getRefId(body) {
  return String(
    body?.refId ||
    body?.ref_id ||
    body?.data?.refId ||
    body?.data?.ref_id ||
    body?.transaction?.refId ||
    body?.transaction?.ref_id ||
    ""
  );
}

function getItems(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.order?.items)) return body.order.items;
  if (Array.isArray(body?.data?.order?.items)) return body.data.order.items;
  return [];
}

function getGrandTotal(body) {
  const value =
    body?.totals?.grandTotal ??
    body?.totals?.grand_total ??
    body?.data?.totals?.grandTotal ??
    body?.data?.totals?.grand_total ??
    body?.order?.totals?.grandTotal ??
    body?.order?.totals?.grand_total ??
    body?.grandTotal ??
    body?.grand_total ??
    body?.amount ??
    body?.total ??
    0;

  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}


/* =========================================================
   BODY PARSER
   ========================================================= */

async function readIncomingBody(request) {
  const raw = await request.text();

  const contentType =
    request.headers.get("content-type") ||
    "application/json";

  let parsed = {};

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      if (
        contentType.includes(
          "application/x-www-form-urlencoded"
        )
      ) {
        parsed = Object.fromEntries(
          new URLSearchParams(raw)
        );
      }
    }
  }

  return {
    raw,
    parsed,
    contentType,
  };
}


/* =========================================================
   SIGNATURE DIAGNOSTIC
   ========================================================= */

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

function bytesToBase64(buffer) {
  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  for (const b of bytes) {
    binary +=
      String.fromCharCode(b);
  }

  return btoa(binary);
}

async function hmacSha256(raw, secret) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const mac =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(raw)
    );

  return {
    hex:
      bytesToHex(mac),

    base64:
      bytesToBase64(mac),
  };
}

async function sha256(text) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        text
      )
    );

  return {
    hex:
      bytesToHex(digest),

    base64:
      bytesToBase64(digest),
  };
}

function normalizeSignature(value) {
  let s =
    String(
      value || ""
    ).trim();

  if (
    (
      s.startsWith('"') &&
      s.endsWith('"')
    ) ||
    (
      s.startsWith("'") &&
      s.endsWith("'")
    )
  ) {
    s =
      s.slice(
        1,
        -1
      );
  }

  s =
    s
      .replace(
        /^sha256=/i,
        ""
      )
      .trim();

  return s;
}

async function diagnoseLynkSignature(
  raw,
  signature,
  merchantKey
) {
  const normalized =
    normalizeSignature(
      signature
    );

  if (!normalized) {
    return {
      available: false,
      merchantKeyReady:
        Boolean(
          merchantKey
        ),
      match:
        "NO_SIGNATURE",
    };
  }

  if (!merchantKey) {
    return {
      available: true,
      merchantKeyReady:
        false,
      match:
        "MERCHANT_KEY_NOT_CONFIGURED",
    };
  }

  const [
    hmac,
    rawThenKey,
    keyThenRaw,
  ] =
    await Promise.all([
      hmacSha256(
        raw,
        merchantKey
      ),

      sha256(
        raw +
        merchantKey
      ),

      sha256(
        merchantKey +
        raw
      ),
    ]);

  const candidates = {
    HMAC_SHA256_HEX:
      hmac.hex,

    HMAC_SHA256_BASE64:
      hmac.base64,

    SHA256_BODY_PLUS_KEY_HEX:
      rawThenKey.hex,

    SHA256_BODY_PLUS_KEY_BASE64:
      rawThenKey.base64,

    SHA256_KEY_PLUS_BODY_HEX:
      keyThenRaw.hex,

    SHA256_KEY_PLUS_BODY_BASE64:
      keyThenRaw.base64,
  };

  for (
    const [
      name,
      candidate,
    ] of
    Object.entries(
      candidates
    )
  ) {
    if (
      normalized ===
      candidate
    ) {
      return {
        available: true,
        merchantKeyReady:
          true,
        match:
          name,
      };
    }
  }

  return {
    available: true,
    merchantKeyReady:
      true,
    match:
      "NO_MATCH",
  };
}


/* =========================================================
   GOOGLE APPS SCRIPT FORWARDER
   ========================================================= */

async function forwardToGoogle(
  env,
  raw,
  contentType,
  forwardedBy
) {
  if (
    !env
      .GOOGLE_AFFILIATE_WEBHOOK_URL
  ) {
    return {
      ok: false,
      error:
        "DOWNSTREAM_NOT_CONFIGURED",
      status: 500,
      text: "",
      data: null,
    };
  }

  let googleResponse;

  try {
    googleResponse =
      await fetch(
        env
          .GOOGLE_AFFILIATE_WEBHOOK_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              contentType,

            "X-Forwarded-By":
              forwardedBy,
          },

          body:
            raw,

          redirect:
            "follow",
        }
      );

  } catch (error) {
    console.error(
      "Google Apps Script fetch error:",
      String(error)
    );

    return {
      ok: false,
      error:
        "DOWNSTREAM_CONNECTION_FAILED",
      status: 502,
      text: "",
      data: null,
    };
  }

  const text =
    await googleResponse.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (e) {
    data = null;
  }

  return {
    ok:
      googleResponse.ok,

    status:
      googleResponse.status,

    text,
    data,
  };
}


/* =========================================================
   AFFILIATE PORTAL PROXY
   POST /portal
   ========================================================= */

async function handlePortal(
  request,
  env
) {
  const origin =
    request.headers.get(
      "origin"
    ) || "";

  const cors =
    portalCorsHeaders(
      origin
    );

  if (
    request.method ===
    "OPTIONS"
  ) {
    if (
      origin &&
      !PORTAL_ALLOWED_ORIGINS.has(
        origin
      )
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            "ORIGIN_NOT_ALLOWED",
        },
        403,
        cors
      );
    }

    return new Response(
      null,
      {
        status: 204,
        headers: cors,
      }
    );
  }

  if (
    request.method !==
    "POST"
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "METHOD_NOT_ALLOWED",
      },
      405,
      cors
    );
  }

  if (
    !isPortalOriginAllowed(
      request
    )
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "ORIGIN_NOT_ALLOWED",
      },
      403,
      cors
    );
  }

  const {
    raw,
    parsed,
    contentType,
  } =
    await readIncomingBody(
      request
    );

  const action =
    String(
      parsed?.action || ""
    )
      .trim()
      .toLowerCase();

  if (
    !PORTAL_ALLOWED_ACTIONS.has(
      action
    )
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "PORTAL_ACTION_NOT_ALLOWED",
      },
      400,
      cors
    );
  }

  /*
   * Jangan log:
   * - email
   * - OTP
   * - sessionToken
   * - body mentah
   */
  console.log(
    JSON.stringify({
      timestamp:
        new Date()
          .toISOString(),

      channel:
        "affiliate_portal",

      action,

      origin:
        origin || null,
    })
  );

  /*
   * Apps Script doPost portal membaca e.parameter.
   * Karena website mengirim JSON ke Worker, ubah payload
   * menjadi application/x-www-form-urlencoded sebelum
   * diteruskan ke Google Apps Script.
   */
  const googleFormBody =
    new URLSearchParams(
      Object.entries(parsed || {})
        .reduce((acc, [key, value]) => {
          if (
            value !== undefined &&
            value !== null
          ) {
            acc[key] =
              typeof value === "string"
                ? value
                : String(value);
          }

          return acc;
        }, {})
    ).toString();

  const downstream =
    await forwardToGoogle(
      env,
      googleFormBody,
      "application/x-www-form-urlencoded;charset=UTF-8",
      "panglima-affiliate-portal"
    );

  console.log(
    JSON.stringify({
      timestamp:
        new Date()
          .toISOString(),

      channel:
        "affiliate_portal",

      action,

      downstreamStatus:
        downstream.status,
    })
  );

  if (!downstream.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          downstream.error ||
          "PORTAL_DOWNSTREAM_ERROR",
        downstreamStatus:
          downstream.status,
      },
      502,
      cors
    );
  }

  if (
    downstream.data &&
    typeof downstream.data ===
      "object"
  ) {
    return jsonResponse(
      downstream.data,
      200,
      cors
    );
  }

  /*
   * DEBUG AMAN:
   * Jika Google Apps Script merespons non-JSON,
   * tampilkan preview singkat agar penyebabnya terlihat.
   * Tidak menggunakan variabel debugPreview,
   * sehingga tidak ada risiko duplicate declaration.
   */
  return jsonResponse(
    {
      ok: false,
      error:
        "INVALID_PORTAL_RESPONSE",

      message:
        "Google Apps Script response: " +
        (
          String(
            downstream.text || ""
          )
            .replace(
              /<[^>]*>/g,
              " "
            )
            .replace(
              /\s+/g,
              " "
            )
            .trim()
            .slice(
              0,
              500
            ) ||
          "[EMPTY RESPONSE]"
        ),

      downstreamStatus:
        downstream.status,
    },
    502,
    cors
  );
}


/* =========================================================
   STEP 10C — ADMIN PORTAL UI
   Disajikan langsung dari Cloudflare Worker.
   Tidak membutuhkan file baru di Hostinger Horizons.
   ========================================================= */

function adminPortalHtml() {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Portal Admin Affiliate — UMKM Naik Kelas</title>

  <style>
    :root{
      --red:#8c0d10;
      --red2:#650a0d;
      --gold:#b8892e;
      --bg:#f5f3ee;
      --card:#ffffff;
      --text:#171717;
      --muted:#737373;
      --line:#e7e5e4;
      --ok:#166534;
      --okbg:#f0fdf4;
      --err:#991b1b;
      --errbg:#fef2f2;
    }

    *{box-sizing:border-box}

    body{
      margin:0;
      font-family:Arial,Helvetica,sans-serif;
      background:var(--bg);
      color:var(--text);
    }

    a{color:inherit}

    .hidden{display:none!important}

    .wrap{
      width:min(1500px,calc(100% - 32px));
      margin:0 auto;
    }

    .login-shell{
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:28px 16px;
      background:#faf8f3;
    }

    .login-card{
      width:min(460px,100%);
      overflow:hidden;
      border:1px solid rgba(0,0,0,.10);
      border-radius:28px;
      background:#fff;
      box-shadow:0 20px 55px rgba(0,0,0,.08);
    }

    .login-head{
      padding:30px 28px;
      color:#fff;
      background:linear-gradient(135deg,var(--red2),var(--red),var(--gold));
    }

    .pill{
      display:inline-flex;
      padding:6px 10px;
      border:1px solid rgba(255,255,255,.25);
      border-radius:999px;
      background:rgba(255,255,255,.10);
      font-size:11px;
      font-weight:800;
      letter-spacing:.14em;
      text-transform:uppercase;
    }

    .login-head h1{
      margin:18px 0 8px;
      font-size:30px;
      line-height:1.08;
    }

    .login-head p{
      margin:0;
      color:rgba(255,255,255,.82);
      font-size:14px;
      line-height:1.55;
    }

    .login-body{padding:28px}

    label{
      display:block;
      margin-bottom:8px;
      font-size:13px;
      font-weight:800;
    }

    input,select{
      width:100%;
      min-height:48px;
      padding:0 14px;
      border:1px solid #d6d3d1;
      border-radius:12px;
      background:#fff;
      color:#171717;
      font:inherit;
      outline:none;
    }

    input:focus,select:focus{
      border-color:var(--red);
      box-shadow:0 0 0 4px rgba(140,13,16,.10);
    }

    .otp-input{
      min-height:58px;
      text-align:center;
      font-size:25px;
      font-weight:900;
      letter-spacing:.30em;
    }

    button{
      cursor:pointer;
      border:0;
      border-radius:12px;
      font:inherit;
      font-weight:800;
    }

    button:disabled{
      opacity:.55;
      cursor:not-allowed;
    }

    .btn-primary{
      width:100%;
      min-height:50px;
      margin-top:18px;
      padding:0 18px;
      background:var(--red);
      color:#fff;
    }

    .btn-primary:hover{background:#6f090c}

    .btn-light{
      min-height:42px;
      padding:0 14px;
      border:1px solid var(--line);
      background:#fff;
      color:#44403c;
    }

    .btn-danger{
      min-height:42px;
      padding:0 14px;
      background:var(--red);
      color:#fff;
    }

    .msg{
      margin-top:16px;
      padding:12px 14px;
      border-radius:12px;
      font-size:13px;
      line-height:1.5;
    }

    .msg.ok{
      color:var(--ok);
      background:var(--okbg);
      border:1px solid #bbf7d0;
    }

    .msg.err{
      color:var(--err);
      background:var(--errbg);
      border:1px solid #fecaca;
    }

    .topbar{
      position:sticky;
      top:0;
      z-index:20;
      border-bottom:1px solid var(--line);
      background:rgba(255,255,255,.96);
      backdrop-filter:blur(8px);
    }

    .topbar-inner{
      min-height:72px;
      display:flex;
      gap:18px;
      align-items:center;
      justify-content:space-between;
    }

    .brand-kicker{
      margin:0 0 4px;
      color:var(--red);
      font-size:11px;
      font-weight:900;
      letter-spacing:.16em;
      text-transform:uppercase;
    }

    .brand-title{
      margin:0;
      font-size:22px;
    }

    .actions{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }

    .content{
      padding:28px 0 44px;
    }

    .hero{
      padding:28px;
      border-radius:26px;
      color:#fff;
      background:linear-gradient(135deg,var(--red2),var(--red),var(--gold));
      box-shadow:0 18px 45px rgba(101,10,13,.14);
    }

    .hero-kicker{
      margin:0;
      color:#fde68a;
      font-size:11px;
      font-weight:900;
      letter-spacing:.16em;
      text-transform:uppercase;
    }

    .hero-row{
      display:flex;
      justify-content:space-between;
      align-items:end;
      gap:22px;
      margin-top:10px;
    }

    .hero h2{
      margin:0;
      font-size:38px;
      line-height:1.06;
    }

    .hero p{
      margin:9px 0 0;
      color:rgba(255,255,255,.78);
      font-size:14px;
    }

    .hero-update{
      flex:0 0 auto;
      color:rgba(255,255,255,.74);
      font-size:12px;
    }

    .stats{
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:14px;
      margin-top:16px;
    }

    .stats.four{
      grid-template-columns:repeat(4,minmax(0,1fr));
    }

    .stat{
      padding:20px;
      border:1px solid var(--line);
      border-radius:18px;
      background:#fff;
      box-shadow:0 3px 14px rgba(0,0,0,.03);
    }

    .stat-label{
      color:var(--muted);
      font-size:10px;
      font-weight:900;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    .stat-value{
      margin-top:8px;
      font-size:28px;
      font-weight:900;
      letter-spacing:-.025em;
    }

    .db{
      margin-top:22px;
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:22px;
      background:#fff;
    }

    .db-head{
      padding:20px;
      border-bottom:1px solid var(--line);
    }

    .db-row{
      display:flex;
      align-items:end;
      justify-content:space-between;
      gap:18px;
    }

    .db-kicker{
      margin:0;
      color:var(--red);
      font-size:10px;
      font-weight:900;
      letter-spacing:.15em;
      text-transform:uppercase;
    }

    .db h3{
      margin:5px 0 3px;
      font-size:21px;
    }

    .db-count{
      color:var(--muted);
      font-size:12px;
    }

    .filters{
      display:flex;
      gap:8px;
      min-width:min(580px,100%);
    }

    .filters input{flex:1}
    .filters select{width:190px}

    .table-wrap{
      width:100%;
      overflow:auto;
    }

    table{
      width:100%;
      min-width:1750px;
      border-collapse:collapse;
      font-size:12px;
    }

    th{
      position:sticky;
      top:0;
      z-index:2;
      padding:12px 14px;
      background:#fafafa;
      color:#737373;
      text-align:left;
      font-size:10px;
      letter-spacing:.08em;
      text-transform:uppercase;
      white-space:nowrap;
    }

    td{
      padding:14px;
      border-top:1px solid #f0efed;
      vertical-align:top;
    }

    tbody tr:hover{background:#fafaf9}

    .strong{font-weight:900}
    .muted{color:var(--muted)}
    .right{text-align:right}
    .nowrap{white-space:nowrap}
    .break{max-width:220px;word-break:break-all}

    .status{
      display:inline-flex;
      padding:5px 8px;
      border-radius:999px;
      background:#f5f5f4;
      font-size:10px;
      font-weight:900;
      white-space:nowrap;
    }

    .code{
      color:var(--red);
      font-weight:900;
    }

    .link{
      color:var(--red);
      font-weight:800;
      text-decoration:none;
    }

    .link:hover{text-decoration:underline}

    .action-stack{
      display:flex;
      flex-wrap:wrap;
      gap:6px;
      min-width:230px;
    }

    .action-btn{
      min-height:32px;
      padding:0 10px;
      border-radius:9px;
      font-size:10px;
      font-weight:900;
      letter-spacing:.02em;
    }

    .action-approve{
      background:#166534;
      color:#fff;
    }

    .action-reject{
      background:#991b1b;
      color:#fff;
    }

    .action-suspend{
      background:#92400e;
      color:#fff;
    }

    .action-btn:disabled{
      opacity:.45;
      cursor:not-allowed;
    }

    .name-button{
      padding:0;
      border:0;
      border-radius:0;
      background:transparent;
      color:var(--text);
      text-align:left;
      font:inherit;
      font-weight:900;
      cursor:pointer;
    }

    .name-button:hover{
      color:var(--red);
      text-decoration:underline;
    }

    .modal-backdrop{
      position:fixed;
      inset:0;
      z-index:100;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:22px;
      background:rgba(17,17,17,.58);
      backdrop-filter:blur(5px);
    }

    .modal{
      width:min(1050px,100%);
      max-height:calc(100vh - 44px);
      overflow:auto;
      border-radius:24px;
      background:#fff;
      box-shadow:0 30px 90px rgba(0,0,0,.28);
    }

    .modal-head{
      position:sticky;
      top:0;
      z-index:3;
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:18px;
      padding:22px 24px;
      border-bottom:1px solid var(--line);
      background:rgba(255,255,255,.97);
      backdrop-filter:blur(8px);
    }

    .modal-kicker{
      margin:0;
      color:var(--red);
      font-size:10px;
      font-weight:900;
      letter-spacing:.14em;
      text-transform:uppercase;
    }

    .modal-title{
      margin:5px 0 0;
      font-size:25px;
      line-height:1.15;
    }

    .modal-close{
      flex:0 0 auto;
      width:38px;
      height:38px;
      border:1px solid var(--line);
      border-radius:12px;
      background:#fff;
      color:#44403c;
      font-size:20px;
      line-height:1;
    }

    .modal-body{
      padding:24px;
    }

    .detail-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
    }

    .detail-card{
      padding:16px;
      border:1px solid var(--line);
      border-radius:16px;
      background:#fafaf9;
    }

    .detail-card.full{
      grid-column:1 / -1;
    }

    .detail-label{
      color:var(--muted);
      font-size:10px;
      font-weight:900;
      letter-spacing:.11em;
      text-transform:uppercase;
    }

    .detail-value{
      margin-top:6px;
      font-size:13px;
      font-weight:700;
      line-height:1.55;
      word-break:break-word;
      white-space:pre-wrap;
    }

    .detail-metrics{
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:12px;
      margin-top:18px;
    }

    .detail-metric{
      padding:16px;
      border:1px solid var(--line);
      border-radius:15px;
      background:#fff;
    }

    .detail-metric-label{
      color:var(--muted);
      font-size:9px;
      font-weight:900;
      letter-spacing:.10em;
      text-transform:uppercase;
    }

    .detail-metric-value{
      margin-top:7px;
      font-size:20px;
      font-weight:900;
    }

    .detail-actions{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-top:18px;
    }

    .detail-link{
      display:inline-flex;
      align-items:center;
      min-height:40px;
      padding:0 13px;
      border:1px solid var(--line);
      border-radius:11px;
      background:#fff;
      color:var(--red);
      font-size:12px;
      font-weight:900;
      text-decoration:none;
    }

    .detail-link:hover{
      background:#fafaf9;
    }

    @media(max-width:760px){
      .modal-backdrop{
        padding:10px;
      }

      .modal{
        max-height:calc(100vh - 20px);
        border-radius:18px;
      }

      .detail-grid{
        grid-template-columns:1fr;
      }

      .detail-card.full{
        grid-column:auto;
      }

      .detail-metrics{
        grid-template-columns:1fr 1fr;
      }
    }

    .empty{
      padding:40px 20px;
      color:var(--muted);
      text-align:center;
      font-size:13px;
    }

    .footer{
      padding:30px 0 4px;
      color:var(--muted);
      text-align:center;
      font-size:11px;
    }

    @media(max-width:1100px){
      .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
      .stats.four{grid-template-columns:repeat(2,minmax(0,1fr))}
      .db-row{align-items:stretch;flex-direction:column}
      .filters{min-width:0;width:100%}
    }

    @media(max-width:680px){
      .wrap{width:min(100% - 20px,1500px)}
      .topbar-inner{align-items:flex-start;flex-direction:column;padding:14px 0}
      .hero{padding:22px}
      .hero-row{align-items:flex-start;flex-direction:column}
      .hero h2{font-size:31px}
      .stats,.stats.four{grid-template-columns:1fr 1fr}
      .stat{padding:16px}
      .stat-value{font-size:23px}
      .filters{flex-direction:column}
      .filters select{width:100%}
    }
  </style>
</head>

<body>
  <section id="loginView" class="login-shell">
    <div class="login-card">
      <div class="login-head">
        <div class="pill">Administrator</div>
        <h1>Portal Admin Affiliate</h1>
        <p>Pantau seluruh affiliator, aktivitas referral, penjualan, omzet, dan komisi.</p>
      </div>

      <div class="login-body">
        <form id="emailForm">
          <label for="adminEmail">Email Admin</label>
          <input id="adminEmail" type="email" autocomplete="email" placeholder="email admin" required>
          <button id="sendOtpBtn" class="btn-primary" type="submit">Kirim Kode OTP Admin</button>
        </form>

        <form id="otpForm" class="hidden">
          <div class="muted" style="font-size:13px">Kode OTP dikirim ke:</div>
          <div id="otpEmailLabel" class="strong break" style="margin-top:5px"></div>

          <label for="adminOtp" style="margin-top:22px">Kode OTP 6 Digit</label>
          <input id="adminOtp" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
          <button id="verifyOtpBtn" class="btn-primary" type="submit">Masuk ke Portal Admin</button>

          <button id="changeEmailBtn" class="btn-light" type="button" style="width:100%;margin-top:10px">
            Ganti Email
          </button>
        </form>

        <div id="loginMessage"></div>
      </div>
    </div>
  </section>


  <section id="dashboardView" class="hidden">
    <header class="topbar">
      <div class="wrap topbar-inner">
        <div>
          <p class="brand-kicker">UMKM Naik Kelas</p>
          <h1 class="brand-title">Portal Admin Affiliate</h1>
        </div>

        <div class="actions">
          <button id="refreshBtn" class="btn-light" type="button">Refresh</button>
          <button id="logoutBtn" class="btn-danger" type="button">Keluar</button>
        </div>
      </div>
    </header>

    <main class="wrap content">
      <div id="dashMessage"></div>

      <section class="hero">
        <p class="hero-kicker">Affiliate Command Center</p>

        <div class="hero-row">
          <div>
            <h2><span id="heroTotal">0</span> Affiliator Bergabung</h2>
            <p>Data seluruh pendaftar Affiliate UMKM Naik Kelas.</p>
          </div>

          <div id="generatedAt" class="hero-update">Update: -</div>
        </div>
      </section>


      <section class="stats">
        <div class="stat"><div class="stat-label">Total Affiliate</div><div id="sTotal" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Approved</div><div id="sApproved" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Pending</div><div id="sPending" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Perlu Review</div><div id="sReview" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Email Verified</div><div id="sVerified" class="stat-value">0</div></div>
      </section>


      <section class="stats four">
        <div class="stat"><div class="stat-label">Page Views</div><div id="sPV" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Checkout Clicks</div><div id="sCheckout" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Purchases</div><div id="sPurchases" class="stat-value">0</div></div>
        <div class="stat"><div class="stat-label">Omzet Referral</div><div id="sRevenue" class="stat-value">Rp0</div></div>
      </section>


      <section class="stats four">
        <div class="stat"><div class="stat-label">Komisi Earned</div><div id="sEarned" class="stat-value">Rp0</div></div>
        <div class="stat"><div class="stat-label">Komisi Pending</div><div id="sCommissionPending" class="stat-value">Rp0</div></div>
        <div class="stat"><div class="stat-label">Komisi Approved</div><div id="sCommissionApproved" class="stat-value">Rp0</div></div>
        <div class="stat"><div class="stat-label">Komisi Paid</div><div id="sCommissionPaid" class="stat-value">Rp0</div></div>
      </section>


      <section class="db">
        <div class="db-head">
          <div class="db-row">
            <div>
              <p class="db-kicker">Database Affiliate</p>
              <h3>Detail Affiliator</h3>
              <div id="dbCount" class="db-count">0 affiliator</div>
            </div>

            <div class="filters">
              <input id="searchBox" type="search" placeholder="Cari nama, email, WA, kode…">

              <select id="statusFilter">
                <option value="ALL">Semua Status</option>
                <option value="APPROVED">APPROVED</option>
                <option value="PENDING">PENDING</option>
                <option value="PENDING_EMAIL">PENDING_EMAIL</option>
                <option value="EMAIL_ERROR">EMAIL_ERROR</option>
                <option value="REVIEW_DUPLICATE">REVIEW_DUPLICATE</option>
              </select>
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gabung</th>
                <th>Nama</th>
                <th>WhatsApp</th>
                <th>Email</th>
                <th>Kota / Profesi</th>
                <th>Kode</th>
                <th>Status</th>
                <th>Verified</th>
                <th class="right">PV</th>
                <th class="right">Checkout</th>
                <th class="right">Purchase</th>
                <th class="right">Omzet</th>
                <th class="right">Komisi</th>
                <th>Aktivitas</th>
                <th>Link</th>
                <th>Aksi Admin</th>
              </tr>
            </thead>

            <tbody id="affiliateRows"></tbody>
          </table>
        </div>

        <div id="emptyState" class="empty hidden">Tidak ada affiliator yang cocok dengan filter.</div>
      </section>

      <div class="footer">Portal Admin Affiliate — UMKM Naik Kelas</div>
    </main>
  </section>

  <div id="affiliateDetailModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="affiliateDetailTitle">
    <div class="modal">
      <div class="modal-head">
        <div>
          <p class="modal-kicker">Detail Affiliator</p>
          <h2 id="affiliateDetailTitle" class="modal-title">Affiliate</h2>
        </div>

        <button id="affiliateDetailClose" class="modal-close" type="button" aria-label="Tutup">×</button>
      </div>

      <div id="affiliateDetailBody" class="modal-body"></div>
    </div>
  </div>


<script>
(function(){
  const SESSION_KEY = 'umkmnaikkelas_affiliate_admin_session_v1';

  const state = {
    email: '',
    token: '',
    dashboard: null,
    affiliates: [],

    /*
     * Mencegah request restore session lama
     * menimpa layar OTP login baru.
     */
    authFlowId: 0,
  };

  const $ = (id) => document.getElementById(id);

  function esc(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function money(value){
    const n = Number(value || 0);
    return new Intl.NumberFormat('id-ID',{
      style:'currency',
      currency:'IDR',
      maximumFractionDigits:0
    }).format(Number.isFinite(n) ? n : 0);
  }

  function number(value){
    const n = Number(value || 0);
    return new Intl.NumberFormat('id-ID').format(Number.isFinite(n) ? n : 0);
  }

  function dateText(value){
    if(!value) return '-';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return '-';

    return new Intl.DateTimeFormat('id-ID',{
      day:'2-digit',
      month:'short',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    }).format(d);
  }

  function message(target,type,text){
    const el = $(target);

    if(!text){
      el.innerHTML = '';
      return;
    }

    el.innerHTML =
      '<div class="msg ' +
      (type === 'ok' ? 'ok' : 'err') +
      '">' +
      esc(text) +
      '</div>';
  }

  async function api(payload){
    const res = await fetch('/portal',{
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        ...payload,
        userAgent:navigator.userAgent || ''
      })
    });

    let data = {};

    try{
      data = await res.json();
    }catch(e){}

    if(!res.ok || data.ok === false){
      const error = new Error(
        data.message ||
        data.error ||
        'Portal admin sedang tidak dapat diakses.'
      );

      error.data = data;
      throw error;
    }

    return data;
  }

  function readSession(){
    try{
      const raw = localStorage.getItem(SESSION_KEY);
      if(!raw) return null;

      const data = JSON.parse(raw);

      if(!data.token || !data.expiresAt){
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      const expires = new Date(data.expiresAt).getTime();

      if(!expires || Date.now() >= expires){
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      return data;
    }catch(e){
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function saveSession(token,expiresAt,email){
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token,
        expiresAt,
        email
      })
    );
  }

  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
  }

  function showLogin(stage){
    $('dashboardView').classList.add('hidden');
    $('loginView').classList.remove('hidden');

    if(stage === 'otp'){
      $('emailForm').classList.add('hidden');
      $('otpForm').classList.remove('hidden');
      $('otpEmailLabel').textContent = state.email;
      $('adminOtp').focus();
    }else{
      $('otpForm').classList.add('hidden');
      $('emailForm').classList.remove('hidden');
      $('adminEmail').value = state.email || '';
    }
  }

  function showDashboard(){
    $('loginView').classList.add('hidden');
    $('dashboardView').classList.remove('hidden');
  }

  function setBusy(button,busy,busyText,normalText){
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }

  async function requestOtp(){
    const email =
      String($('adminEmail').value || '')
        .trim()
        .toLowerCase();

    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){
      message('loginMessage','err','Masukkan alamat email admin yang valid.');
      return;
    }

    /*
     * Login baru selalu membatalkan restore
     * session lama yang mungkin masih berjalan.
     */
    state.authFlowId += 1;
    const thisFlowId =
      state.authFlowId;

    clearSession();

    state.token = '';
    state.dashboard = null;
    state.affiliates = [];
    state.email = email;

    const btn = $('sendOtpBtn');
    setBusy(btn,true,'Mengirim OTP…','Kirim Kode OTP Admin');
    message('loginMessage','', '');

    try{
      const data = await api({
        action:'admin_request_otp',
        email
      });

      /*
       * Abaikan response request lama
       * jika flow login sudah berubah.
       */
      if(
        thisFlowId !==
        state.authFlowId
      ){
        return;
      }

      showLogin('otp');

      message(
        'loginMessage',
        'ok',
        data.message ||
        'Jika email memiliki akses admin, kode OTP telah dikirim.'
      );

    }catch(err){
      if(
        thisFlowId !==
        state.authFlowId
      ){
        return;
      }

      message(
        'loginMessage',
        'err',
        err.message
      );

    }finally{
      setBusy(btn,false,'Mengirim OTP…','Kirim Kode OTP Admin');
    }
  }

  async function verifyOtp(){
    const otp =
      String($('adminOtp').value || '')
        .replace(/\\D/g,'')
        .slice(0,6);

    if(!/^\\d{6}$/.test(otp)){
      message('loginMessage','err','Masukkan kode OTP 6 digit.');
      return;
    }

    const btn = $('verifyOtpBtn');
    setBusy(btn,true,'Memverifikasi…','Masuk ke Portal Admin');
    message('loginMessage','', '');

    try{
      const data = await api({
        action:'admin_verify_otp',
        email:state.email,
        otp
      });

      if(!data.authenticated || !data.sessionToken){
        throw new Error(
          data.message ||
          'Kode OTP salah atau sudah kedaluwarsa.'
        );
      }

      state.authFlowId += 1;
      state.token = data.sessionToken;

      saveSession(
        data.sessionToken,
        data.expiresAt,
        state.email
      );

      $('adminOtp').value = '';

      await loadDashboard();
    }catch(err){
      message('loginMessage','err',err.message);
    }finally{
      setBusy(btn,false,'Memverifikasi…','Masuk ke Portal Admin');
    }
  }

  async function loadDashboard(){
    const thisFlowId =
      state.authFlowId;

    const tokenAtStart =
      state.token;

    if(!tokenAtStart){
      /*
       * Jangan paksa balik ke email jika
       * pengguna sudah berada di flow OTP.
       */
      return;
    }

    const btn = $('refreshBtn');

    if(btn){
      setBusy(btn,true,'Memuat…','Refresh');
    }

    message('dashMessage','', '');

    try{
      const data = await api({
        action:'admin_dashboard',
        sessionToken:tokenAtStart
      });

      /*
       * Jika selama request ini pengguna
       * memulai login baru, response lama
       * tidak boleh mengubah UI.
       */
      if(
        thisFlowId !==
        state.authFlowId ||
        tokenAtStart !==
        state.token
      ){
        return;
      }

      if(!data.authenticated){
        throw new Error('Sesi admin berakhir. Silakan masuk kembali.');
      }

      state.dashboard = data;
      state.affiliates = Array.isArray(data.affiliates)
        ? data.affiliates
        : [];

      renderDashboard();
      showDashboard();

    }catch(err){
      /*
       * Abaikan error dari request restore
       * session lama yang sudah dibatalkan
       * oleh login OTP baru.
       */
      if(
        thisFlowId !==
        state.authFlowId ||
        tokenAtStart !==
        state.token
      ){
        return;
      }

      clearSession();
      state.token = '';
      state.dashboard = null;
      state.affiliates = [];

      showLogin('email');

      message(
        'loginMessage',
        'err',
        err.message
      );

    }finally{
      if(btn){
        setBusy(btn,false,'Memuat…','Refresh');
      }
    }
  }

  function renderDashboard(){
    const d = state.dashboard || {};
    const s = d.summary || {};

    $('heroTotal').textContent = number(s.totalAffiliates);
    $('generatedAt').textContent = 'Update: ' + dateText(d.generatedAt);

    $('sTotal').textContent = number(s.totalAffiliates);
    $('sApproved').textContent = number(s.approved);
    $('sPending').textContent = number(s.pending);
    $('sReview').textContent = number(s.review);
    $('sVerified').textContent = number(s.emailVerified);

    $('sPV').textContent = number(s.totalPageViews);
    $('sCheckout').textContent = number(s.totalCheckoutClicks);
    $('sPurchases').textContent = number(s.totalPurchases);
    $('sRevenue').textContent = money(s.grossRevenue);

    $('sEarned').textContent = money(s.commissionEarned);
    $('sCommissionPending').textContent = money(s.commissionPending);
    $('sCommissionApproved').textContent = money(s.commissionApproved);
    $('sCommissionPaid').textContent = money(s.commissionPaid);

    renderRows();
  }

  function renderRows(){
    const q =
      String($('searchBox').value || '')
        .trim()
        .toLowerCase();

    const filter =
      String($('statusFilter').value || 'ALL')
        .toUpperCase();

    const rows = state.affiliates.filter((a) => {
      const status =
        String(a.status || '').toUpperCase();

      if(filter !== 'ALL' && status !== filter){
        return false;
      }

      if(!q) return true;

      const haystack = [
        a.name,
        a.email,
        a.whatsapp,
        a.city,
        a.profession,
        a.referralCode,
        a.slug,
        a.social
      ].join(' ').toLowerCase();

      return haystack.includes(q);
    });

    $('dbCount').textContent =
      'Menampilkan ' +
      number(rows.length) +
      ' dari ' +
      number(state.affiliates.length) +
      ' affiliator';

    $('emptyState').classList.toggle(
      'hidden',
      rows.length !== 0
    );

    $('affiliateRows').innerHTML = rows.map((a) => {
      const affiliateLink = a.affiliatePage
        ? '<a class="link" href="' + esc(a.affiliatePage) + '" target="_blank" rel="noopener noreferrer">Halaman Affiliate</a>'
        : '-';

      const kitLink = a.marketingKitUrl
        ? '<br><a class="link muted" href="' + esc(a.marketingKitUrl) + '" target="_blank" rel="noopener noreferrer">Marketing Kit</a>'
        : '';

      const status =
        String(a.status || '').toUpperCase();

      let actionButtons = '';

      const safeCode =
        esc(
          String(
            a.referralCode ||
            ''
          )
        );

      const safeName =
        esc(
          String(
            a.name ||
            'Affiliate'
          )
        );

      if(status !== 'APPROVED'){
        actionButtons +=
          '<button type="button" class="action-btn action-approve" data-affiliate-action="1" data-code="' +
          safeCode +
          '" data-name="' +
          safeName +
          '" data-status="APPROVED">Approve</button>';
      }

      if(status !== 'REJECTED'){
        actionButtons +=
          '<button type="button" class="action-btn action-reject" data-affiliate-action="1" data-code="' +
          safeCode +
          '" data-name="' +
          safeName +
          '" data-status="REJECTED">Reject</button>';
      }

      if(status !== 'SUSPENDED'){
        actionButtons +=
          '<button type="button" class="action-btn action-suspend" data-affiliate-action="1" data-code="' +
          safeCode +
          '" data-name="' +
          safeName +
          '" data-status="SUSPENDED">Suspend</button>';
      }

      return '<tr>' +
        '<td class="nowrap muted">' + esc(dateText(a.joinedAt)) + '</td>' +
        '<td><button type="button" class="name-button" data-affiliate-detail="' + esc(String(a.referralCode || '')) + '">' + esc(a.name || '-') + '</button><div class="muted" style="margin-top:4px">' + esc(a.social || '-') + '</div></td>' +
        '<td class="nowrap strong">' + esc(a.whatsapp || '-') + '</td>' +
        '<td><div class="break">' + esc(a.email || '-') + '</div></td>' +
        '<td><div class="strong">' + esc(a.city || '-') + '</div><div class="muted" style="margin-top:4px">' + esc(a.profession || '-') + '</div></td>' +
        '<td><div class="code">' + esc(a.referralCode || '-') + '</div><div class="muted" style="margin-top:4px">' + esc(a.slug || '-') + '</div></td>' +
        '<td><span class="status">' + esc(a.status || '-') + '</span></td>' +
        '<td class="strong">' + esc(a.emailVerified || '-') + '</td>' +
        '<td class="right strong">' + esc(number(a.pageViews)) + '</td>' +
        '<td class="right strong">' + esc(number(a.checkoutClicks)) + '</td>' +
        '<td class="right strong">' + esc(number(a.purchases)) + '</td>' +
        '<td class="right strong nowrap">' + esc(money(a.grossRevenue)) + '</td>' +
        '<td class="right strong nowrap">' + esc(money(a.commissionEarned)) + '</td>' +
        '<td class="nowrap muted">' + esc(dateText(a.lastActivity)) + '</td>' +
        '<td>' + affiliateLink + kitLink + '</td>' +
        '<td><div class="action-stack">' + actionButtons + '</div></td>' +
      '</tr>';
    }).join('');
  }



  function affiliateByCode(code){
    const normalized =
      String(code || '')
        .trim()
        .toUpperCase();

    return state.affiliates.find(
      (a) =>
        String(
          a.referralCode || ''
        )
          .trim()
          .toUpperCase() ===
        normalized
    ) || null;
  }


  function detailItem(label,value,full){
    return (
      '<div class="detail-card' +
      (full ? ' full' : '') +
      '">' +
        '<div class="detail-label">' +
          esc(label) +
        '</div>' +
        '<div class="detail-value">' +
          esc(
            value === undefined ||
            value === null ||
            value === ''
              ? '-'
              : value
          ) +
        '</div>' +
      '</div>'
    );
  }


  function metricItem(label,value){
    return (
      '<div class="detail-metric">' +
        '<div class="detail-metric-label">' +
          esc(label) +
        '</div>' +
        '<div class="detail-metric-value">' +
          esc(value) +
        '</div>' +
      '</div>'
    );
  }


  function openAffiliateDetail(code){
    const a =
      affiliateByCode(code);

    if(!a){
      message(
        'dashMessage',
        'err',
        'Detail affiliate tidak ditemukan.'
      );
      return;
    }

    $('affiliateDetailTitle').textContent =
      a.name || 'Affiliate';

    const links = [];

    if(a.affiliatePage){
      links.push(
        '<a class="detail-link" href="' +
        esc(a.affiliatePage) +
        '" target="_blank" rel="noopener noreferrer">Buka Halaman Affiliate</a>'
      );
    }

    if(a.marketingKitUrl){
      links.push(
        '<a class="detail-link" href="' +
        esc(a.marketingKitUrl) +
        '" target="_blank" rel="noopener noreferrer">Buka Marketing Kit</a>'
      );
    }

    if(a.checkoutUrl){
      links.push(
        '<a class="detail-link" href="' +
        esc(a.checkoutUrl) +
        '" target="_blank" rel="noopener noreferrer">Buka Checkout</a>'
      );
    }

    if(a.whatsapp){
      const wa =
        String(a.whatsapp)
          .replace(/\D/g,'');

      if(wa){
        links.push(
          '<a class="detail-link" href="https://wa.me/' +
          esc(wa) +
          '" target="_blank" rel="noopener noreferrer">WhatsApp</a>'
        );
      }
    }

    if(a.email){
      links.push(
        '<a class="detail-link" href="mailto:' +
        esc(a.email) +
        '">Email</a>'
      );
    }

    $('affiliateDetailBody').innerHTML =
      '<div class="detail-grid">' +

        detailItem(
          'Tanggal Bergabung',
          dateText(a.joinedAt)
        ) +

        detailItem(
          'Status',
          a.status
        ) +

        detailItem(
          'Kode Referral',
          a.referralCode
        ) +

        detailItem(
          'Slug',
          a.slug
        ) +

        detailItem(
          'WhatsApp',
          a.whatsapp
        ) +

        detailItem(
          'Email',
          a.email
        ) +

        detailItem(
          'Email Verified',
          a.emailVerified
        ) +

        detailItem(
          'Duplicate Flag',
          a.duplicateFlag
        ) +

        detailItem(
          'Kota',
          a.city
        ) +

        detailItem(
          'Profesi / Usaha',
          a.profession
        ) +

        detailItem(
          'Instagram / TikTok',
          a.social
        ) +

        detailItem(
          'Tanggal Approval',
          dateText(a.approvalDate)
        ) +

        detailItem(
          'Alasan Bergabung',
          a.reason,
          true
        ) +

        detailItem(
          'Catatan Admin',
          a.adminNotes,
          true
        ) +

      '</div>' +

      '<div class="detail-metrics">' +

        metricItem(
          'Page Views',
          number(a.pageViews)
        ) +

        metricItem(
          'Checkout Clicks',
          number(a.checkoutClicks)
        ) +

        metricItem(
          'Purchases',
          number(a.purchases)
        ) +

        metricItem(
          'Omzet',
          money(a.grossRevenue)
        ) +

        metricItem(
          'Komisi Earned',
          money(a.commissionEarned)
        ) +

        metricItem(
          'Komisi Pending',
          money(a.commissionPending)
        ) +

        metricItem(
          'Komisi Approved',
          money(a.commissionApproved)
        ) +

        metricItem(
          'Komisi Paid',
          money(a.commissionPaid)
        ) +

      '</div>' +

      '<div class="detail-grid" style="margin-top:18px">' +

        detailItem(
          'Aktivitas Terakhir',
          dateText(a.lastActivity)
        ) +

        detailItem(
          'Purchase Terakhir',
          dateText(a.lastPurchase)
        ) +

      '</div>' +

      (
        links.length
          ? '<div class="detail-actions">' +
            links.join('') +
            '</div>'
          : ''
      );

    $('affiliateDetailModal')
      .classList
      .remove('hidden');

    document.body.style.overflow =
      'hidden';
  }


  function closeAffiliateDetail(){
    $('affiliateDetailModal')
      .classList
      .add('hidden');

    $('affiliateDetailBody').innerHTML =
      '';

    document.body.style.overflow =
      '';
  }


  async function updateAffiliateStatus(
    referralCode,
    affiliateName,
    newStatus
  ){
    if(!state.token){
      message(
        'dashMessage',
        'err',
        'Sesi admin tidak tersedia.'
      );
      return;
    }

    const actionLabel =
      newStatus === 'APPROVED'
        ? 'APPROVE'
        : newStatus === 'REJECTED'
          ? 'REJECT'
          : 'SUSPEND';

    const confirmed =
      window.confirm(
        actionLabel +
        ' affiliate ' +
        affiliateName +
        ' (' +
        referralCode +
        ')?'
      );

    if(!confirmed){
      return;
    }

    const notes =
      window.prompt(
        'Catatan admin (opsional):',
        ''
      );

    if(notes === null){
      return;
    }

    message(
      'dashMessage',
      '',
      ''
    );

    document
      .querySelectorAll(
        '[data-affiliate-action]'
      )
      .forEach(
        (btn) => {
          btn.disabled = true;
        }
      );

    try{
      const data =
        await api({
          action:
            'admin_update_affiliate_status',
          sessionToken:
            state.token,
          referralCode:
            referralCode,
          newStatus:
            newStatus,
          adminNotes:
            notes || ''
        });

      message(
        'dashMessage',
        'ok',
        data.message ||
        'Status affiliate berhasil diperbarui.'
      );

      await loadDashboard();

    }catch(err){
      message(
        'dashMessage',
        'err',
        err.message ||
        'Status affiliate belum dapat diperbarui.'
      );

    }finally{
      document
        .querySelectorAll(
          '[data-affiliate-action]'
        )
        .forEach(
          (btn) => {
            btn.disabled = false;
          }
        );
    }
  }


  async function logout(){
    const token = state.token;

    state.authFlowId += 1;

    clearSession();

    state.token = '';
    state.dashboard = null;
    state.affiliates = [];

    showLogin('email');
    message('loginMessage','', '');

    if(!token) return;

    try{
      await api({
        action:'admin_logout',
        sessionToken:token
      });
    }catch(e){}
  }

  /*
   * Event delegation untuk tombol
   * Approve / Reject / Suspend.
   * Tidak memakai inline onclick agar
   * HTML/JS tetap valid.
   */
  $('affiliateRows').addEventListener(
    'click',
    (e) => {
      const detailButton =
        e.target.closest(
          '[data-affiliate-detail]'
        );

      if(detailButton){
        openAffiliateDetail(
          String(
            detailButton.dataset
              .affiliateDetail ||
            ''
          )
        );
        return;
      }

      const button =
        e.target.closest(
          '[data-affiliate-action]'
        );

      if (!button) {
        return;
      }

      updateAffiliateStatus(
        String(
          button.dataset.code ||
          ''
        ),
        String(
          button.dataset.name ||
          'Affiliate'
        ),
        String(
          button.dataset.status ||
          ''
        )
      );
    }
  );

  $('affiliateDetailClose')
    .addEventListener(
      'click',
      closeAffiliateDetail
    );

  $('affiliateDetailModal')
    .addEventListener(
      'click',
      (e) => {
        if(
          e.target ===
          $('affiliateDetailModal')
        ){
          closeAffiliateDetail();
        }
      }
    );

  document.addEventListener(
    'keydown',
    (e) => {
      if(
        e.key === 'Escape' &&
        !$('affiliateDetailModal')
          .classList
          .contains('hidden')
      ){
        closeAffiliateDetail();
      }
    }
  );

  $('emailForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    requestOtp();
  });

  $('otpForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    verifyOtp();
  });

  $('adminOtp').addEventListener('input',(e)=>{
    e.target.value =
      e.target.value
        .replace(/\\D/g,'')
        .slice(0,6);
  });

  $('changeEmailBtn').addEventListener('click',()=>{
    $('adminOtp').value = '';
    message('loginMessage','', '');
    showLogin('email');
  });

  $('refreshBtn').addEventListener('click',()=>{
    loadDashboard();
  });

  $('logoutBtn').addEventListener('click',()=>{
    logout();
  });

  $('searchBox').addEventListener('input',renderRows);
  $('statusFilter').addEventListener('change',renderRows);

  const stored = readSession();

  if(stored){
    state.email = stored.email || '';
    state.token = stored.token || '';
    loadDashboard();
  }else{
    showLogin('email');
  }
})();
</script>
</body>
</html>`;
}


function adminPortalResponse(request) {
  if (
    request.method === "HEAD"
  ) {
    return new Response(
      null,
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Robots-Tag":
            "noindex, nofollow",
        },
      }
    );
  }

  if (
    request.method !== "GET"
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "METHOD_NOT_ALLOWED",
      },
      405
    );
  }

  return new Response(
    adminPortalHtml(),
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
        "Pragma":
          "no-cache",
        "X-Robots-Tag":
          "noindex, nofollow",
        "Referrer-Policy":
          "no-referrer",
        "X-Content-Type-Options":
          "nosniff",
        "X-Frame-Options":
          "DENY",
        "Content-Security-Policy":
          "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      },
    }
  );
}



/* =========================================================
   MAIN WORKER
   ========================================================= */

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    /*
     * Universal safe request log.
     * Tidak pernah log nilai token.
     */
    console.log(
      JSON.stringify({
        timestamp:
          new Date()
            .toISOString(),

        stage:
          "REQUEST_RECEIVED",

        method:
          request.method,

        path:
          url.pathname,

        hasTokenQuery:
          url.searchParams.has(
            "token"
          ),
      })
    );

    /*
     * STEP 10C:
     * Admin Affiliate Portal UI.
     * Tidak membutuhkan Hostinger/Horizons.
     */
    if (
      url.pathname === "/admin" ||
      url.pathname === "/admin/"
    ) {
      return adminPortalResponse(
        request
      );
    }

    /*
     * STEP 10B:
     * Affiliate Portal endpoint.
     */
    if (
      url.pathname ===
      "/portal"
    ) {
      return handlePortal(
        request,
        env
      );
    }

    /*
     * Root health check /
     */
    if (
      request.method ===
        "GET" ||
      request.method ===
        "HEAD"
    ) {
      return jsonResponse({
        ok: true,
        service:
          "Panglima Lynk Webhook + Affiliate Portal",
        status:
          "READY",
        version:
          WORKER_VERSION,

        merchantKeyConfigured:
          Boolean(
            env
              .LYNK_MERCHANT_KEY
          ),

        portalReady:
          Boolean(
            env
              .GOOGLE_AFFILIATE_WEBHOOK_URL
          ),

        portalEndpoint:
          "/portal",

        adminPortal:
          "/admin",
      });
    }

    if (
      request.method !==
      "POST"
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            "METHOD_NOT_ALLOWED",
        },
        405
      );
    }

    /*
     * LYNK WEBHOOK
     */
    const {
      raw,
      parsed,
      contentType,
    } =
      await readIncomingBody(
        request
      );

    const eventType =
      getEventType(
        parsed
      );

    const refId =
      getRefId(
        parsed
      );

    const items =
      getItems(
        parsed
      );

    const grandTotal =
      getGrandTotal(
        parsed
      );

    const suppliedToken =
      url.searchParams.get(
        "token"
      ) || "";

    const hasValidToken =
      Boolean(
        env
          .LYNK_WEBHOOK_TOKEN
      ) &&
      suppliedToken ===
        env
          .LYNK_WEBHOOK_TOKEN;

    const signature =
      request.headers.get(
        "x-signature"
      ) ||
      request.headers.get(
        "x-lynk-signature"
      ) ||
      "";

    const signatureDiagnostic =
      await diagnoseLynkSignature(
        raw,
        signature,
        env
          .LYNK_MERCHANT_KEY ||
          ""
      );

    console.log(
      JSON.stringify({
        timestamp:
          new Date()
            .toISOString(),

        method:
          request.method,

        event:
          eventType ||
          "UNKNOWN",

        refId:
          refId ||
          null,

        itemCount:
          items.length,

        grandTotal,

        hasToken:
          Boolean(
            suppliedToken
          ),

        validToken:
          hasValidToken,

        hasSignature:
          Boolean(
            signature
          ),

        signatureLength:
          signature
            ? signature.length
            : 0,

        merchantKeyReady:
          signatureDiagnostic
            .merchantKeyReady,

        signatureMatch:
          signatureDiagnostic
            .match,
      })
    );

    const looksLikeRealPayment =
      (
        eventType ===
          "payment.received" ||
        eventType ===
          "payment_received"
      ) &&
      Boolean(
        refId
      ) &&
      items.length > 0 &&
      grandTotal > 0;

    /*
     * Lynk Test URL / dummy payload:
     * tetap 200.
     */
    if (
      !looksLikeRealPayment
    ) {
      return jsonResponse({
        ok: true,
        received: true,
        test: true,
        ignored: true,

        event:
          eventType ||
          null,

        signatureDetected:
          Boolean(
            signature
          ),

        signatureMatch:
          signatureDiagnostic
            .match,
      });
    }

    /*
     * Real payment masih wajib token.
     */
    if (
      !hasValidToken
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            "UNAUTHORIZED_PAYMENT_WEBHOOK",
        },
        401
      );
    }

    const downstream =
      await forwardToGoogle(
        env,
        raw,
        contentType,
        "panglima-lynk-webhook"
      );

    console.log(
      JSON.stringify({
        timestamp:
          new Date()
            .toISOString(),

        event:
          eventType,

        refId:
          refId ||
          null,

        downstreamStatus:
          downstream.status,

        signatureMatch:
          signatureDiagnostic
            .match,
      })
    );

    if (
      !downstream.ok
    ) {
      return jsonResponse(
        {
          ok: false,
          received: true,
          forwarded: false,

          error:
            downstream.error ||
            "DOWNSTREAM_ERROR",

          downstreamStatus:
            downstream.status,
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      received: true,
      forwarded: true,

      event:
        eventType,

      refId:
        refId ||
        null,

      signatureDetected:
        Boolean(
          signature
        ),

      signatureMatch:
        signatureDiagnostic
          .match,
    });
  },
};
