#!/usr/bin/env python3
"""Guarded VPS4-only installer. Installs new user units only; never touches OpenClaw/Guardian/production."""
from __future__ import annotations
import argparse
import getpass
import hashlib
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import json

APP="hermes-quality-gate-v1"
UNIT="hermes-checklist-gate"
EXPECTED_HOST="VM-4-5-ubuntu"
EXPECTED_USER="ubuntu"
SRC=Path(__file__).resolve().parent
HOME=Path.home()
DEST=HOME/".local/share"/APP
STATE=HOME/".local/state/hermes-quality-gate"
UNITS=HOME/".config/systemd/user"
FILES=("gate.py","policy.json","checklist.md","README.md","tests/test_gate.py","INSTALLER-NOTES.md","installer.py","examples/receipt-schema.json","HERMES-MAIN-REVIEWER-HANDOFF.md","QA-RESULTS.json")

class InstallError(Exception):pass

def fail(code):raise InstallError(code)

def shasum(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def verify_pkg():
    manifest=SRC/"CHECKSUMS.sha256"
    if not manifest.is_file():fail("MANIFEST_MISSING")
    keys=set()
    for line in manifest.read_text().splitlines():
        digest,rel=line.split("  ",1)
        if rel not in FILES or not (SRC/rel).is_file() or shasum(SRC/rel)!=digest:
            fail("PACKAGE_HASH_MISMATCH:"+rel)
        keys.add(rel)
    if keys!=set(FILES):fail("PACKAGE_MANIFEST_INCOMPLETE")
    return True

def check_host():
    if socket.gethostname()!=EXPECTED_HOST:fail("WRONG_HOST")
    if getpass.getuser()!=EXPECTED_USER or os.geteuid()==0:fail("WRONG_USER_OR_ROOT")
    if sys.version_info < (3,10):fail("PYTHON_TOO_OLD")
    if HOME!=Path('/home/ubuntu'):fail("WRONG_HOME")

def preflight():
    check_host();verify_pkg()
    if DEST.exists():fail("DEST_EXISTS_REFUSE_OVERWRITE")
    if STATE.exists():fail("STATE_EXISTS_REFUSE_OVERWRITE")
    for unit in (f"{UNIT}.path",f"{UNIT}.service"):
        if (UNITS/unit).exists():fail("UNIT_EXISTS_REFUSE_OVERWRITE:"+unit)
    return {"status":"PREFLIGHT_PASS","host":EXPECTED_HOST,"user":EXPECTED_USER,"changed":False}

def unit_texts():
    service=f"""[Unit]
Description=Hermes checklist evidence receipt verifier (offline)
After=local-fs.target

[Service]
Type=oneshot
WorkingDirectory=%h/.local/share/{APP}
ExecStart=/usr/bin/python3 %h/.local/share/{APP}/gate.py ingest
NoNewPrivileges=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=default.target
"""
    path=f"""[Unit]
Description=Hermes checklist quality gate receipt event watcher

[Path]
PathExistsGlob=%h/.local/state/hermes-quality-gate/inbox/*.json
PathChanged=%h/.local/state/hermes-quality-gate/inbox
Unit={UNIT}.service

[Install]
WantedBy=default.target
"""
    return {f"{UNIT}.service":service,f"{UNIT}.path":path}

def apply():
    proof=preflight()
    old_umask=os.umask(0o077)
    try:
        DEST.mkdir(parents=True,mode=0o700)
        for rel in FILES:
            p=DEST/rel;p.parent.mkdir(exist_ok=True,parents=True)
            shutil.copyfile(SRC/rel,p)
            p.chmod(0o600)
        shutil.copyfile(SRC/"CHECKSUMS.sha256",DEST/"CHECKSUMS.sha256")
        out=subprocess.run(["/usr/bin/python3",str(DEST/"gate.py"),"init","--checklist",str(DEST/"checklist.md"),"--policy",str(DEST/"policy.json")],capture_output=True,text=True,timeout=35)
        if out.returncode!=0:fail("LEDGER_INIT_FAILED:"+out.stderr[:350])
        UNITS.mkdir(parents=True,exist_ok=True)
        for unit,body in unit_texts().items():
            p=UNITS/unit;p.write_text(body);p.chmod(0o600)
        verify=verify_local()
        systemd=subprocess.run(["systemctl","--user","daemon-reload"],capture_output=True,text=True,timeout=20)
        if systemd.returncode!=0:
            return {"status":"INSTALLED_NOT_ACTIVATED","reason":"systemctl --user unavailable","local_audit":verify,"action":"Check user DBUS session then systemctl --user enable --now hermes-checklist-gate.path"}
        started=subprocess.run(["systemctl","--user","enable","--now",f"{UNIT}.path"],capture_output=True,text=True,timeout=20)
        if started.returncode!=0:
            return {"status":"INSTALLED_NOT_ACTIVATED","reason":"systemctl --user path activation failed","local_audit":verify,"action":"Inspect systemctl --user status hermes-checklist-gate.path"}
        return {"status":"INSTALL_PASS_PATH_ACTIVE","local_audit":verify,"openclaw_config_changed":False,"production_changed":False,"automatic_closure":False}
    finally: os.umask(old_umask)

def verify_local():
    if not DEST.is_dir() or not STATE.is_dir():fail("NOT_INSTALLED")
    for line in (DEST/"CHECKSUMS.sha256").read_text().splitlines():
        digest,rel=line.split("  ",1)
        if shasum(DEST/rel)!=digest:fail("INSTALLED_HASH_MISMATCH:"+rel)
    p=subprocess.run(["/usr/bin/python3",str(DEST/"gate.py"),"audit"],capture_output=True,text=True,timeout=25)
    if p.returncode:fail("LEDGER_AUDIT_FAILED:"+p.stderr[:250])
    audit=json.loads(p.stdout)
    if not audit.get("chain_valid") or audit.get("task_count")!=81:fail("LEDGER_INVALID")
    return audit

def rollback():
    check_host()
    # Only disable this new path unit, do not touch Hermes/OpenClaw/Guardian.
    subprocess.run(["systemctl","--user","disable","--now",f"{UNIT}.path"],capture_output=True,text=True,timeout=15)
    paths=unit_texts()
    for n,body in paths.items():
        p=UNITS/n
        if p.exists() and p.read_text()==body:p.unlink()
        elif p.exists():fail("UNIT_CHANGED_REFUSE_DELETE:"+n)
    subprocess.run(["systemctl","--user","daemon-reload"],capture_output=True,text=True,timeout=15)
    # Preserve all audit data and installed source as immutable checkpoint for operator.
    return {"status":"PATH_DISABLED","state_preserved":str(STATE),"app_preserved":str(DEST),"production_changed":False}

def main():
    ap=argparse.ArgumentParser();g=ap.add_mutually_exclusive_group(required=True)
    for k in ("preflight","apply","verify","rollback"):g.add_argument("--"+k,action="store_true")
    a=ap.parse_args()
    try:
        if a.preflight: out=preflight()
        elif a.apply: out=apply()
        elif a.verify:
            check_host();out={"status":"VERIFY_PASS","audit":verify_local()}
        else:out=rollback()
        print(json.dumps(out,ensure_ascii=False,indent=2))
    except (InstallError, OSError, ValueError, subprocess.TimeoutExpired) as e:
        print(json.dumps({"status":"BLOCKED","reason":str(e)}),file=sys.stderr);sys.exit(2)

if __name__=="__main__":main()
