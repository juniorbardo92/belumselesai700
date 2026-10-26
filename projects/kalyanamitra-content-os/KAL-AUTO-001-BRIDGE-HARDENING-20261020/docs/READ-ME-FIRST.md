# KAL-AUTO-001 Bridge Hardening 2026-10-20

## Status
Candidate receiver extension built offline. Does **not** make Telegram-to-Repliz publishing operational. No live VPS access. Does not amend prior KAL-AUTO-001 ZIP.

**Latest owner evidence:** VPS2 publisher hash `012195...8708e6`, canonical fingerprint `319db0...d930`, queue columns match, publisher gates ON, historical timer inactive/disabled. VPS4 Telegram globally and Kalyanamitra are both DM allowlist with count 1 and route to kalyanamitra. But sender IDs have not been compared and runtime metadata not verified. VPS2 `kalauto-intake` missing.

## What's new
- `receiver_vps2.py` only accepts HMAC signed envelope on stdin and inserts into an isolated intent ledger; **does not publish**. Maximum 64 KiB, no remote commands allowed, private receiver configuration.
- `verify_owner_binding_vps4.py` checks that account and global allowlists consist of one matching exact numeric sender ID, that the DM policies are `allowlist`, and that the agent route is exact. Reports booleans only, no user IDs or tokens. It does not prove OpenClaw runtime sender metadata was passed to the signing service.
- `stage_receiver_vps2.sh` guarded staging, creates a dedicated `kalauto-intake` account and installs root-owned code, **without** SSH authorized_keys, secret, config, service, timer or any Repliz write. Idempotent fail-closed if files/account already exist.
- `tests/test_receiver.py`: unit tests for ingest, replay, tampering, unsafe config, oversized payload, remote-command block, owner allowlist consistency.

## Steps — do these now, in sequence

### 1. VPS4: owner binding read-only
Unzip the package and run:

```bash
cd ~/KAL-AUTO-001-BRIDGE-HARDENING
python3 -B src/verify_owner_binding_vps4.py
```

Target `CONFIG_BINDING_PASS` with `sender_allowlists_match:true`. **The field `runtime_sender_metadata_verified:false` remains false on purpose** until a trusted channel-origin hook is proven; it is not a pass/fail of the static configuration.

### 2. VPS2: inspect and stage receiver (local only)
Upload/unzip the ZIP to a private staging directory. First:

```bash
cd ~/KAL-AUTO-001-BRIDGE-HARDENING
python3 -B -m unittest discover -s tests -v
```

Only if the hash and host baselines remain correct:

```bash
sudo bash ./stage_receiver_vps2.sh
```

Target: `RECEIVER_STAGED_NO_KEYS`, `AUTHORIZED_KEYS=ABSENT`, `REPLIZ_POST=0`. Do not add SSH public key or set `KAL_AUTO_WRITE_ENABLED=true` yet.

### 3. Next integration gate (not implemented here)
1. Independent trusted verification of Telegram sender metadata at Gateway ingress. A numeric allowlist on its own is **not** provenance for JSON created by the LLM. `KAL_AUTO_VERIFIED_TELEGRAM_PEER=true` must **not** be enabled based solely on these checks.
2. Separate locked-down VPS4 signer service, kept outside the OpenClaw agent's shell-readable credentials. Do not put HMAC secret or VPS2 SSH private key under the shared `ubuntu` home used by all agents.
3. SSH known_hosts pin and `authorized_keys` forced command restricted to verified VPS4 egress, with `restrict,command="/usr/bin/python3 -I /opt/kal-auto-001/receiver_vps2.py"` on the **single designated public key**. Disable TCP, agent, X11 and PTY forwarding; no general shell.
4. Before production dispatcher creation, implement an independent source QA receipt, immutable review audit, and worker impersonation prevention. Present `source_verified:true` and `review.status=APPROVED` in JSON are currently self-asserted by the adapter and are not sufficient independently to authorize a provider POST.
5. Validate publisher draft format with real validator on a **clone**, queue fields and baseline fingerprint, rollback and B3e 27-case UAT. Then reconcile schedule IDs using the existing `repliz_ro` GET tools. Any ambiguous result remains `SUBMISSION_UNCERTAIN` without automatic repeat.
6. Only after these gates: enable dedicated worker for new owner intents, direct Telegram receipt/status notifier, series scheduling, 1–5 segments, real publish-now and Instagram independently.

## Rollback of staging
Because no key, service or secret is installed, staging cannot accept SSH requests. To undo **only if no future config/keys/data have been added**:

```bash
sudo test ! -e /var/lib/kal-auto-intake/.ssh/authorized_keys && \
sudo test ! -e /etc/kal-auto-001/receiver.env && \
sudo userdel -r kalauto-intake
sudo rm -rf /opt/kal-auto-001 /etc/kal-auto-001
```

Do not run rollback if subsequent setup created accepted requests or keys. Inspect the directories and reconcile first. No production database restoration is needed for staging-only activity.

## Safety and scope
No publisher/`.env`/Gateway/global tools modification. No timer activation. No deployment or production UAT actually performed by ChatGPT; the scripts are operator-run. No historical repost. All action claims require terminal receipts.
