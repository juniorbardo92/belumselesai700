#!/usr/bin/env bash
# Stage sender skill. No Gateway restart; no API post.
set -euo pipefail
[[ $(id -u) != 0 && $(hostname -s) == VM-4-5-ubuntu ]] || { echo BLOCKED_WRONG_USER_OR_HOST;exit 3; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
root="$HOME/.openclaw/workspace-kalyanamitra"
[[ -d "$root" ]] || { echo BLOCKED_KAL_WORKSPACE_MISSING;exit 3; }
[[ -r "$HOME/.local/share/kalauto-ssh-stage/known_hosts" && -r "$HOME/.local/share/kalauto-ssh-stage/id_ed25519" ]] || { echo BLOCKED_SSH_PIN_NOT_PRESENT;exit 3; }
[[ ! -e "$root/tools/kalauto_schedule_v3.py" && ! -e "$root/tools/kalauto_v3_core.py" ]] || { echo BLOCKED_EXISTING_TOOL;exit 3; }
install -d -m 0700 "$root/tools"
install -m 0644 "$base/src/sender_vps4.py" "$root/tools/kalauto_schedule_v3.py"
install -m 0644 "$base/src/kalauto.py" "$root/tools/kalauto_v3_core.py"
# The sender imports kalauto from its own directory, installed as a private module alias.
python3 - "$root/tools/kalauto_schedule_v3.py" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s=s.replace('import kalauto\n','import kalauto_v3_core as kalauto\n');p.write_text(s)
PY
install -d -m 0755 "$root/skills/kalauto-repliz-schedule"
install -m 0644 "$base/skill/SKILL.md" "$root/skills/kalauto-repliz-schedule/SKILL.md"
echo 'KAL_AUTO_V3_VPS4_TOOL_STAGED'
echo 'SIGNER_NOT_BOOTSTRAPPED'
echo 'NO_GATEWAY_RESTART'
echo 'REPLIZ_POST=0'
