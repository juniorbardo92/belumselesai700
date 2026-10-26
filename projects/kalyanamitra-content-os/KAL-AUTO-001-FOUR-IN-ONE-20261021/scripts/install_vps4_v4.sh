#!/usr/bin/env bash
# Install notifier provisioning helper only. No Gateway restart; no global tool changes.
set -euo pipefail
[[ $(hostname -s) == 'VM-4-5-ubuntu' && $(id -u) != 0 ]] || { echo BLOCKED_WRONG_HOST_OR_UID;exit 3; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tools="$HOME/.openclaw/workspace-kalyanamitra/tools"
[[ -r "$tools/kalauto_schedule_v3.py" && -r "$tools/kalauto_v3_core.py" ]] || { echo BLOCKED_SENDER_V3_MISSING;exit 3; }
[[ -f "$HOME/.local/share/kalauto-ssh-stage/schedule.json" ]] || { echo BLOCKED_SIGNED_BRIDGE_NOT_BOOTSTRAPPED;exit 3; }
[[ ! -e "$tools/kalauto_notify_provision_v4.py" ]] || { echo BLOCKED_V4_TOOL_ALREADY_PRESENT;exit 3; }
install -m 0700 "$base/src/provision_notify_vps4.py" "$tools/kalauto_notify_provision_v4.py"
echo 'KAL_AUTO_V4_VPS4_PROVISION_TOOL_STAGED'
echo 'OPENCLAW_GATEWAY=UNCHANGED'
echo 'TELEGRAM_BOT_TOKEN=NOT_PRINTED'
echo 'REPLIZ_POST=0'
