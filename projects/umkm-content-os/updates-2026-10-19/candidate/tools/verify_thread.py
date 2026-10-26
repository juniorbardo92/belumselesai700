#!/usr/bin/env python3
"""Thread publication verifier (GET-only).

Resolves a Repliz thread root by exact text match against the paginated content
listing, then verifies every reply by ID via the Content API. Produces JSON
evidence with explicit PASS/BLOCKED per element. Never POSTs, never writes DB.

Usage:
  verify_thread.py --env /opt/umkm-engine/.env.publisher \
      --account-id 6a8e... --schedule-id 6ad3... --out evidence.json
  verify_thread.py --from-json schedule.json --env ... --account-id ... --out ...
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

import requests
from requests.auth import HTTPBasicAuth

BASE = 'https://api.repliz.com/public'


def load_env(path: str) -> dict:
    out = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        s = line.strip()
        if s and not s.startswith('#') and '=' in s:
            k, v = s.split('=', 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def norm(s) -> str:
    if not isinstance(s, str):
        return ''
    return ' '.join(unicodedata.normalize('NFKC', s).split())


def parse_ts(v):
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        dt = datetime.fromisoformat(v.strip().replace('Z', '+00:00'))
        return dt if dt.tzinfo else None
    except (ValueError, TypeError):
        return None


def url_ok(u: str, username: str) -> bool:
    if not isinstance(u, str):
        return False
    try:
        p = urlsplit(u)
    except ValueError:
        return False
    return (p.scheme == 'https' and p.hostname in {'www.threads.com', 'threads.com'}
            and p.username is None and p.password is None and p.port is None
            and not p.query and not p.fragment
            and p.path.rstrip('/').count('/') == 3
            and p.path.lower().startswith(f'/@{username.lower()}/post/'))


def fetch_listing(session, auth, account_id, max_pages=30):
    docs, token, pages, errors = {}, None, [], []
    for page in range(1, max_pages + 1):
        params = {'accountId': account_id}
        if token:
            params['nextToken'] = token
        r = session.get(BASE + '/content', params=params, auth=auth, timeout=60, allow_redirects=False)
        pages.append({'page': page, 'status': r.status_code, 'bytes': len(r.content)})
        if r.status_code != 200:
            errors.append(f'LISTING_HTTP_{r.status_code}')
            break
        j = r.json()
        new = 0
        for d in j.get('docs') or []:
            if d.get('id') and d['id'] not in docs:
                docs[d['id']] = d
                new += 1
        token = j.get('nextToken')
        if not token or new == 0:
            break
        time.sleep(0.3)
    return docs, pages, errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--env', required=True)
    ap.add_argument('--account-id', required=True)
    ap.add_argument('--username', required=True)
    ap.add_argument('--owner-id', required=True,
                    help='stable Threads owner id, e.g. schedule.account.generatedId')
    ap.add_argument('--schedule-id')
    ap.add_argument('--from-json')
    ap.add_argument('--out', required=True)
    ap.add_argument('--listing-json', help='pre-fetched content dump to reuse instead of paging again')
    ap.add_argument('--expect-replies', type=int, default=None)
    args = ap.parse_args()

    cfg = load_env(args.env)
    auth = HTTPBasicAuth(cfg['REPLIZ_ACCESS_KEY'], cfg['REPLIZ_SECRET_KEY'])
    s = requests.Session()
    ev = {'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          'account_id': args.account_id, 'username': args.username, 'owner_id': args.owner_id,
          'schedule_id': args.schedule_id, 'method': 'GET_ONLY', 'post': 0}

    if args.from_json:
        sch = json.loads(Path(args.from_json).read_text(encoding='utf-8'))
    else:
        r = s.get(f'{BASE}/schedule/{args.schedule_id}', auth=auth, timeout=40, allow_redirects=False)
        ev['schedule_http'] = r.status_code
        if r.status_code != 200:
            ev['result'] = 'BLOCKED'
            ev['reason'] = f'SCHEDULE_HTTP_{r.status_code}'
            Path(args.out).write_text(json.dumps(ev, ensure_ascii=False, indent=1), encoding='utf-8')
            print(ev['reason'])
            return 2
        sch = r.json()

    sch = sch.get('data', sch) if isinstance(sch.get('data'), dict) else (sch.get('schedule', sch) if isinstance(sch.get('schedule'), dict) else sch)
    ev['schedule_status'] = sch.get('status')
    ev['schedule_post_id_field'] = str(sch.get('postId') or '')
    ev['schedule_at'] = sch.get('scheduleAt')

    if args.listing_json:
        dump = json.loads(Path(args.listing_json).read_text(encoding='utf-8'))
        docs = {d['id']: d for d in dump['docs'] if d.get('id')}
        pages, lerr = dump.get('pages', []), []
    else:
        docs, pages, lerr = fetch_listing(s, auth, args.account_id)
    ev['listing'] = {'docs': len(docs), 'pages': pages, 'errors': lerr}

    root_text = norm(sch.get('description'))
    hits = [d for d in docs.values() if norm(d.get('description')) == root_text]
    ev['root'] = {'text_len': len(root_text), 'matches': len(hits)}
    root_ok = False
    if len(hits) == 1:
        h = hits[0]
        ok_owner = isinstance(h.get('owner'), dict) and str(h['owner'].get('id') or '') == str(args.owner_id)
        ok_url = url_ok(h.get('url'), args.username)
        ok_ts = parse_ts(h.get('createdAt')) is not None
        root_ok = ok_owner and ok_url and ok_ts
        ev['root'].update({'id': h['id'], 'url': h.get('url'), 'createdAt': h.get('createdAt'),
                           'owner': (h.get('owner') or {}).get('name'),
                           'owner_ok': ok_owner, 'url_ok': ok_url, 'created_at_ok': ok_ts})
    else:
        ev['root']['reason'] = 'ROOT_TEXT_MATCH_NOT_UNIQUE' if hits else 'ROOT_TEXT_NOT_FOUND'
    ev['root']['result'] = 'PASS' if root_ok else 'BLOCKED'

    reps = sch.get('replies') or []
    rows, ids = [], []
    for i, x in enumerate(reps):
        pid = str(x.get('postId') or '')
        row = {'index': i, 'schedule_post_id': pid, 'schedule_status': x.get('status'),
               'schedule_text_len': len(norm(x.get('description')))}
        ids.append(pid)
        if not pid:
            row['result'] = 'BLOCKED'; row['reason'] = 'MISSING_POST_ID'; rows.append(row); continue
        rr = s.get(f'{BASE}/content/{pid}', params={'accountId': args.account_id}, auth=auth,
                   timeout=40, allow_redirects=False)
        row['content_http'] = rr.status_code
        if rr.status_code != 200:
            row['result'] = 'BLOCKED'; row['reason'] = f'CONTENT_HTTP_{rr.status_code}'; rows.append(row); continue
        c = rr.json()
        c = c.get('data', c) if isinstance(c.get('data'), dict) else c
        ok_id = str(c.get('id') or '') == pid
        ok_owner = isinstance(c.get('owner'), dict) and str(c['owner'].get('id') or '') == str(args.owner_id)
        ok_url = url_ok(c.get('url'), args.username)
        ok_ts = parse_ts(c.get('createdAt')) is not None
        ok_text = norm(c.get('description')) == norm(x.get('description'))
        row.update({'id': c.get('id'), 'url': c.get('url'), 'createdAt': c.get('createdAt'),
                    'id_ok': ok_id, 'owner_ok': ok_owner, 'url_ok': ok_url,
                    'created_at_ok': ok_ts, 'text_match': ok_text,
                    'content_status': c.get('status') or c.get('publishStatus')})
        ok = ok_id and ok_owner and ok_url and ok_ts and ok_text and (x.get('status') == 'success')
        row['result'] = 'PASS' if ok else 'BLOCKED'
        if not ok:
            row['reason'] = ('TEXT_MISMATCH' if not ok_text else
                             'ID_MISMATCH' if not ok_id else
                             'OWNER_MISMATCH' if not ok_owner else
                             'URL_INVALID' if not ok_url else
                             'CREATED_AT_INVALID' if not ok_ts else 'SCHEDULE_STATUS_NOT_SUCCESS')
        rows.append(row)

    order_ok = True
    stamps = [parse_ts(r.get('createdAt')) for r in rows]
    for a, b in zip(stamps, stamps[1:]):
        if a and b and not (a <= b):
            order_ok = False
    ev['replies'] = {'count': len(rows), 'unique_ids': len(set(ids)), 'order_nondecreasing': order_ok,
                     'rows': rows}
    ev['duplicate_post_ids'] = sorted({p for p in ids if ids.count(p) > 1})
    # schedule.postId is the provider's own field; record whether it is the root or a reply
    ev['post_id_field_role'] = ('ROOT' if hits and str(ev['schedule_post_id_field']) == hits[0]['id']
                                else 'REPLY' if ev['schedule_post_id_field'] in ids else 'UNKNOWN')

    all_reps = all(r['result'] == 'PASS' for r in rows)
    ev['thread_complete'] = bool(root_ok and all_reps and len(rows) == len(set(ids))
                                 and not ev['duplicate_post_ids'])
    ev['result'] = 'PASS' if ev['thread_complete'] else 'BLOCKED'
    Path(args.out).write_text(json.dumps(ev, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({'result': ev['result'], 'root': ev['root'].get('result'),
                      'replies_pass': sum(1 for r in rows if r['result'] == 'PASS'),
                      'replies_total': len(rows), 'post_id_field_role': ev['post_id_field_role'],
                      'duplicates': ev['duplicate_post_ids']}, ensure_ascii=False))
    return 0 if ev['result'] == 'PASS' else 2


if __name__ == '__main__':
    sys.exit(main())
