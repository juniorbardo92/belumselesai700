#!/usr/bin/env python3
"""VPS2-only single writer for new KAL-AUTO jobs (never historic queue)."""
import fcntl, json, os, sqlite3, stat, subprocess, sys
from pathlib import Path

ROOT=Path('/var/lib/kal-auto-intake')
CONFIG=ROOT/'receiver.env'
PROD=Path('/opt/kalyanamitra')
ENGINE=Path('/opt/kal-auto-001/kalauto.py')
PUBLISHER_HASH='0121951bd9b8f2bbb26de6c2212e816af18e256746619d4a6d3f1d53cb8708e6'

def load():
    if CONFIG.is_symlink() or not CONFIG.is_file():raise RuntimeError('RECEIVER_CONFIG_ABSENT')
    x=dict(line.split('=',1) for line in CONFIG.read_text().splitlines() if line and not line.startswith('#') and '=' in line)
    if x.get('KAL_AUTO_DATA_DIR')!=str(ROOT/'state/kalauto') or x.get('KAL_AUTO_HMAC_FILE')!=str(ROOT/'hmac.key'):
        raise RuntimeError('CONFIG_PATH_MISMATCH')
    return x

def run():
    if os.geteuid()!=0:raise RuntimeError('WORKER_MUST_RUN_AS_ROOT_ON_VPS2')
    if os.uname().nodename.split('.')[0]!='VM-0-10-ubuntu':raise RuntimeError('WRONG_HOST')
    c=load();folder=Path(c['KAL_AUTO_DATA_DIR']);db=folder/'intent.sqlite'
    if not db.is_file():return {'status':'NO_INTAKE_JOBS','post_attempted':False}
    fd=os.open(folder/'worker.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with sqlite3.connect(db,timeout=20) as con:
            rec=con.execute("SELECT id,draft_path FROM jobs WHERE state='READY' AND id LIKE 'KAL-AUTO-%' ORDER BY created_at LIMIT 1").fetchone()
        if not rec:return {'status':'NO_READY_JOBS','post_attempted':False}
        jid,draft=rec
        validator=PROD/'scripts/validate_dharma_json.py'
        if not validator.is_file():return {'status':'BLOCKED_QA_VALIDATOR_ABSENT','job_id':jid}
        proc=subprocess.run([sys.executable,str(validator),str(draft)],capture_output=True,text=True,timeout=35)
        if proc.returncode!=0:
            with sqlite3.connect(db,timeout=20) as con:
                con.execute("UPDATE jobs SET state='QA_BLOCKED',error_code='QA_VALIDATOR_FAILED' WHERE id=? AND state='READY'",(jid,))
            return {'status':'QA_BLOCKED','job_id':jid,'post_attempted':False}
        env={**os.environ,**c,
             'KAL_AUTO_BACKEND':'publisher_vps2','KAL_AUTO_WRITE_ENABLED':'true',
             'KAL_AUTO_PUBLISHER_SHA256':PUBLISHER_HASH,
             'KAL_AUTO_PRODUCTION_DB':str(PROD/'data/kalyanamitra.db'),
             'KAL_AUTO_FINGERPRINT_PATH':str(PROD/'provisioning/fingerprint_kalyanamitra.py')}
        proc=subprocess.run([sys.executable,str(ENGINE),'dispatch',jid],env=env,capture_output=True,text=True,timeout=180)
        try: result=json.loads(proc.stdout)
        except ValueError: result={'status':'SUBMISSION_UNCERTAIN'}
        return {'status':'DISPATCH_RESULT','job_id':jid,'dispatch_rc':proc.returncode,
                'state':result.get('state',result.get('status','UNKNOWN')),
                'schedule_id':result.get('schedule_id'),'post_attempted':True}
    finally:os.close(fd)

def main():
    try: out=run(); print(json.dumps(out));return 0 if out.get('status') in ('NO_INTAKE_JOBS','NO_READY_JOBS','QA_BLOCKED','DISPATCH_RESULT') else 3
    except BlockingIOError:print(json.dumps({'status':'ALREADY_RUNNING'}));return 0
    except Exception as e:print(json.dumps({'status':'BLOCKED','reason':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));return 3

if __name__=='__main__':raise SystemExit(main())
