# UMKM Naik Kelas — Monetization Engine FINAL v1.0

Status operasional: **core production GREEN** pada runtime resmi v14. External OpenClaw/Telegram/Hermes, real Lynk same-chain attribution, content → revenue → learning loop, schema v15, guarded canary, dashboard Access hardening, dan final automated regression yang sudah memiliki evidence tetap **GREEN**. Status release final tetap **YELLOW** sampai real APK client, website tracked CTA, real external affiliate-provider acceptance, Access-authenticated dashboard render, dan release closure memiliki runtime evidence.

PR #7 pada branch `build/monetization-engine-v1` tetap Draft, belum di-merge ke `main`, dan belum diberi tag `v1.0`. Hardening v15 telah menjalani guarded 1% canary selama 30 menit pada version `4654fdf3-d6ef-4e76-a692-4c9b0efe2add`, lalu workflow mengembalikan exact baseline v14 `ec19dcb0-3c61-4b48-a0c1-e9f28cec4397` ke 100%. Candidate bukan deployment permanen dan maintenance v15 tetap nonaktif.

Prinsip implementasi: **ADDITIVE ONLY**.

Content OS existing, renderer, approval, publisher Repliz, research, dan analytics tidak diganti oleh Monetization Engine. Monetization Engine berjalan sebagai Worker terpisah `umkm-monetization-engine`, menggunakan D1 existing, tabel baru berawalan `monetization_`, serta `content_monetization`.

## Current production runtime

- Content OS Worker: `umkm-content-os`
- Monetization Worker: `umkm-monetization-engine`
- Monetization entry point resmi: `src/monetization-worker-v14.ts` melalui `wrangler.monetization.jsonc`
- Candidate entry point: `src/monetization-worker-v15.ts` melalui `wrangler.monetization.candidate.jsonc`; source-validation dan ephemeral-canary only
- D1: `umkm-content-os-db`
- R2: `umkm-content-media`
- Queue: `umkm-monetization-ops`
- Custom tracked-link domain: `go.umkmnaikkelas.id`
- Dashboard: Content OS `/monetization`, server-rendered dan berada di belakang Cloudflare Access existing
- Content OS dashboard version: `2b923aeb-883e-4587-826f-ebe2cf8cf918` pada 100%, dengan Access JWT RS256 validation di route `/monetization`
- Revenue Learning cron: `0 1 * * *` atau sekitar 08:00 WIB
- Content OS Service Binding: `CONTENT_OS`
- OpenClaw integration package: `integrations/openclaw/`
- Platform aktif: Threads, Instagram, TikTok
- Repliz: draft-only; approval tetap berlaku

## Build

```bash
npm ci
npm run types
npm run check
npm run test:content-os:access
npm run test:monetization:v15
npm run check:all
```

`check:all` memvalidasi TypeScript, regression Access JWT, regression v15, build Content OS, build production-config v14, dan dry-run bundle candidate v15. CI/source validation tidak menggantikan Access-authenticated, provider, client, atau production runtime acceptance.

## Migration

Migration production yang sudah berlaku:

- `0004_monetization_engine_v1.sql`
- `0005_monetization_attribution_reconciliation.sql`
- `0006_monetization_hardening_v15.sql`
- `0007_monetization_record_quality.sql`
- `0008_monetization_quality_history.sql`

Hardening v15 menggunakan migration additive berikut dalam urutan exact:

1. `0006_monetization_hardening_v15.sql`
2. `0007_monetization_record_quality.sql`
3. `0008_monetization_quality_history.sql`

Migration `0006`/`0007`/`0008` diterapkan oleh allow-listed production gate dan diverifikasi kembali oleh final read-only inventory. Ketiganya tidak menghapus atau menulis ulang business/evidence rows: `0007` membiarkan row existing sebagai `unknown`/`unverified`, dan `0008` menambahkan history append-only. Rollback aplikasi tidak boleh menghapus tabel, quality history, atau revenue rows.

## Secrets dan identity

Simpan sebagai Cloudflare/GitHub Actions/OpenClaw process secrets sesuai runtime; jangan commit ke repository.

- `MONETIZATION_INGEST_TOKEN` — melindungi endpoint ingestion/admin internal.
- `MONETIZATION_QUALITY_TOKEN` — credential operator terpisah khusus review/promosi quality; nilainya wajib berbeda dari `MONETIZATION_INGEST_TOKEN`.
- `APP_RECEIPT_SECRET` — menandatangani receipt telemetry app yang terikat ke normalized instance, app version, event, dan masa berlaku.
- `LYNK_WEBHOOK_SECRET` — callback token untuk webhook Lynk production.
- `DEEPSEEK_API_KEY` — credential AI untuk Revenue Learning.
- `DEEPSEEK_MODEL` — optional override.
- `MONETIZATION_AI_ENABLED=true` — feature gate Revenue Learning.
- `OPENCLAW_INGRESS_TOKEN` — tetap berada pada Content OS Worker dan diverifikasi melalui Service Binding; jangan diduplikasi ke Monetization Worker.
- `UMKM_OPENCLAW_TOKEN` — alias environment pada proses OpenClaw yang nilainya menggunakan existing `OPENCLAW_INGRESS_TOKEN`; bukan token baru.
- `MONETIZATION_V15_MAINTENANCE_ENABLED` — feature gate operasional, bukan credential; default/non-`true` berarti materialization terjadwal v15 tetap nonaktif.

Native signature Lynk belum boleh disebut verified sampai signing contract resmi dikonfirmasi. Callback token tetap menjadi autentikasi production yang aktif.

Candidate v15 harus fail-closed bila `APP_RECEIPT_SECRET` atau `MONETIZATION_QUALITY_TOKEN` tidak tersedia. Secret baru tidak boleh disamakan, disubstitusi, atau dipindahkan ke browser/dashboard.

## Core endpoints

### Foundation

- `GET /api/monetization/status`
- `GET/POST /api/monetization/offers`
- `PATCH /api/monetization/offers/:id`
- `GET/POST /api/monetization/campaigns`
- `GET/PUT /api/monetization/content/:contentId`
- `GET/POST /api/monetization/links`
- `POST /api/monetization/events`
- `POST /api/monetization/revenue`
- `GET /api/monetization/summary?days=30`
- `GET /go/:slug`

### Attribution dan revenue rails

- `POST /api/monetization/provider-mappings`
- `POST /api/monetization/webhooks/lynk`
- `POST /api/monetization/affiliate/conversions`
- `GET /api/monetization/funnel?days=30`
- `GET /api/monetization/attribution?days=30`
- `GET/POST /api/monetization/reconciliation`
- `POST /api/monetization/attribution/reprocess/:revenueEventId`

Endpoint reprocess adalah protected operational route. Ia hanya menghitung ulang attribution untuk revenue event yang sudah ada; tidak membuat revenue transaksi baru.

### Candidate v15 hardening

- `GET /api/monetization/daily-analytics`
- `GET /api/monetization/learning/dataset`
- `GET /api/monetization/quality/review`
- `PUT /api/monetization/quality/{event|revenue_event|learning_insight}/{recordId}`
- `POST /api/monetization/maintenance/aggregate`
- `POST /api/monetization/maintenance/retention/preview`
- `POST /api/monetization/app/handoff`

Endpoint quality menggunakan `MONETIZATION_QUALITY_TOKEN`, bukan ingest token. Review queue hanya mengekspos record `unknown`/`unverified` yang perlu keputusan operator. Promosi revenue menjadi `production`/`verified` memvalidasi IDR, algebra/status/sign, attribution touchpoint, serta seluruh lifecycle sale/reversal; projection terkait dipromosikan bersama secara atomik dan setiap perubahan dicatat pada `monetization_record_quality_history` yang append-only. Record existing tidak pernah dipromosikan otomatis.

### AI learning

- `GET /api/monetization/learning/status`
- `POST /api/monetization/learning/run?days=30`
- `GET /api/monetization/learning/context`

Revenue Learning hanya membaca agregasi yang diperlukan. PII customer dan raw event massal tidak dikirim ke model. Bila belum ada confirmed revenue yang cukup, learning boleh `skipped` dan tidak mengarang insight.

Production real-attributed learning acceptance pada 1 September 2026 menghasilkan 3 insight baru dari dataset current-ledger berisi 1 content, 2 revenue events, gross/net/profit Rp10.000. Snapshot ini adalah evidence, bukan invariant permanen.

### Operations dan experiments

- `GET /api/monetization/operations?days=30`
- `POST /api/monetization/command`
- `GET/POST /api/monetization/experiments`
- `POST /api/monetization/experiments/:id/complete`
- `GET /dashboard`
- Content OS `GET /monetization`

### OpenClaw

- `POST /api/monetization/openclaw/command`
- `GET /api/monetization/openclaw/context`
- `GET /api/monetization/openclaw/telegram-manifest`
- `GET /api/monetization/openclaw/automation-status`
- `GET /api/monetization/openclaw/research-manifest`
- `POST /api/monetization/openclaw/research`
- `GET /api/monetization/openclaw/research-readiness`
- `GET /api/monetization/openclaw/evidence`

OpenClaw identity diverifikasi oleh Content OS melalui Service Binding `CONTENT_OS`. Endpoint OpenClaw-facing harus fail-closed tanpa bearer `OPENCLAW_INGRESS_TOKEN` yang valid. Readiness/evidence internal menggunakan `MONETIZATION_INGEST_TOKEN` dan tidak menjadi credential caller eksternal.

### Telegram runtime contract

Arsitektur final:

`Telegram → OpenClaw skill → Monetization Engine`

- `GET /api/monetization/telegram/runtime` — status kontrak runtime, dilindungi `MONETIZATION_INGEST_TOKEN`.
- `POST /api/monetization/telegram/webhook` — sengaja dinonaktifkan dan harus mengembalikan HTTP 410.
- Bot token dan Telegram webhook dikelola oleh OpenClaw, bukan Monetization Worker.
- Hanya satu bot/interface.
- Tidak ada action publish.

Command read-only/install-ready:

- `/revenue`
- `/profit`
- `/offers`
- `/content`
- `/health`
- `/learning`
- `/research <topik>`

Formal real Telegram delivery acceptance sudah GREEN, dan functional `/revenue`, `/learning`, `/research` reply juga sudah terbukti.

## First-party tracking

Production tracked URL:

`https://go.umkmnaikkelas.id/go/{slug}`

Alur:

1. social/content/website/app CTA mengarah ke tracked link;
2. Worker membaca mapping content/campaign/offer/CTA;
3. click event dicatat best-effort;
4. redirect HTTP 302 tetap dilakukan meskipun event write gagal;
5. destination dapat berupa website, Lynk, affiliate provider, atau app route.

Custom domain, health, redirect, click write, dan cleanup acceptance sudah GREEN. Production website placement/click masih gate terpisah dan tetap YELLOW.

## Lynk.id Pro integration

Lynk diperlakukan sebagai commerce/checkout rail, bukan source of truth analytics.

Flow:

`tracked content → Lynk checkout → webhook → normalize → Revenue Ledger → attribution → reconciliation`

Payload real `payment.received` yang telah divalidasi pada runtime v14 menggunakan:

- `data.message_action=SUCCESS`
- `data.message_data.refId` sebagai transaction ID
- `data.message_data.items[].uuid` sebagai external product ID
- `data.message_data.totals.grandTotal` sebagai gross merchant
- `data.message_data.createdAt` sebagai provider timestamp

Real transaction Rp5.000 telah masuk ke Revenue Ledger. Resend transaksi yang sama menjadi duplicate dan tidak menggandakan revenue. Reconciliation menghasilkan transaction delta 0 dan gross delta 0.

Production mapping dan attribution sekarang sudah GREEN. Existing revenue event `rev-8c89beb3-25e4-48e5-85ae-45947ea9f64f` / transaction `668833d4c96fc82031a7c9d448b51848` dipetakan ke:

- Content `50a75269-32b4-4fe4-9272-33594c890de7`
- Campaign `cam-lynk-prod-20260901`
- Offer `off-lynk-prod-6a866261`

Attribution production adalah `attributed` dengan model `last_touch`. First dan last event sama-sama `evt-561f5070-32f2-4679-8baa-bbdc5ebb0ddd`, yaitu production Instagram `affiliate_click` melalui tracked link `lnk-lynk-prod-20260901`. Bounded evidence v1.1 memverifikasi satu candidate, clock anchor revenue receipt UTC, dan touch reuse prevention.

Candidate v15 memperketat adapter tanpa mengubah evidence historis tersebut:

- hanya currency `IDR` dan integer monetary fields yang valid yang boleh masuk ledger;
- known sale event yang malformed ditolak fail-closed tanpa revenue write;
- refund Lynk v1 hanya mendukung **full refund** yang exact terhadap original confirmed sale;
- partial refund, ambiguous original, atau refund amount/dimensi yang tidak cocok dikarantina dan tidak dipersist sebagai transaksi;
- full refund mewarisi currency, fee/cost, Content/Campaign/Offer, serta identity original agar lifecycle tetap konsisten;
- bila provider tidak mengirim fee yang terverifikasi, contribution margin tetap provisional/unknown, bukan accounting profit.

Kontrak refund/fee ini masih membutuhkan real external provider fixture atau dokumentasi resmi sebelum gate provider dinyatakan selesai.

## Affiliate integration

Affiliate provider diperlakukan sebagai adapter generik.

Input normalized minimum:

```json
{
  "provider": "provider-name",
  "transactionId": "external-conversion-id",
  "commissionAmount": 50000,
  "currency": "IDR",
  "status": "confirmed",
  "externalOfferId": "provider-offer-id",
  "subId": "optional-first-party-tracking-id"
}
```

Synthetic adapter acceptance sudah GREEN. Status provider production tetap YELLOW sampai conversion dan reconciliation nyata dari external affiliate network tersedia. Lynk tetap checkout rail dan tidak digunakan untuk menutup gate adapter affiliate ini.

## APK/App integration

Backend app contract mendukung:

- pseudonymous `appInstanceId`;
- app events;
- event idempotency;
- offer handoff;
- tracked destination.

Candidate v15 mengeluarkan receipt telemetry yang ditandatangani server dengan `APP_RECEIPT_SECRET` dan mengikat normalized instance, app version, event, serta TTL. Receipt ini membuktikan penerimaan telemetry backend; receipt tersebut **bukan** APK signing, device attestation, Play Integrity, atau bukti bahwa build nyata berjalan di perangkat.

Backend contract acceptance tetap GREEN. APK production tetap YELLOW sampai build nyata diinstal, mengirim event production, menjalankan tracked handoff, dan menghasilkan touchpoint/conversion yang dapat ditelusuri. Real APK runtime/attestation tidak boleh diturunkan dari synthetic/public telemetry acceptance.

## Attribution

v1.0 menyimpan:

- direct/provider mapping;
- first touch;
- last touch;
- partial attribution;
- unattributed state;
- bounded reprocess evidence untuk existing revenue event.

Attribution tanpa bukti tidak ditebak. Real same-chain attribution sekarang sudah GREEN untuk chain Lynk production yang tercatat di atas.

## Revenue Ledger

D1 `monetization_revenue_events` adalah source of truth internal untuk dashboard dan AI learning.

Simpan gross, fee, cost, net, contribution margin, refund, status, currency, source, dan provider transaction identity. Jangan mengoptimasi gross revenue saja. Fee semantics Lynk yang belum tersedia dari provider tetap harus diperlakukan provisional; jangan menyebut gross sebagai final accounting profit setelah provider fee tanpa bukti fee aktual.

## AI Revenue Learning

Output disimpan di `monetization_learning_insights` dengan:

- scope;
- statement;
- evidence;
- confidence 0–1;
- action recommendation.

Learning run, persistence, context endpoint, daily cron, production aggregate-only refresh, dan refresh setelah real attributed chain sudah GREEN. Low-confidence insight tidak boleh otomatis mengubah pipeline existing.

Pada candidate v15, analytics hanya membaca snapshot lengkap ber-scope `verified-production`. Response menyertakan `freshness.stale`, alasan staleness, umur/source change, dan `materializationRequired`. Nilai `materializationRequired=true` berarti operator harus materialize ulang; response lama tidak boleh diperlakukan fresh. Scheduler v15 tidak berjalan kecuali `MONETIZATION_V15_MAINTENANCE_ENABLED=true`. Keputusan mengaktifkan flag tersebut dilakukan **sesudah** schema, secret bindings, canary, dan observasi freshness berhasil; canary tidak boleh diam-diam mengaktifkannya.

## Revenue-informed research bridge

OpenClaw dapat memanggil `POST /api/monetization/openclaw/research`.

Alur server-side:

`OpenClaw → Revenue Learning context → research keyword enrichment → Content OS Service Binding → topic_research run`

Batasan:

- read-only terhadap publishing pipeline;
- tidak membuat content, approval, render, Repliz draft, atau publish;
- platform riset hanya Threads dan Instagram;
- lookback 1–30 hari;
- maksimum 12 keywords setelah enrichment;
- input dibatasi dan disanitasi;
- request tanpa bearer valid ditolak.

Bridge, readiness, Service Binding, Revenue Learning availability, topic-research availability, fail-closed routes, formal OpenClaw caller acceptance, dan real Hermes Revenue Learning feedback acceptance sudah GREEN.

## OpenClaw integration package

Package install-ready berada pada `integrations/openclaw/` dan menyediakan:

- deterministic HTTP client;
- tujuh `user-invocable` skills;
- exact manifest;
- native skill config fragment;
- idempotent installer;
- installation/acceptance guide;
- package validation tests;
- checksum-verified reproducible bundle.

CI memvalidasi manifest, frontmatter, exact skill set, installer permissions, double-install idempotency, fail-closed no-token behavior, request routes/headers/body, supported research platforms, serta token non-disclosure.

Package sudah dijalankan pada external OpenClaw runtime dan formal runtime acceptance sudah GREEN.

## OpenClaw runtime evidence

OpenClaw request dapat membawa opaque headers untuk acceptance evidence. Sistem menyimpan correlation hanya dalam bentuk privacy-bounded evidence dan tidak menyimpan chat ID, token, customer PII, atau raw provider payload sebagai acceptance record.

Formal real OpenClaw runtime acceptance sudah GREEN. CI tetap tidak boleh memalsukan external evidence.

## Hermes feedback loop

OpenClaw membaca Revenue Learning context dan memberikan guidance kepada Hermes sebelum research berikutnya. Real Hermes Agent runtime menggunakan custom DeepSeek Chat Completions path dan formal Revenue Learning research feedback acceptance sudah GREEN, termasuk SHA-256 brief/result hashes. Loop tetap read-only/no-publish.

## Reconciliation

Setiap source revenue harus dapat dibandingkan dengan report source eksternal per periode.

Endpoint reconciliation menerima aggregate external count/gross lalu membandingkan ledger. Mismatch menghasilkan reconciliation item untuk investigasi. Real Lynk reconciliation sudah GREEN.

## Queue

Queue `umkm-monetization-ops` digunakan untuk operational/integration async path dan tidak menggantikan Revenue Ledger transaction write path. Producer → consumer → D1 acceptance sudah GREEN.

## Backup dan restore

D1 production telah diexport, direstore ke D1 sementara, diverifikasi untuk base tables, monetization tables, Revenue Ledger, dan Lynk revenue, lalu database sementara dihapus. Backup/restore proof sudah GREEN.

## Candidate v15 release boundary

Urutan rollout v15 bersifat manual dan terpisah dari source validation:

1. pastikan PR SHA exact dan seluruh validation source/CI lulus;
2. set `APP_RECEIPT_SECRET` dan `MONETIZATION_QUALITY_TOKEN` yang distinct pada candidate bindings;
3. jalankan schema-prepare protected workflow untuk `0006` → `0007` → `0008` dan verifikasi inventory;
4. pastikan production berada pada satu baseline v14 dengan 100% traffic dan preview URL remote nonaktif;
5. jalankan ephemeral canary v15 tepat 1% dengan version override smoke;
6. workflow harus selalu mengembalikan 100% traffic ke exact baseline v14, termasuk ketika smoke gagal;
7. review evidence canary dan freshness, kemudian buat keputusan eksplisit apakah `MONETIZATION_V15_MAINTENANCE_ENABLED` tetap nonaktif atau diaktifkan pada rollout terpisah.

Canary tidak memiliki promotion path dan bukan deployment v15 permanen. Jangan menjalankan schema workflow, canary, traffic change, maintenance activation, merge, atau tag tanpa approval eksplisit.

Perbaikan code untuk Content OS `/monetization` yang sebelumnya dapat menghasilkan Cloudflare Error 1101 telah dideploy terpisah pada Content OS Worker. Route tersebut sekarang memvalidasi signature RS256, issuer, audience, expiry, `nbf`, dan `kid` Cloudflare Access JWT menggunakan JWKS yang dirotasi. Edge Access dan JWKS smoke GREEN; HTTP 200 dengan sesi Access operator masih memerlukan evidence karena cloud browser berhenti pada challenge anti-bot. Smoke tanpa sesi hanya membuktikan Access menolak caller, bukan bahwa dashboard berhasil dirender.

## Production activation progress

- [x] CI hijau untuk Content OS dan Monetization Engine.
- [x] Backup/export D1 existing.
- [x] Restore proof ke D1 sementara.
- [x] Apply migration 0004/0005.
- [x] Set core runtime secrets.
- [x] Deploy Worker `umkm-monetization-engine` terpisah.
- [x] Smoke test health dan CRUD core.
- [x] Functional acceptance 28/28.
- [x] First-party tracked link dan custom domain.
- [x] Real Lynk webhook dan transaction ingestion.
- [x] Lynk retry/idempotency.
- [x] Real Lynk reconciliation.
- [x] Dashboard production dan Access existing.
- [x] DeepSeek Revenue Learning dan cron.
- [x] Production Revenue Learning refresh.
- [x] Queue producer/consumer acceptance.
- [x] OpenClaw platform bridge dan fail-closed identity.
- [x] OpenClaw-only Telegram runtime contract deployed.
- [x] Privacy-safe OpenClaw runtime evidence contract.
- [x] Revenue-informed OpenClaw research bridge.
- [x] OpenClaw skill package validation dan external installation/runtime use.
- [x] Formal real external OpenClaw request.
- [x] Formal real Telegram → OpenClaw delivery acceptance.
- [x] Real Hermes invocation dan formal feedback acceptance.
- [x] Correct production Lynk product mapping.
- [x] Real Instagram tracked click tied to real payment.
- [x] Real attributed revenue closed loop.
- [x] Content → revenue → Revenue Learning closed loop.
- [x] Learning → OpenClaw → Hermes → research feedback loop.
- [x] Candidate v15 source/regression/build hardening tervalidasi tanpa deployment claim.
- [x] Provision `APP_RECEIPT_SECRET` dan distinct `MONETIZATION_QUALITY_TOKEN` pada protected candidate runtime.
- [x] Apply additive migrations `0006`/`0007`/`0008` secara manual dalam urutan exact dan simpan postcheck inventory.
- [x] Jalankan ephemeral 1% canary v15 selama 30 menit dan buktikan restore exact baseline v14@100%.
- [x] Deploy perbaikan main Content OS Worker untuk Error 1101.
- [x] Tambahkan, uji, dan deploy app-layer Cloudflare Access JWT defense-in-depth.
- [ ] Buktikan dashboard HTTP 200 dengan sesi Cloudflare Access operator yang valid.
- [x] Pertahankan `MONETIZATION_V15_MAINTENANCE_ENABLED` nonaktif setelah review post-canary.
- [ ] Website tracked CTA production acceptance.
- [ ] APK production client acceptance.
- [ ] Real external affiliate provider acceptance.
- [x] Final automated/internal all-gates regression pada deployed versions dan production evidence.
- [ ] PR readiness decision, merge, dan tag `v1.0`.

## Go-live acceptance

Closed-loop commercial proof yang sudah GREEN:

`offer → campaign → content monetization → tracked Instagram click → real Lynk payment → Revenue Ledger → last-touch attribution → Revenue Learning`

Closed-loop learning/research proof yang sudah GREEN:

`Revenue Learning → OpenClaw → Hermes → research feedback`

Golden path Content OS existing harus tetap lulus:

`research → content → render → approval → Repliz draft`

Jika regression existing ditemukan, Monetization Engine harus dapat dirollback secara code-only tanpa migrasi destruktif pada Content OS lama.

Audit terbaru memiliki **0 RED**. Schema/secret prerequisites, canary/restore, app-layer Access JWT, dashboard code deployment, dan final automated regression sudah GREEN. Empat evidence gate tetap YELLOW: real APK client/attestation, production website tracked CTA, real external affiliate provider contract/reconciliation, dan Access-authenticated dashboard HTTP 200. PR #7 tetap Draft; merge dan tag menunggu seluruh gate yang diwajibkan serta explicit approval.
