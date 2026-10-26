#!/usr/bin/env python3
"""Ubuntu-owned, fail-closed read-only projection of the canonical Gate ledger.

No network, no command execution, no claims, no production writes. Only writes
an atomic, group-readable JSON projection under a root-protected directory.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile

ID = re.compile(r"^[HBQKUSCX][0-9]{2}$")
ALLOWED = {"CLOSED", "CLOSED_DEV", "OPEN", "PARTIAL", "HOLD", "STOPPED"}
PHASE_BUSY = {"CLAIMED", "VERIFIED_PENDING_OWNER"}
SOURCE = "VPS4_LOCAL_GATE_LEDGER_AND_POLICY"
EXPECTED_COUNT = 81
DEFAULT_LEDGER = Path('/home/ubuntu/.local/state/hermes-quality-gate')
DEFAULT_DEST = Path('/var/lib/hermes-checklist-ro/live/status.json')

class ExportError(Exception): pass

def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def sha(v):
    return hashlib.sha256(v).hexdigest()

def require_plain(p: Path, cap: int):
    if p.is_symlink() or not p.is_file() or not stat.S_ISREG(p.stat().st_mode):
        raise ExportError('UNSAFE_OR_MISSING_FILE:'+p.name)
    if p.stat().st_size > cap:
        raise ExportError('FILE_TOO_LARGE:'+p.name)
    return p

def validate_graph(p, ids):
    if not isinstance(p,dict) or p.get('schema') != 1 or p.get('allow_automatic_close') is not False:
        raise ExportError('POLICY_INVALID')
    for key in ('dependencies_for_start','dependencies_for_close'):
        graph=p.get(key)
        if not isinstance(graph,dict): raise ExportError('POLICY_GRAPH_MISSING')
        for child, parents in graph.items():
            if child not in ids or not isinstance(parents,list) or len(set(parents)) != len(parents):
                raise ExportError('POLICY_DEPENDENCIES_INVALID')
            if any(d not in ids or d==child for d in parents):
                raise ExportError('POLICY_ID_INVALID')
    combined={i:set(p['dependencies_for_start'].get(i,[])+p['dependencies_for_close'].get(i,[])) for i in ids}
    def visit(i,path):
        if i in path: raise ExportError('POLICY_DEPENDENCY_CYCLE')
        for j in combined[i]: visit(j,path|{i})
    for i in ids: visit(i,set())

def generate(root:Path, now:dt.datetime|None=None):
    root=Path(root)
    if root.is_symlink() or not root.is_dir(): raise ExportError('LEDGER_ROOT_INVALID')
    raw_policy=require_plain(root/'policy.json', 1_000_000).read_bytes()
    try: policy=json.loads(raw_policy)
    except ValueError as e: raise ExportError('POLICY_JSON_INVALID') from e
    dbfile=require_plain(root/'ledger.sqlite', 80_000_000)
    # A single read-only transaction guarantees decisions and history are consistent.
    conn=sqlite3.connect(dbfile.resolve().as_uri()+'?mode=ro', uri=True, timeout=5)
    conn.row_factory=sqlite3.Row
    try:
        conn.execute('PRAGMA query_only=ON')
        conn.execute('BEGIN')
        rows=conn.execute('SELECT id,priority,state,phase,description FROM tasks').fetchall()
        if len(rows)!=EXPECTED_COUNT: raise ExportError('TASK_COUNT_NOT_81')
        states={r['id']:r['state'] for r in rows}
        if len(states)!=EXPECTED_COUNT or any(not ID.fullmatch(i) for i in states):
            raise ExportError('TASK_IDS_INVALID')
        if any(v not in ALLOWED for v in states.values()): raise ExportError('TASK_STATE_INVALID')
        validate_graph(policy,set(states))
        # Independently recompute the exact canonical gate chain.
        prev='0'*64
        event_count=0
        for e in conn.execute('SELECT seq,time,kind,payload,prev,hash FROM events ORDER BY seq'):
            event_count+=1
            try: content={'time':e['time'],'kind':e['kind'],'payload':json.loads(e['payload']),'prev':prev}
            except ValueError as err: raise ExportError('EVENT_PAYLOAD_INVALID') from err
            if e['prev']!=prev or sha(canonical(content).encode())!=e['hash']:
                raise ExportError('EVENT_CHAIN_INVALID:'+str(e['seq']))
            prev=e['hash']
        if event_count<1: raise ExportError('EVENT_HISTORY_EMPTY')
        output=[]
        for row in sorted(rows,key=lambda x:x['id']):
            i=row['id']; ds=policy['dependencies_for_start'].get(i,[]); dc=policy['dependencies_for_close'].get(i,[])
            blockers=[{'id':d,'state':states[d]} for d in ds if states[d] not in ('CLOSED','CLOSED_DEV')]
            output.append({
                'id':i,'priority':row['priority'],'state':row['state'],'phase':row['phase'],
                'description':row['description'],
                'dependencies_for_start':ds,'dependencies_for_close':dc,
                'start_blockers':blockers,
                'can_start':row['state'] not in ('CLOSED','CLOSED_DEV','HOLD','STOPPED')
                            and row['phase'] not in PHASE_BUSY and not blockers,
                'read_only':True
            })
        now=now or dt.datetime.now(dt.timezone.utc)
        if now.tzinfo is None:raise ExportError('TIMESTAMP_NEEDS_TIMEZONE')
        return {
            'result':'CHECKLIST_READONLY_SNAPSHOT_PASS',
            'namespace':'CHECKLIST_INDUK_81','source':SOURCE,'task_count':EXPECTED_COUNT,
            'generated_at':now.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),
            'event_count':event_count,'last_event_hash':prev,'chain_valid':True,
            'policy_sha256':sha(raw_policy),'automatic_close':False,
            'items':output,
            'note':'Snapshot only. No claim, dispatch, POST, approval, or ledger mutation.'
        }
    except sqlite3.Error as e:
        raise ExportError('LEDGER_READ_FAILED:'+type(e).__name__) from e
    finally:conn.close()

def publish(obj,dest:Path):
    parent=dest.parent
    if parent.is_symlink() or not parent.is_dir():raise ExportError('EXPORT_DIR_MISSING_OR_SYMLINK')
    if dest.is_symlink():raise ExportError('EXPORT_DEST_SYMLINK')
    if dest.exists() and not stat.S_ISREG(dest.stat().st_mode):raise ExportError('EXPORT_DEST_UNSAFE')
    data=(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
    fd,tmp=tempfile.mkstemp(prefix='.status-',suffix='.tmp',dir=parent)
    try:
        with os.fdopen(fd,'wb') as f:
            os.fchmod(f.fileno(),0o640)
            f.write(data);f.flush();os.fsync(f.fileno())
        if os.stat(tmp).st_gid != os.stat(parent).st_gid:
            raise ExportError('GROUP_INHERITANCE_MISSING')
        os.replace(tmp,dest)
        dfd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return {'result':'SNAPSHOT_PUBLISHED','task_count':obj['task_count'],'event_count':obj['event_count'],'path':str(dest)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',default=str(DEFAULT_LEDGER))
    ap.add_argument('--dest',default=str(DEFAULT_DEST))
    ap.add_argument('--check-only',action='store_true')
    a=ap.parse_args()
    try:
        obj=generate(Path(a.root))
        if a.check_only:
            out={'result':'SNAPSHOT_SOURCE_PASS','task_count':obj['task_count'],'event_count':obj['event_count']}
        else: out=publish(obj,Path(a.dest))
        print(json.dumps(out));return 0
    except (ExportError,OSError,ValueError) as e:
        print(json.dumps({'result':'SNAPSHOT_BLOCKED','reason':str(e)}));return 2

if __name__=='__main__':raise SystemExit(main())
