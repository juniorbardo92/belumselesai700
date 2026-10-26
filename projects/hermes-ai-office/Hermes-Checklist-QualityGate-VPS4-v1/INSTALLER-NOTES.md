# Installer safety notes

- VPS4 `VM-4-5-ubuntu`, account `ubuntu`, Python 3.10+ ONLY.
- `--preflight` does not write; `--apply` fails closed when a unit/state/install exists.
- Adds only `~/.local/share/hermes-quality-gate-v1`, `~/.local/state/hermes-quality-gate` and **new** user systemd units `hermes-checklist-gate.path` and `.service`.
- Does not edit existing Hermes, OpenClaw, Guardian, VPS2, Cloudflare, Telegram, Repliz, database or credential files. No network calls.
- `systemd.path` triggers one-shot verifier on new atomically renamed `.json` receipts. If user systemd unavailable, installer leaves staged state and reports `INSTALLED_NOT_ACTIVATED`.
- `--rollback` disables only gate.path, conditionally removes only byte-identical new units; preserves source and ledger for forensic retention.
- Never submit secrets or private client content in receipt JSON. The event chain is an audit aid, not a tamper-proof external ledger.
- **Not an interception mechanism:** agents must invoke gate claim before dispatch and submit receipts on completion; integration into Hermes executor is not automatic. Direct commands outside gate remain possible. Owner approval is a human step and cannot be cryptographically guaranteed without a separate OS principal.
