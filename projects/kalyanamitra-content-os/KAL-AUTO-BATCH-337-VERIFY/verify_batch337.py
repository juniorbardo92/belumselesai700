#!/usr/bin/env python3
"""Audit-only comparison of KAL-AUTO Batch 337 manifest to current SQLite ledger."""
import argparse
import csv
import json
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

WIB = ZoneInfo('Asia/Jakarta')
DEFAULT_DB = '/var/lib/kal-auto-intake/state/kalauto/intent.sqlite'


def utc_from_wib(slot):
    dt = datetime.fromisoformat(slot)
    if dt.tzinfo is not None:
        raise ValueError('slot_wib must be local naive WIB')
    return dt.replace(tzinfo=WIB).astimezone(timezone.utc)


def audit(db, manifest):
    path = Path(manifest)
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    required = {'thread','slot_wib','job_id'}
    if len(rows) != 46 or not rows or not required <= set(rows[0]):
        raise ValueError('EXPECTED_EXACTLY_46_MANIFEST_JOBS')
    jobs = [r['job_id'].strip() for r in rows]
    if len(set(jobs)) != 46 or not all(j.startswith('KAL-AUTO-') for j in jobs):
        raise ValueError('DUPLICATE_OR_INVALID_MANIFEST_JOB_IDS')
    if len({r['thread'].strip() for r in rows}) != 46:
        raise ValueError('DUPLICATE_MANIFEST_THREADS')
    if len({r['slot_wib'].strip() for r in rows}) != 46:
        raise ValueError('DUPLICATE_MANIFEST_SLOTS')
    dbp = Path(db)
    if not dbp.is_file() or dbp.is_symlink():
        raise ValueError('DATABASE_MISSING_OR_UNSAFE')
    con = sqlite3.connect(dbp.resolve().as_uri() + '?mode=ro', uri=True, timeout=15)
    try:
        con.execute('BEGIN')
        holders = ','.join('?' for _ in jobs)
        fetched = con.execute(
            f'SELECT id,state,schedule_id,slot_utc,error_code FROM jobs WHERE id IN ({holders})',
            jobs
        ).fetchall()
        con.commit()
    finally:
        con.close()
    by_id = {r[0]:r for r in fetched}
    counts = Counter()
    schedule_ids = []
    details = []
    for record in rows:
        j = record['job_id'].strip()
        current = by_id.get(j)
        label = record['thread'].strip()
        expected_time = utc_from_wib(record['slot_wib'].strip())
        if current is None:
            state, schedule_id, slot_utc, error_code = ('MISSING','','','')
            verdict = 'MISSING'
        else:
            _, state, schedule_id, slot_utc, error_code = current
            schedule_id = schedule_id or ''
            try:
                actual_time = datetime.fromisoformat(str(slot_utc).replace('Z','+00:00'))
                match_time = actual_time.astimezone(timezone.utc) == expected_time
            except (ValueError, TypeError, OverflowError):
                match_time = False
            if not match_time:
                verdict = 'SLOT_MISMATCH'
            elif state == 'SCHEDULED' and schedule_id:
                verdict = 'SCHEDULED_WITH_ID'
                schedule_ids.append(schedule_id)
            elif state == 'READY' and not schedule_id:
                verdict = 'READY'
            elif state == 'SUBMISSION_UNCERTAIN':
                verdict = 'RECONCILE_GET_ONLY'
            else:
                verdict = 'ATTENTION'
        counts[verdict] += 1
        details.append(dict(thread=label, job_id=j, expected_slot_wib=record['slot_wib'],
                            ledger_state=state, schedule_id=schedule_id, slot_utc=slot_utc,
                            error_code=error_code, verdict=verdict))
    if len(schedule_ids) != len(set(schedule_ids)):
        counts['DUPLICATE_SCHEDULE_ID'] += len(schedule_ids) - len(set(schedule_ids))
    complete = counts['SCHEDULED_WITH_ID'] == 46 and len(counts) == 1
    outcome = 'BATCH_337_LEDGER_COMPLETE' if complete else 'BATCH_337_IN_PROGRESS'
    if any(counts.get(key,0) for key in ('RECONCILE_GET_ONLY','ATTENTION','MISSING','SLOT_MISMATCH','DUPLICATE_SCHEDULE_ID')):
        outcome = 'BATCH_337_ATTENTION_REQUIRED'
    return dict(status=outcome, scope='46 batch jobs only', checked=len(rows),
                by_verdict=dict(sorted(counts.items())), complete=complete,
                details=details, repliz_get_verified=False, write_attempts=0)


def main():
    ap = argparse.ArgumentParser(description='Read-only Batch 337 ledger audit; no Repliz API calls')
    ap.add_argument('--db',default=DEFAULT_DB)
    ap.add_argument('--manifest',default=str(Path(__file__).resolve().parent/'batch-337-snapshot.csv'))
    ap.add_argument('--report',help='Optional path for output CSV (local audit report only)')
    args = ap.parse_args()
    try:
        result = audit(args.db,args.manifest)
    except (sqlite3.Error,OSError,ValueError) as err:
        print(json.dumps({'status':'BLOCKED','reason':str(err),'write_attempts':0}),flush=True)
        return 3
    print(json.dumps({k:v for k,v in result.items() if k!='details'},ensure_ascii=False),flush=True)
    if args.report:
        report=Path(args.report)
        if report.resolve() == Path(args.manifest).resolve() or report.resolve() == Path(args.db).resolve():
            print('BLOCKED: REPORT_CANNOT_OVERWRITE_SOURCE',file=sys.stderr)
            return 3
        with report.open('w',encoding='utf-8',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(result['details'][0]))
            writer.writeheader();writer.writerows(result['details'])
        print(f'REPORT={report}')
    return 0 if result['complete'] else 2

if __name__ == '__main__':
    sys.exit(main())
