#!/usr/bin/env python3
"""Trusted-owner Telegram -> forced-SSH V3 receiver. No Repliz keys on VPS4."""
import argparse, json, os, re, secrets, stat, subprocess, sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
import kalauto

HOME=Path.home()
SSH_ROOT=HOME/'.local/share/kalauto-ssh-stage'
CONFIG=SSH_ROOT/'schedule.json'
SECRET=SSH_ROOT/'kalauto-hmac.key'
OPENCLAW=HOME/'.openclaw/openclaw.json'
ACCOUNT=kalauto.ACCOUNT

def owner_from_openclaw():
    data=json.loads(OPENCLAW.read_text())
    tg=data['channels']['telegram']
    account=tg['accounts']['kalyanamitra']
    if tg.get('dmPolicy')!='allowlist' or account.get('dmPolicy')!='allowlist':
        raise kalauto.Blocked('TELEGRAM_ALLOWLIST_OFF')
    def normalized(items):
        if not isinstance(items,list) or len(items)!=1:raise kalauto.Blocked('SENDER_BINDING_NOT_UNIQUE')
        m=re.fullmatch(r'(?:telegram:)?([0-9]{2,20})',str(items[0]))
        if not m: raise kalauto.Blocked('SENDER_ID_INVALID')
        return m.group(1)
    glob=normalized(tg['allowFrom'])
    local=normalized(account['allowFrom'])
    if glob!=local:raise kalauto.Blocked('SENDER_ALLOWLIST_MISMATCH')
    routes=[x for x in data.get('bindings',[]) if x.get('agentId')=='kalyanamitra' and
            x.get('match',{}).get('channel')=='telegram' and x.get('match',{}).get('accountId')=='kalyanamitra']
    if len(routes)!=1:raise kalauto.Blocked('BOT_ROUTING_MISMATCH')
    return glob

def load_config():
    if CONFIG.is_symlink() or not CONFIG.is_file():raise kalauto.Blocked('SCHEDULE_NOT_BOOTSTRAPPED')
    st=CONFIG.stat()
    if st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o600:raise kalauto.Blocked('UNSAFE_CONFIG_PERMISSIONS')
    cfg=json.loads(CONFIG.read_text())
    if cfg.get('owner_id')!=owner_from_openclaw():raise kalauto.Blocked('OWNER_CONFIG_CHANGED')
    return cfg

def ssh_send(host,doc):
    if not re.fullmatch(r'(?:[0-9]{1,3}\.){3}[0-9]{1,3}',host):raise kalauto.Blocked('IPV4_REQUIRED')
    root=SSH_ROOT
    key=root/'id_ed25519'; pin=root/'known_hosts'
    if not key.is_file() or not pin.is_file() or not any(line.startswith(host+' ') for line in pin.read_text().splitlines()):
        raise kalauto.Blocked('PINNED_SSH_TRANSPORT_MISSING')
    cmd=['ssh','-T','-i',str(key),'-o','UserKnownHostsFile='+str(pin),'-o','StrictHostKeyChecking=yes',
         '-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','PasswordAuthentication=no',
         '-o','KbdInteractiveAuthentication=no','-o','ClearAllForwardings=yes',
         '-o','ConnectTimeout=10','-o','ConnectionAttempts=1','kalauto-intake@'+host]
    raw=json.dumps(doc,ensure_ascii=False,separators=(',',':'))
    if len(raw.encode())>65536:raise kalauto.Blocked('PAYLOAD_TOO_LARGE')
    try: r=subprocess.run(cmd,input=raw,text=True,capture_output=True,timeout=35)
    except subprocess.TimeoutExpired:raise kalauto.Blocked('SSH_TIMEOUT_CHECK_STATUS_BEFORE_RETRY')
    try:result=json.loads(r.stdout)
    except ValueError:raise kalauto.Blocked('NO_REMOTE_RECEIPT')
    if r.returncode!=0 or result.get('status')=='BLOCKED':
        raise kalauto.Blocked('REMOTE_'+str(result.get('reason','SSH_FAILURE')))
    return result

def write_private(path,contents):
    if path.exists():raise kalauto.Blocked('CONFIG_ALREADY_PRESENT')
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as out:out.write(contents);out.flush();os.fsync(out.fileno())

def bootstrap(host):
    if CONFIG.exists():raise kalauto.Blocked('ALREADY_BOOTSTRAPPED')
    owner=owner_from_openclaw()
    SSH_ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    if not SECRET.exists():write_private(SECRET,secrets.token_hex(32)+'\n')
    token=SECRET.read_text().strip()
    result=ssh_send(host,{'operation':'BOOTSTRAP','owner_id':owner,'secret':token})
    if result.get('status')!='BOOTSTRAP_READY':raise kalauto.Blocked('BOOTSTRAP_RECEIPT_INVALID')
    write_private(CONFIG,json.dumps({'owner_id':owner,'host':host},sort_keys=True))
    return {'status':'SIGNED_BRIDGE_BOOTSTRAPPED','receiver_configured':True,'publisher_enabled':False}

def execute(action,arg):
    cfg=load_config()
    os.environ.update({'KAL_AUTO_OWNER_ID':cfg['owner_id'],'KAL_AUTO_HMAC_FILE':str(SECRET)})
    if action=='submit':
        file=Path(arg)
        if not file.is_file() or file.is_symlink() or file.stat().st_size>60000:
            raise kalauto.Blocked('INVALID_PAYLOAD_FILE')
        p=json.loads(file.read_text())
        if not isinstance(p,dict):raise kalauto.Blocked('INVALID_PAYLOAD')
        p=dict(p);p['owner_id']=cfg['owner_id'];p['account_id']=ACCOUNT
        kalauto.validate_payload(p)
        doc=kalauto.sign_payload(p)
    elif action=='status':
        if not re.fullmatch(r'KAL-AUTO-[A-F0-9]{20}',arg):raise kalauto.Blocked('INVALID_JOB_ID')
        doc=kalauto.sign_payload({'operation':'STATUS','owner_id':cfg['owner_id'],'job_id':arg})
    else:raise kalauto.Blocked('UNKNOWN_ACTION')
    result=ssh_send(cfg['host'],doc)
    if action=='submit' and result.get('status') not in ('ACCEPTED_NO_PUBLISH','DUPLICATE_NO_POST'):
        raise kalauto.Blocked('SUBMIT_RESPONSE_INVALID')
    if action=='status' and result.get('status')!='STATUS_OK':
        raise kalauto.Blocked('STATUS_RESPONSE_INVALID')
    return result

def main(argv=None):
    ap=argparse.ArgumentParser()
    sub=ap.add_subparsers(dest='command',required=True)
    sub.add_parser('bootstrap').add_argument('ip')
    sub.add_parser('submit').add_argument('json_file')
    sub.add_parser('status').add_argument('job_id')
    args=ap.parse_args(argv)
    try:
        if args.command=='bootstrap':out=bootstrap(args.ip)
        elif args.command=='submit':out=execute('submit',args.json_file)
        else:out=execute('status',args.job_id)
        print(json.dumps(out,ensure_ascii=False));return 0
    except (kalauto.Blocked,ValueError,KeyError,OSError,subprocess.SubprocessError) as exc:
        print(json.dumps({'status':'BLOCKED','reason':exc.code if isinstance(exc,kalauto.Blocked) else type(exc).__name__}));return 3

if __name__=='__main__':raise SystemExit(main())
