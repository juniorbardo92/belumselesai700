#!/usr/bin/env python3
"""Install/verify/rollback ONLY copied VPS2 Kalyanamitra Jalur B UAT sandbox.
No production paths, no service config, no API credentials, no network.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path

STAGE = Path('/tmp/kalyanamitra-uat.NMAtlK')
SRC = Path(__file__).resolve().parent
BACKUPS = STAGE / '.b3e-dev-backups'
EXPECTED_CANON = '319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930'
EXPECTED_FIXTURE = '9f2bf637a662c41bbce00c9552bb2725d650080fd12935a989a3407d1396461d'
FILES = {
    'publisher_kalyanamitra.py': (
        '7893b28d413151d135e3a801f120560c93ff839e4530bac91fb7d6170bc48937',
        '0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6'),
    'uat_publisher_sandbox.py': (
        '924b15016cade1e598a87fa9771ff6532bf7b9720374fcaddc16ee32472bf41d',
        '76b31281146e992c63e964a6fa825e1482d7a8eb04ed215aa889ea0e4d9b04a9'),
    'fake_repliz_api.py': (
        '31d7d987f3542f66cd97dca20b0e44eae28d86e29bc6c35f94ff5b2b33cf6846',
        'b577795bcb7281535335db934fedff56d2458a631d8ff841438aab69978b9f99'),
}


def digest(b: bytes):
    return hashlib.sha256(b).hexdigest()


def regular(p: Path, owned=True):
    if p.is_symlink() or not p.is_file() or not stat.S_ISREG(p.stat().st_mode):
        raise RuntimeError('BLOCKED_MISSING_OR_SYMLINK:' + p.name)
    if owned and p.stat().st_uid != os.geteuid():
        raise RuntimeError('BLOCKED_OWNER:' + p.name)
    return p.read_bytes()


def atomic_replace(dest: Path, payload: bytes, mode: int):
    fd, tmp = tempfile.mkstemp(prefix='.b3e-', suffix='.tmp', dir=dest.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, stat.S_IMODE(mode))
        os.replace(tmp, dest)
    finally:
        if os.path.lexists(tmp):
            os.unlink(tmp)


def preflight():
    if os.uname().nodename != 'VM-0-10-ubuntu':
        raise RuntimeError('BLOCKED_WRONG_VPS')
    if STAGE.is_symlink() or not STAGE.is_dir() or STAGE.stat().st_uid != os.geteuid():
        raise RuntimeError('BLOCKED_STAGE_INVALID')
    for rel, expect in [
        ('provisioning/fingerprint_kalyanamitra.py', EXPECTED_CANON),
        ('fixtures/jadwal-nyata-3.json', EXPECTED_FIXTURE),
    ]:
        if digest(regular(STAGE / rel)) != expect:
            raise RuntimeError('BLOCKED_PROTECTED_SHA:' + rel)
    checks = {}
    for name, (before, after) in FILES.items():
        source = regular(SRC / name, owned=False)
        if digest(source) != after:
            raise RuntimeError('BLOCKED_PACKAGE_SHA:' + name)
        raw = regular(STAGE / name)
        current = digest(raw)
        if current not in (before, after):
            raise RuntimeError('BLOCKED_TARGET_SHA:' + name)
        checks[name] = 'ORIGINAL' if current == before else 'PATCHED'
    print(json.dumps({'status':'PREFLIGHT_PASS','stage':str(STAGE),'files':checks,
                      'canon_unchanged':True,'fixture_unchanged':True}))
    return checks


def backup_name(name: str):
    return BACKUPS / (name + '.' + FILES[name][0][:16] + '.bak')


def backup_everything():
    if BACKUPS.is_symlink():
        raise RuntimeError('BLOCKED_BACKUP_DIR_SYMLINK')
    BACKUPS.mkdir(mode=0o700, exist_ok=True)
    for name, (before, _) in FILES.items():
        dest = backup_name(name)
        if dest.exists() or dest.is_symlink():
            if digest(regular(dest)) != before:
                raise RuntimeError('BLOCKED_BACKUP_CONFLICT:' + name)
            continue
        orig = regular(STAGE / name)
        if digest(orig) != before:
            raise RuntimeError('BLOCKED_ORIGINAL_REQUIRED_FOR_FIRST_BACKUP:' + name)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        fd = os.open(dest, flags, 0o600)
        with os.fdopen(fd,'wb') as f:
            f.write(orig)
            f.flush()
            os.fsync(f.fileno())
        if digest(regular(dest)) != before:
            raise RuntimeError('BLOCKED_BACKUP_SHA:' + name)


def apply(checks):
    if all(x == 'PATCHED' for x in checks.values()):
        verify()
        print('ALREADY_APPLIED_NO_CHANGES')
        return
    if any(x != 'ORIGINAL' for x in checks.values()):
        raise RuntimeError('BLOCKED_MIXED_PATCH_STATE_RUN_ROLLBACK_FIRST')
    backup_everything()
    for name, (before, after) in FILES.items():
        dest = STAGE / name
        raw = regular(dest)
        if digest(raw) != before:
            raise RuntimeError('BLOCKED_CONCURRENT_CHANGE:' + name)
        atomic_replace(dest, regular(SRC / name, owned=False), dest.stat().st_mode)
        if digest(regular(dest)) != after:
            raise RuntimeError('BLOCKED_APPLY_SHA:' + name)
    verify()
    print('SANDBOX_PATCH_APPLIED')


def verify():
    for name, (_, after) in FILES.items():
        if digest(regular(STAGE / name)) != after:
            raise RuntimeError('BLOCKED_VERIFY_SHA:' + name)
        if digest(regular(backup_name(name))) != FILES[name][0]:
            raise RuntimeError('BLOCKED_BACKUP_SHA:' + name)
    for name, h in [
        ('provisioning/fingerprint_kalyanamitra.py',EXPECTED_CANON),
        ('fixtures/jadwal-nyata-3.json',EXPECTED_FIXTURE),
    ]:
        if digest(regular(STAGE / name)) != h:
            raise RuntimeError('BLOCKED_PROTECTED_SHA:' + name)
    print('SANDBOX_PATCH_VERIFY_PASS')


def rollback():
    for name, (before, after) in FILES.items():
        if digest(regular(backup_name(name))) != before:
            raise RuntimeError('BLOCKED_BACKUP_INVALID:' + name)
        if digest(regular(STAGE/name)) not in (before, after):
            raise RuntimeError('BLOCKED_CHANGED_TARGET:' + name)
    for name, (before, _) in FILES.items():
        dest = STAGE / name
        if digest(regular(dest)) != before:
            atomic_replace(dest, regular(backup_name(name)), dest.stat().st_mode)
        if digest(regular(dest)) != before:
            raise RuntimeError('BLOCKED_ROLLBACK_SHA:' + name)
    print('SANDBOX_ROLLBACK_VERIFIED')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['preflight','apply','verify','rollback'])
    args=parser.parse_args()
    if args.action in ('preflight','apply'):
        checks=preflight()
        if args.action=='apply':apply(checks)
    elif args.action=='verify':
        preflight();verify()
    else:
        if os.uname().nodename != 'VM-0-10-ubuntu':
            raise RuntimeError('BLOCKED_WRONG_VPS')
        rollback()

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('PATCH_GATE_BLOCKED:'+str(exc))
        raise SystemExit(2)
