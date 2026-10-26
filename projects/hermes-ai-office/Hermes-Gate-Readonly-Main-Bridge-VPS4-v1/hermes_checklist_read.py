#!/usr/bin/env python3
"""Unprivileged hermes-ai reader. Never opens ubuntu's home or the gate ledger."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import stat

DEFAULT=Path('/var/lib/hermes-checklist-ro/live/status.json')
ID=re.compile(r'^[HBQKUSCX][0-9]{2}$')
class ReadError(Exception):pass

def read(snapshot:Path,ids:list[str],age_seconds:int=120, now=None):
    if not ids or len(ids)>20 or len(set(ids))!=len(ids) or any(not ID.fullmatch(i) for i in ids):
        raise ReadError('INVALID_REQUEST_IDS')
    if age_seconds<=0 or age_seconds>300:raise ReadError('INVALID_MAX_AGE')
    for p in (snapshot.parent.parent,snapshot.parent,snapshot):
        if p.is_symlink():raise ReadError('SYMLINK_PATH_DENIED')
    if snapshot == DEFAULT:
        base=snapshot.parent.parent.stat(); live=snapshot.parent.stat()
        if base.st_uid!=0 or (stat.S_IMODE(base.st_mode)&0o022):
            raise ReadError('INSECURE_PARENT_DIRECTORY')
        if live.st_uid==os.geteuid() or (stat.S_IMODE(live.st_mode)&0o022):
            raise ReadError('INSECURE_LIVE_DIRECTORY')
        if live.st_gid not in (set(os.getgroups())|{os.getegid()}):
            raise ReadError('NOT_IN_SNAPSHOT_READ_GROUP')
    flags=os.O_RDONLY|os.O_CLOEXEC|getattr(os,'O_NOFOLLOW',0)
    fd=os.open(snapshot,flags)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_size>512*1024 or s.st_size<100:
            raise ReadError('SNAPSHOT_UNSAFE_SIZE_OR_TYPE')
        if (stat.S_IMODE(s.st_mode)&0o022) or (snapshot==DEFAULT and s.st_uid==os.geteuid()):
            raise ReadError('INSECURE_SNAPSHOT_PERMISSIONS')
        if snapshot==DEFAULT and s.st_gid!=snapshot.parent.stat().st_gid:
            raise ReadError('SNAPSHOT_GROUP_MISMATCH')
        with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(512*1024+1)
        if len(raw)>512*1024:raise ReadError('SNAPSHOT_TOO_LARGE')
    finally:os.close(fd)
    try:obj=json.loads(raw)
    except ValueError as e:raise ReadError('SNAPSHOT_JSON_INVALID') from e
    if (obj.get('result')!='CHECKLIST_READONLY_SNAPSHOT_PASS' or
        obj.get('namespace')!='CHECKLIST_INDUK_81' or
        obj.get('source')!='VPS4_LOCAL_GATE_LEDGER_AND_POLICY' or
        obj.get('task_count')!=81 or obj.get('chain_valid') is not True or
        obj.get('automatic_close') is not False):
        raise ReadError('SNAPSHOT_HEADER_INVALID')
    try:
        timestamp=dt.datetime.fromisoformat(obj['generated_at'].replace('Z','+00:00'))
        now=now or dt.datetime.now(dt.timezone.utc)
        age=(now-timestamp).total_seconds()
    except (ValueError,KeyError,TypeError) as e:raise ReadError('SNAPSHOT_TIME_INVALID') from e
    if not 0<=age<=age_seconds:raise ReadError('SNAPSHOT_STALE_OR_FUTURE')
    items=obj.get('items')
    if not isinstance(items,list) or len(items)!=81:raise ReadError('SNAPSHOT_ITEM_COUNT_INVALID')
    byid={x.get('id'):x for x in items if isinstance(x,dict)}
    if len(byid)!=81 or any(not ID.fullmatch(str(i)) for i in byid):raise ReadError('SNAPSHOT_IDS_INVALID')
    selected=[]
    for i in ids:
        if i not in byid:raise ReadError('UNKNOWN_TASK:'+i)
        selected.append(byid[i])
    return {
        'result':'CHECKLIST_NAMESPACE_PASS','namespace':obj['namespace'],
        'source':'VPS4_ROOT_PROTECTED_READONLY_SNAPSHOT',
        'snapshot_source':obj['source'],'task_count':81,
        'snapshot_generated_at':obj['generated_at'],
        'snapshot_age_seconds':round(age,2),
        'event_count':obj['event_count'],'chain_valid':True,
        'last_event_hash':obj['last_event_hash'],'policy_sha256':obj['policy_sha256'],
        'items':selected,'note':'Read-only projection; no claim, dispatch, POST, or state changes. State may lag source by up to snapshot age.'
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--id',action='append',required=True)
    p.add_argument('--max-age',type=int,default=120)
    a=p.parse_args()
    try:
        print(json.dumps(read(DEFAULT,a.id,a.max_age),ensure_ascii=False,indent=2));return 0
    except (ReadError,PermissionError,FileNotFoundError,OSError) as e:
        print(json.dumps({'result':'GATE_READONLY_BLOCKED','reason':str(e)}));return 2
if __name__=='__main__':raise SystemExit(main())
