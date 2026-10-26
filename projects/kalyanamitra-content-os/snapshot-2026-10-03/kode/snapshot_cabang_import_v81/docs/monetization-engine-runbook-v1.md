# Monetization Engine FINAL v1.0 — Production Runbook

## Status saat ini

- Core Monetization Engine di production: **GREEN**.
- OpenClaw server-side bridge, evidence contract, research bridge, skill package, checksum bundle, dan Revenue Learning enrichment: **GREEN**.
- External OpenClaw host, real Telegram reply, real Hermes invocation, dan real attributed closed loop yang telah direkam tetap **GREEN** berdasarkan evidence production historis.
- Runtime resmi Monetization Worker tetap v14 `ec19dcb0-3c61-4b48-a0c1-e9f28cec4397` pada 100%. Hardening v15 telah lolos 1% canary 30 menit dan exact restore; bukan deployment permanen.
- Migration `0006`/`0007`/`0008`, candidate-only secret bindings, dashboard Access JWT hardening, dan final automated regression: **GREEN**.
- Final release v1.0 tetap **YELLOW** sampai real APK/website/external-affiliate gates, dashboard authenticated smoke, dan release closure selesai.
- PR #7 tetap Draft dan belum di-merge/tag.
- Prinsip implementasi: **ADDITIVE ONLY**.

## Scope dan invariants

Runbook ini hanya untuk lapisan Monetization Engine yang bersifat additive terhadap UMKM Content OS. D1 `umkm-content-os-db` tetap source of truth. Website utama `umkmnaikkelas.id` tidak diubah oleh prosedur ini. `go.umkmnaikkelas.id` hanya untuk first-party tracked redirect. Repliz tetap draft-only. Platform aktif konten adalah Threads, Instagram, dan TikTok; LinkedIn/X tidak didukung pada jalur aktif.

Jangan merge PR, menghapus tabel, menonaktifkan Cloudflare Access, membuat attribution palsu, atau melakukan auto-publish sebagai bagian dari incident response.

## Runtime utama

- Content OS Worker: `umkm-content-os`
- Monetization Worker: `umkm-monetization-engine`
- Monetization entry point resmi: `src/monetization-worker-v14.ts`
- Candidate entry point: `src/monetization-worker-v15.ts`; jangan gunakan config candidate untuk permanent deploy
- D1: `umkm-content-os-db`
- R2: `umkm-content-media`
- Queue: `umkm-monetization-ops`
- First-party redirect: `https://go.umkmnaikkelas.id/go/{slug}`
- Lynk webhook: `/api/monetization/webhooks/lynk`
- Dashboard monetisasi: Content OS `/monetization`, server-rendered dan berada di balik Access existing
- Revenue Learning cron: `0 1 * * *` atau sekitar 08:00 WIB
- Content OS Service Binding pada Monetization Worker: `CONTENT_OS`
- OpenClaw integration package: `integrations/openclaw/`

## Health triage

Urutan pemeriksaan:

1. GET Monetization `/api/monetization/status` harus 200 dan `ok:true`.
2. GET `https://go.umkmnaikkelas.id/api/monetization/status` harus 200.
3. Sensitive Monetization API tanpa bearer harus 401.
4. Content OS `/api/status` dan `/monetization` harus tetap tertahan Cloudflare Access untuk caller tanpa sesi.
5. Direct POST `/api/monetization/telegram/webhook` harus 410 karena Telegram hanya boleh melalui OpenClaw.
6. GET `/api/monetization/openclaw/evidence` tanpa internal bearer harus 401.
7. GET `/api/monetization/openclaw/research-manifest` tanpa OpenClaw bearer harus 401.
8. POST `/api/monetization/openclaw/research` tanpa OpenClaw bearer harus 401.
9. Dengan sesi Access yang valid, Content OS `/monetization` harus HTTP 200 dan merender HTML, bukan Error 1101.
10. Periksa `monetization_integration_logs` untuk error terbaru sebelum mengubah konfigurasi.

Jangan menonaktifkan Access atau membuka endpoint publik untuk menyelesaikan kegagalan health check automation.

Perbaikan route/dashboard Error 1101 berada pada main Content OS Worker, bukan Monetization Worker, dan telah dideploy terpisah sebagai Content OS version `2b923aeb-883e-4587-826f-ebe2cf8cf918`. App-layer Access JWT validation juga aktif dan fail-closed. Unauthorized redirect serta JWKS checks sudah GREEN; Access-authenticated HTTP 200 smoke masih menunggu sesi operator yang dapat melewati challenge anti-bot.

## Candidate v15 prerequisites

Jangan mengarahkan traffic ke v15 sebelum semua prerequisite berikut terpenuhi:

1. exact candidate SHA sama dengan SHA yang sudah lolos `npm run check:all`;
2. production masih satu baseline version v14 pada 100% traffic;
3. remote preview URLs nonaktif sebelum dan sesudah candidate upload;
4. `APP_RECEIPT_SECRET`, `MONETIZATION_INGEST_TOKEN`, distinct `MONETIZATION_QUALITY_TOKEN`, `LYNK_WEBHOOK_SECRET`, `DB`, `CONTENT_OS`, dan `MONETIZATION_QUEUE` terdeteksi pada candidate version;
5. schema production memiliki migration `0006`, `0007`, `0008` dan kolom history yang diwajibkan;
6. protected environment approval tersedia untuk schema dan canary.

`MONETIZATION_QUALITY_TOKEN` tidak boleh memakai nilai `MONETIZATION_INGEST_TOKEN`. `APP_RECEIPT_SECRET` hanya untuk receipt telemetry; jangan memakainya sebagai bearer API. `MONETIZATION_V15_MAINTENANCE_ENABLED` harus tidak diset atau bukan `true` selama schema prep dan canary awal.

## Schema prepare v15

Gunakan workflow manual `monetization-v15-schema-prepare.yml`; jangan menjalankan migration general-purpose yang dapat menyertakan file baru di luar daftar review. Workflow harus:

- mengunci exact commit SHA dan confirmation phrase;
- menolak pending migration selain `0006_monetization_hardening_v15.sql`, `0007_monetization_record_quality.sql`, dan `0008_monetization_quality_history.sql`;
- menerapkan ketiganya dalam urutan `0006` → `0007` → `0008`;
- memverifikasi `monetization_analytics_snapshots`, `monetization_daily_analytics_v15`, `monetization_record_quality`, dan `monetization_record_quality_history`;
- memverifikasi sequence/history columns sesudah apply.

Migration bersifat additive. `0007` tidak mengklasifikasi row lama secara otomatis; row tanpa overlay tetap `unknown`/`unverified`. `0008` menambah history append-only. Jangan drop tabel atau menghapus history saat rollback aplikasi.

## Quality review dan promotion

Gunakan `GET /api/monetization/quality/review` dan `PUT /api/monetization/quality/{type}/{id}` dengan `MONETIZATION_QUALITY_TOKEN`. Ingest token tidak berwenang mengakses jalur ini.

Sebelum promosi ke `production`/`verified`, operator harus menyediakan evidence reference dan memastikan:

- revenue ber-currency IDR, integer amounts, status/sign/algebra valid;
- attribution touchpoint terverifikasi dan Content/Campaign/Offer konsisten;
- seluruh lifecycle sale/reversal dapat diproyeksikan bersama;
- fee/cost basis tidak diklaim `actual` tanpa evidence provider.

Promosi quality menulis projection lifecycle secara atomik serta history sebelumnya/baru dalam batch yang sama. Pending→confirmed atau confirmed→rejected dapat menginvalidasi quality lama; perubahan otomatis itu juga harus meninggalkan history. Jangan menulis overlay langsung melalui SQL untuk melewati validasi.

## Lynk webhook

Runtime v14 mendukung event `payment.received` dengan `data.message_action=SUCCESS`, transaction id pada `data.message_data.refId`, product id pada `items[].uuid`, gross merchant pada `totals.grandTotal`, dan waktu provider pada `createdAt`. Candidate v15 mempertahankan mapping real nested payload tersebut dan memvalidasi known lifecycle events secara fail-closed.

Customer/shipping/question data tidak diperlukan untuk Revenue Ledger dan tidak boleh disalin ke log operasional.

Success provider contract harus HTTP 200. Retry/resend transaksi yang sama aman karena idempotency memakai source/event/transaction identity. Jika Lynk menunjukkan FAILED tetapi Revenue Ledger sudah berisi transaksi, cek HTTP response contract terlebih dahulu dan jangan membuat ledger row manual.

Test URL/handshake yang tidak berisi transaction id harus diterima secara aman tanpa menulis revenue.

Autentikasi production saat ini memakai callback token dari `LYNK_WEBHOOK_SECRET`. Native signature Lynk belum boleh dilabeli verified sampai algoritma/signing contract resminya dikonfirmasi. Jangan menghapus callback token hanya karena header signature terdeteksi.

### Lynk reconciliation

Gunakan periode sempit yang mencakup timestamp provider transaksi. Bandingkan external transaction count dan external gross dengan ledger source `lynk`. Status yang diharapkan adalah `matched` dengan transaction delta 0 dan gross delta 0.

`fee=0`, `net=gross`, dan `margin=gross` untuk adapter Lynk saat ini adalah nilai engineering sementara sampai semantics settlement fee resmi terkonfirmasi. Jangan melabelinya sebagai laba final setelah biaya Lynk.

Candidate v15 hanya menerima currency `IDR` dan monetary fields integer yang memenuhi algebra/status/sign. Untuk rail Lynk v1:

- `payment.received` yang malformed atau statusnya tidak sesuai tidak boleh menulis revenue;
- refund/cancel/reversal hanya dapat dipersist sebagai **full refund** bila satu original confirmed sale ditemukan dan gross refund exact sama dengan original;
- partial refund, ambiguous original, mismatch currency/dimensi/amount, atau known event malformed harus dikarantina tanpa ledger write;
- full refund mewarisi fee, cost, currency, Content, Campaign, Offer, dan identity original;
- bila fee tidak hadir atau belum terverifikasi dari provider, tampilkan contribution margin sebagai provisional/unknown; jangan mengubahnya menjadi accounting profit.

Full-refund-only adalah batas aman implementation candidate, bukan bukti kontrak resmi Lynk. Sebelum rollout final, cocokkan fixture/dokumentasi provider nyata untuk event name, status, refund semantics, currency, fee, dan retry behavior.

## Attribution

Revenue ingestion dan attribution adalah gate terpisah. `unattributed` bukan kegagalan parser jika provider mapping/touchpoint tidak tersedia. Jangan membuat mapping permanen untuk produk test hanya agar status terlihat attributed.

Untuk produk production, mapping harus menggunakan Provider Mapping Registry dan merujuk Offer/Campaign/Content yang benar.

Pemeriksaan minimum sebelum menyatakan attributed:

- external product ID benar;
- `offer_id` benar;
- `campaign_id` benar;
- `content_item_id` benar;
- touchpoint/visitor evidence tersedia atau direct mapping memang sah;
- transaksi tetap satu row setelah retry/resend.

## First-party tracked links

Tracked URL production menggunakan `https://go.umkmnaikkelas.id/go/{slug}`. Redirect normal adalah HTTP 302 menuju destination URL. Click event harus tercatat di D1. Redirect tetap boleh berhasil ketika event write best-effort gagal. Jangan mengubah website utama menjadi redirect service.

## OpenClaw platform bridge

OpenClaw ingress identity diverifikasi oleh Content OS menggunakan Worker secret `OPENCLAW_INGRESS_TOKEN`. Monetization Worker tidak memiliki copy token; verifikasi dilakukan melalui Cloudflare Service Binding `CONTENT_OS`.

Endpoints:

- POST `/api/monetization/openclaw/command` — read-only revenue/profit/offer/content/health reporting
- GET `/api/monetization/openclaw/context` — Revenue Learning feedback untuk orchestration/research loop
- GET `/api/monetization/openclaw/telegram-manifest` — kontrak command center Telegram untuk OpenClaw
- GET `/api/monetization/openclaw/automation-status` — Content OS automation state melalui Service Binding
- GET `/api/monetization/openclaw/research-manifest` — kontrak topic research yang boleh dipanggil OpenClaw
- POST `/api/monetization/openclaw/research` — membuat read-only `topic_research` run di Content OS
- GET `/api/monetization/openclaw/research-readiness` — readiness internal, dilindungi `MONETIZATION_INGEST_TOKEN`
- GET `/api/monetization/openclaw/evidence` — runtime evidence internal, dilindungi `MONETIZATION_INGEST_TOKEN`

Semua endpoint OpenClaw-facing harus fail-closed bila bearer OpenClaw tidak valid. Jangan mengganti OpenClaw token dengan `MONETIZATION_INGEST_TOKEN`.

Platform-side bridge dan Service Binding yang sehat belum membuktikan external OpenClaw runtime aktif. Real caller acceptance harus dicatat terpisah dengan bukti request dari runtime OpenClaw production.

## OpenClaw runtime evidence

Successful OpenClaw-facing calls dapat mencatat evidence ke `monetization_integration_logs`.

Evidence hanya menyimpan:

- operation;
- response status;
- interface yang sudah masuk allowlist;
- keberadaan external run/Telegram update evidence;
- command name yang sudah masuk allowlist;
- correlation ID dalam bentuk prefix hash SHA-256;
- timestamp.

Evidence tidak menyimpan raw external run ID, raw Telegram update ID, chat ID, bearer token, request body customer, atau PII.

Gate external runtime hanya dapat dianggap GREEN bila evidence menunjukkan caller eksternal, misalnya `X-OpenClaw-Run-Id` atau interface Telegram. Internal CI tidak boleh memalsukan external runtime evidence.

## OpenClaw Revenue-informed research bridge

`POST /api/monetization/openclaw/research` melakukan alur berikut:

`OpenClaw → Revenue Learning context → keyword enrichment → Content OS Service Binding → topic_research run`

Batasan:

- read-only terhadap pipeline publishing;
- tidak membuat content, approval, render, Repliz draft, atau publish;
- platform riset hanya Threads dan Instagram;
- lookback 1–30 hari;
- maksimum 12 keywords setelah enrichment;
- input dibatasi dan disanitasi;
- request tanpa bearer valid ditolak 401.

Production aggregate-only learning refresh pada 31 Agustus 2026 menghasilkan dua active insights dan empat enrichment keywords. Angka ini adalah evidence pada waktu acceptance, bukan invariant permanen; jumlah dapat berubah setelah cron/learning run berikutnya.

## OpenClaw install-ready package

Package berada pada `integrations/openclaw/` dan berisi:

- deterministic client `common/umkm-monetization.mjs`;
- tujuh user-invocable skills: revenue, profit, offers, content, health, learning, research;
- manifest package;
- config fragment untuk native skill commands;
- idempotent installer;
- installation/acceptance guide;
- checksum-verified bundle workflow.

Required environment pada host OpenClaw:

```text
UMKM_OPENCLAW_TOKEN=<nilai existing OPENCLAW_INGRESS_TOKEN>
```

Jangan membuat token baru. Jangan menaruh nilainya dalam repo, skill file, Telegram message, atau log.

Verifikasi host setelah instalasi:

```bash
openclaw skills check
openclaw skills list --eligible
openclaw skills info revenue
openclaw skills info research
```

Package/CI/bundle readiness dapat berstatus GREEN, tetapi external OpenClaw baru GREEN setelah package terpasang dan command nyata menghasilkan response serta runtime evidence.

## Hermes research feedback

`/api/monetization/openclaw/context` menyediakan insight dan research guidance dari AI Revenue Learning. OpenClaw dapat memberi context ini ke Hermes sebelum research berikutnya. Hermes tetap Research Assistant; DeepSeek tetap Content/Revenue Learning Assistant.

Server-side research bridge sudah siap dan dapat memasukkan Revenue Learning guidance ke Content OS research. Jangan mengklaim Hermes runtime GREEN sampai ada invocation dari agent Hermes yang nyata dan hasilnya kembali menjadi input research/content yang dapat ditelusuri.

## Telegram command center

Arsitektur final hanya menggunakan satu bot/interface:

`Telegram → OpenClaw skill → Monetization Engine`

Telegram tidak mengarah langsung ke Monetization Worker. Direct endpoint `/api/monetization/telegram/webhook` sengaja dinonaktifkan dan harus mengembalikan HTTP 410. Credential bot dan Telegram webhook dikelola pada runtime OpenClaw, bukan disalin ke Monetization Worker.

Command read-only yang dipublikasikan melalui OpenClaw skills:

- `/revenue`
- `/profit`
- `/offers`
- `/content`
- `/health`
- `/learning`
- `/research <topik>`

Command center tidak memiliki action publish. Jangan menaruh bot token, webhook secret, OpenClaw bearer, atau credential lain di repository, URL, log, dashboard, maupun chat.

Readiness internal berarti manifest, skill package, route, authentication, checksum, dan direct-webhook denial bekerja. Status Telegram baru GREEN end-to-end setelah command nyata dari Telegram menerima balasan melalui OpenClaw.

## DeepSeek Revenue Learning

Daily cron berjalan 01:00 UTC / 08:00 WIB. Jika tidak ada confirmed revenue, learning boleh safe-skip. Jika ada data, insight disimpan di `monetization_learning_insights` dan guidance tersedia melalui learning context.

Revenue Learning hanya menggunakan agregat bisnis yang diperlukan. Jangan mengirim PII customer atau raw event massal ke model. Jangan menghapus insight atau memaksa model menyimpulkan sebab yang tidak didukung data.

### Analytics freshness v15

`GET /api/monetization/daily-analytics` pada candidate membaca snapshot lengkap `verified-production`, bukan rollup legacy ketika quality overlay tersedia. Interpretasi response:

- `freshness.stale=false` dan `materializationRequired=false`: snapshot masih layak dibaca;
- `freshness.stale=true`: baca `freshness.reasons`, `ageSeconds`, dan `sourceChangedAt`;
- `materializationRequired=true`: lakukan manual aggregate dan jangan sajikan snapshot lama sebagai current;
- tidak ada snapshot lengkap: endpoint mengembalikan keadaan yang membutuhkan materialization, bukan fallback diam-diam ke legacy data.

Scheduled v15 materialization hanya berjalan jika `MONETIZATION_V15_MAINTENANCE_ENABLED=true`. Pertahankan flag nonaktif saat canary. Setelah canary kembali ke v14@100%, review durasi aggregate, staleness, source change, Queue/log, dan error rate; keputusan aktivasi maintenance harus dibuat eksplisit pada rollout terpisah.

## Queue

Queue `umkm-monetization-ops` hanya untuk operational/integration async path dan tidak menggantikan D1 write-path transaksi. Consumer harus ack setelah D1 write sukses dan retry pada error.

Saat incident Queue, Revenue Ledger transaction path tetap authoritative. Jangan replay message tanpa correlation/idempotency review.

## APK/App contract

Backend app contract mendukung app event, pseudonymous `appInstanceId`, idempotency, dan offer handoff. Backend readiness tidak sama dengan APK production acceptance.

Candidate receipt menggunakan HMAC server-side `APP_RECEIPT_SECRET` serta mengikat normalized instance, app version, event, dan TTL. Receipt ini hanya membuktikan telemetry diterima backend. Ia bukan APK signing, device attestation, Play Integrity, atau bukti install pada perangkat nyata.

Status APK baru GREEN penuh setelah build nyata diinstal pada perangkat, mengirim event ke production, menjalankan tracked handoff, dan menghasilkan touchpoint/conversion yang dapat ditelusuri. Bila attestation diwajibkan oleh release policy, bukti tersebut harus berasal dari mekanisme attestation nyata; jangan mengonversi public telemetry acceptance menjadi attestation evidence.

## Affiliate adapter

Generic affiliate adapter menerima normalized conversion dan provider mapping. Synthetic acceptance tidak menggantikan provider production acceptance.

Sebelum mengaktifkan provider nyata:

- pastikan transaction ID stabil;
- pastikan commission semantics benar;
- pastikan currency dan status mapping benar;
- pastikan duplicate/retry aman;
- lakukan reconciliation per periode.

## Ephemeral canary v15

Gunakan hanya workflow manual `monetization-v15-canary.yml` dengan protected environment. Workflow ini bukan promotion path.

Expected sequence:

1. verifikasi exact baseline v14 version ID pada 100% traffic;
2. verifikasi schema `0006`/`0007`/`0008`, candidate bindings, dan preview policy;
3. upload version candidate tanpa traffic atau preview alias;
4. arm unconditional restore;
5. ubah traffic menjadi baseline 99% + exact candidate 1%;
6. smoke exact candidate dengan version override, observasi singkat, dan capture artifacts;
7. pada success maupun failure, restore exact baseline v14 ke 100% dan tolak restore bila deployment sudah diubah pihak lain.

Canary selesai hanya setelah status deployment membuktikan satu baseline version exact pada 100%. Jangan mempromosikan candidate, menambah persentase, menjalankan maintenance, merge, atau tag dari workflow ini.

## Backup dan restore

Sebelum migrasi/perubahan data berisiko, export D1. Restore proof dilakukan ke D1 sementara, bukan database production. Verifikasi minimal:

- base tables terbaca;
- monetization tables terbaca;
- Revenue Ledger terbaca;
- Lynk revenue rows terbaca.

Hapus temporary restore database setelah verification. Jangan melakukan destructive restore ke production tanpa explicit approval dan incident justification.

## Incident isolation

Jika salah satu integration gagal:

- Lynk: hentikan perubahan adapter, cek integration log + satu transaction ID + idempotency.
- Affiliate: isolasi provider; jangan mematikan generic ingestion.
- OpenClaw: endpoint tetap fail-closed; monetization core tidak bergantung pada external caller.
- OpenClaw skills: rollback hanya folder package/config fragment; jangan rollback Worker/D1 bila core sehat.
- Telegram: biarkan transport berada di OpenClaw; jangan mengaktifkan direct public webhook pada Monetization Worker.
- Hermes: jangan memalsukan runtime evidence; pertahankan context/research endpoints read-only.
- DeepSeek: learning dapat error tanpa menghentikan Revenue Ledger.
- Queue: D1 transaction write-path tetap authoritative.
- Dashboard: read-only; jangan memindahkan bearer token ke browser.
- Attribution: jangan membuat mapping spekulatif untuk menghilangkan status `unattributed`.

## Rollback policy

Rollback harus code-only ke exact Worker version yang sebelumnya terbukti GREEN bila memungkinkan. Migrations `0004`/`0005` serta candidate schema `0006`/`0007`/`0008` bersifat additive dan tidak boleh di-drop untuk rollback aplikasi. Jangan menghapus revenue rows, quality projection, atau append-only history untuk rollback code.

Rollback OpenClaw skill package:

```bash
rm -rf "$HOME/.openclaw/workspace/skills/umkm"
```

Setelah rollback, ulangi health, bearer protection, Lynk protection, first-party redirect, Queue, OpenClaw fail-closed, direct Telegram 410, dan Access gate checks.

## Go-live acceptance rule

Sebuah gate hanya GREEN jika memiliki runtime evidence. Synthetic acceptance tidak menggantikan real provider evidence. Package readiness tidak menggantikan real external caller evidence.

Minimal closed loop final:

`offer → campaign → content monetization → tracked link → real click → real checkout/payment → Revenue Ledger → correct attribution → dashboard → Revenue Learning → OpenClaw/Hermes feedback → next research/content`

Golden path Content OS existing juga harus tetap lulus:

`research → content → render → approval → Repliz draft`

PR tetap Draft sampai semua gate yang diwajibkan untuk final release selesai dan merge mendapat explicit approval.

Audit terbaru memiliki **0 RED**. Schema/secret/canary/restore, dashboard code deployment, app-layer Access JWT, dan final automated regression sudah GREEN. Gate yang masih memerlukan evidence ialah real APK runtime/attestation, website tracked CTA, real external affiliate provider contract/reconciliation, dan authenticated dashboard HTTP 200. PR readiness, merge, dan tag tetap ditahan sampai acceptance diwajibkan selesai dan ada explicit approval.
