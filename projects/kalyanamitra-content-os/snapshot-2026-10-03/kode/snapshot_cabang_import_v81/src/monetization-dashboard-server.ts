import { verifiedQualityFilter } from './monetization-quality';

type DashboardEnv = { DB: D1Database };

type Row = Record<string, unknown>;

const BRAND_ID = 'brand-umkm-naik-kelas';

function n(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function h(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rupiah(value: unknown): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(n(value));
}

function integer(value: unknown): string {
  return new Intl.NumberFormat('id-ID').format(n(value));
}

function selected(current: number, option: number): string {
  return current === option ? ' selected' : '';
}

function tableRows(rows: Row[], kind: 'content' | 'offer'): string {
  if (!rows.length) return '<tr><td colspan="4" class="empty">Belum ada data teratribusi.</td></tr>';
  return rows.map((row) => {
    const name = kind === 'content' ? (row.title || row.id) : (row.name || row.id);
    const detail = kind === 'content' ? (row.platform || '—') : (row.type || '—');
    return `<tr><td><strong>${h(name)}</strong><small>${h(detail)}</small></td><td>${integer(row.transactions)}</td><td>${rupiah(row.net_revenue)}</td><td>${rupiah(row.profit)}</td></tr>`;
  }).join('');
}

export async function renderMonetizationDashboard(request: Request, env: DashboardEnv): Promise<Response> {
  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') ?? '30');
  const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
  const since = `-${days} days`;
  const qualityTable = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='monetization_record_quality'`).first();
  const verifiedRevenue=verifiedQualityFilter(Boolean(qualityTable),'revenue_event','r');
  const verifiedRevenuePredicate=verifiedRevenue.replace(/^AND\s+/,'');
  const verifiedEvent = qualityTable ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='event' AND q.record_id=e.id AND q.data_class='production' AND q.verification_status='verified')` : '';
  const verifiedAttribution = qualityTable ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='revenue_event' AND q.record_id=monetization_attributions.revenue_event_id AND q.data_class='production' AND q.verification_status='verified')
    AND NOT EXISTS (SELECT 1 FROM monetization_revenue_events base
      JOIN monetization_revenue_events lifecycle_member ON lifecycle_member.brand_id=base.brand_id AND lifecycle_member.source=base.source
        AND lifecycle_member.transaction_id=base.transaction_id
      WHERE base.id=monetization_attributions.revenue_event_id AND base.transaction_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM monetization_record_quality lifecycle_quality
          WHERE lifecycle_quality.record_type='revenue_event' AND lifecycle_quality.record_id=lifecycle_member.id
            AND lifecycle_quality.data_class='production' AND lifecycle_quality.verification_status='verified'))` : '';
  const feeCompleteSql=qualityTable?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='revenue_event' AND q.record_id=r.id AND q.fee_status IN ('actual','not_applicable'))
    OR json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql=qualityTable?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='revenue_event' AND q.record_id=r.id AND q.cost_status IN ('actual','not_applicable'))
    OR json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const revenueContent=qualityTable?'r.content_item_id':'COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id)';
  const revenueOffer=qualityTable?'r.offer_id':'COALESCE(a.last_offer_id,a.first_offer_id,r.offer_id)';

  // Keep all reads on one D1 connection; Workers allow at most six concurrent D1 connections.
  const [revenueResult, trafficResult, attribution, topContent, topOffers, integration, lynkResult, excludedResult] = await env.DB.batch<Row>([
    env.DB.prepare(`SELECT COUNT(*) transactions,
      SUM(CASE WHEN event_type IN ('sale','affiliate_commission','subscription','service_conversion') AND status='confirmed' THEN 1 ELSE 0 END) sales,
      SUM(CASE WHEN event_type IN ('refund','chargeback') OR status='refunded' THEN 1 ELSE 0 END) reversals,
      COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) profit,
      SUM(${feeCompleteSql}) fee_complete,SUM(${costCompleteSql}) cost_complete
      FROM monetization_revenue_events r
      WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) AND status IN ('confirmed','refunded') ${verifiedRevenue}`)
      .bind(BRAND_ID, since),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END),0) clicks,
      COALESCE(SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END),0) leads,
      COALESCE(SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END),0) checkouts
      FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${verifiedEvent}`)
      .bind(BRAND_ID, since),
    env.DB.prepare(`SELECT attribution_status,COUNT(*) total
      FROM monetization_attributions
      WHERE brand_id=?1 AND created_at>=datetime('now',?2) ${verifiedAttribution}
      GROUP BY attribution_status ORDER BY total DESC`)
      .bind(BRAND_ID, since),
    env.DB.prepare(`SELECT c.id,c.title,c.platform,COUNT(r.id) transactions,
      COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
      FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
      JOIN content_items c ON c.id=${revenueContent}
      WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY c.id,c.title,c.platform ORDER BY profit DESC LIMIT 10`)
      .bind(BRAND_ID, since),
    env.DB.prepare(`SELECT o.id,o.name,o.type,COUNT(r.id) transactions,
      COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
      FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
      JOIN monetization_offers o ON o.id=${revenueOffer}
      WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY o.id,o.name,o.type ORDER BY profit DESC LIMIT 10`)
      .bind(BRAND_ID, since),
    env.DB.prepare(`SELECT status,COUNT(*) total FROM monetization_integration_logs
      WHERE created_at>=datetime('now',?1) GROUP BY status ORDER BY status`).bind(since),
    env.DB.prepare(`SELECT COUNT(*) transactions,COALESCE(SUM(gross_amount),0) gross,
      COALESCE(SUM(net_amount),0) net,MAX(occurred_at) last_transaction
      FROM monetization_revenue_events r
      WHERE brand_id=?1 AND source='lynk' AND occurred_at>=datetime('now',?2) AND status IN ('confirmed','refunded') ${verifiedRevenue}`)
      .bind(BRAND_ID, since),
    qualityTable
      ? env.DB.prepare(`SELECT COUNT(*) entries,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(margin_amount),0) contribution_margin
          FROM monetization_revenue_events r WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2)
          AND r.status IN ('confirmed','refunded')
          AND NOT (${verifiedRevenuePredicate})`).bind(BRAND_ID,since)
      : env.DB.prepare(`SELECT 0 entries,0 gross,0 contribution_margin`)
  ]);
  const revenue = revenueResult?.results[0];
  const traffic = trafficResult?.results[0];
  const lynk = lynkResult?.results[0];
  const excluded = excludedResult?.results[0];

  const attrRows = (attribution?.results ?? []) as Row[];
  const integrationRows = (integration?.results ?? []) as Row[];
  const attributed = attrRows.reduce((sum, row) => sum + (['attributed', 'partial'].includes(String(row.attribution_status)) ? n(row.total) : 0), 0);
  const unattributed = attrRows.reduce((sum, row) => sum + (String(row.attribution_status) === 'unattributed' ? n(row.total) : 0), 0);
  const errors = integrationRows.reduce((sum, row) => sum + (String(row.status) === 'error' ? n(row.total) : 0), 0);
  const warnings = integrationRows.reduce((sum, row) => sum + (String(row.status) === 'warning' ? n(row.total) : 0), 0);
  const transactions=n(revenue?.transactions);
  const feeComplete=n(revenue?.fee_complete);
  const costComplete=n(revenue?.cost_complete);
  const financialComplete=transactions>0&&feeComplete===transactions&&costComplete===transactions;

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monetization · UMKM Content OS</title>
<style>
:root{--bg:#f5f0e7;--paper:#fffaf0;--ink:#1b1612;--muted:#756d64;--red:#9e1b13;--gold:#c69a3d;--green:#23845b;--line:#e7d9c2;--warn:#a95f12}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:30px 20px 60px}a{color:var(--red)}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--red);font-weight:800}.top h1{font-family:Georgia,serif;margin:5px 0 3px}.muted,small{color:var(--muted)}form{display:flex;gap:8px;align-items:center}select,button{border:1px solid var(--line);border-radius:9px;padding:9px 11px;background:#fff}button{background:var(--red);color:#fff;border-color:var(--red);font-weight:700}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:22px 0}.card,.panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:17px}.card span{font-size:12px;color:var(--muted)}.card strong{display:block;font-family:Georgia,serif;font-size:27px;margin-top:7px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.panel h2{font-family:Georgia,serif;font-size:19px;margin:0 0 14px}.status{display:flex;flex-wrap:wrap;gap:9px}.pill{border-radius:999px;padding:7px 10px;font-size:12px;font-weight:750;background:#eee}.ok{background:#e5f3eb;color:var(--green)}.warn{background:#fff0d9;color:var(--warn)}.bad{background:#f8dfdc;color:var(--red)}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}td,th{padding:10px 8px;border-bottom:1px solid var(--line)}td strong,td small{display:block}.empty{text-align:center;color:var(--muted);padding:24px}.footer{margin-top:18px;font-size:12px;color:var(--muted)}@media(max-width:850px){.grid{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}@media(max-width:480px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<div class="top"><div><div class="eyebrow">CONTENT OS · MONETIZATION ENGINE v1.0</div><h1>Revenue Command Center</h1><div class="muted">Server-rendered dari D1. Tidak ada bearer token di browser. <a href="/monetization?view=setup">Kelola setup →</a></div></div><form method="get" action="/monetization"><label for="days" class="muted">Periode</label><select id="days" name="days"><option value="7"${selected(days,7)}>7 hari</option><option value="30"${selected(days,30)}>30 hari</option><option value="90"${selected(days,90)}>90 hari</option></select><button type="submit">Terapkan</button></form></div>
<div class="grid"><div class="card"><span>Omzet tercatat</span><strong>${rupiah(revenue?.gross)}</strong></div><div class="card"><span>Penerimaan bersih tercatat</span><strong>${rupiah(revenue?.net)}</strong></div><div class="card"><span>Margin kontribusi tercatat</span><strong>${rupiah(revenue?.profit)}</strong></div><div class="card"><span>Entri ledger</span><strong>${integer(revenue?.transactions)}</strong></div></div>
<div class="panel"><div class="status"><span class="pill ${financialComplete?'ok':'warn'}">Fee lengkap ${integer(feeComplete)}/${integer(transactions)}</span><span class="pill ${financialComplete?'ok':'warn'}">HPP/biaya lengkap ${integer(costComplete)}/${integer(transactions)}</span><span class="pill ${qualityTable?'ok':'warn'}">Scope: ${qualityTable?'production terverifikasi':'legacy belum terklasifikasi'}</span></div><p class="muted">Margin kontribusi tercatat = penerimaan bersih dikurangi biaya variabel/HPP yang tercatat. Ini bukan laba bersih akuntansi dan masih parsial selama fee atau HPP belum lengkap.</p></div>
<div class="grid"><div class="card"><span>Clicks</span><strong>${integer(traffic?.clicks)}</strong></div><div class="card"><span>Leads</span><strong>${integer(traffic?.leads)}</strong></div><div class="card"><span>Checkouts</span><strong>${integer(traffic?.checkouts)}</strong></div><div class="card"><span>Unattributed Revenue Events</span><strong>${integer(unattributed)}</strong></div></div>
<div class="grid"><div class="card"><span>Penjualan/komisi</span><strong>${integer(revenue?.sales)}</strong></div><div class="card"><span>Refund/chargeback</span><strong>${integer(revenue?.reversals)}</strong></div><div class="card"><span>Non-production atau belum terverifikasi</span><strong>${integer(excluded?.entries)}</strong></div><div class="card"><span>Nominal dikecualikan</span><strong>${rupiah(excluded?.gross)}</strong></div></div>
<div class="two"><section class="panel"><h2>Lynk.id</h2><div class="status"><span class="pill ok">Real webhook ingestion aktif</span><span class="pill ${n(lynk?.transactions)>0?'ok':'warn'}">${integer(lynk?.transactions)} transaksi</span></div><p><strong>${rupiah(lynk?.gross)}</strong> gross · ${rupiah(lynk?.net)} net</p><small>Transaksi terakhir: ${h(lynk?.last_transaction || 'belum ada dalam periode')}</small></section><section class="panel"><h2>Attribution & Integration Health</h2><div class="status"><span class="pill ok">${integer(attributed)} attributed/partial</span><span class="pill ${unattributed?'warn':'ok'}">${integer(unattributed)} unattributed</span><span class="pill ${warnings?'warn':'ok'}">${integer(warnings)} warning</span><span class="pill ${errors?'bad':'ok'}">${integer(errors)} error</span></div></section></div>
<div class="two"><section class="panel"><h2>Top Content berdasarkan margin tercatat</h2><table><thead><tr><th>Content</th><th>Entri</th><th>Net</th><th>Margin</th></tr></thead><tbody>${tableRows((topContent?.results??[]) as Row[],'content')}</tbody></table></section><section class="panel"><h2>Top Offers berdasarkan margin tercatat</h2><table><thead><tr><th>Offer</th><th>Entri</th><th>Net</th><th>Margin</th></tr></thead><tbody>${tableRows((topOffers?.results??[]) as Row[],'offer')}</tbody></table></section></div>
<div class="footer"><a href="/">← Content OS</a> · <a href="/monetization?view=setup">Kelola setup</a> · Periode ${days} hari · Rendered ${h(new Date().toISOString())}</div>
</main></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    }
  });
}
