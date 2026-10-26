#!/usr/bin/env python3
"""Restricted SSH intake for KAL-AUTO-001. Ingest only; no publish/dispatch.

Deploy alongside trusted, root-owned kalauto.py. SSH authorized_keys must pin
this file as a forced command with restrict/no forwarding. All requests are HMAC
verified in kalauto.ingest and can only create draft/ready records.
"""
import json
import os
import sys
from pathlib import Path

# Python -I deliberately does not trust PYTHONPATH or cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import kalauto

MAX_BYTES = 65536
ALLOWED_ENV = {'KAL_AUTO_OWNER_ID', 'KAL_AUTO_HMAC_FILE', 'KAL_AUTO_DATA_DIR'}
CONFIG_PATH = Path('/etc/kal-auto-001/receiver.env')


def load_private_config():
    """Load key=value secrets from a file supplied by deployment, not SSH client."""
    path = CONFIG_PATH
    st = path.stat()
    if st.st_mode & 0o027:
        raise kalauto.Blocked('UNSAFE_CONFIG_PERMISSIONS')
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise kalauto.Blocked('INVALID_CONFIG_LINE')
        key, value = line.split('=', 1)
        if key not in ALLOWED_ENV or not value.strip():
            raise kalauto.Blocked('INVALID_CONFIG_NAME')
        os.environ[key] = value.strip()
    if set(ALLOWED_ENV) - set(os.environ):
        raise kalauto.Blocked('MISSING_RECEIVER_CONFIG')
    if not os.environ['KAL_AUTO_OWNER_ID'].isdecimal():
        raise kalauto.Blocked('OWNER_ID_MUST_BE_NUMERIC')


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
    # Do not return the signed envelope or any user material to the caller.
    return {k: result[k] for k in ('status', 'job_id', 'state', 'slot_utc') if k in result}


def main():
    try:
        result = receive()
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        reason = exc.code if isinstance(exc, kalauto.Blocked) else 'INTERNAL_RECEIVER_ERROR'
        print(json.dumps({'status': 'BLOCKED', 'reason': reason}))
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
