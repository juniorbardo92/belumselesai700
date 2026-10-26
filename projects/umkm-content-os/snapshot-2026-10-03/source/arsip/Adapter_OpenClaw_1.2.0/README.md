# UMKM Content OS — OpenClaw Connector

This package adds three optional OpenClaw tools:

- `umkm_topic_research`
- `umkm_account_audit`
- `umkm_viral_analyzer`

The tool sends a bounded JSON request to the fixed production endpoint:

`https://umkmnaikkelas.app.n8n.cloud/webhook/umkm-content-os/topic-research`

## Security boundaries

- The destination URL is fixed in code and must use HTTPS.
- Redirects are rejected, preventing the authentication header from being forwarded.
- The token is read only from `UMKM_CONTENT_OS_TOKEN` in the OpenClaw runtime environment.
- The token is never accepted as a model/tool parameter and is never returned.
- Inputs and response size are bounded.
- The request times out after 60 seconds.
- Account audit is read-only and is limited to public Threads data returned by Repliz.
- Viral analysis is read-only, checks at most five candidate posts, and labels low-confidence or incomplete evidence explicitly.
- The plugin does not enable shell execution, filesystem access, channels, or public Gateway access.

## Requirements

- OpenClaw `2026.5.17` or newer
- Node.js 22.22.3, 24.15, 25.9, or newer compatible release
- `UMKM_CONTENT_OS_TOKEN` already stored in the global OpenClaw `.env`

## Install

Extract the package, open PowerShell in its directory, and run:

```powershell
npm install --omit=dev
openclaw.cmd plugins install .
openclaw.cmd plugins enable umkm-content-os
openclaw.cmd gateway restart
openclaw.cmd plugins inspect umkm-content-os --runtime
```

All three tools are optional. Add `umkm_topic_research`, `umkm_account_audit`, and `umkm_viral_analyzer` to the effective tool allowlist only after runtime inspection succeeds.

## Test prompt

```text
Gunakan UMKM Content OS untuk riset topik "omzet ramai tetapi kas kosong" di Threads selama 7 hari terakhir dengan keyword "cashflow UMKM". Tampilkan akun relevan dan pola konten berperforma tinggi.
```

```text
Audit akun Threads @ronald21__ secara read-only. Tampilkan statistik profil, konten terbaru, tautan konten, dan metrik yang memang tersedia. Jangan membuat draft atau melakukan engagement.
```

```text
Gunakan Viral Content Analyzer untuk topik "omzet ramai tetapi kas kosong" di Threads selama 7 hari. Tampilkan skor outlier, confidence, metrik yang tersedia, baseline yang dipakai, dan keterbatasannya. Jangan membuat draft atau mempublikasikan apa pun.
```
