#!/usr/bin/env python3
"""Run Kalyanamitra sandbox test and accept ONLY 27/27 PASS, never PARTIAL."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

STAGE=Path('/tmp/kalyanamitra-uat.NMAtlK')
EXPECTED={
    'publisher_kalyanamitra.py':'0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6',
    'uat_publisher_sandbox.py':'76b31281146e992c63e964a6fa825e1482d7a8eb04ed215aa889ea0e4d9b04a9',
    'fake_repliz_api.py':'b577795bcb7281535335db934fedff56d2458a631d8ff841438aab69978b9f99',
    'provisioning/fingerprint_kalyanamitra.py':'319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930',
    'fixtures/jadwal-nyata-3.json':'9f2bf637a662c41bbce00c9552bb2725d650080fd12935a989a3407d1396461d',
}

def main():
    if os.uname().nodename!='VM-0-10-ubuntu':
        raise RuntimeError('BLOCKED_WRONG_VPS')
    for name, expected in EXPECTED.items():
        p=STAGE/name
        if not p.is_file() or p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
            raise RuntimeError('BLOCKED_HASH:'+name)
    for name in ('migrate_publish_columns.py','rollback_publish_columns.py','fixtures/validate_dharma_json-v0.2.1.py','fixtures/kalyanamitra-db-snapshot.sql'):
        if not (STAGE/name).is_file():
            raise RuntimeError('BLOCKED_DEPENDENCY:'+name)
    out=STAGE/'uat-terakhir.json'
    log=STAGE/('uat-b3e-'+str(time.time_ns())+'.log')
    if out.is_symlink():
        raise RuntimeError('BLOCKED_RESULT_SYMLINK')
    before=out.stat().st_mtime_ns if out.is_file() else 0
    started=time.time_ns()
    env={
        'HOME':'/home/ubuntu','PATH':'/usr/bin:/bin',
        'UAT_WORKDIR':str(STAGE/'work'),
        'KALYANAMITRA_FINGERPRINT_DIR':str(STAGE/'provisioning'),
        'PYTHONDONTWRITEBYTECODE':'1','PYTHONUNBUFFERED':'1'
    }
    fd=os.open(log,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'wb') as f:
        try:
            proc=subprocess.run([sys.executable,'-B','-u',str(STAGE/'uat_publisher_sandbox.py')],
                                cwd=STAGE,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240)
            rc=proc.returncode
        except subprocess.TimeoutExpired:
            print('UAT_TIMEOUT_LOG='+str(log))
            raise SystemExit(124)
    print('UAT_EXIT_CODE='+str(rc))
    print('UAT_LOG='+str(log))
    if not out.is_file() or out.stat().st_mtime_ns<=before or out.stat().st_mtime_ns < started:
        print('UAT_ACCEPTANCE=BLOCKED_RESULT_MISSING_OR_STALE')
        raise SystemExit(2)
    data=json.loads(out.read_text(encoding='utf-8'))
    if not isinstance(data,list) or not all(isinstance(x,dict) for x in data):
        print('UAT_ACCEPTANCE=BLOCKED_RESULT_INVALID')
        raise SystemExit(2)
    counts={x:sum(t.get('verdict')==x for t in data) for x in ('PASS','PARTIAL','FAIL')}
    print('UAT_TOTAL='+str(len(data)))
    for k,v in counts.items():print('UAT_'+k+'='+str(v))
    for t in data:
        if t.get('verdict')!='PASS':
            print('NONPASS='+str(t.get('nama','UNKNOWN'))+'; VERDICT='+str(t.get('verdict','UNKNOWN')))
            print('NONPASS_BUKTI='+str(t.get('bukti',''))[:650])
    good=rc==0 and len(data)==27 and counts['PASS']==27 and counts['PARTIAL']==0 and counts['FAIL']==0
    print('UAT_ACCEPTANCE='+('PASS' if good else 'NOT_CLOSED'))
    raise SystemExit(0 if good else 1)

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('UAT_RUNNER_BLOCKED:'+type(exc).__name__+':'+str(exc))
        raise SystemExit(2)
