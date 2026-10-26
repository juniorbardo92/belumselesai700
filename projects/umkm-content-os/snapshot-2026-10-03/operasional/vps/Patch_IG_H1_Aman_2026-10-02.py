#!/usr/bin/env python3
"""Narrow safety patch for the existing UMKM Instagram H+1 worker.

Run only on the VPS project root after reviewing the source. This edits the
worker, not its database or systemd units. It aborts on unknown source.
"""

from pathlib import Path
import os
import shutil
import time

path = Path("scripts/run_umkm_ig_h1_once.py")
before = path.read_text(encoding="utf-8")
after = before


def replace_once(label, old, new):
    global after
    count = after.count(old)
    if count != 1:
        raise SystemExit(f"BATAL: pola {label} ditemukan {count} kali; tidak ada perubahan")
    after = after.replace(old, new, 1)


replace_once(
    "satu kandidat per hari sumber",
    "  AND q.publish_status='PUBLISHED';\n\"\"\")",
    """  AND q.publish_status='PUBLISHED'
  AND NOT EXISTS (
      SELECT 1
      FROM umkm_instagram_queue previous
      WHERE date(datetime(previous.source_published_at, '+7 hours'))
          = date(datetime(COALESCE(q.published_at, q.scheduled_at), '+7 hours'))
  );
\"\"\")""",
)

replace_once(
    "konflik tanggal IG",
    "def target_schedule():",
    '''class IGDayOccupied(RuntimeError):
    pass


def assert_remote_day_open(target):
    day_start = datetime.combine(target.date(), time(0, 0), tzinfo=JAKARTA)
    day_end = day_start + timedelta(days=1)
    for page in range(1, 21):
        response = requests.get(
            f"{API}/schedule",
            params={
                "page": page, "limit": 100,
                "fromDate": iso_utc(day_start), "toDate": iso_utc(day_end),
            },
            auth=AUTH,
            timeout=25,
        )
        if not 200 <= response.status_code < 300:
            raise RuntimeError(f"IG_REMOTE_LIST_HTTP_{response.status_code}")
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("docs"), list):
            raise RuntimeError("IG_REMOTE_LIST_FORMAT")
        pages = data.get("totalPages")
        if not isinstance(pages, int):
            raise RuntimeError("IG_REMOTE_LIST_PAGES")
        for item in data["docs"]:
            if not isinstance(item, dict):
                raise RuntimeError("IG_REMOTE_LIST_ITEM")
            if str(item.get("accountId")) != str(IG_ACCOUNT_ID):
                continue
            when = parse_dt(item.get("scheduleAt"))
            if when is None:
                raise RuntimeError("IG_REMOTE_TIME_INVALID")
            if when.astimezone(JAKARTA).date() == target.date():
                raise IGDayOccupied(
                    f"IG_REMOTE_DAY_OCCUPIED:{target.date()}:{item.get('id', item.get('_id'))}"
                )
        if page >= pages:
            return
    raise RuntimeError("IG_REMOTE_PAGINATION_LIMIT")


def target_schedule():''',
)

replace_once(
    "jendela H+1",
    "    target = target_schedule()\n    schedule_at = iso_utc(\n        target\n    )",
    '''    target = target_schedule()
    expected_day = (
        parse_dt(job["source_published_at"]).astimezone(JAKARTA).date()
        + timedelta(days=1)
    )
    if target.date() != expected_day:
        raise IGDayOccupied(f"IG_H1_WINDOW_MISSED:{expected_day}")
    schedule_at = iso_utc(
        target
    )''',
)

replace_once(
    "POST IG dan klaim final",
    "    response = requests.post(\n        f\"{API}/schedule\",\n        json=payload,\n        auth=AUTH,\n        timeout=45\n    )",
    '''    assert_remote_day_open(target)

    # Hold the target day in the local queue before POST. A response lost
    # after a successful create must never trigger a blind second POST.
    con = db()
    try:
        con.execute("BEGIN IMMEDIATE")
        occupied = con.execute("""
            SELECT source_content_id
            FROM umkm_instagram_queue
            WHERE source_content_id <> ?
              AND scheduled_at IS NOT NULL
              AND (repliz_schedule_id IS NOT NULL
                   OR status IN ('SUBMITTING', 'RECONCILE', 'SCHEDULED', 'PUBLISHED'))
              AND date(datetime(scheduled_at, '+7 hours')) = ?
            LIMIT 1
        """, (CONTENT_ID, target.date().isoformat())).fetchone()
        if occupied:
            raise IGDayOccupied(
                f"IG_DAY_OCCUPIED:{target.date()}:{occupied['source_content_id']}"
            )
        claim = con.execute("""
            UPDATE umkm_instagram_queue
            SET status='SUBMITTING', scheduled_at=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE source_content_id=? AND repliz_schedule_id IS NULL
              AND status NOT IN ('SUBMITTING', 'RECONCILE', 'SCHEDULED')
        """, (schedule_at, CONTENT_ID))
        if claim.rowcount != 1:
            raise IGDayOccupied(f"IG_JOB_ALREADY_CLAIMED:{CONTENT_ID}")
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    post_may_have_succeeded = True
    response = requests.post(
        f"{API}/schedule",
        json=payload,
        auth=AUTH,
        timeout=45
    )''',
)

replace_once(
    "HTTP 4xx definitif",
    "    if not (\n        200\n        <= response.status_code\n        < 300\n    ):\n        raise RuntimeError(",
    "    if not (\n        200\n        <= response.status_code\n        < 300\n    ):\n        if response.status_code < 500:\n            post_may_have_succeeded = False\n        raise RuntimeError(",
)

replace_once(
    "status sukses",
    "        last_error=None\n    )\n\n    con = db()",
    "        last_error=None\n    )\n    schedule_recorded = True\n    post_may_have_succeeded = False\n\n    con = db()",
)

replace_once(
    "penanganan akhir",
    "except Exception as exc:\n    set_queue(\n        CONTENT_ID,\n        \"RETRY\",\n        error=str(exc)[:1500]\n    )\n\n    print(\n        f\"{CONTENT_ID}=IG_RETRY \"\n        f\"{str(exc)[:500]}\"\n    )",
    """except IGDayOccupied as exc:
    if str(exc).startswith("IG_JOB_ALREADY_CLAIMED"):
        print(f"{CONTENT_ID}=IG_ALREADY_CLAIMED")
    else:
        set_queue(CONTENT_ID, "BLOCKED", error=str(exc)[:1500])
        print(f"{CONTENT_ID}=IG_BLOCKED {str(exc)[:500]}")

except Exception as exc:
    if locals().get("schedule_recorded", False):
        print(f"{CONTENT_ID}=IG_METRIC_UPDATE_ERROR {str(exc)[:500]}")
    elif locals().get("post_may_have_succeeded", False):
        set_queue(CONTENT_ID, "RECONCILE", error=str(exc)[:1500])
        print(f"{CONTENT_ID}=IG_RECONCILE {str(exc)[:500]}")
    else:
        set_queue(CONTENT_ID, "RETRY", error=str(exc)[:1500], scheduled_at=None)
        print(f"{CONTENT_ID}=IG_RETRY {str(exc)[:500]}")""",
)

compile(after, str(path), "exec")
if after == before:
    raise SystemExit("BATAL: tidak ada perubahan")

backup = path.with_name(path.name + f".bak-{time.strftime('%Y%m%d-%H%M%S')}")
shutil.copy2(path, backup)
temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
try:
    temporary.write_text(after, encoding="utf-8")
    os.chmod(temporary, path.stat().st_mode)
    os.replace(temporary, path)
finally:
    temporary.unlink(missing_ok=True)
print(f"PATCH_OK backup={backup} script={path}")
