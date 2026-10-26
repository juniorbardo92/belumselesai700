# KAL-AUTO-001 — V4.1 Content API HTTP 400 hotfix

**Diagnosis confirmed from source and Repliz official API docs**: V4 monitor calls `GET /public/content/{contentId}` *without* required `accountId`. This returns `REPLIZ_HTTP_400` on accounts enforcing documented validation. Scheduling and already-published posts are unaffected.

Official docs: https://docs.repliz.com/api/content/get-one-content

One-line functional change (seven Content API lookups):
```diff
-        doc=api.get('/content/'+content_id)
+        doc=api.get('/content/'+content_id,params={'accountId':ACCOUNT})
```

Before SHA256: `2403bb7ebc0549659b7127f8332d5cd1549ba145706dc066f7151c01de1948d9`
After SHA256: `627e7eb756e95caa3ca9a2c330128823a1c664797da19d7d6b2a4cc9c1508698`

Scope: VPS2 `/opt/kal-auto-001/publication_monitor.py` only; no publisher B3e, Telegram, `.env`, SSH, historic timers, or content changes. The helper `recheck_gampopa_vps2.py` optionally updates only V4's sidecar `proofs.next_check` for the known Gampopa job, **not** the original jobs DB, alerts, or any schedule.

## 1. Upload and unpack on VPS2

```bash
cd /home/ubuntu
python3 -m zipfile -e KAL-AUTO-001-MONITOR-CONTENT-FIX-20261021.zip /home/ubuntu/kal-auto-v4-fix-stage
cd /home/ubuntu/kal-auto-v4-fix-stage/KAL-AUTO-001-MONITOR-CONTENT-FIX
python3 -B -m unittest discover -s tests -q
```

## 2. Install guarded patch on VPS2 (only if tests PASS)

```bash
sudo bash scripts/install_vps2_hotfix.sh
```

Expected: `CONTENT_ACCOUNT_ID_FIX_INSTALLED`. If `BLOCKED_MONITOR_CURRENTLY_RUNNING_RETRY_LATER`, wait one minute and retry; do not bypass. Script checks host and exact original SHA256; backups prior source; briefly pauses **only the V4 monitor timer**, resumes if previously active. Worker/publisher timer remain untouched.

## 3. Recheck without retrying publication

```bash
sudo python3 -B scripts/recheck_gampopa_vps2.py
sudo python3 -B /opt/kal-auto-001/publication_monitor.py once
sudo python3 -B /opt/kal-auto-001/publication_monitor.py status --job-id KAL-AUTO-D8BC64FDB13CD47902B6
```

Expected if Repliz Content API accepts the corrected query: `proof_status: CONTENT_CONFIRMED`, `post_count: 7` and distinct URLs. Public visibility and parent-child can remain `NOT_VERIFIED` without negating Content API proof. The monitor sends a new `PUBLISHED` Telegram milestone once, if not already sent. `EVIDENCE_PENDING` remains recorded and will not repeat. If new error appears, do not retry POST: provide only `reason`, proof status, and the HTTP code; never reveal credentials.

## Rollback (if needed)

Stop V4 monitor timer, restore the exact backup emitted by installer with `sudo cp -a`, then start that timer again if it was previously active. Do not remove sidecar ledger or notification records.

**This is an offline-tested hotfix, not an assertion of production deployment.**
