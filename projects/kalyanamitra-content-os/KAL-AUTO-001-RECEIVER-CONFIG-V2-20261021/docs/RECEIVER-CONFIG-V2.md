# KAL-AUTO-001 — receiver staging config V2 (2026-10-21)

**Scope:** patch ONE receiver source on **VPS2**, not Telegram, SSH keys, HMAC secret, publisher, DB production, timer, or Gateway.

## Evidence baseline
- VPS2 to VPS4 probe: `SSH_FORCED_RECEIVER_REACHED`, `RECEIVER_RESPONSE=BLOCKED_EXPECTED`, `REPLIZ_POST=0`, receiver remote exit=3 (intentional), wrapper exits 0.
- Owner Telegram metadata was observed by a read-only hook; NOT a cryptographic origin binding.
- Current receiver `/opt/kal-auto-001/receiver_vps2.py` is a root-owned staging source. The old code looked for `/etc/kal-auto-001/receiver.env` but `/etc/kal-auto-001` is installed with mode 0700 root. Unprivileged `kalauto-intake` cannot traverse it.

## Changed
- `src/receiver_vps2.py`: config path is `/var/lib/kal-auto-intake/receiver.env` owned by `kalauto-intake` mode 0600, protects against symlink, wrong owner/permissions, partial/duplicate config, oversize config and nonabsolute key/data paths. Fails closed while config is absent; no dispatch capability.
- `stage_receiver_config_fix_vps2.sh`: guarded one-file replacement on VPS2 only; preserves a root-owned backup at `/opt/kal-auto-001/receiver_vps2.py.backup-pre-config-v2`; refuses if config is already present or source no longer matches original staging release; locks the intake home mode 0700.
- `tests/test_receiver_config_v2.py`: additional negative coverage (11 tests).

## Operator steps (VPS2 only)

```
mkdir -p ~/kal-auto-config-v2-stage
python3 -m zipfile -e ~/KAL-AUTO-001-RECEIVER-CONFIG-V2-20261021.zip ~/kal-auto-config-v2-stage
cd ~/kal-auto-config-v2-stage/kalauto_bridge_hardening
python3 -B -m unittest discover -s tests -v
sudo bash stage_receiver_config_fix_vps2.sh
```

Successful receipt:
```
RECEIVER_CONFIG_V2_STAGED
CONFIG_PATH=/var/lib/kal-auto-intake/receiver.env
CONFIG=ABSENT
HMAC=ABSENT
PUBLISH_WORKER=ABSENT
REPLIZ_POST=0
LEGACY_TIMER=UNCHANGED
```

Retest existing VPS4 SSH probe with same pinned host and saved `VPS2_IP`:
```
cd ~/kal-auto-ssh-stage/KAL-AUTO-001-SSH-HANDSHAKE
bash scripts/probe_vps4_ssh.sh "$VPS2_IP"
```
Expected: `SSH_FORCED_RECEIVER_REACHED`, `RECEIVER_RESPONSE=BLOCKED_EXPECTED`, `SSH_EXIT_STATUS=3`; wrapper exit status=0. If variable was lost in new shell, specify the same previously verified numeric IPv4.

## Rollback (VPS2, only if no receiver config/accepted jobs exist)
```
sudo test ! -e /var/lib/kal-auto-intake/receiver.env || { echo 'STOP: CONFIG_EXISTS'; exit 3; }
sudo test ! -e /etc/kal-auto-001/receiver.env || { echo 'STOP: LEGACY_CONFIG_EXISTS'; exit 3; }
sudo cp -a /opt/kal-auto-001/receiver_vps2.py.backup-pre-config-v2 /opt/kal-auto-001/receiver_vps2.py
```

## Outstanding gates
**DO NOT PROVISION HMAC / ACTIVATE PUBLISHING YET.** A verified incoming Telegram update needs to be bound to signer evidence unavailable to other agents sharing the VPS4 OS user. Owner-approved command and independent Dharma-source QA must be recorded without self-asserted model booleans, then safe ingest tested on a new draft. Worker Repliz, media ingestion, notification and recurring scheduling are still absent. Existing publisher hash and fingerprint must remain pinned.
