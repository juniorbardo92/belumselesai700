#!/usr/bin/env bash
# Root-only, staged install. No SSH key, no receiver.env, no timer, no Repliz POST.
set -euo pipefail
if [[ $(id -u) -ne 0 ]]; then echo 'BLOCKED: RUN_WITH_SUDO' >&2; exit 3; fi
if [[ $(hostname -s) != VM-0-10-ubuntu ]]; then echo 'BLOCKED: WRONG_HOST' >&2; exit 3; fi
pkg=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
publisher=/opt/kalyanamitra/scripts/jalurb/publisher_kalyanamitra.py
fingerprint=/opt/kalyanamitra/provisioning/fingerprint_kalyanamitra.py
expected_pub=0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6
expected_fp=319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930
if [[ $(sha256sum "$publisher" | cut -d' ' -f1) != "$expected_pub" ]]; then echo 'BLOCKED: PUBLISHER_HASH_CHANGED'; exit 3; fi
if [[ $(sha256sum "$fingerprint" | cut -d' ' -f1) != "$expected_fp" ]]; then echo 'BLOCKED: FINGERPRINT_HASH_CHANGED'; exit 3; fi
if id kalauto-intake >/dev/null 2>&1; then
  echo 'BLOCKED: ACCOUNT_ALREADY_EXISTS_REVIEW_MANUALLY'; exit 3
fi
if [[ -e /opt/kal-auto-001/kalauto.py || -e /opt/kal-auto-001/receiver_vps2.py ]]; then
  echo 'BLOCKED: EXISTING_RECEIVER_FILES_REVIEW_MANUALLY'; exit 3
fi
# A system account with a valid shell is intentionally not able to accept SSH
# until a separately approved, forced-command-only authorized_keys is installed.
useradd --system --user-group --create-home --home-dir /var/lib/kal-auto-intake --shell /bin/sh kalauto-intake
install -d -o root -g root -m 0755 /opt/kal-auto-001
install -o root -g root -m 0644 "$pkg/src/kalauto.py" /opt/kal-auto-001/kalauto.py
install -o root -g root -m 0644 "$pkg/src/receiver_vps2.py" /opt/kal-auto-001/receiver_vps2.py
install -d -o root -g root -m 0700 /etc/kal-auto-001
install -d -o kalauto-intake -g kalauto-intake -m 0700 /var/lib/kal-auto-intake/.ssh
install -d -o kalauto-intake -g kalauto-intake -m 0700 /var/lib/kal-auto-intake/state
# Never install auth keys, secrets, worker or active transport in this staging step.
if [[ -e /var/lib/kal-auto-intake/.ssh/authorized_keys ]]; then echo 'BLOCKED: UNEXPECTED_AUTH_KEYS' >&2; exit 3; fi
printf '%s\n' 'RECEIVER_STAGED_NO_KEYS' 'AUTHORIZED_KEYS=ABSENT' 'SECRET_CONFIG=ABSENT' 'PUBLISH_WORKER=NOT_INSTALLED' 'REPLIZ_POST=0' 'LEGACY_TIMER=UNCHANGED'
