#!/usr/bin/env python3
"""Hermes AI Office Stage 6: safely retire duplicate VPS2 OpenClaw user gateway.
No arbitrary remote execution; runs only on the expected VPS. Stdlib only.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys

SOURCE = 'VM-0-10-ubuntu'
TARGET = 'VM-4-5-ubuntu'
HOME = Path.home()
CFG = HOME / '.openclaw/openclaw.json'
MIGRATION = HOME / '.openclaw/hermes-stage4-migration/state.json'
STATE_DIR = HOME / '.local/state/hermes-stage6'
STATE = STATE_DIR / 'retirement.json'
UNIT = 'openclaw-gateway.service'
CORE = ['bazi-vps.service', 'caddy.service', 'cloudflared.service',
        'umkm-control.service', 'umkm-monetization.service',
        'umkm-pendampingan.service', 'umkm-updates.service',
        'umkm-activation.service']
USER_STAY = ['hermes-gateway.service']
USER_TIMERS = ['hermes-bazi-backup.timer', 'hermes-guardian-check.timer', 'hermes-guardian-external.timer']
SYS_TIMERS = ['umkm-backup.timer', 'umkm-content-worker.timer', 'umkm-publisher.timer', 'umkm-reconcile.timer']

class Stop(Exception): pass

def require(ok, msg):
    if not ok: raise Stop('STOP_AMAN: ' + msg)

def sh(args, timeout=45, required=False):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if required and p.returncode != 0:
        raise Stop('COMMAND_FAILED: '+str(args[:3])+': exit='+str(p.returncode))
    return p.stdout.strip(), p.returncode

def active(service, user=False):
    out, rc = sh(['systemctl'] + (['--user'] if user else []) + ['is-active', service])
    return rc == 0 and out == 'active'

def enabled(service, user=True):
    out, _ = sh(['systemctl'] + (['--user'] if user else []) + ['is-enabled', service])
    return out

def host(want):
    require(socket.gethostname() == want, 'WRONG_HOST: expected '+want)

def read_json(file):
    require(file.is_file() and not file.is_symlink(), 'FILE_NOT_FOUND_OR_SYMLINK: '+str(file))
    return json.loads(file.read_text(encoding='utf-8'))

def safe_config(hostname):
    cfg = read_json(CFG)
    t = cfg.get('channels', {}).get('telegram', {})
    require(isinstance(t, dict), 'TELEGRAM_CONFIG_MISSING')
    accounts = t.get('accounts', {})
    require(isinstance(accounts, dict), 'TELEGRAM_ACCOUNTS_BAD')
    if hostname == SOURCE:
        require(t.get('enabled') is False, 'VPS2_TELEGRAM_MUST_REMAIN_DISABLED')
        require(all(isinstance(a, dict) and a.get('enabled') is False for a in accounts.values()),
                'VPS2_NAMED_TELEGRAM_ACCOUNT_ENABLED')
        require(read_json(MIGRATION).get('phase') == 'source_off', 'SOURCE_MIGRATION_PHASE_NOT_SOURCE_OFF')
    else:
        require(t.get('enabled') is True, 'VPS4_TELEGRAM_NOT_ENABLED')
        require(set(accounts) == {'default','researcher','strategist','writer','reviewer','kalyanamitra','bazi-hermes'},
                'VPS4_SEVEN_TELEGRAM_ACCOUNTS_NOT_FOUND')
        require(all(isinstance(a,dict) and a.get('enabled') is True for a in accounts.values()),
                'VPS4_ACCOUNT_NOT_ENABLED')
        require(read_json(MIGRATION).get('phase') == 'target_active', 'TARGET_MIGRATION_PHASE_NOT_ACTIVE')
        bindings = [b for b in cfg.get('bindings', []) if isinstance(b,dict) and isinstance(b.get('match'),dict)
                    and b['match'].get('channel') == 'telegram']
        require(len(bindings) == 7, 'VPS4_TELEGRAM_BINDINGS_NOT_SEVEN')
    return cfg

def check_core():
    failures = []
    for service in CORE:
        if not active(service): failures.append(service)
    for service in USER_STAY:
        if not active(service, user=True): failures.append(service)
    for timer in USER_TIMERS:
        if not active(timer, user=True): failures.append(timer)
    for timer in SYS_TIMERS:
        if not active(timer): failures.append(timer)
    print('VPS2_PRODUCTION_CORE:', 'PASS' if not failures else 'MISSING: '+','.join(failures))
    require(not failures, 'VPS2_PRODUCTION_NOT_BASELINE_HEALTHY')

def established_port_peers(port=18789):
    out, rc = sh(['ss','-Htn','state','established'])
    if rc: return None
    return [line for line in out.splitlines() if re.search(r'(?<!\d):'+str(port)+r'(?!\d)', line)]

def unit_references():
    roots = [Path('/etc/systemd/system'), HOME/'.config/systemd/user',
             Path('/usr/lib/systemd/user'), Path('/lib/systemd/system')]
    flags = [b'openclaw-gateway.service', b'127.0.0.1:18789', b'localhost:18789', b'ws://127.0.0.1:18789']
    hits = []
    seen = set()
    for root in roots:
        if not root.is_dir(): continue
        for pattern in ('*.service','*.timer','*.socket'):
            for p in root.glob(pattern):
                if p.name == UNIT or str(p) in seen or p.is_symlink(): continue
                seen.add(str(p))
                try:
                    blob = p.read_bytes()
                except (PermissionError,OSError):
                    continue
                if any(f in blob for f in flags): hits.append(str(p))
    return hits

def preflight_vps2():
    host(SOURCE)
    safe_config(SOURCE)
    print('VPS2_TELEGRAM: disabled (7 bot already moved)')
    check_core()
    refs = unit_references()
    print('OPENCLAW_DEPENDENCY_REFERENCES_IN_OTHER_UNITS:', len(refs))
    for hit in refs[:10]: print('BLOCKER_UNIT:', hit)
    require(not refs, 'POSSIBLE_UNIT_DEPENDENCY_ON_OLD_GATEWAY')
    peers = established_port_peers()
    print('ESTABLISHED_PEERS_PORT_18789:', 'unknown' if peers is None else len(peers))
    require(peers is not None, 'CANNOT_AUDIT_ACTIVE_CONNECTIONS_NO_SS')
    require(not peers, 'ACTIVE_CLIENTS_CONNECTED_TO_OLD_GATEWAY')
    print('VPS2_RETIRE_PREFLIGHT_PASS')

def save_state(data):
    STATE_DIR.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(STATE_DIR,0o700)
    fd=os.open(str(STATE),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        json.dump(data,f,indent=2)
        f.write('\n')

def verify_stopped():
    require(not active(UNIT,user=True), 'OPENCLAW_VPS2_STILL_RUNNING')
    require(enabled(UNIT) in ('disabled','masked','static','indirect','not-found'),
            'OPENCLAW_VPS2_STILL_ENABLED')
    safe_config(SOURCE)
    check_core()
    print('VPS2_DUPLICATE_OPENCLAW_OFF: True')
    print('VPS2_PRODUCTION_PRESERVED_PASS')

def restore_unit(prior):
    if prior.get('enabled') == 'enabled':
        sh(['systemctl','--user','enable','--now',UNIT],required=True)
    elif prior.get('active'):
        sh(['systemctl','--user','start',UNIT],required=True)
    print('ROLLBACK_OLD_GATEWAY_UNIT_RESTORED')

def retire(args):
    require(args.confirm_target_ready, 'USE_--confirm-target-ready_AFTER_VPS4_VERIFIED')
    preflight_vps2()
    prior={'enabled':enabled(UNIT), 'active':active(UNIT,user=True)}
    require(prior['active'], 'OLD_GATEWAY_NOT_ACTIVE_OR_ALREADY_RETIRED')
    state={'timestamp_utc':datetime.now(timezone.utc).isoformat(),
           'previous':prior,'config_sha256':hashlib.sha256(CFG.read_bytes()).hexdigest(),
           'action':'retire_duplicate_openclaw_vps2', 'result':'attempted'}
    save_state(state)
    print('RETIRE_STATE_BACKUP:',STATE)
    try:
        sh(['systemctl','--user','disable','--now',UNIT],timeout=90,required=True)
        verify_stopped()
        state['result']='pass'
        STATE.write_text(json.dumps(state,indent=2)+'\n')
        os.chmod(STATE,0o600)
        print('STAGE6_VPS2_DUPLICATE_RETIRED_PASS')
    except Exception:
        print('RETIRE_CHECK_FAILED_ATTEMPT_ROLLBACK')
        try: restore_unit(prior)
        except Exception as e: print('URGENT_MANUAL_RECOVERY:',type(e).__name__)
        raise

def check_vps2(args):
    host(SOURCE)
    verify_stopped()
    print('STAGE6_VPS2_STATE_CHECK_PASS')

def rollback(args):
    host(SOURCE)
    safe_config(SOURCE)  # no duplicate Telegram polling even if rollback
    info=read_json(STATE)
    restore_unit(info['previous'])
    require(active(UNIT,user=True), 'ROLLBACK_GATEWAY_NOT_ACTIVE')
    print('STAGE6_VPS2_ROLLBACK_PASS (Telegram still disabled)')

def verify_vps4(args):
    host(TARGET)
    safe_config(TARGET)
    require(active(UNIT,user=True), 'VPS4_GATEWAY_NOT_ACTIVE')
    require(active('hermes-guardian-telegram.service',user=True), 'GUARDIAN_TELEGRAM_NOT_ACTIVE')
    print('VPS4_GATEWAY_TELEGRAM_7_ACCOUNTS_PASS')
    print('VPS4_GUARDIAN_TELEGRAM_PASS')
    bridge=HOME/'Hermes-Stage5-Bridge/stage5_bridge.py'
    require(bridge.is_file(), 'STAGE5_BRIDGE_VERIFY_SCRIPT_MISSING')
    output,rc=sh([sys.executable,str(bridge),'verify-vps4'],timeout=110)
    for line in output.splitlines():
        if re.match(r'^(BRIDGE_|BAZI_|UMKM_|PORT_|REMOTE_|STAGE5_)',line):print(line)
    require(rc==0 and 'STAGE5_BRIDGE_E2E_PASS' in output, 'STAGE5_BRIDGE_REGRESSION_FAILED')
    print('STAGE6_VPS4_PRODUCTION_BRIDGE_PASS')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='action',required=True)
    sub.add_parser('verify-vps4')
    pp=sub.add_parser('retire-vps2')
    pp.add_argument('--confirm-target-ready',action='store_true')
    sub.add_parser('check-vps2')
    sub.add_parser('rollback-vps2')
    args=parser.parse_args()
    try:
        {'verify-vps4':verify_vps4, 'retire-vps2':retire,
         'check-vps2':check_vps2,'rollback-vps2':rollback}[args.action](args)
    except Stop as e:
        print(str(e)); return 2
    except (subprocess.TimeoutExpired, OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        print('STOP_AMAN: unexpected_'+type(e).__name__);return 3
    return 0

if __name__=='__main__': sys.exit(main())
