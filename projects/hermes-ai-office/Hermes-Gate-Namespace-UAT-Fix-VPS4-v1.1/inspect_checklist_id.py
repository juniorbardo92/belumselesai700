#!/usr/bin/env python3
"""Read-only canonical checklist namespace resolver for Hermes Main UAT.

No receipt, claim, update, network, or task execution. The SQLite handle is read-only.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

ID = re.compile(r'^[HBQKUSCX][0-9]{2}$')
EXPECTED_IDS = 81
class InspectError(Exception): pass

def canonical(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def digest(b): return hashlib.sha256(b).hexdigest()

def regular(p):
    if p.is_symlink() or not p.is_file():
        raise InspectError('MISSING_OR_SYMLINK:'+p.name)
    return p

def inspect(root:Path,ids:list[str]):
    if not ids or len(ids)>20 or len(set(ids)) != len(ids) or any(not ID.fullmatch(i) for i in ids):
        raise InspectError('INVALID_CHECKLIST_ID')
    root = Path(root).expanduser()
    if root.is_symlink() or not root.is_dir(): raise InspectError('STATE_ROOT_MISSING_OR_SYMLINK')
    policy = json.loads(regular(root/'policy.json').read_text(encoding='utf-8'))
    if policy.get('schema') != 1 or policy.get('allow_automatic_close') is not False:
        raise InspectError('POLICY_INVALID')
    dbpath = regular(root/'ledger.sqlite')
    db=sqlite3.connect(dbpath.as_uri()+'?mode=ro',uri=True,timeout=5)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA query_only=ON')
        row=db.execute('SELECT count(*) AS n FROM tasks').fetchone()
        if row['n']!=EXPECTED_IDS:raise InspectError('CHECKLIST_TASK_COUNT_NOT_81')
        evs=db.execute('SELECT seq,time,kind,payload,prev,hash FROM events ORDER BY seq').fetchall()
        old='0'*64
        for e in evs:
            content={'time':e['time'],'kind':e['kind'],'payload':json.loads(e['payload']),'prev':old}
            if e['prev']!=old or digest(canonical(content).encode())!=e['hash']:
                raise InspectError('EVENT_CHAIN_INVALID_AT:'+str(e['seq']))
            old=e['hash']
        result=[]
        for item in ids:
            task=db.execute('SELECT id,priority,state,phase,description FROM tasks WHERE id=?',(item,)).fetchone()
            if task is None: raise InspectError('UNKNOWN_CHECKLIST_ID:'+item)
            starts=policy.get('dependencies_for_start',{}).get(item,[])
            closes=policy.get('dependencies_for_close',{}).get(item,[])
            if not isinstance(starts,list) or not isinstance(closes,list):
                raise InspectError('INVALID_DEPENDENCY_POLICY')
            blockers=[]
            for d in starts:
                row=db.execute('SELECT state FROM tasks WHERE id=?',(d,)).fetchone()
                if row is None:raise InspectError('UNKNOWN_DEPENDENCY:'+d)
                if row['state'] not in ('CLOSED','CLOSED_DEV'):
                    blockers.append({'id':d,'state':row['state']})
            already_closed = task['state'] in ('CLOSED','CLOSED_DEV','STOPPED','HOLD')
            busy=task['phase'] in ('CLAIMED','VERIFIED_PENDING_OWNER')
            result.append({**dict(task),'dependencies_for_start':starts,'dependencies_for_close':closes,
                           'start_blockers':blockers,'can_start':not(already_closed or busy or blockers),
                           'read_only':True})
        return {'result':'CHECKLIST_NAMESPACE_PASS','namespace':'CHECKLIST_INDUK_81',
                'source':'VPS4_LOCAL_GATE_LEDGER_AND_POLICY','task_count':EXPECTED_IDS,
                'event_count':len(evs),'chain_valid':True,'items':result,
                'note':'No claim, no dispatch, no POST, no state changes'}
    finally:db.close()

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument('--root',default='/home/ubuntu/.local/state/hermes-quality-gate')
    p.add_argument('--id',action='append',required=True)
    a=p.parse_args(argv)
    try:
        print(json.dumps(inspect(Path(a.root),a.id),ensure_ascii=False,indent=2))
        return 0
    except (InspectError,sqlite3.Error,OSError,ValueError,KeyError) as e:
        print(json.dumps({'result':'CHECKLIST_NAMESPACE_BLOCKED','reason':str(e)},ensure_ascii=False),file=sys.stderr)
        return 2
if __name__=='__main__':sys.exit(main())
