#!/usr/bin/env python3
"""Offline tests for the bounded Repliz reader (K07)."""
import importlib.util
import json
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
_cand = [BASE / 'repliz_reader.py', BASE / 'code' / 'repliz_reader.py']
_modpath = next(p for p in _cand if p.is_file())
spec = importlib.util.spec_from_file_location('repliz_reader', _modpath)
rd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rd)

ACC = '6a8d2c7862caae1e0405397a'
OTHER = '6a8e2fc362caae1e04063419'


class Resp:
    def __init__(self, status=200, payload=None, pad=0):
        self.status_code = status
        self._payload = payload
        body = json.dumps(payload or {}) + ('x' * pad)
        self.content = body.encode()
        self.text = body

    def json(self):
        if self._payload is None:
            raise ValueError('no json')
        return self._payload


class Sess:
    def __init__(self, handler):
        self.calls = []
        self.handler = handler

    def get(self, url, params=None, **kw):
        self.calls.append((url, dict(params or {})))
        return self.handler(url, params or {}, len(self.calls))


def item(acc, sid='1', desc='teks'):
    return {'_id': sid, 'id': sid, 'status': 'success', 'postId': 'p' + sid,
            'accountId': acc, 'scheduleAt': '2026-10-18T08:00:00.000Z',
            'description': desc, 'replies': [{'status': 'success', 'postId': 'r1'}]}


class ScheduleTests(unittest.TestCase):
    def test_sends_indexed_account_filter(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC)], 'totalPages': 1}))
        c = rd.Client('a', 'b', session=sess)
        c.list_schedules(ACC)
        self.assertEqual(sess.calls[0][1].get('accountIds[0]'), ACC)
        self.assertNotIn('accountIds', sess.calls[0][1])

    def test_drops_other_account_items(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC, '1'), item(OTHER, '2')],
                                              'totalPages': 1}))
        c = rd.Client('a', 'b', session=sess)
        rows = c.list_schedules(ACC)
        self.assertEqual(len(rows), 1)
        self.assertEqual(c.dropped, 1)
        self.assertEqual(rows[0]['accountId'], ACC)

    def test_item_without_account_is_blocked(self):
        bad = item(ACC)
        bad.pop('accountId')
        bad.pop('account', None)
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [bad], 'totalPages': 1}))
        c = rd.Client('a', 'b', session=sess)
        with self.assertRaises(rd.ReaderBlocked):
            c.list_schedules(ACC)

    def test_pagination_until_total_pages(self):
        def handler(u, p, n):
            return Resp(200, {'docs': [item(ACC, str(p['page']))], 'totalPages': 3})
        sess = Sess(handler)
        c = rd.Client('a', 'b', session=sess)
        rows = c.list_schedules(ACC)
        self.assertEqual(len(rows), 3)
        self.assertEqual([p['page'] for _, p in sess.calls], [1, 2, 3])

    def test_missing_total_pages_blocked(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC)]}))
        c = rd.Client('a', 'b', session=sess)
        with self.assertRaises(rd.ReaderBlocked):
            c.list_schedules(ACC)

    def test_page_limit_blocked(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC)], 'totalPages': 99}))
        c = rd.Client('a', 'b', session=sess)
        with self.assertRaises(rd.ReaderBlocked):
            c.list_schedules(ACC, max_pages=2)

    def test_truncates_description_and_reply_ids_kept(self):
        long = 'x' * 5000
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC, '1', long)], 'totalPages': 1}))
        c = rd.Client('a', 'b', session=sess)
        row = c.list_schedules(ACC)[0]
        self.assertEqual(len(row['description']), c.desc_chars + 1)
        self.assertEqual(row['reply_post_ids'], ['r1'])

    def test_response_byte_guard(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [item(ACC)], 'totalPages': 1}, pad=5000))
        c = rd.Client('a', 'b', max_bytes=1000, session=sess)
        with self.assertRaises(rd.ReaderBlocked) as ctx:
            c.list_schedules(ACC)
        self.assertIn('RESPONSE_TOO_LARGE', str(ctx.exception))

    def test_adaptive_page_limit_shrinks_instead_of_failing(self):
        def handler(u, p, n):
            pad = 4000 if p['limit'] > 10 else 0
            return Resp(200, {'docs': [item(ACC)], 'totalPages': 1}, pad=pad)
        sess = Sess(handler)
        c = rd.Client('a', 'b', max_bytes=2000, session=sess)
        rows = c.list_schedules(ACC, page_limit=40)
        self.assertEqual(len(rows), 1)
        self.assertLess(c.effective_limit, 40)

    def test_http_error_blocked(self):
        sess = Sess(lambda u, p, n: Resp(404, {'message': 'nope'}))
        c = rd.Client('a', 'b', session=sess)
        with self.assertRaises(rd.ReaderBlocked):
            c.list_schedules(ACC)


class ContentTests(unittest.TestCase):
    def doc(self, cid, owner=ACC, url='https://www.threads.com/@ruangkalyanamitra/post/abc'):
        return {'id': cid, 'createdAt': '2026-10-18T08:00:00.000Z',
                'owner': {'id': owner, 'name': 'Ruang Kalyanamitra'},
                'url': url, 'description': 'd' * 900}

    def test_next_token_pagination(self):
        def handler(u, p, n):
            if n == 1:
                return Resp(200, {'docs': [self.doc('1')], 'nextToken': 'T2'})
            return Resp(200, {'docs': [self.doc('2')], 'nextToken': None})
        sess = Sess(handler)
        c = rd.Client('a', 'b', session=sess)
        rows = c.list_content(ACC)
        self.assertEqual([r['id'] for r in rows], ['1', '2'])
        self.assertEqual(sess.calls[1][1].get('nextToken'), 'T2')

    def test_projection_is_bounded(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [self.doc('1')], 'nextToken': None}))
        c = rd.Client('a', 'b', session=sess)
        row = c.list_content(ACC)[0]
        self.assertEqual(len(row['description']), c.desc_chars + 1)
        self.assertLessEqual(len(row['url']), 201)
        self.assertEqual(row['host'], 'www.threads.com')
        self.assertNotIn('picture', json.dumps(row))

    def test_page_limit_blocked(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [self.doc(str(n))], 'nextToken': 'T'}))
        c = rd.Client('a', 'b', session=sess)
        with self.assertRaises(rd.ReaderBlocked):
            c.list_content(ACC, max_pages=2)

    def test_bad_url_does_not_crash(self):
        sess = Sess(lambda u, p, n: Resp(200, {'docs': [self.doc('1', url='http://[bad')],
                                               'nextToken': None}))
        c = rd.Client('a', 'b', session=sess)
        self.assertIsNone(c.list_content(ACC)[0]['host'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
