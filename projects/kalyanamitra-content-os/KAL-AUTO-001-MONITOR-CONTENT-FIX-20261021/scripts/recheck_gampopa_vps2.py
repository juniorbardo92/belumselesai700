#!/usr/bin/env python3
"""Advance one V4 sidecar due cursor for rechecking; no Repliz writes."""
import fcntl, os, sqlite3
from pathlib import Path
from datetime import datetime,timezone
root=Path('/var/lib/kal-auto-intake/state/kalauto')
db=root/'publication_proof.sqlite'
lock=root/'publication-monitor.lock'
job='KAL-AUTO-D8BC64FDB13CD47902B6'
schedule='6ad814e47e1804fa7c9430d0'
if os.geteuid()!=0 or os.uname().nodename.split('.')[0]!='VM-0-10-ubuntu':
    raise SystemExit('BLOCKED_RUN_AS_ROOT_ON_VPS2')
if not db.is_file() or db.is_symlink():
    raise SystemExit('BLOCKED_PROOF_LEDGER_MISSING')
fd=os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
try:
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    with sqlite3.connect(db,timeout=5) as con:
        row=con.execute('SELECT state,schedule_id FROM proofs WHERE job_id=?',(job,)).fetchone()
        if not row or row[1]!=schedule:
            raise SystemExit('BLOCKED_PROOF_ROW_MISMATCH')
        if row[0]=='CONTENT_CONFIRMED':
            print('ALREADY_CONTENT_CONFIRMED_NO_ACTION')
        else:
            with sqlite3.connect(root/'intent.sqlite') as jobs:
                orig=jobs.execute('SELECT state,schedule_id FROM jobs WHERE id=?',(job,)).fetchone()
            if orig!=('SCHEDULED',schedule):
                raise SystemExit('BLOCKED_JOB_ROW_MISMATCH')
            con.execute('UPDATE proofs SET next_check=? WHERE job_id=? AND schedule_id=?',
                ('2000-01-01T00:00:00Z',job,schedule))
            print('ONE_JOB_RECHECK_REQUESTED')
            print('SCHEDULE_ID='+schedule)
            print('REPLIZ_POST=0')
except BlockingIOError:
    raise SystemExit('BLOCKED_MONITOR_RUNNING_RETRY_LATER')
finally:
    os.close(fd)
