#!/usr/bin/env bash
# Applies V2 receiver code only; cannot activate ingestion or Repliz.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'BLOCKED: ROOT_REQUIRED'; exit 3; }
[[ $(hostname -s) == 'VM-0-10-ubuntu' ]] || { echo 'BLOCKED: NOT_VPS2'; exit 3; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
old=/opt/kal-auto-001/receiver_vps2.py
new="$base/src/receiver_vps2.py"
[[ -f "$old" && -f "$new" ]] || { echo 'BLOCKED: CODE_MISSING'; exit 3; }
id kalauto-intake >/dev/null || { echo 'BLOCKED: RECEIVER_ACCOUNT_MISSING'; exit 3; }
[[ ! -L "$old" && ! -L "$new" ]] || { echo 'BLOCKED: CODE_SYMLINK'; exit 3; }
[[ ! -e /var/lib/kal-auto-intake/receiver.env && ! -e /etc/kal-auto-001/receiver.env ]] || { echo 'BLOCKED: ACTIVE_CONFIG_REQUIRES_MIGRATION_PLAN'; exit 3; }
[[ -f /var/lib/kal-auto-intake/.ssh/authorized_keys ]] || { echo 'BLOCKED: NO_SSH_FORCED_KEY'; exit 3; }
# This installer is specifically for unconfigured staging; harden dir before secrets.
oldhash=$(sha256sum "$old" | awk '{print $1}')
expected=''
# source is intentionally exact: no accidental overwrite if an intervening deployment changed code
expected=$(python3 - "$base" <<'PY'
import hashlib,sys
from pathlib import Path
p=Path(sys.argv[1])/'src/receiver_vps2_original.py'
print(hashlib.sha256(p.read_bytes()).hexdigest())
PY
)
[[ "$oldhash" == "$expected" ]] || { echo 'BLOCKED: RECEIVER_MODIFIED_REVIEW_DIFF'; exit 3; }
python3 -B - "$new" <<'PY'
import ast,sys
ast.parse(open(sys.argv[1],encoding='utf-8').read())
PY
backup=/opt/kal-auto-001/receiver_vps2.py.backup-pre-config-v2
[[ ! -e "$backup" ]] || { echo 'BLOCKED: BACKUP_ALREADY_EXISTS'; exit 3; }
install -o root -g root -m 0644 "$old" "$backup"
temp=$(mktemp /opt/kal-auto-001/.receiver-v2.XXXXXX)
trap 'rm -f "$temp"' EXIT
install -o root -g root -m 0644 "$new" "$temp"
mv -f "$temp" "$old"
# Before adding secrets, make the intake home non-traversable to other service users.
chown kalauto-intake:kalauto-intake /var/lib/kal-auto-intake
chmod 0700 /var/lib/kal-auto-intake
printf '%s\n' 'RECEIVER_CONFIG_V2_STAGED' 'CONFIG_PATH=/var/lib/kal-auto-intake/receiver.env' 'CONFIG=ABSENT' 'HMAC=ABSENT' 'PUBLISH_WORKER=ABSENT' 'REPLIZ_POST=0' 'LEGACY_TIMER=UNCHANGED'
