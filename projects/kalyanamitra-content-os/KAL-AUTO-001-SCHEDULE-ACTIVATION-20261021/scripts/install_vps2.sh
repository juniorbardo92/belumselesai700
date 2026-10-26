#!/usr/bin/env bash
# Stage V3 receiver and worker on VPS2, no activation until operator enables timer.
set -euo pipefail
[[ $(id -u) == 0 && $(hostname -s) == VM-0-10-ubuntu ]] || { echo BLOCKED_WRONG_USER_OR_HOST; exit 3; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dest=/opt/kal-auto-001
[[ $(sha256sum "$dest/receiver_vps2.py"|cut -d' ' -f1) == 4eb9573ef28704c05cb3cd43ebfb6b3f11fcb7c69999fd07415aaabb29fb2eca ]] || { echo BLOCKED_RECEIVER_V2_HASH_CHANGED;exit 3; }
[[ $(sha256sum "$dest/kalauto.py"|cut -d' ' -f1) == 5d26afff8cc68eadd47611722a41cc0b4531f0804757dd7efc4100a6c7b88393 ]] || { echo BLOCKED_ADAPTER_V2_HASH_CHANGED;exit 3; }
[[ ! -e /etc/systemd/system/kalauto-schedule-worker.service && ! -e /etc/systemd/system/kalauto-schedule-worker.timer ]] || { echo BLOCKED_WORKER_ALREADY_EXISTS;exit 3; }
# Never overwrite a live receiver with secret or accepted jobs.
[[ ! -e /var/lib/kal-auto-intake/receiver.env ]] || { echo BLOCKED_ACTIVE_RECEIVER;exit 3; }
[[ $(sha256sum /opt/kalyanamitra/scripts/jalurb/publisher_kalyanamitra.py|cut -d' ' -f1) == 0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6 ]] || { echo BLOCKED_PUBLISHER_HASH_CHANGED;exit 3; }
[[ $(sha256sum /opt/kalyanamitra/provisioning/fingerprint_kalyanamitra.py|cut -d' ' -f1) == 319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930 ]] || { echo BLOCKED_FINGERPRINT_HASH_CHANGED;exit 3; }
[[ ! -e "$dest/kalauto.py.bak-pre-write" && ! -e "$dest/receiver_vps2.py.bak-pre-write" ]] || { echo BLOCKED_BACKUP_EXISTS;exit 3; }
python3 -c 'import requests' || { echo BLOCKED_REQUESTS_MISSING_FOR_ROOT;exit 3; }
for f in kalauto.py receiver_vps2.py worker_vps2.py; do python3 -m py_compile "$base/src/$f"; done
cp -a "$dest/kalauto.py" "$dest/kalauto.py.bak-pre-write"
cp -a "$dest/receiver_vps2.py" "$dest/receiver_vps2.py.bak-pre-write"
install -o root -g root -m 0644 "$base/src/kalauto.py" "$dest/kalauto.py"
install -o root -g root -m 0644 "$base/src/receiver_vps2.py" "$dest/receiver_vps2.py"
install -o root -g root -m 0644 "$base/src/worker_vps2.py" "$dest/worker_vps2.py"
install -o root -g root -m 0644 "$base/systemd/kalauto-schedule-worker.service" /etc/systemd/system/kalauto-schedule-worker.service
install -o root -g root -m 0644 "$base/systemd/kalauto-schedule-worker.timer" /etc/systemd/system/kalauto-schedule-worker.timer
systemctl daemon-reload
printf '%s\n' 'KAL_AUTO_V3_VPS2_STAGED' 'FORCED_RECEIVER=V3' 'WORKER_INSTALLED=YES' 'WORKER_TIMER=DISABLED' 'REPLIZ_POST=0'
