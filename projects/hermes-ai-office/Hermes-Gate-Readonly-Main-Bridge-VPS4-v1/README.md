# Hermes Main read-only Gate Bridge v1 — VPS4

Purpose: Hermes Main is user `hermes-ai` (HOME=/var/lib/hermes-ai); the canonical Quality Gate is installed privately under `/home/ubuntu`. It is **correct** that Main cannot read `ubuntu`'s home. Do not chmod it or copy the SQLite ledger.

This package creates a **one-way read-only projection**:

`ubuntu private ledger + policy (read-only verification)` → `ubuntu-owned exporter` → `/var/lib/hermes-checklist-ro/live/status.json` → `hermes-ai` reads `/usr/local/bin/hermes-checklist-read --id B03 --id K05 --id K06`.

The parent directory is root-owned, the live directory is `ubuntu:<primary group of hermes-ai>` with mode **2750**, the snapshot is `ubuntu:<same group>` mode **0640**, and the reader binary is root-owned. Main cannot alter the ledger, policy, snapshot, approvals, or task claims. Exports never include claim tokens, agent actor values, credentials, or receipt bodies. The exporter verifies the 81-ID count, policy safety/dependency graph and hash-chained events in a single read-only SQLite transaction. Failed verification never exports a fresh snapshot.

**Freshness:** user systemd timer exports about every 30 seconds. The Main reader rejects snapshots older than 120 seconds, future timestamps, incorrect namespace, changed schema, and malformed or unsafe files. Freshness is a bound, not an atomic live lock: Main must use the canonical Gate claim/approval path before any real dispatch. This package solves **read-only UAT and advisory task selection**, not compulsory interception of all Hermes tools.

## Preconditions

- VPS4 host `VM-4-5-ubuntu`; users `ubuntu` and `hermes-ai` exist.
- Main Gate v1, Bridge, Namespace Inspector already installed and `AUDIT_PASS` (81 tasks). Source `/home/ubuntu/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py` exists.
- `ubuntu` has controlled sudo access for installation only. Do **not** give sudo to `hermes-ai`.
- Do not change `/home/ubuntu` permissions, ledger ownership, `AGENTS.md`, or OpenClaw config.

## VPS4 install (stop on first failure)

Upload ZIP + SHA256 into `/home/ubuntu`; as `ubuntu`:

```bash
set -euo pipefail
cd /home/ubuntu
sha256sum -c Hermes-Gate-Readonly-Main-Bridge-VPS4-v1.zip.sha256
unzip -oq Hermes-Gate-Readonly-Main-Bridge-VPS4-v1.zip
cd hermes-gate-readonly-bridge-v1
python3 -m unittest discover -s tests -v
python3 export_gate_snapshot.py --check-only --root "$HOME/.local/state/hermes-quality-gate"
python3 install_ro_bridge.py preflight
sudo python3 install_ro_bridge.py apply
sudo python3 install_ro_bridge.py verify
python3 "$HOME/.local/libexec/hermes-gate-ro/export_gate_snapshot.py"
systemctl --user daemon-reload
systemctl --user enable --now hermes-gate-ro-export.timer
systemctl --user start hermes-gate-ro-export.service
systemctl --user is-active hermes-gate-ro-export.timer
sudo -u hermes-ai /usr/local/bin/hermes-checklist-read --id B03 --id K05 --id K06
```

Expected statuses: `READONLY_BRIDGE_PREFLIGHT_PASS`, `READONLY_BRIDGE_FILES_INSTALLED`, `READONLY_BRIDGE_INSTALL_VERIFY_PASS`, `SNAPSHOT_PUBLISHED`, `active`, and `CHECKLIST_NAMESPACE_PASS` (source `VPS4_ROOT_PROTECTED_READONLY_SNAPSHOT`). B03 should be CLOSED, K05 OPEN/ready if still current, K06 blocked on K05 until closed. **Do not rely on these expected states if the ledger has legitimately changed.**

Note: `sudo -u hermes-ai` checks Linux file permissions but does not guarantee the specific Main terminal tool has unrestricted mounts. After this terminal test, open a new Main conversation and ask it to run only:

```sh
/usr/local/bin/hermes-checklist-read --id B03 --id K05 --id K06
```

If denied by Main's tool sandbox, stop and report `GATE_READONLY_BLOCKED` or `TOOL_NOT_AVAILABLE` without opening its filesystem permissions broadly.

## Evidence and service checks

```bash
systemctl --user status hermes-gate-ro-export.timer --no-pager
systemctl --user status hermes-gate-ro-export.service --no-pager
journalctl --user -u hermes-gate-ro-export.service -n 25 --no-pager
ls -ld /var/lib/hermes-checklist-ro /var/lib/hermes-checklist-ro/live
stat -c '%U:%G %a %n' /var/lib/hermes-checklist-ro/live/status.json
python3 "$HOME/.local/share/hermes-quality-gate-v1/gate.py" audit
```

No POST, no claims, no approvals, and no service restart are triggered by this bridge.

## Optional Main SOP correction (after Main UAT passes)

The existing Main SOP may still show the old private ubuntu-home CLI. After a successful test **inside the actual Main terminal**, as `ubuntu`:

```bash
cd /home/ubuntu/hermes-gate-readonly-bridge-v1
python3 patch_main_sop.py preflight
python3 patch_main_sop.py apply
python3 patch_main_sop.py verify
```

This addendum supersedes only the old Main-facing CLI path, is append-only, backs up the existing `AGENTS.md` with mode 0600, and is idempotent. No OpenClaw config/restart is performed. Read a new Main session to load SOP after the update. Do not do this step if Main cannot reach the new read-only CLI.

## Safe rollback

```bash
systemctl --user disable --now hermes-gate-ro-export.timer
systemctl --user stop hermes-gate-ro-export.service
```

The snapshot becomes stale and clients fail closed. Keep it and the software for audit until the owner explicitly authorizes removal; no changes to the original Gate or ledger are made by this rollback.

## Limits

- This is a **read-only status mirror**, not real-time remote execution of `gate.py claim` or `approve`.
- If the mirror timer stops or DB integrity fails, Main must not infer status from old data or from KPI/provisioning documents.
- An agent can still bypass an advisory SOP when using other tools; enforcement of all dispatch requires a separate, explicitly authorized integration with the actual task-dispatch path. Never claim P2-03 CLOSED from this bridge alone.
