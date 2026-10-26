#!/usr/bin/env python3
"""KAL-AUTO-001 forced-command SSH receiver, intake only.

This receiver never invokes dispatch/POST. Configuration (when eventually
provisioned) is owned by the dedicated kalauto-intake UID, stored in its private
home, never in root-only /etc. Without config, receipt MUST remain BLOCKED.
"""
import json
import os
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kalauto

MAX_BYTES = 65536
ALLOWED_ENV = {'KAL_AUTO_OWNER_ID', 'KAL_AUTO_HMAC_FILE', 'KAL_AUTO_DATA_DIR'}
CONFIG_PATH = Path('/var/lib/kal-auto-intake/receiver.env')


def load_private_config():
    """Read trusted private configuration; never accept fields from SSH client."""
    path = CONFIG_PATH
    try:
        if path.is_symlink():
            raise kalauto.Blocked('CONFIG_SYMLINK_FORBIDDEN')
        st = path.stat()
    except (FileNotFoundError, PermissionError):
        raise kalauto.Blocked('RECEIVER_CONFIG_NOT_PROVISIONED')
    if not stat.S_ISREG(st.st_mode):
        raise kalauto.Blocked('CONFIG_NOT_REGULAR_FILE')
    if stat.S_IMODE(st.st_mode) != 0o600:
        raise kalauto.Blocked('UNSAFE_CONFIG_PERMISSIONS')
    if st.st_uid != os.geteuid():
        raise kalauto.Blocked('CONFIG_OWNER_MISMATCH')
    try:
        # Limit input size; config is only three key-value pairs.
        if st.st_size > 4096:
            raise kalauto.Blocked('CONFIG_TOO_LARGE')
        lines = path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeError):
        raise kalauto.Blocked('CONFIG_READ_FAILED')
    cfg = {}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise kalauto.Blocked('INVALID_CONFIG_LINE')
        key, value = line.split('=', 1)
        if key not in ALLOWED_ENV or not value.strip() or key in cfg:
            raise kalauto.Blocked('INVALID_CONFIG_NAME')
        cfg[key] = value.strip()
    if set(cfg) != ALLOWED_ENV:
        raise kalauto.Blocked('MISSING_RECEIVER_CONFIG')
    if not cfg['KAL_AUTO_OWNER_ID'].isdecimal() or not (2 <= len(cfg['KAL_AUTO_OWNER_ID']) <= 20):
        raise kalauto.Blocked('OWNER_ID_MUST_BE_NUMERIC')
    for name in ('KAL_AUTO_HMAC_FILE', 'KAL_AUTO_DATA_DIR'):
        if not Path(cfg[name]).is_absolute():
            raise kalauto.Blocked('INVALID_CONFIG_PATH')
    # This overwrites any inherited values, rather than trusting the caller env.
    os.environ.update(cfg)


def receive(stream=None):
    if os.environ.get('SSH_ORIGINAL_COMMAND'):
        raise kalauto.Blocked('REMOTE_COMMAND_FORBIDDEN')
    load_private_config()
    stream = stream or sys.stdin.buffer
    raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise kalauto.Blocked('PAYLOAD_TOO_LARGE')
    if not raw:
        raise kalauto.Blocked('EMPTY_REQUEST')
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError):
        raise kalauto.Blocked('INVALID_JSON')
    result = kalauto.ingest(data)
    return {k: result[k] for k in ('status', 'job_id', 'state', 'slot_utc') if k in result}


def main():
    try:
        result = receive()
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        code = exc.code if isinstance(exc, kalauto.Blocked) else 'INTERNAL_RECEIVER_ERROR'
        print(json.dumps({'status': 'BLOCKED', 'reason': code}))
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
