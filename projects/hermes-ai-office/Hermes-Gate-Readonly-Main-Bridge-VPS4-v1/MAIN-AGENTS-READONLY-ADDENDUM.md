<!-- HERMES_MAIN_GATE_READONLY_BRIDGE_V1_BEGIN -->
### Canonical checklist read-only interface (VPS4)

Main runs under user `hermes-ai`. The canonical 81-task ledger remains private to `ubuntu`.
For **read-only** task IDs/status/dependency decisions, Main MUST call the allowed terminal tool with:

`/usr/local/bin/hermes-checklist-read --id B03 --id K05 --id K06`

Replace these IDs with the requested checklist IDs. The output source must be
`VPS4_ROOT_PROTECTED_READONLY_SNAPSHOT`, `namespace` must be `CHECKLIST_INDUK_81`,
`chain_valid` must be true, and snapshot age at most 120 seconds.
This replaces earlier Main-facing examples that run
`python3 ~/.local/share/hermes-quality-gate-v1/inspect_checklist_id.py`.
That **private path** belongs to `ubuntu`, not Main's `~`.
Never search KPI/provisioning documents to reinterpret checklist task IDs.

If CLI missing, tool denied, snapshot stale, or integrity fails, report
`GATE_READONLY_UNAVAILABLE` and do not dispatch a dependent task.
Do not use `sudo`, change file permissions, copy the ledger, or treat this
read-only interface as permission to `claim`, `approve`, write receipts or POST.
A successful status lookup does **not** establish full dispatch enforcement.
<!-- HERMES_MAIN_GATE_READONLY_BRIDGE_V1_END -->
