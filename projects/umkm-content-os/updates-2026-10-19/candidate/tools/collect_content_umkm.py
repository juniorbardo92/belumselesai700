#!/usr/bin/env python3
"""GET-only collector: all Repliz content docs for the UMKM Threads account.

No POST, no DB write. Saves paged evidence to a JSON file.
Handles nextToken pagination and records response sizes (oversized-response evidence).
"""
import json
import sys
import time
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/handoff/content_dump_umkm.json')
MAX_PAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 40

cfg = {}
for line in Path('/opt/umkm-engine/.env.publisher').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        cfg[k.strip()] = v.strip().strip('"\'')
AUTH = HTTPBasicAuth(cfg['REPLIZ_ACCESS_KEY'], cfg['REPLIZ_SECRET_KEY'])
ACC = cfg['REPLIZ_THREADS_ACCOUNT_ID']
BASE = 'https://api.repliz.com/public'

s = requests.Session()
docs = {}
token = None
meta = []
for page in range(1, MAX_PAGES + 1):
    params = {'accountId': ACC}
    if token:
        params['nextToken'] = token
    r = s.get(BASE + '/content', params=params, auth=AUTH, timeout=60, allow_redirects=False)
    size = len(r.content)
    if r.status_code != 200:
        meta.append({'page': page, 'status': r.status_code, 'bytes': size})
        print(f'page {page}: HTTP {r.status_code} bytes={size} body={r.text[:200]!r}')
        break
    j = r.json()
    batch = j.get('docs') or []
    new = 0
    for d in batch:
        if d.get('id') and d['id'] not in docs:
            docs[d['id']] = d
            new += 1
    token = j.get('nextToken')
    meta.append({'page': page, 'status': 200, 'bytes': size, 'docs': len(batch), 'new': new, 'has_next': bool(token)})
    print(f'page {page}: bytes={size} docs={len(batch)} new={new} has_next={bool(token)} total={len(docs)}', flush=True)
    if not token or new == 0:
        break
    time.sleep(0.5)

payload = {'account_id': ACC, 'collected_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'pages': meta, 'count': len(docs), 'docs': list(docs.values())}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8')
print('WROTE', OUT, 'docs', len(docs), 'bytes', OUT.stat().st_size)
print('max_response_bytes', max((m['bytes'] for m in meta), default=0))
print('min_created', min((d.get('createdAt') or '') for d in docs.values()) if docs else None)
print('max_created', max((d.get('createdAt') or '') for d in docs.values()) if docs else None)
