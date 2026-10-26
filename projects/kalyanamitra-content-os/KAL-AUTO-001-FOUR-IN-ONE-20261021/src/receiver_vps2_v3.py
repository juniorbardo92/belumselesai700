#!/usr/bin/env python3
"""KAL-AUTO-001 VPS2 forced SSH receiver V3.
Bootstraps once using an already-pinned, forced-command SSH key. After bootstrap,
accepts only HMAC-signed SCHEDULE/DRAFT jobs and signed STATUS queries.
Never calls Repliz; a separate VPS2 single-writer service handles scheduling.
"""
import json, os, re, stat, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kalauto

CONFIG_PATH=Path('/var/lib/kal-auto-intake/receiver.env')
KEY_PATH=Path('/var/lib/kal-auto-intake/hmac.key')
DATA_PATH=Path('/var/lib/kal-auto-intake/state/kalauto')
ALLOWED={'KAL_AUTO_OWNER_ID','KAL_AUTO_HMAC_FILE','KAL_AUTO_DATA_DIR'}


def _private(path):
    if path.is_symlink(): raise kalauto.Blocked('SYMLINK_FORBIDDEN')
    st=path.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o600:
        raise kalauto.Blocked('UNSAFE_PRIVATE_FILE')
    return path.read_text(encoding='utf-8')


def _write_once(path,content):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            f.write(content); f.flush(); os.fsync(f.fileno())
    except BaseException:
        try: path.unlink()
        except OSError: pass
        raise


def bootstrap(doc):
    if CONFIG_PATH.exists() or KEY_PATH.exists():raise kalauto.Blocked('BOOTSTRAP_ALREADY_PROVISIONED')
    if set(doc)!={'operation','owner_id','secret'} or doc.get('operation')!='BOOTSTRAP':
        raise kalauto.Blocked('INVALID_BOOTSTRAP')
    owner=str(doc.get('owner_id',''))
    secret=doc.get('secret','')
    if not re.fullmatch(r'[0-9]{2,20}',owner) or not isinstance(secret,str) or not re.fullmatch(r'[a-f0-9]{64,128}',secret):
        raise kalauto.Blocked('BOOTSTRAP_FIELDS_INVALID')
    home=CONFIG_PATH.parent
    if home.stat().st_uid!=os.geteuid() or stat.S_IMODE(home.stat().st_mode)!=0o700:
        raise kalauto.Blocked('INTAKE_HOME_UNSAFE')
    DATA_PATH.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(DATA_PATH,0o700)
    _write_once(KEY_PATH, secret+'\n')
    config=f'KAL_AUTO_OWNER_ID={owner}\nKAL_AUTO_HMAC_FILE={KEY_PATH}\nKAL_AUTO_DATA_DIR={DATA_PATH}\n'
    _write_once(CONFIG_PATH,config)
    return {'status':'BOOTSTRAP_READY','writer':'NOT_ENABLED','repliz_posts':0}


def private_config():
    try: raw=_private(CONFIG_PATH)
    except FileNotFoundError:raise kalauto.Blocked('RECEIVER_CONFIG_NOT_PROVISIONED')
    if len(raw)>4096:raise kalauto.Blocked('CONFIG_TOO_LARGE')
    cfg={}
    for line in raw.splitlines():
        if not line or line.startswith('#'):continue
        if '=' not in line:raise kalauto.Blocked('INVALID_CONFIG_LINE')
        k,v=line.split('=',1)
        if k not in ALLOWED or k in cfg or not v:raise kalauto.Blocked('INVALID_CONFIG_LINE')
        cfg[k]=v
    if set(cfg)!=ALLOWED:raise kalauto.Blocked('MISSING_RECEIVER_CONFIG')
    if cfg['KAL_AUTO_HMAC_FILE']!=str(KEY_PATH) or cfg['KAL_AUTO_DATA_DIR']!=str(DATA_PATH):
        raise kalauto.Blocked('CONFIG_PATH_MISMATCH')
    if not re.fullmatch(r'[0-9]{2,20}',cfg['KAL_AUTO_OWNER_ID']):raise kalauto.Blocked('INVALID_OWNER_CONFIG')
    _private(KEY_PATH)
    os.environ.update(cfg)
    return cfg


def receive(stream=None):
    if os.environ.get('SSH_ORIGINAL_COMMAND'):
        raise kalauto.Blocked('REMOTE_COMMAND_FORBIDDEN')
    raw=(stream or sys.stdin.buffer).read(65537)
    if len(raw)>65536:raise kalauto.Blocked('PAYLOAD_TOO_LARGE')
    if not raw:raise kalauto.Blocked('EMPTY_REQUEST')
    try: doc=json.loads(raw)
    except (ValueError,UnicodeError):raise kalauto.Blocked('INVALID_JSON')
    if not isinstance(doc,dict):raise kalauto.Blocked('INVALID_DOCUMENT')
    if doc.get('operation')=='BOOTSTRAP':
        return bootstrap(doc)
    cfg=private_config()
    payload=kalauto.verify_envelope(doc)
    if isinstance(payload,dict) and payload.get('operation')=='STATUS':
        if set(payload)!={'operation','owner_id','job_id'} or str(payload['owner_id'])!=cfg['KAL_AUTO_OWNER_ID']:
            raise kalauto.Blocked('STATUS_OWNER_MISMATCH')
        return {'status':'STATUS_OK', **kalauto.status(payload['job_id'])}
    result=kalauto.ingest(doc)
    return {k:result[k] for k in ('status','job_id','state','slot_utc') if k in result}


def main():
    try:
        print(json.dumps(receive(),ensure_ascii=False));return 0
    except Exception as exc:
        print(json.dumps({'status':'BLOCKED','reason':exc.code if isinstance(exc,kalauto.Blocked) else 'RECEIVER_INTERNAL_ERROR'}))
        return 3

if __name__=='__main__':raise SystemExit(main())
