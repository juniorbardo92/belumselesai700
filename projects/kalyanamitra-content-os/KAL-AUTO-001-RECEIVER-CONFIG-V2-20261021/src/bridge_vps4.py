#!/usr/bin/env python3
"""Outbound-only VPS4 -> VPS2 via pinned-host SSH forced-command.
IMPORTANT: this helper trusts ingress from a separately enforced OpenClaw Telegram
sender allowlist; it cannot infer authenticated sender metadata from a text file.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
from kalauto import ACCOUNT, Blocked, sign_payload, validate_payload

def main():
    try:
        if os.environ.get('KAL_AUTO_TRANSPORT_ENABLED')!='true':raise Blocked('TRANSPORT_KILL_SWITCH_OFF')
        if os.environ.get('KAL_AUTO_VERIFIED_TELEGRAM_PEER')!='true':
            raise Blocked('TRUSTED_TELEGRAM_PEER_BINDING_UNVERIFIED')
        host=os.environ.get('KAL_AUTO_VPS2_SSH_HOST')
        key=os.environ.get('KAL_AUTO_SSH_KEY_FILE')
        if not host or not key or not Path(key).is_file(): raise Blocked('SSH_TRANSPORT_NOT_CONFIGURED')
        # host must be numeric IPv4/IPv6 or restricted DNS label, not command options.
        import re
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.:-]{0,250}',host):raise Blocked('INVALID_SSH_HOST')
        raw=sys.stdin.buffer.read(65537)
        if len(raw)>65536:raise Blocked('PAYLOAD_TOO_LARGE')
        p=json.loads(raw)
        # Server-side fixed owner ID; never trust a name/ID included by an uploaded document.
        p['owner_id']=os.environ['KAL_AUTO_OWNER_ID']
        p['account_id']=ACCOUNT
        validate_payload(p)
        envelope=sign_payload(p)
        cmd=['ssh','-T','-i',key,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',
             '-o','ClearAllForwardings=yes','kalauto-intake@'+host]
        r=subprocess.run(cmd,input=json.dumps(envelope,ensure_ascii=False),capture_output=True,text=True,timeout=35)
        if r.returncode!=0:raise Blocked('REMOTE_INGEST_FAILED_NO_POST')
        # Ignore/never echo untrusted remote output that may contain secrets.
        obj=json.loads(r.stdout)
        if obj.get('status') not in ('ACCEPTED_NO_PUBLISH','DUPLICATE_NO_POST','BLOCKED'):
            raise Blocked('REMOTE_RESPONSE_UNEXPECTED')
        result={k:obj.get(k) for k in ('status','job_id','state','slot_utc','reason') if k in obj}
        print(json.dumps(result,ensure_ascii=False))
        return 0 if obj.get('status')!='BLOCKED' else 3
    except (Blocked,KeyError,ValueError,subprocess.TimeoutExpired, OSError,json.JSONDecodeError) as ex:
        code=ex.code if isinstance(ex,Blocked) else type(ex).__name__.upper()
        print(json.dumps({'status':'BLOCKED','reason':code}))
        return 3

if __name__=='__main__':raise SystemExit(main())
