#!/usr/bin/env bash
# Deploy NEW monitor and upgrade forced-command receiver, preservative patch only.
set -euo pipefail
[[ $(id -u) == 0 && $(hostname -s) == 'VM-0-10-ubuntu' ]] || { echo BLOCKED_WRONG_HOST_OR_UID;exit 3; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dest=/opt/kal-auto-001
expected_v3=5d16f40caf8bc744c48d2077d6d5893bb2d43447bdf2a5c7a5833b3d2927b845
current=$(sha256sum "$dest/receiver_vps2.py" | cut -d' ' -f1)
new=$(sha256sum "$base/src/receiver_vps2_v4.py" | cut -d' ' -f1)
[[ "$current" == "$expected_v3" || "$current" == "$new" ]] || { echo BLOCKED_RECEIVER_HASH_CHANGED_REVIEW_DIFF;exit 3; }
[[ -f "$dest/kalauto.py" && -f "$dest/worker_vps2.py" ]] || { echo BLOCKED_V3_NOT_INSTALLED;exit 3; }
[[ -f /var/lib/kal-auto-intake/receiver.env && -f /var/lib/kal-auto-intake/hmac.key ]] || { echo BLOCKED_SIGNED_BRIDGE_NOT_BOOTSTRAPPED;exit 3; }
[[ ! -e /etc/systemd/system/kalauto-publication-monitor.service && ! -e /etc/systemd/system/kalauto-publication-monitor.timer ]] || { echo BLOCKED_MONITOR_ALREADY_INSTALLED;exit 3; }
[[ ! -e "$dest/receiver_vps2.py.bak-pre-proof-v4" ]] || { echo BLOCKED_BACKUP_EXISTS;exit 3; }
python3 -B -m py_compile "$base/src/receiver_vps2_v4.py" "$base/src/publication_monitor.py"
install -m 0600 -o root -g root "$dest/receiver_vps2.py" "$dest/receiver_vps2.py.bak-pre-proof-v4"
install -m 0644 -o root -g root "$base/src/receiver_vps2_v4.py" "$dest/receiver_vps2.py"
install -m 0644 -o root -g root "$base/src/publication_monitor.py" "$dest/publication_monitor.py"
install -m 0644 -o root -g root "$base/systemd/kalauto-publication-monitor.service" /etc/systemd/system/
install -m 0644 -o root -g root "$base/systemd/kalauto-publication-monitor.timer" /etc/systemd/system/
systemctl daemon-reload
echo 'KAL_AUTO_V4_STAGED'
echo 'NOTIFY_TOKEN=NOT_CHANGED'
echo 'NEW_MONITOR_TIMER=DISABLED'
echo 'OLD_PUBLISHER=UNCHANGED'
echo 'OLD_WORKER=UNCHANGED'
echo 'REPLIZ_POST=0'
