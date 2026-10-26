#!/usr/bin/env python3
"""Preflight baca-saja untuk R2: skema, trigger, konsumen hilir, dan hash baseline.

Tidak menulis apa pun. Exit 0 bila aman untuk UAT salinan; exit 2 bila ada
blocker yang harus diselesaikan pemilik data.
"""
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path('/opt/umkm-engine')
DB = ROOT / 'data/system.db'
BASELINE_SHA = 'ceaaf52e43df6ec372be6b26e663e32dffd6fa073dd57a0a52a64c945c36cd15'
PROD_SCRIPT = ROOT / 'scripts/reconcile_repliz.py'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    problems, notes = [], []
    print('=== PREFLIGHT R2 (READ-ONLY) ===')

    if not DB.exists():
        print('DB_MISSING'); return 2
    actual = sha(PROD_SCRIPT)
    print(f'prod_reconcile_sha256={actual}')
    print(f'baseline_match={actual == BASELINE_SHA}')
    if actual != BASELINE_SHA:
        problems.append('BASELINE_HASH_DRIFT')

    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    cols = {r['name']: r for r in con.execute('PRAGMA table_info(umkm_content_queue)')}
    print('columns:', len(cols))
    for needed in ('published_at', 'note', 'platform_status', 'reconcile_error'):
        if needed not in cols:
            problems.append('MISSING_COLUMN_' + needed.upper())
    print(f'published_at_notnull={cols["published_at"]["notnull"]}')
    triggers = con.execute("SELECT name FROM sqlite_master WHERE type='trigger' "
                           "AND tbl_name='umkm_content_queue'").fetchall()
    print('triggers_on_queue:', [t['name'] for t in triggers])
    if triggers:
        problems.append('TRIGGERS_ON_QUEUE')

    counts = {r['status']: r['n'] for r in con.execute(
        'SELECT status, count(*) n FROM umkm_content_queue GROUP BY status')}
    print('status_counts:', counts)
    ready = con.execute("""SELECT count(*) FROM umkm_content_queue
        WHERE status='READY' AND publish_status='SCHEDULED'
          AND repliz_schedule_id IS NOT NULL""").fetchone()[0]
    sched = con.execute("""SELECT count(*) FROM umkm_content_queue
        WHERE status='SCHEDULED' AND publish_status='SCHEDULED'
          AND repliz_schedule_id IS NOT NULL
          AND (repliz_post_id IS NULL OR repliz_post_id='')""").fetchone()[0]
    print(f'jobs_scheduled={sched} jobs_ready={ready}')

    # Konsumen hilir: IG H+1 mensyaratkan published_at NOT NULL dan status PUBLISHED.
    ig_rows = con.execute('SELECT count(*) FROM umkm_instagram_queue').fetchone()[0]
    h1 = {r['status']: r['n'] for r in con.execute(
        'SELECT status, count(*) n FROM umkm_h1_metrics GROUP BY status')}
    print(f'ig_queue_rows={ig_rows} h1_metrics={h1}')
    notes.append('IG H+1 memakai q.published_at; promosi wajib mengisi published_at '
                 'bukan NULL, jika tidak baris tidak akan pernah diadaptasi ke IG.')
    if ig_rows == 0:
        notes.append('IG queue kosong: promosi PUBLISHED akan membuat IG H+1 mulai '
                     'membuat pekerjaan IG. Perlu persetujuan pemilik + jeda timer IG.')
    integ = con.execute('PRAGMA integrity_check').fetchone()[0]
    print('integrity_check:', integ)
    if integ != 'ok':
        problems.append('INTEGRITY_' + str(integ))
    con.close()

    print('\nNOTES:')
    for n in notes:
        print(' -', n)
    print('\nBLOCKERS:', problems or 'NONE')
    return 0 if not problems else 2


if __name__ == '__main__':
    sys.exit(main())
