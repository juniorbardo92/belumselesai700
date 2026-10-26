#!/usr/bin/env python3
"""Offline regression tests for the R2 reconciler.

No network, no production database. Fixtures are anonymised captures of two real
UMKM threads (root + 7 replies) from 17-18 October 2026.
"""
import copy
import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
FIX = Path(__file__).resolve().parent / 'fixtures'

_cand = [BASE / 'reconcile_repliz.py', BASE / 'code' / 'reconcile_repliz.py']
_modpath = next(p for p in _cand if p.is_file())
spec = importlib.util.spec_from_file_location('reconcile_r2', _modpath)
rec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rec)

ACCOUNT = '6a8e2fc362caae1e04063419'
OWNER = '28108610098795775'
USERNAME = 'umkmnaikkelas.id'

SCHED = json.loads((FIX / 'UMKM-AUTO-20261017-01.schedule.json').read_text())
DOCS = json.loads((FIX / 'UMKM-AUTO-20261017-01.docs.json').read_text())
DOC_BY_ID = {d['id']: d for d in DOCS}


def root_doc():
    """Root is the doc whose description equals the schedule description."""
    want = rec.normalize_text(SCHED['description'])
    return next(d for d in DOCS if rec.normalize_text(d['description']) == want)


# --------------------------------------------------------------------------- #
# HTTP double
# --------------------------------------------------------------------------- #
class Resp:
    def __init__(self, status=200, payload=None, headers=None, raw=None):
        self.status_code = status
        self._payload = payload
        self.headers = headers or {}
        self.text = raw if raw is not None else json.dumps(payload or {})
        self.content = self.text.encode()

    def json(self):
        if self._payload is None:
            raise ValueError('no json')
        return copy.deepcopy(self._payload)


class FakeSession:
    """Routes GETs to fixture payloads and records every request."""

    def __init__(self, docs=None, listing=None, schedule=None, script=None):
        self.docs = docs if docs is not None else DOC_BY_ID
        self.listing = listing if listing is not None else [root_doc()]
        self.schedule = schedule if schedule is not None else SCHED
        self.calls = []
        self.script = script or []

    def get(self, url, params=None, auth=None, timeout=None, allow_redirects=None):
        self.calls.append((url, params))
        if self.script:
            nxt = self.script.pop(0)
            if isinstance(nxt, Exception):
                raise nxt
            return nxt
        if '/schedule/' in url:
            return Resp(200, self.schedule)
        if url.endswith('/content'):
            page = (params or {}).get('page', 0)
            return Resp(200, {'docs': self.listing, 'nextToken': None})
        if '/content/' in url:
            cid = url.rsplit('/', 1)[1]
            if cid in self.docs:
                return Resp(200, self.docs[cid])
            return Resp(404, {'code': 404, 'message': 'not found'})
        return Resp(500, {'error': 'unrouted'})


def make_index(session, docs):
    index = rec.ContentIndex(session, None, ACCOUNT)
    for d in docs:
        index.docs[d['id']] = d
        index.by_text.setdefault(rec.normalize_text(d.get('description')), []).append(d)
    index.loaded = True
    return index


def prove(schedule=None, docs=None, session=None, **kw):
    schedule = schedule if schedule is not None else SCHED
    docs = docs if docs is not None else DOCS
    session = session or FakeSession(docs=DOC_BY_ID)
    index = make_index(session, docs)
    args = dict(owner_id=OWNER, username=USERNAME, account_id=ACCOUNT)
    args.update(kw)
    return rec.prove_thread(index, schedule, **args)


# --------------------------------------------------------------------------- #
# Database fixture
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE umkm_content_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  priority INTEGER DEFAULT 100,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  output_path TEXT,
  review_status TEXT,
  note TEXT,
  last_error TEXT,
  publish_status TEXT,
  repliz_schedule_id TEXT,
  scheduled_at TEXT,
  published_at TEXT,
  publish_attempts INTEGER DEFAULT 0,
  publish_error TEXT,
  repliz_post_id TEXT,
  platform_status TEXT,
  last_reconciled_at TEXT,
  reconcile_attempts INTEGER DEFAULT 0,
  reconcile_error TEXT,
  UNIQUE(content_id)
);
"""


class DbCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.dbpath = self.dir / 'system.db'
        con = sqlite3.connect(self.dbpath)
        con.executescript(SCHEMA)
        con.commit()
        con.close()
        self._saved = (rec.DB, rec.RESPONSES, rec.PROMOTE, rec.PUBLISHED_AT_SOURCE,
                       rec.INCLUDE_READY, rec.requests)
        rec.DB = self.dbpath
        rec.RESPONSES = self.dir / 'responses'
        rec.RESPONSES.mkdir()
        rec.PROMOTE = False
        rec.PUBLISHED_AT_SOURCE = ''
        rec.INCLUDE_READY = True
        for k, v in {'REPLIZ_ACCESS_KEY': 'ak-test', 'REPLIZ_SECRET_KEY': 'sk-test',
                     'REPLIZ_THREADS_ACCOUNT_ID': ACCOUNT,
                     'REPLIZ_THREADS_OWNER_ID': OWNER,
                     'REPLIZ_THREADS_USERNAME': USERNAME}.items():
            os.environ[k] = v

    def tearDown(self):
        (rec.DB, rec.RESPONSES, rec.PROMOTE, rec.PUBLISHED_AT_SOURCE,
         rec.INCLUDE_READY, rec.requests) = self._saved
        for k in ('REPLIZ_ACCESS_KEY', 'REPLIZ_SECRET_KEY', 'REPLIZ_THREADS_ACCOUNT_ID',
                  'REPLIZ_THREADS_OWNER_ID', 'REPLIZ_THREADS_USERNAME'):
            os.environ.pop(k, None)
        self.tmp.cleanup()

    def insert(self, content_id='UMKM-TEST-001', status='SCHEDULED', publish='SCHEDULED',
               schedule_id='6ad30a2c601f5a0361a6ad5b', post_id=None, published_at=None):
        con = sqlite3.connect(self.dbpath)
        con.execute("""INSERT INTO umkm_content_queue
            (content_id,status,publish_status,repliz_schedule_id,repliz_post_id,published_at)
            VALUES (?,?,?,?,?,?)""", (content_id, status, publish, schedule_id, post_id, published_at))
        con.commit()
        con.close()

    def row(self, content_id='UMKM-TEST-001'):
        con = sqlite3.connect(self.dbpath)
        con.row_factory = sqlite3.Row
        r = con.execute("SELECT * FROM umkm_content_queue WHERE content_id=?",
                        (content_id,)).fetchone()
        con.close()
        return dict(r) if r else None

    def install_session(self, session):
        class Shim:
            Session = staticmethod(lambda: session)
            RequestException = rec.requests.RequestException
        rec.requests = Shim


# --------------------------------------------------------------------------- #
# 1. Bukti utas: jalur positif
# --------------------------------------------------------------------------- #
class ThreadProofTests(unittest.TestCase):
    def test_real_thread_passes_root_and_seven_replies(self):
        proof = prove()
        self.assertEqual(proof['result'], 'PASS')
        self.assertEqual(proof['replies']['count'], 7)
        self.assertTrue(all(r['result'] == 'PASS' for r in proof['replies']['rows']))
        self.assertEqual(proof['duplicate_post_ids'], [])
        self.assertEqual(proof['post_id_field_role'], 'REPLY')

    def test_schedule_post_id_is_reply_not_root(self):
        # Regresi R1: R1 memakai schedule.postId sebagai post root, sehingga teks
        # root dibandingkan dengan teks balasan pertama dan selalu mismatch.
        proof = prove()
        self.assertNotEqual(proof['post_id_field'], proof['root']['id'])
        self.assertEqual(proof['post_id_field_role'], 'REPLY')
        self.assertEqual(proof['root']['result'], 'PASS')

    def test_root_text_not_found_blocks(self):
        docs = [d for d in DOCS if d['id'] != root_doc()['id']]
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['root']['reason'], 'ROOT_TEXT_NOT_FOUND')

    def test_root_text_duplicate_blocks(self):
        docs = DOCS + [copy.deepcopy(root_doc())]
        dup = docs[-1]
        dup['id'] = '19999999999999999'
        session = FakeSession(docs={d['id']: d for d in docs})
        proof = prove(docs=docs, session=session)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['root']['reason'], 'ROOT_TEXT_NOT_UNIQUE')

    def test_root_owner_mismatch_blocks(self):
        docs = copy.deepcopy(DOCS)
        next(d for d in docs if d['id'] == root_doc()['id'])['owner']['id'] = '1'
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertIn('OWNER', proof['root']['reason'])

    def test_root_url_variants_invalid(self):
        bad = ['http://www.threads.com/@umkmnaikkelas.id/post/abc',
               'https://www.threads.com/@someone.else/post/abc',
               'https://www.threads.com/@umkmnaikkelas.id/post/abc?x=1',
               'https://evil.example/@umkmnaikkelas.id/post/abc',
               'javascript:alert(1)']
        for url in bad:
            docs = copy.deepcopy(DOCS)
            next(d for d in docs if d['id'] == root_doc()['id'])['url'] = url
            proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
            self.assertEqual(proof['root']['result'], 'BLOCKED', url)

    def test_root_created_at_future_blocks(self):
        docs = copy.deepcopy(DOCS)
        rd = next(d for d in docs if d['id'] == root_doc()['id'])
        rd['createdAt'] = '2099-01-01T00:00:00.000Z'
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')

    def test_root_created_at_naive_timestamp_blocks(self):
        docs = copy.deepcopy(DOCS)
        next(d for d in docs if d['id'] == root_doc()['id'])['createdAt'] = '2026-10-18T08:00:16'
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')

    def test_root_outside_schedule_window_blocks(self):
        sch = copy.deepcopy(SCHED)
        sch['scheduleAt'] = '2026-08-18T08:00:00.000Z'
        proof = prove(schedule=sch)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertIn('WINDOW', json.dumps(proof['root']['checks']).upper())

    def test_reply_text_mismatch_blocks(self):
        docs = copy.deepcopy(DOCS)
        rep = SCHED['replies'][3]['postId']
        for d in docs:
            if d['id'] == rep:
                d['description'] += ' tambahan palsu'
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['replies']['rows'][3]['reason'], 'TEXT_MATCH')

    def test_reply_missing_post_id_blocks(self):
        sch = copy.deepcopy(SCHED)
        sch['replies'][2]['postId'] = ''
        proof = prove(schedule=sch)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['replies']['rows'][2]['reason'], 'MISSING_POST_ID')

    def test_duplicate_reply_ids_block(self):
        sch = copy.deepcopy(SCHED)
        sch['replies'][4]['postId'] = sch['replies'][3]['postId']
        proof = prove(schedule=sch)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['reason'], 'DUPLICATE_POST_ID')
        self.assertTrue(proof['duplicate_post_ids'])

    def test_reply_missing_at_provider_blocks(self):
        session = FakeSession(docs={k: v for k, v in DOC_BY_ID.items()
                                    if k != SCHED['replies'][5]['postId']})
        proof = prove(session=session)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['replies']['rows'][5]['content_http'], 404)

    def test_no_replies_in_schedule_blocks(self):
        sch = copy.deepcopy(SCHED)
        sch['replies'] = []
        proof = prove(schedule=sch)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['reason'], 'NO_REPLIES_IN_SCHEDULE')

    def test_reply_owner_mismatch_blocks(self):
        docs = copy.deepcopy(DOCS)
        for d in docs:
            if d['id'] == SCHED['replies'][2]['postId']:
                d['owner']['id'] = '999'
        proof = prove(docs=docs, session=FakeSession(docs={d['id']: d for d in docs}))
        self.assertEqual(proof['result'], 'BLOCKED')

    def test_only_get_requests_are_made(self):
        session = FakeSession()
        prove(session=session)
        self.assertTrue(session.calls)
        self.assertTrue(all('/content' in u or '/schedule/' in u for u, _ in session.calls))


# --------------------------------------------------------------------------- #
# 2. HTTP: retry / backoff
# --------------------------------------------------------------------------- #
class HttpTests(unittest.TestCase):
    def test_retry_on_429_then_success(self):
        session = FakeSession(script=[Resp(429, headers={'Retry-After': '0'}), Resp(200, {'ok': 1})])
        resp = rec.http_get(session, 'https://example.invalid/x', auth=None, retries=2)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(session.calls), 2)

    def test_retry_exhausted_raises(self):
        session = FakeSession(script=[Resp(500), Resp(503), Resp(502)])
        with self.assertRaises(rec.HttpFailure):
            rec.http_get(session, 'https://example.invalid/x', auth=None, retries=2)

    def test_404_not_retried(self):
        session = FakeSession(script=[Resp(404), Resp(200)])
        resp = rec.http_get(session, 'https://example.invalid/x', auth=None, retries=2)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(len(session.calls), 1)

    def test_network_error_retried(self):
        session = FakeSession(script=[rec.requests.ConnectionError('boom'), Resp(200, {'ok': 1})])
        resp = rec.http_get(session, 'https://example.invalid/x', auth=None, retries=2)
        self.assertEqual(resp.status_code, 200)


# --------------------------------------------------------------------------- #
# 3. Listing index
# --------------------------------------------------------------------------- #
class ListingTests(unittest.TestCase):
    def test_pagination_follows_next_token(self):
        a = copy.deepcopy(root_doc())
        b = copy.deepcopy(a)
        b['id'] = '18888888888888888'
        b['description'] = 'dokumen lain'
        state = {'n': 0}

        def get(url, params=None, **kw):
            state['n'] += 1
            if state['n'] == 1:
                return Resp(200, {'docs': [a], 'nextToken': 'T2'})
            return Resp(200, {'docs': [b], 'nextToken': None})

        class S:
            def get(self, url, params=None, **kw):
                return get(url, params, **kw)

        index = rec.ContentIndex(S(), None, ACCOUNT).load()
        self.assertEqual(len(index.docs), 2)
        self.assertEqual(len(index.pages), 2)

    def test_page_limit_marks_error(self):
        state = {'n': 0}

        class S:
            def get(self, url, params=None, **kw):
                state['n'] += 1
                d = copy.deepcopy(root_doc())
                d['id'] = str(1000 + state['n'])
                d['description'] = 'x' * 10 + d['id']
                return Resp(200, {'docs': [d], 'nextToken': 'T' + d['id']})

        index = rec.ContentIndex(S(), None, ACCOUNT, max_pages=3).load()
        self.assertIn('LISTING_PAGE_LIMIT', index.errors)

    def test_listing_failure_blocks_proof(self):
        class S:
            def get(self, url, params=None, **kw):
                return Resp(500, {})
        index = rec.ContentIndex(S(), None, ACCOUNT, max_pages=1)
        index.load()
        proof = rec.prove_thread(index, SCHED, owner_id=OWNER, username=USERNAME,
                                 account_id=ACCOUNT)
        self.assertEqual(proof['result'], 'BLOCKED')
        self.assertEqual(proof['reason'], 'CONTENT_INDEX_INCOMPLETE')


# --------------------------------------------------------------------------- #
# 4. End-to-end main(): SHADOW, gate, promosi, READY
# --------------------------------------------------------------------------- #
class MainTests(DbCase):
    def run_main(self, session):
        self.install_session(session)
        return rec.main()

    def test_shadow_mode_does_not_change_status(self):
        self.insert()
        code = self.run_main(FakeSession())
        row = self.row()
        self.assertEqual(code, 0)
        self.assertEqual(row['status'], 'SCHEDULED')
        self.assertEqual(row['publish_status'], 'SCHEDULED')
        self.assertIsNone(row['repliz_post_id'])
        self.assertIsNone(row['published_at'])
        self.assertIsNone(row['reconcile_error'])
        self.assertTrue((rec.RESPONSES / 'UMKM-TEST-001-content-proof.json').exists())

    def test_promote_blocked_without_contract(self):
        self.insert()
        rec.PROMOTE = True
        code = self.run_main(FakeSession())
        row = self.row()
        self.assertEqual(code, 2)
        self.assertEqual(row['status'], 'SCHEDULED')
        self.assertIn('PUBLISHED_AT_SOURCE_UNCONTRACTED', row['reconcile_error'] or '')

    def test_promote_with_contract_sets_root_id(self):
        self.insert()
        rec.PROMOTE = True
        rec.PUBLISHED_AT_SOURCE = 'root_createdAt'
        code = self.run_main(FakeSession())
        row = self.row()
        self.assertEqual(code, 0)
        self.assertEqual(row['status'], 'PUBLISHED')
        self.assertEqual(row['repliz_post_id'], root_doc()['id'])
        self.assertEqual(row['published_at'], root_doc()['createdAt'])
        self.assertNotEqual(row['repliz_post_id'], SCHED['postId'])
        self.assertIsNone(row['reconcile_error'])
        self.assertIn('root_createdAt', row['note'])

    def test_ready_rows_are_reconciled(self):
        self.insert(content_id='UMKM-READY-001', status='READY')
        code = self.run_main(FakeSession())
        row = self.row('UMKM-READY-001')
        self.assertEqual(code, 0)
        self.assertEqual(row['status'], 'READY')
        self.assertIsNotNone(row['last_reconciled_at'])
        self.assertIsNone(row['reconcile_error'])

    def test_ready_rows_skipped_when_disabled(self):
        rec.INCLUDE_READY = False
        self.insert(content_id='UMKM-READY-002', status='READY')
        rec.PROMOTE = False
        code = self.run_main(FakeSession())
        self.assertEqual(code, 0)
        self.assertIsNone(self.row('UMKM-READY-002')['last_reconciled_at'])

    def test_wrong_account_blocks(self):
        sch = copy.deepcopy(SCHED)
        sch['accountId'] = 'someone-else'
        self.insert()
        code = self.run_main(FakeSession(schedule=sch))
        self.assertEqual(code, 2)
        self.assertEqual(self.row()['status'], 'SCHEDULED')
        self.assertIn('WRONG_ACCOUNT', self.row()['reconcile_error'])

    def test_pending_schedule_not_alerted(self):
        sch = copy.deepcopy(SCHED)
        sch['status'] = 'pending'
        sch['postId'] = ''
        self.insert()
        code = self.run_main(FakeSession(schedule=sch))
        self.assertEqual(code, 0)
        self.assertEqual(self.row()['status'], 'SCHEDULED')

    def test_failed_schedule_is_terminal_alert(self):
        sch = copy.deepcopy(SCHED)
        sch['status'] = 'failed'
        self.insert()
        code = self.run_main(FakeSession(schedule=sch))
        self.assertEqual(code, 2)
        self.assertIn('REMOTE_TERMINAL', self.row()['reconcile_error'])

    def test_schedule_http_500_retries_then_alert(self):
        self.insert()
        session = FakeSession(script=[Resp(500), Resp(500), Resp(500), Resp(500)])
        # only the schedule GET is scripted; retries consume all three
        code = self.run_main(session)
        self.assertEqual(code, 2)
        self.assertIn('SCHEDULE_', self.row()['reconcile_error'])

    def test_published_schedule_cannot_bypass_shadow(self):
        sch = copy.deepcopy(SCHED)
        sch['status'] = 'published'
        sch['publishedAt'] = '2026-10-18T08:00:16.000Z'
        self.insert()
        code = self.run_main(FakeSession(schedule=sch))
        row = self.row()
        self.assertEqual(code, 0)
        self.assertEqual(row['status'], 'SCHEDULED')
        self.assertEqual(row['publish_status'], 'SCHEDULED')
        self.assertIsNone(row['published_at'])
        self.assertIsNone(row['repliz_post_id'])

    def test_published_schedule_cannot_bypass_contract(self):
        sch = copy.deepcopy(SCHED)
        sch['status'] = 'published'
        sch['publishedAt'] = '2026-10-18T08:00:16.000Z'
        self.insert()
        rec.PROMOTE = True
        rec.PUBLISHED_AT_SOURCE = ''
        code = self.run_main(FakeSession(schedule=sch))
        row = self.row()
        self.assertEqual(code, 2)
        self.assertEqual(row['status'], 'SCHEDULED')
        self.assertIsNone(row['published_at'])
        self.assertIn('PUBLISHED_AT_SOURCE_UNCONTRACTED', row['reconcile_error'])

    def test_published_schedule_promotion_with_contract_uses_root(self):
        sch = copy.deepcopy(SCHED)
        sch['status'] = 'published'
        sch['publishedAt'] = '2026-10-18T08:00:16.000Z'
        self.insert()
        rec.PROMOTE = True
        rec.PUBLISHED_AT_SOURCE = 'root_createdAt'
        code = self.run_main(FakeSession(schedule=sch))
        row = self.row()
        self.assertEqual(code, 0)
        self.assertEqual(row['status'], 'PUBLISHED')
        self.assertEqual(row['repliz_post_id'], root_doc()['id'])
        self.assertEqual(row['published_at'], root_doc()['createdAt'])
        self.assertNotEqual(row['repliz_post_id'], sch['postId'])

    def test_trigger_present_blocks_promotion(self):
        self.insert()
        con = sqlite3.connect(self.dbpath)
        con.execute("""CREATE TRIGGER t AFTER UPDATE ON umkm_content_queue
                       BEGIN SELECT 1; END""")
        con.commit()
        con.close()
        rec.PROMOTE = True
        rec.PUBLISHED_AT_SOURCE = 'root_createdAt'
        code = self.run_main(FakeSession())
        self.assertEqual(code, 2)
        self.assertEqual(self.row()['status'], 'SCHEDULED')
        self.assertIn('SCHEMA_TRIGGER_PRESENT', self.row()['reconcile_error'] or '')

    def test_no_post_verb_used(self):
        self.insert()
        session = FakeSession()
        self.run_main(session)
        self.assertFalse(hasattr(session, 'post'))


# --------------------------------------------------------------------------- #
# 5. Bukti tersimpan tidak memuat kredensial
# --------------------------------------------------------------------------- #
class EvidenceHygieneTests(DbCase):
    def test_proof_file_has_no_credentials(self):
        self.insert()
        self.install_session(FakeSession())
        rec.main()
        blob = (rec.RESPONSES / 'UMKM-TEST-001-content-proof.json').read_text()
        self.assertNotIn('ak-test', blob)
        self.assertNotIn('sk-test', blob)
        self.assertNotIn('scontent', blob)


if __name__ == '__main__':
    unittest.main(verbosity=2)
