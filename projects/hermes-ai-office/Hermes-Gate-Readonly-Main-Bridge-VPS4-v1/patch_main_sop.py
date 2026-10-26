#!/usr/bin/env python3
"""Optional, additive and backup-protected SOP addendum after Main CLI UAT PASS."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

TARGET=Path('/home/ubuntu/.openclaw/workspace/AGENTS.md')
SRC=Path(__file__).resolve().parent/'MAIN-AGENTS-READONLY-ADDENDUM.md'
BACKUP=Path('/home/ubuntu/.openclaw/quality-gate-sop-backups')
MARKER='<!-- HERMES_MAIN_GATE_READONLY_BRIDGE_V1_BEGIN -->'
END='<!-- HERMES_MAIN_GATE_READONLY_BRIDGE_V1_END -->'
class SOPError(Exception):pass

def sha(b):return hashlib.sha256(b).hexdigest()

def safe(path):
    if path.is_symlink() or not path.is_file() or not stat.S_ISREG(path.stat().st_mode):
        raise SOPError('SOP_FILE_MISSING_OR_SYMLINK')
    if path.stat().st_size>500_000:raise SOPError('SOP_SIZE_UNSAFE')
    return path.read_bytes()

def planned(path=TARGET, source=SRC):
    old=safe(path)
    if source.is_symlink() or not source.is_file():raise SOPError('ADDENDUM_UNSAFE')
    add=source.read_bytes()
    if add.count(MARKER.encode())!=1 or add.count(END.encode())!=1:raise SOPError('ADDENDUM_INVALID')
    if old.count(MARKER.encode())==1 and old.count(END.encode())==1:
        if add in old:return old,old
        raise SOPError('ADDENDUM_DIFFERENT_ALREADY_PRESENT')
    if MARKER.encode() in old or END.encode() in old:raise SOPError('ADDENDUM_PARTIAL_MARKER')
    return old,old.rstrip(b'\n')+b'\n\n'+add

def apply(path=TARGET,source=SRC,backup_dir=BACKUP):
    old,new=planned(path,source)
    if old==new:return {'status':'SOP_ALREADY_PRESENT','changed':False}
    if backup_dir.is_symlink() or (backup_dir.exists() and not backup_dir.is_dir()):
        raise SOPError('BACKUP_DIR_UNSAFE')
    backup_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(backup_dir,0o700)
    ts=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    bp=backup_dir/f'AGENTS-before-ro-bridge-{ts}-{sha(old)[:12]}.bak'
    fd=os.open(bp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(old);f.flush();os.fsync(f.fileno())
    if bp.read_bytes()!=old:raise SOPError('BACKUP_MISMATCH')
    st=path.stat()
    fd,tmp=tempfile.mkstemp(prefix='.agents-gate-ro-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:
            f.write(new);f.flush();os.fsync(f.fileno())
            os.fchmod(f.fileno(),stat.S_IMODE(st.st_mode))
            newst=os.fstat(f.fileno())
            if (newst.st_uid,newst.st_gid)!=(st.st_uid,st.st_gid):
                os.fchown(f.fileno(),st.st_uid,st.st_gid)
        if safe(path)!=old:raise SOPError('SOP_CONCURRENT_CHANGE')
        os.replace(tmp,path)
    finally:
        if os.path.lexists(tmp):os.unlink(tmp)
    if path.read_bytes()!=new:raise SOPError('SOP_VERIFY_MISMATCH')
    return {'status':'SOP_READONLY_ADDENDUM_PASS','changed':True,'backup':str(bp),'new_sha256':sha(new),'restart_needed':False}

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['preflight','apply','verify']);a=p.parse_args()
    try:
        if a.action=='preflight':
            old,new=planned()
            o={'status':'SOP_READONLY_PREFLIGHT_PASS','changed':False,'would_add':old!=new,'sha256':sha(old)}
        elif a.action=='apply':o=apply()
        else:
            old,new=planned()
            if old!=new:raise SOPError('SOP_ADDENDUM_MISSING')
            o={'status':'SOP_READONLY_VERIFY_PASS','sha256':sha(old)}
        print(json.dumps(o));return 0
    except (SOPError,OSError,ValueError) as e:
        print(json.dumps({'status':'SOP_READONLY_BLOCKED','reason':str(e)}));return 2
if __name__=='__main__':raise SystemExit(main())
