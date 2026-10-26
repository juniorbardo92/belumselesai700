#!/usr/bin/env python3
"""Guarded one-time installer for the Ubuntu->Hermes read-only namespace mirror.

Checks before writing; never changes the Gate ledger, OpenClaw config, Guardian, or VPS2.
Run --preflight as ubuntu and --apply as sudo from account ubuntu on VPS4.
"""
from __future__ import annotations
import argparse
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import stat

SOURCE=Path(__file__).resolve().parent
HOST='VM-4-5-ubuntu'
BASE=Path('/var/lib/hermes-checklist-ro')
LIVE=BASE/'live'
EXPORT=Path('/home/ubuntu/.local/libexec/hermes-gate-ro/export_gate_snapshot.py')
READ=Path('/usr/local/bin/hermes-checklist-read')
UNITS=Path('/home/ubuntu/.config/systemd/user')
UNITS_FILES={
 'hermes-gate-ro-export.service': UNITS/'hermes-gate-ro-export.service',
 'hermes-gate-ro-export.timer': UNITS/'hermes-gate-ro-export.timer',
}
INSTALL_FILES={
 'export_gate_snapshot.py':EXPORT,
 'hermes_checklist_read.py':READ,
 **UNITS_FILES
}
class InstallError(Exception):pass

def digest(b):return hashlib.sha256(b).hexdigest()

def package_check():
    mf=SOURCE/'SHA256SUMS'
    if not mf.is_file() or mf.is_symlink():raise InstallError('NO_MANIFEST')
    lines=mf.read_text().splitlines()
    expected={}
    for line in lines:
        if len(line)<67 or line[64:66] != '  ':
            raise InstallError('MANIFEST_INVALID')
        sig,name=line[:64],line[66:]
        if len(sig)!=64 or any(c not in '0123456789abcdef' for c in sig):raise InstallError('MANIFEST_HASH_INVALID')
        if name in expected:raise InstallError('MANIFEST_DUPLICATE')
        expected[name]=sig
    if set(expected)!=set(INSTALL_FILES):raise InstallError('MANIFEST_FILES_INVALID')
    for name,sig in expected.items():
        p=SOURCE/name
        if p.is_symlink() or not p.is_file() or digest(p.read_bytes())!=sig:
            raise InstallError('SOURCE_HASH_MISMATCH:'+name)

def check_gate():
    state=Path('/home/ubuntu/.local/state/hermes-quality-gate')
    gate=Path('/home/ubuntu/.local/share/hermes-quality-gate-v1')
    for p in (state,gate):
        if p.is_symlink() or not p.is_dir():raise InstallError('GATE_NOT_PRESENT')
    for name in ('ledger.sqlite','policy.json'):
        p=state/name
        if p.is_symlink() or not p.is_file():raise InstallError('GATE_FILE_MISSING:'+name)
    inspector=gate/'inspect_checklist_id.py'
    if inspector.is_symlink() or not inspector.is_file():raise InstallError('NAMESPACE_INSPECTOR_MISSING')

def check_existing():
    for src,target in INSTALL_FILES.items():
        if target.is_symlink():raise InstallError('TARGET_SYMLINK:'+str(target))
        if target.exists() and (not target.is_file() or target.read_bytes()!=(SOURCE/src).read_bytes()):
            raise InstallError('TARGET_DIFFERENT:'+str(target))
    for d in [BASE,LIVE]:
        if d.is_symlink() or (d.exists() and not d.is_dir()):
            raise InstallError('UNSAFE_EXISTING_DIR:'+str(d))
    # Root-owned parent prevents the agent account replacing a status directory.
    if BASE.exists():
        s=BASE.stat()
        if s.st_uid!=0 or (stat.S_IMODE(s.st_mode)&0o022):
            raise InstallError('UNSAFE_PUBLIC_BASE')
    if LIVE.exists():
        s=LIVE.stat(); h=pwd.getpwnam('hermes-ai')
        if s.st_uid!=pwd.getpwnam('ubuntu').pw_uid or s.st_gid!=h.pw_gid or (stat.S_IMODE(s.st_mode)&0o022):
            raise InstallError('UNSAFE_LIVE_DIR')

def preflight(host_check:bool=True):
    package_check()
    if host_check and socket.gethostname()!=HOST:raise InstallError('WRONG_HOST')
    pwd.getpwnam('ubuntu');pwd.getpwnam('hermes-ai')
    check_gate();check_existing()
    return {'status':'READONLY_BRIDGE_PREFLIGHT_PASS','gate_files_unchanged':True,
            'ledger_private':True,'agent_permission':'read-only-snapshot',
            'existing_targets':sum(x.exists() for x in INSTALL_FILES.values())}

def ensure_dirs():
    ubuntu=pwd.getpwnam('ubuntu'); hermes=pwd.getpwnam('hermes-ai')
    BASE.mkdir(mode=0o755,exist_ok=True)
    os.chown(BASE,0,0);os.chmod(BASE,0o755)
    LIVE.mkdir(mode=0o750,exist_ok=True)
    os.chown(LIVE,ubuntu.pw_uid,hermes.pw_gid)
    os.chmod(LIVE,0o2750) # Inherit hermes-ai group for atomic export files.
    # Create intermediate directories under ubuntu's home as ubuntu-owned;
    # never create a root-owned parent that would break user systemd management.
    for p in [EXPORT.parent.parent,EXPORT.parent,
              UNITS.parent.parent,UNITS.parent,UNITS]:
        if p.is_symlink() or (p.exists() and not p.is_dir()):
            raise InstallError('DEST_DIR_UNSAFE:'+str(p))
        if not p.exists():
            p.mkdir(mode=0o755)
            os.chown(p,ubuntu.pw_uid,ubuntu.pw_gid)
            os.chmod(p,0o755)

def apply():
    if os.geteuid()!=0 or os.environ.get('SUDO_USER')!='ubuntu':
        raise InstallError('APPLY_REQUIRES_SUDO_FROM_UBUNTU')
    preflight()
    ensure_dirs()
    ubuntu=pwd.getpwnam('ubuntu')
    for name,target in INSTALL_FILES.items():
        src=SOURCE/name
        if target.exists():continue
        # Exclusive create and no symlinks; preserve exact bytes.
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o644)
        with os.fdopen(fd,'wb') as out:
            out.write(src.read_bytes());out.flush();os.fsync(out.fileno())
        if target==READ:
            os.chown(target,0,0);os.chmod(target,0o755)
        else:
            os.chown(target,ubuntu.pw_uid,ubuntu.pw_gid)
            os.chmod(target,0o755 if target==EXPORT else 0o644)
    check_existing()
    return {'status':'READONLY_BRIDGE_FILES_INSTALLED','gate_unchanged':True,
            'openclaw_unchanged':True,'timer_enabled':False,
            'next_steps':'Run ubuntu export once; enable --user timer; test sudo -u hermes-ai CLI.'}

def verify():
    preflight()
    required=[x for x in INSTALL_FILES.values() if not x.is_file()]
    if required:raise InstallError('NOT_INSTALLED')
    s=LIVE.stat()
    if not (s.st_mode & stat.S_ISGID):raise InstallError('LIVE_SETGID_MISSING')
    return {'status':'READONLY_BRIDGE_INSTALL_VERIFY_PASS','files':len(INSTALL_FILES),'ledger_unmodified':True,
            'service_timer':'VERIFY_SEPARATELY','snapshot':'VERIFY_SEPARATELY'}

def main():
    a=argparse.ArgumentParser(); a.add_argument('action',choices=('preflight','apply','verify'))
    args=a.parse_args()
    try:
        print(json.dumps({'preflight':preflight,'apply':apply,'verify':verify}[args.action]()))
        return 0
    except (InstallError,OSError,KeyError,ValueError) as e:
        print(json.dumps({'status':'READONLY_BRIDGE_BLOCKED','reason':str(e)}));return 2
if __name__=='__main__':raise SystemExit(main())
