#!/usr/bin/env python3
"""Read-only privacy-safe check. Never prints Telegram IDs, keys or token values."""
import json
import os
import sys
from pathlib import Path


def verify(obj):
    tg = obj.get('channels', {}).get('telegram', {})
    account = tg.get('accounts', {}).get('kalyanamitra', {})
    binds = obj.get('bindings', [])
    matching = [b for b in binds if isinstance(b, dict)
                and b.get('agentId') == 'kalyanamitra'
                and b.get('match', {}).get('channel') == 'telegram'
                and b.get('match', {}).get('accountId') == 'kalyanamitra']
    def list_classify(v):
        if not isinstance(v, list):
            return False, 'NOT_LIST'
        if len(v) != 1:
            return False, 'COUNT_NOT_ONE'
        s = str(v[0]).strip()
        if s in ('*', 'all', 'any', '0') or not s.isdecimal():
            return False, 'NOT_EXACT_NUMERIC_TELEGRAM_ID'
        return True, s
    gok, gid = list_classify(tg.get('allowFrom'))
    aok, aid = list_classify(account.get('allowFrom'))
    result = {'telegram_bot_configured': bool(account),
              'global_dm_allowlist': tg.get('dmPolicy') == 'allowlist',
              'account_dm_allowlist': account.get('dmPolicy') == 'allowlist',
              'global_sender_exact': gok,
              'account_sender_exact': aok,
              'sender_allowlists_match': gok and aok and gid == aid,
              'route_exactly_one': len(matching) == 1}
    result['status'] = 'CONFIG_BINDING_PASS' if all(result.values()) else 'BLOCKED'
    # Configuration can't prove authenticated sender metadata reaches bridge.
    result['runtime_sender_metadata_verified'] = False
    return result


def main():
    path = Path.home() / '.openclaw/openclaw.json'
    data = json.loads(path.read_text())
    print(json.dumps(verify(data), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
