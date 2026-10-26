#!/usr/bin/env python3
"""Additive, guarded VPS4-only namespace clarification for Hermes Main SOP.

No OpenClaw config changes, daemon reload, restarts, state DB writes or claims.

V1.1: portable synthetic QA fixtures and diagnostic-only hash inspection.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import pwd
import socket
import stat
import subprocess
import sys
import tempfile

SRC=Path(__file__).resolve().parent
APP=Path('/home/ubuntu/.local/share/hermes-quality-gate-v1')
LEDGER=Path('/home/ubuntu/.local/state/hermes-quality-gate')
MAIN=Path('/home/ubuntu/.openclaw/workspace/AGENTS.md')
BACKUPS=Path('/home/ubuntu/.openclaw/quality-gate-sop-backups')
NEW_FILE='inspect_checklist_id.py'
DOC='MAIN-NAMESPACE-ADDENDUM.md'
MARKER='<!-- HERMES-CHECKLIST-NAMESPACE-V1-START -->'
BRIDGE='<!-- HERMES-CHECKLIST-GATE-BRIDGE-V1-START -->'
PINNED_GATE_SHA='6af7cef012b6aac0e1f95ff625d52682fbff56ee485b50c5062c47f9b7a5300e'
FIXTURES=('tests/fixtures/ledger.sqlite','tests/fixtures/policy.json')
class InstallError(Exception): pass

def sha(b):return hashlib.sha256(b).hexdigest()
def filehash(p):return sha(p.read_bytes())
def check_source():
    d={}
    for line in (SRC/'MANIFEST.sha256').read_text().splitlines():
        h,name=line.split('  ',1);d[name]=h
    if set(d)!={NEW_FILE,DOC,'install_namespace_fix.py',*FIXTURES}:raise InstallError('UNEXPECTED_MANIFEST')
    for name,h in d.items():
        p=SRC/name
        if p.is_symlink() or not p.is_file() or filehash(p)!=h:raise InstallError('SOURCE_HASH_FAIL:'+name)

def check_host():
    if socket.gethostname()!='VM-4-5-ubuntu' or pwd.getpwuid(os.getuid()).pw_name!='ubuntu' or os.geteuid()==0 or Path.home()!=Path('/home/ubuntu'):
        raise InstallError('WRONG_HOST_OR_USER')

def guard_file(p):
    if p.is_symlink() or not p.is_file() or not stat.S_ISREG(p.stat().st_mode):raise InstallError('UNSAFE_FILE:'+p.name)
    return p

def diagnose():
    """Read-only integrity diagnosis; never mutates the deployed gate."""
    report={'status':'GATE_INTEGRITY_BLOCKED','gate_path':str(APP/'gate.py'),
            'manifest_path':str(APP/'CHECKSUMS.sha256'),
            'pinned_gate_sha256':PINNED_GATE_SHA,
            'manifest_gate_sha256':None,'installed_gate_sha256':None,
            'gate_matches_pinned':False,'gate_matches_manifest':False,
            'no_changes':True}
    try:
        gate=guard_file(APP/'gate.py')
        checksum=guard_file(APP/'CHECKSUMS.sha256')
        entries={rel:expected for line in checksum.read_text().splitlines() for expected,rel in [line.split('  ',1)]}
        actual=filehash(gate)
        expected=entries.get('gate.py')
        report.update(manifest_gate_sha256=expected,installed_gate_sha256=actual,
                      gate_matches_pinned=(actual==PINNED_GATE_SHA),
                      gate_matches_manifest=(actual==expected))
        if actual==PINNED_GATE_SHA and expected==PINNED_GATE_SHA:
            report['status']='GATE_INTEGRITY_PASS'
        else:
            report['reason']='GATE_HASH_MISMATCH'
    except (OSError,ValueError,InstallError) as e:
        report['reason']=type(e).__name__+':'+str(e)
    return report

def audit():
    d=diagnose()
    if d['status']!='GATE_INTEGRITY_PASS':
        raise InstallError('GATE_HASH_MISMATCH_USE_DIAGNOSE')
    p=APP/'gate.py'
    r=subprocess.run(['/usr/bin/python3',str(p),'audit'],capture_output=True,text=True,timeout=20)
    if r.returncode:raise InstallError('GATE_AUDIT_BLOCKED')
    out=json.loads(r.stdout)
    if out.get('result')!='AUDIT_PASS' or out.get('task_count')!=81 or out.get('chain_valid') is not True:
        raise InstallError('GATE_AUDIT_NOT_PASS')
    return out

def preflight():
    check_host();check_source();audit()
    raw=guard_file(MAIN).read_bytes()
    if MAIN.stat().st_uid!=os.getuid() or len(raw)>1024*1024:raise InstallError('MAIN_OWNER_OR_SIZE')
    raw.decode('utf-8')
    if BRIDGE.encode() not in raw:raise InstallError('BRIDGE_SOP_V1_REQUIRED')
    target=APP/NEW_FILE
    if target.exists() and (target.is_symlink() or filehash(target)!=filehash(SRC/NEW_FILE)):
        raise InstallError('INSPECTOR_DEST_CONFLICT')
    return {'status':'NAMESPACE_PREFLIGHT_PASS','task_count':81,'sop_sha256':sha(raw),
            'sop_addendum_present':MARKER.encode() in raw,'inspector_present':target.exists(),
            'openclaw_config_changed':False}

def atomic_write(path,data,mode):
    fd,temp=tempfile.mkstemp(dir=path.parent,prefix='.'+path.name+'.',suffix='.tmp')
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(temp,mode)
        os.replace(temp,path)
    finally:
        if os.path.lexists(temp):os.unlink(temp)

def apply():
    p=preflight();target=APP/NEW_FILE
    if not target.exists():
        # Exclusive creation: never overwrite an existing inspector
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:f.write((SRC/NEW_FILE).read_bytes());f.flush();os.fsync(f.fileno())
    if p['sop_addendum_present']:
        return {'status':'NAMESPACE_ALREADY_APPLIED','sop_changed':False,'inspector_hash_verified':filehash(target)==filehash(SRC/NEW_FILE)}
    raw=MAIN.read_bytes()
    if sha(raw)!=p['sop_sha256']:raise InstallError('SOP_CONCURRENT_CHANGE')
    BACKUPS.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(BACKUPS,0o700)
    bkp=BACKUPS/('AGENTS-before-namespace-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+sha(raw)[:12]+'.bak')
    fd=os.open(bkp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    addition=(SRC/DOC).read_bytes()
    if MARKER.encode() not in addition:raise InstallError('ADDENDUM_INVALID')
    updated=raw+(b'\n' if raw and not raw.endswith(b'\n') else b'')+b'\n'+addition+b'\n'
    if sha(MAIN.read_bytes())!=sha(raw):raise InstallError('SOP_CONCURRENT_CHANGE')
    atomic_write(MAIN,updated,stat.S_IMODE(MAIN.stat().st_mode))
    return {'status':'NAMESPACE_SOP_APPEND_PASS','backup':str(bkp),'old_sha256':sha(raw),
            'new_sha256':sha(updated),'openclaw_config_changed':False,'requires_fresh_main_uat':True}

def verify():
    p=preflight()
    if not p['sop_addendum_present'] or not p['inspector_present']:raise InstallError('NOT_APPLIED')
    result=subprocess.run(['/usr/bin/python3',str(APP/NEW_FILE),'--id','B03','--id','K05','--id','K06'],capture_output=True,text=True,timeout=20)
    if result.returncode:raise InstallError('INSPECTOR_RUN_FAILED:'+result.stderr[:250])
    data=json.loads(result.stdout)
    if data['result']!='CHECKLIST_NAMESPACE_PASS' or [x['id'] for x in data['items']]!=['B03','K05','K06']:
        raise InstallError('NAMESPACE_VERIFICATION_FAILED')
    return {'status':'NAMESPACE_VERIFY_PASS','task_count':81,'item_ids':['B03','K05','K06'],
            'k06_depends_on_k05':'K05' in data['items'][2]['dependencies_for_start'],
            'b03_state':data['items'][0]['state'],'main_sop_updated':True,
            'openclaw_config_changed':False,'requires_fresh_main_uat':True}

def rollback_sop():
    p=preflight()
    if not p['sop_addendum_present']:
        return {'status':'NAMESPACE_SOP_ALREADY_ABSENT','changed':False}
    current=MAIN.read_bytes()
    addition=(SRC/DOC).read_bytes()+b'\n'
    choices=[]
    for backup in sorted(BACKUPS.glob('AGENTS-before-namespace-*.bak')):
        if backup.is_symlink() or not backup.is_file():continue
        old=backup.read_bytes()
        wanted=old+(b'\n' if old and not old.endswith(b'\n') else b'')+b'\n'+addition
        if current==wanted:choices.append((backup,old))
    if len(choices)!=1:raise InstallError('ROLLBACK_BASELINE_NOT_UNIQUE_OR_CONCURRENT_SOP_CHANGE')
    backup,old=choices[0]
    if MAIN.read_bytes()!=current:raise InstallError('SOP_CONCURRENT_CHANGE')
    atomic_write(MAIN,old,stat.S_IMODE(MAIN.stat().st_mode))
    return {'status':'NAMESPACE_SOP_ROLLBACK_PASS','backup_verified':str(backup),'restored_sha256':sha(old),
            'gate_and_ledger_unchanged':True,'inspector_preserved':True}

def main():
    a=argparse.ArgumentParser();p=a.add_mutually_exclusive_group(required=True)
    for n in ('diagnose','preflight','apply','verify','rollback-sop'):p.add_argument('--'+n,action='store_true')
    opts=a.parse_args()
    try:out=diagnose() if opts.diagnose else preflight() if opts.preflight else apply() if opts.apply else verify() if opts.verify else rollback_sop()
    except Exception as e:
        print(json.dumps({'status':'BLOCKED','reason':str(e)},ensure_ascii=False),file=sys.stderr)
        return 2
    print(json.dumps(out,ensure_ascii=False,indent=2))
    return 2 if opts.diagnose and out["status"] != "GATE_INTEGRITY_PASS" else 0
if __name__=='__main__':sys.exit(main())
