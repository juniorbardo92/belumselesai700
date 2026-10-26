#!/usr/bin/env python3
"""One-time Telegram notifier token handoff via EXISTING signed forced SSH channel.
Never prints the token or writes a copy to disk on VPS4.
"""
import json, os, re, sys, getpass
from pathlib import Path

TOOLS=Path.home()/'.openclaw/workspace-kalyanamitra/tools'
sys.path.insert(0,str(TOOLS))
import kalauto_v3_core as core
import kalauto_schedule_v3 as sender

def get_token():
    d=json.loads((Path.home()/'.openclaw/openclaw.json').read_text())
    acct=d.get('channels',{}).get('telegram',{}).get('accounts',{}).get('kalyanamitra',{})
    for key in ('botToken','token'):
        v=acct.get(key)
        if isinstance(v,str) and re.fullmatch(r'[0-9]{6,12}:[A-Za-z0-9_-]{25,}',v):return v
    v=os.environ.get('KAL_AUTO_BOT_TOKEN', '')
    if re.fullmatch(r'[0-9]{6,12}:[A-Za-z0-9_-]{25,}',v): return v
    # Input remains entirely inside VPS4 terminal; the token is never printed.
    # Used if OpenClaw stores the token as a SecretRef rather than plaintext.
    if sys.stdin.isatty():
        v=getpass.getpass('Bot token Kalyanamitra (input tersembunyi, kosong=batalkan): ')
        if re.fullmatch(r'[0-9]{6,12}:[A-Za-z0-9_-]{25,}',v): return v
    raise core.Blocked('BOT_TOKEN_NOT_AVAILABLE')

def main():
    try:
        cfg=sender.load_config()
        token=get_token()
        os.environ['KAL_AUTO_HMAC_FILE']=str(sender.SECRET)
        doc=core.sign_payload({'operation':'PROVISION_NOTIFY','owner_id':cfg['owner_id'],
                               'chat_id':cfg['owner_id'],'bot_token':token})
        out=sender.ssh_send(cfg['host'],doc)
        if out.get('status')!='TELEGRAM_NOTIFY_CONFIGURED':raise core.Blocked('PROVISION_RECEIPT_INVALID')
        print(json.dumps({'status':'TELEGRAM_NOTIFY_CONFIGURED','repliz_post':0}));return 0
    except (core.Blocked,OSError,ValueError,KeyError) as e:
        print(json.dumps({'status':'BLOCKED','reason':e.code if isinstance(e,core.Blocked) else type(e).__name__}));return 3

if __name__=='__main__':raise SystemExit(main())
