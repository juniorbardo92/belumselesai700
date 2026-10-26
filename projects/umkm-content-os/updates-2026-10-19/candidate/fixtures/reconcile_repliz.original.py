import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

ROOT = Path("/opt/umkm-engine")
DB = ROOT / "data/system.db"
ENV = ROOT / ".env.publisher"
RESPONSES = ROOT / "data/content/publisher/responses"

API = "https://api.repliz.com/public"

RESPONSES.mkdir(parents=True, exist_ok=True)


def load_env(path):
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def now_utc():
    return datetime.now(timezone.utc).isoformat(
        timespec="seconds"
    ).replace("+00:00", "Z")


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


def unwrap(data):
    if not isinstance(data, dict):
        return {}

    for key in ("data", "doc", "schedule"):
        value = data.get(key)

        if isinstance(value, dict):
            return value

    return data


def account_id(obj):
    value = obj.get("accountId")

    if isinstance(value, dict):
        return (
            value.get("id")
            or value.get("_id")
        )

    if value:
        return value

    account = obj.get("account")

    if isinstance(account, dict):
        return (
            account.get("id")
            or account.get("_id")
        )

    return None


def platform_state(obj):
    for key in (
        "publishStatus",
        "status",
        "state"
    ):
        value = obj.get(key)

        if value is not None:
            return str(value)

    return ""


def save_response(content_id, data):
    path = RESPONSES / (
        f"{content_id}-reconcile.json"
    )

    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


load_env(ENV)

ACCESS_KEY = os.environ.get("REPLIZ_ACCESS_KEY")
SECRET_KEY = os.environ.get("REPLIZ_SECRET_KEY")
EXPECTED_ACCOUNT_ID = os.environ.get(
    "REPLIZ_THREADS_ACCOUNT_ID"
)

if not all([
    ACCESS_KEY,
    SECRET_KEY,
    EXPECTED_ACCOUNT_ID
]):
    raise SystemExit(
        "RECONCILE_CONFIG_INCOMPLETE"
    )

AUTH = HTTPBasicAuth(
    ACCESS_KEY,
    SECRET_KEY
)

con = db()

jobs = con.execute("""
    SELECT
        content_id,
        repliz_schedule_id,
        scheduled_at,
        repliz_post_id
    FROM umkm_content_queue
    WHERE status='SCHEDULED'
      AND publish_status='SCHEDULED'
      AND repliz_schedule_id IS NOT NULL
      AND (
          repliz_post_id IS NULL
          OR repliz_post_id=''
      )
    ORDER BY COALESCE(last_reconciled_at, '') ASC, scheduled_at ASC
    LIMIT 50
""").fetchall()

con.close()

if not jobs:
    print("RECONCILE_QUEUE_EMPTY")
    raise SystemExit(0)


reconcile_issues = 0

for row in jobs:
    content_id = row["content_id"]
    schedule_id = row["repliz_schedule_id"]

    checked_at = now_utc()

    try:
        response = requests.get(
            f"{API}/schedule/{schedule_id}",
            auth=AUTH,
            timeout=25
        )

    except requests.RequestException as e:
        con = db()

        con.execute("""
            UPDATE umkm_content_queue
            SET
                reconcile_attempts=
                    COALESCE(reconcile_attempts,0)+1,
                last_reconciled_at=?,
                reconcile_error=?
            WHERE content_id=?
        """, (
            checked_at,
            f"NETWORK:{e}",
            content_id
        ))

        con.commit()
        con.close()

        print(
            f"{content_id}=RECONCILE_NETWORK_ERROR"
        )
        reconcile_issues += 1
        continue

    try:
        raw = response.json()
    except Exception:
        raw = {
            "raw": response.text
        }

    save_response(
        content_id,
        {
            "http_status": response.status_code,
            "checked_at": checked_at,
            "response": raw
        }
    )

    if response.status_code != 200:
        con = db()

        con.execute("""
            UPDATE umkm_content_queue
            SET
                reconcile_attempts=
                    COALESCE(reconcile_attempts,0)+1,
                last_reconciled_at=?,
                reconcile_error=?
            WHERE content_id=?
        """, (
            checked_at,
            (
                f"HTTP {response.status_code}: "
                + json.dumps(
                    raw,
                    ensure_ascii=False
                )[:1000]
            ),
            content_id
        ))

        con.commit()
        con.close()

        print(
            f"{content_id}=RECONCILE_HTTP_"
            f"{response.status_code}"
        )
        reconcile_issues += 1
        continue

    obj = unwrap(raw)

    actual_account = account_id(obj)

    if str(actual_account or "") != str(EXPECTED_ACCOUNT_ID):
        con = db()

        con.execute("""
            UPDATE umkm_content_queue
            SET
                reconcile_attempts=
                    COALESCE(reconcile_attempts,0)+1,
                last_reconciled_at=?,
                reconcile_error='WRONG_ACCOUNT_FROM_REPLIZ'
            WHERE content_id=?
        """, (
            checked_at,
            content_id
        ))

        con.commit()
        con.close()

        print(
            f"{content_id}=WRONG_ACCOUNT_BLOCKED"
        )
        reconcile_issues += 1
        continue

    post_id = (
        obj.get("postId")
        or obj.get("post_id")
    )

    state = platform_state(obj)

    published_at = obj.get("publishedAt") or obj.get("published_at")
    state_normalized = state.strip().lower()
    published_proven = (
        bool(post_id)
        and state_normalized in {"published", "posted"}
        and isinstance(published_at, str)
        and bool(published_at.strip())
    )
    if published_proven:
        try:
            dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            published_proven = dt.tzinfo is not None and dt <= datetime.now(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            published_proven = False

    if published_proven:
        con = db()

        con.execute("""
            UPDATE umkm_content_queue
            SET
                status='PUBLISHED',
                publish_status='PUBLISHED',
                repliz_post_id=?,
                platform_status=?,
                published_at=?,
                last_reconciled_at=?,
                reconcile_attempts=
                    COALESCE(reconcile_attempts,0)+1,
                reconcile_error=NULL,
                note='Published and reconciled automatically via Repliz'
            WHERE content_id=?
              AND status='SCHEDULED'
              AND repliz_schedule_id=?
        """, (
            str(post_id),
            state or "published",
            published_at,
            checked_at,
            content_id,
            schedule_id
        ))

        con.commit()
        changed = con.total_changes
        con.close()

        if changed:
            print(
                f"{content_id}=PUBLISHED "
                f"postId={post_id}"
            )
        else:
            print(
                f"{content_id}=NO_CHANGE"
            )

        continue

    con = db()

    reason = (
        "PUBLISHED_PROOF_INCOMPLETE"
        if (post_id or state_normalized in {"published", "posted"})
        else "REMOTE_TERMINAL:" + state_normalized
        if state_normalized in {"failed", "error", "rejected", "cancelled"}
        else None
    )
    con.execute("""
        UPDATE umkm_content_queue
        SET
            platform_status=?,
            last_reconciled_at=?,
            reconcile_attempts=
                COALESCE(reconcile_attempts,0)+1,
            reconcile_error=?
        WHERE content_id=?
    """, (
        state or "waiting",
        checked_at,
        reason,
        content_id
    ))

    con.commit()
    con.close()
    if reason:
        reconcile_issues += 1

    print(
        f"{content_id}=WAITING "
        f"state={state or 'unknown'}"
        + (f" alert={reason}" if reason else "")
    )

if reconcile_issues:
    print(f"RECONCILE_ALERT_COUNT={reconcile_issues}")
    raise SystemExit(2)
