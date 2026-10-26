# Hermes Gate Main UAT — ID Namespace Fix v1.1 (portable QA)

**Purpose:** repair the Main read-only UAT mismatch, not change gate tasks, policies, dependencies, publication, production, or sessions_spawn permissions.

## Evidence and root cause

- Existing VPS4 evidence: `BRIDGE_PREFLIGHT_PASS`, `AUDIT_PASS`, 81 tasks, valid event chain, watcher `active/enabled`; Main SOP appended.
- UAT Main queried SOP/KPI/provisioning codes, not canonical checklist ledger. `B03` ≠ `B3`; Checklist `K05/K06` ≠ KPI `K05/K06`.
- The gate CLI runs **locally via authorized terminal**, not as a tool named `quality gate`. `tool_search("quality gate")` returning zero is not proof that the CLI cannot run.
- The only defensible fix is to clarify the namespace, run a read-only inspector, then repeat UAT Main with explicit source. This package does **not** register terminal or create a new OpenClaw tool, and so cannot guarantee Main can execute it.

## Install (on VM-4-5-ubuntu as ubuntu; not sudo)

Upload this ZIP and `.sha256` to `/home/ubuntu`, then:

```bash
set -euo pipefail
cd /home/ubuntu
sha256sum -c Hermes-Gate-Namespace-UAT-Fix-VPS4-v1.1.zip.sha256
unzip -oq Hermes-Gate-Namespace-UAT-Fix-VPS4-v1.1.zip
cd hermes-gate-namespace-fix-v1.1
python3 -m unittest discover -s tests -v
python3 install_namespace_fix.py --diagnose  # Must print GATE_INTEGRITY_PASS
python3 install_namespace_fix.py --preflight
python3 install_namespace_fix.py --apply
python3 install_namespace_fix.py --verify
python3 ~/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py --id B03 --id K05 --id K06
```

- `--apply` adds one pinned read-only inspector to the installed v1 gate folder and **appends** one namespace clarification to Main AGENTS.md, with private byte-for-byte backup. It never edits `gate.py`, bridge.py, `policy.json`, ledger, or OpenClaw configuration. Idempotent on rerun.
- Verify should print `NAMESPACE_VERIFY_PASS`, with `B03=CLOSED` and `K06` depending on `K05`. The inspector runs with SQLite `mode=ro` and `PRAGMA query_only=ON` and verifies the event hash chain before returning canonical descriptions.
- If source changed, installer blocks. Do not force append or change state to satisfy UAT.

## Fresh Main UAT (new Telegram session)

**UAT-01:** “Read the canonical Checklist Induk 81 ledger via the authorized VPS4 terminal: `python3 /home/ubuntu/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py --id B03`. Report exact `namespace`, `id`, `state`, `description`, and `can_start`. Do not call claim, spawn, or alter any file. Do not conflate B03 with provisioning B3.”

**UAT-02:** “Read the canonical Checklist Induk 81 ledger and policy via the authorized VPS4 terminal: `python3 /home/ubuntu/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py --id K05 --id K06`. Report `dependencies_for_start` and `start_blockers`. Do not conflate task IDs with KPI codes, claim, post or spawn.”

**Expected UAT results:** actual CLI execution evidence (not mere rephrased SOP), B03 CLOSED so `can_start=false`; K06 has `K05` in `dependencies_for_start`, and if K05 is OPEN it remains blocked. If terminal cannot execute on VPS4 Main session, report `GATE_CLI_UNREACHABLE`, preserve Main UAT PARTIAL, and audit terminal binding/permissions separately. No sessions_spawn config changes from this package.

## Rollback

Run `python3 install_namespace_fix.py --rollback-sop`. It restores the **exact pre-change bytes** only when a unique private backup proves that `AGENTS.md` has not changed since this addendum was appended; otherwise rollback refuses to overwrite concurrent edits. The read-only inspector and gate ledger remain installed for audit. Do not restore an older `AGENTS.md` blindly.

## Remediation v1.1 — why v1 failed on VPS4

- v1 tests referenced `/mnt/data/gate-local-qa/ledger.sqlite`, a private local QA path absent on VPS4. v1.1 **bundles a synthetic, baseline-only test fixture** under `tests/fixtures/`, making its tests independent of operator and production state.
- v1 installer returned `GATE_HASH_MISMATCH`. Root cause confirmed in v1 source: `dict(line.split("  ", 1) ...)` mapped SHA256 → filename, but the code looked up `gate.py` as a key, so the check always failed. v1.1 parses filename → SHA256 correctly, then independently pins the original Gate v1 hash and supplies read-only `--diagnose`. The installer still blocks `--apply` when installed code does not match the original pinned Gate v1 hash.
- Run `--diagnose` first. If `GATE_INTEGRITY_BLOCKED` persists after this parser fix, **do not** copy a replacement `gate.py` or edit `CHECKSUMS.sha256` just to pass. Preserve VPS4 code and ledger; compare hashes and authorized release history first.
- No state data or tokens are embedded. The bundled fixture is an isolated 81-task seed (one BASELINE_IMPORTED event, no claims). Only fixture files and the installer/README/test harness changed; the inspector and SOP addendum bytes are unchanged from v1.

## Gate v1 hash invariant

The canonical Gate v1 `gate.py` SHA256 is `6af7cef012b6aac0e1f95ff625d52682fbff56ee485b50c5062c47f9b7a5300e`. v1 incorrectly built its dictionary in the form `{sha: filename}` then called `.get('gate.py')`, always producing `None`. v1.1 correctly constructs `{filename: sha}`. It also insists that both the manifest and installed `gate.py` equal the known Gate v1 SHA256, instead of trusting a potentially altered manifest alone. If they differ, installation **must stop**; the observed v1 error by itself does not prove code tampering.

Uninstalling this addendum is restricted to `--rollback-sop` with the specific verified backup. It intentionally keeps the inspector available for read-only audits.
