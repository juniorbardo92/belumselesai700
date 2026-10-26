#!/usr/bin/env python3
"""UMKM Repliz reconciler — R2 candidate.

Baseline produksi: /opt/umkm-engine/scripts/reconcile_repliz.py
SHA256 ceaaf52e43df6ec372be6b26e663e32dffd6fa073dd57a0a52a64c945c36cd15 (383 baris).

Perubahan terhadap baseline (lihat docs/R2-CHANGES.md):
  1. Bukti Content API di-resolve lewat daftar konten (GET /public/content) dengan
     pencocokan teks root yang unik — BUKAN lewat schedule.postId, karena Repliz
     mengisi postId dengan ID balasan pertama (terbukti pada 14 utas).
  2. Setiap balasan diverifikasi satu per satu (ID, teks, akun, URL, createdAt,
     status, tidak ada ID ganda, urutan waktu naik).
  3. Baris READY + publish_status=SCHEDULED ikut direkonsiliasi (5 utas yang
     sebelumnya tidak pernah terlihat oleh reconciler).
  4. Retry/backoff untuk 429/5xx dengan Retry-After; kegagalan tetap fail-closed.
  5. R2.1: cabang legacy published/posted tidak boleh bypass SHADOW.
  6. Mode default SHADOW: tidak mempromosikan status. Promosi hanya jika
     UMKM_CONTENT_PROOF_PROMOTE=1 DAN UMKM_CONTENT_PROOF_PUBLISHED_AT=root_createdAt.

Tidak ada POST. Tidak ada perubahan skema. Exit 2 = ada alert yang belum tertutup.
"""
from __future__ import annotations

import json
import os
import random
import re
import sqlite3
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import requests
from requests.auth import HTTPBasicAuth

ROOT = Path("/opt/umkm-engine")
# Override hanya dipakai untuk UAT pada salinan; default tetap lokasi produksi.
DB = Path(os.environ.get("UMKM_RECONCILE_DB") or ROOT / "data/system.db")
ENV = Path(os.environ.get("UMKM_RECONCILE_ENV") or ROOT / ".env.publisher")
RESPONSES = Path(os.environ.get("UMKM_RECONCILE_RESPONSES")
                 or ROOT / "data/content/publisher/responses")

API = "https://api.repliz.com/public"

# --- kebijakan (baca dari environment proses; tidak pernah dari file .env) ----
PROMOTE = os.environ.get("UMKM_CONTENT_PROOF_PROMOTE") == "1"
PUBLISHED_AT_SOURCE = os.environ.get("UMKM_CONTENT_PROOF_PUBLISHED_AT", "").strip()
INCLUDE_READY = os.environ.get("UMKM_RECONCILE_INCLUDE_READY", "1") == "1"
MAX_LIST_PAGES = int(os.environ.get("UMKM_CONTENT_PROOF_MAX_PAGES", "40"))
ROOT_TIME_WINDOW_H = int(os.environ.get("UMKM_CONTENT_PROOF_TIME_WINDOW_H", "6"))
HTTP_RETRIES = int(os.environ.get("UMKM_RECONCILE_HTTP_RETRIES", "3"))
ALLOWED_PUBLISHED_AT_SOURCES = {"root_createdAt"}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


# --------------------------------------------------------------------------- #
# HTTP dengan retry terbatas
# --------------------------------------------------------------------------- #
class HttpFailure(Exception):
    pass


def http_get(session, url, *, params=None, auth, retries=HTTP_RETRIES, timeout=30):
    """GET dengan backoff untuk 429/5xx. Kegagalan akhir melempar HttpFailure.

    4xx selain 429 tidak diulang: itu keputusan server, bukan gangguan sesaat.
    Respons dikembalikan apa adanya agar pemanggil bisa menyimpan bukti HTTP.
    """
    last = None
    for attempt in range(retries + 1):
        try:
            resp = session.get(url, params=params, auth=auth, timeout=timeout,
                               allow_redirects=False)
        except requests.RequestException as exc:
            last = f"NETWORK:{type(exc).__name__}"
            resp = None
        else:
            if resp.status_code == 429 or 500 <= resp.status_code < 600:
                last = f"HTTP_{resp.status_code}"
            else:
                return resp
        if attempt < retries:
            delay = 0.5 * (2 ** attempt) + random.uniform(0, 0.25)
            retry_after = None
            if resp is not None:
                raw = resp.headers.get("Retry-After")
                if raw and raw.isdigit():
                    retry_after = min(int(raw), 30)
            time.sleep(retry_after if retry_after is not None else delay)
    raise HttpFailure(last or "HTTP_UNKNOWN")


# --------------------------------------------------------------------------- #
# Validasi bukti
# --------------------------------------------------------------------------- #
def normalize_text(value) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(unicodedata.normalize("NFKC", value).split())


def parse_ts(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (ValueError, TypeError, OverflowError):
        return None
    if dt.tzinfo is None:
        return None
    return dt.astimezone(timezone.utc)


def content_url_ok(value, username: str) -> bool:
    if not isinstance(value, str):
        return False
    try:
        p = urlsplit(value)
    except ValueError:
        return False
    if p.scheme != "https" or p.hostname not in {"www.threads.com", "threads.com"}:
        return False
    if p.username or p.password or p.port is not None or p.query or p.fragment:
        return False
    return re.fullmatch(
        r"/@" + re.escape(username) + r"/post/[A-Za-z0-9_-]+/?", p.path
    ) is not None


def account_id(obj) -> str | None:
    if not isinstance(obj, dict):
        return None
    value = obj.get("accountId")
    if isinstance(value, dict):
        return str(value.get("id") or value.get("_id") or "") or None
    if value:
        return str(value)
    account = obj.get("account")
    if isinstance(account, dict):
        return str(account.get("id") or account.get("_id") or "") or None
    return None


def platform_state(obj) -> str:
    if not isinstance(obj, dict):
        return ""
    for key in ("publishStatus", "status", "state"):
        value = obj.get(key)
        if value is not None:
            return str(value)
    return ""


def unwrap(data):
    if not isinstance(data, dict):
        return {}
    for key in ("data", "doc", "schedule"):
        value = data.get(key)
        if isinstance(value, dict):
            return value
    return data


def save_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", str(value))


# --------------------------------------------------------------------------- #
# Daftar konten (indeks teks root)
# --------------------------------------------------------------------------- #
class ContentIndex:
    """Indeks konten publik satu akun, dibangun dari GET /public/content bertoken.

    `limit` diabaikan oleh API (selalu 50 dokumen), jadi paginasi memakai
    `nextToken` dan berhenti bila token hilang atau tidak ada dokumen baru.
    """

    def __init__(self, session, auth, account_id: str, max_pages: int = MAX_LIST_PAGES):
        self.session = session
        self.auth = auth
        self.account_id = account_id
        self.max_pages = max_pages
        self.docs: dict[str, dict] = {}
        self.by_text: dict[str, list[dict]] = {}
        self.pages: list[dict] = []
        self.errors: list[str] = []
        self.loaded = False

    def load(self) -> "ContentIndex":
        if self.loaded:
            return self
        token = None
        for page in range(1, self.max_pages + 1):
            params = {"accountId": self.account_id}
            if token:
                params["nextToken"] = token
            try:
                resp = http_get(self.session, f"{API}/content", params=params, auth=self.auth)
            except HttpFailure as exc:
                self.errors.append(str(exc))
                break
            self.pages.append({"page": page, "status": resp.status_code, "bytes": len(resp.content)})
            if resp.status_code != 200:
                self.errors.append(f"LISTING_HTTP_{resp.status_code}")
                break
            try:
                body = resp.json()
            except ValueError:
                self.errors.append("LISTING_INVALID_JSON")
                break
            batch = body.get("docs") if isinstance(body, dict) else None
            if not isinstance(batch, list):
                self.errors.append("LISTING_SHAPE")
                break
            new = 0
            for doc in batch:
                if not isinstance(doc, dict) or not doc.get("id"):
                    continue
                if doc["id"] in self.docs:
                    continue
                self.docs[doc["id"]] = doc
                self.by_text.setdefault(normalize_text(doc.get("description")), []).append(doc)
                new += 1
            token = body.get("nextToken")
            if not token or new == 0:
                break
        else:
            self.errors.append("LISTING_PAGE_LIMIT")
        self.loaded = True
        return self


# --------------------------------------------------------------------------- #
# Bukti utas
# --------------------------------------------------------------------------- #
def prove_thread(index: ContentIndex, schedule: dict, *, owner_id: str, username: str,
                 account_id: str, window_hours: int = ROOT_TIME_WINDOW_H) -> dict:
    """Bukti root + seluruh balasan. Read-only; tidak menyentuh SQLite."""
    proof = {
        "schema": "umkm.thread_proof/v2",
        "account_id": account_id,
        "owner_id": owner_id,
        "schedule_id": str(schedule.get("_id") or schedule.get("id") or ""),
        "schedule_status": platform_state(schedule),
        "schedule_at": schedule.get("scheduleAt"),
        "post_id_field": str(schedule.get("postId") or ""),
        "post_id_field_role": "UNKNOWN",
        "root": {"result": "BLOCKED"},
        "replies": {"result": "BLOCKED", "rows": []},
        "duplicate_post_ids": [],
        "result": "BLOCKED",
    }
    if index.errors:
        proof["root"] = {"result": "BLOCKED", "reason": "CONTENT_INDEX_INCOMPLETE",
                         "errors": index.errors}
        proof["reason"] = "CONTENT_INDEX_INCOMPLETE"
        return proof

    root_text = normalize_text(schedule.get("description"))
    if not root_text:
        proof["root"] = {"result": "BLOCKED", "reason": "SCHEDULE_TEXT_EMPTY"}
        proof["reason"] = "SCHEDULE_TEXT_EMPTY"
        return proof

    matches = index.by_text.get(root_text) or []
    if len(matches) != 1:
        proof["root"] = {
            "result": "BLOCKED",
            "reason": "ROOT_TEXT_NOT_FOUND" if not matches else "ROOT_TEXT_NOT_UNIQUE",
            "matches": len(matches),
        }
        proof["reason"] = proof["root"]["reason"]
        return proof

    root = matches[0]
    root_ts = parse_ts(root.get("createdAt"))
    sched_ts = parse_ts(schedule.get("scheduleAt"))
    window_ok = bool(root_ts and sched_ts and
                     abs((root_ts - sched_ts).total_seconds()) <= window_hours * 3600)
    owner = root.get("owner") if isinstance(root.get("owner"), dict) else {}
    root_checks = {
        "id_present": bool(root.get("id")),
        "owner_id_match": str(owner.get("id") or "") == str(owner_id),
        "url_valid": content_url_ok(root.get("url"), username),
        "created_at_valid": root_ts is not None and root_ts <= datetime.now(timezone.utc),
        "schedule_time_window": window_ok,
    }
    proof["root"] = {
        "result": "PASS" if all(root_checks.values()) else "BLOCKED",
        "id": root.get("id"),
        "url": root.get("url"),
        "createdAt": root.get("createdAt"),
        "owner_name": owner.get("name"),
        "checks": root_checks,
        "reason": "ID_OWNER_URL_CREATEDAT_ACCOUNT_VERIFIED" if all(root_checks.values())
                  else "ROOT_" + next(k for k, v in root_checks.items() if not v).upper(),
    }
    if proof["root"]["result"] != "PASS":
        proof["reason"] = proof["root"]["reason"]
        return proof

    replies = schedule.get("replies") or []
    if not isinstance(replies, list) or not replies:
        proof["replies"] = {"result": "BLOCKED", "rows": [], "reason": "NO_REPLIES_IN_SCHEDULE"}
        proof["reason"] = "NO_REPLIES_IN_SCHEDULE"
        return proof

    rows, ids, stamps = [], [], []
    for i, item in enumerate(replies):
        item = item if isinstance(item, dict) else {}
        pid = str(item.get("postId") or "")
        row = {"index": i, "post_id": pid, "schedule_status": platform_state(item)}
        ids.append(pid)
        if not pid:
            row.update(result="BLOCKED", reason="MISSING_POST_ID")
            rows.append(row)
            continue
        if i == 0 and pid == proof["post_id_field"]:
            # Diketahui: elemen pertama balasan memakai ID yang sama dengan
            # schedule.postId. Dicatat, bukan dianggap bukti root.
            row["note"] = "SCHEDULE_POST_ID_EQUALS_FIRST_REPLY"
        try:
            resp = http_get(index.session, f"{API}/content/{pid}",
                            params={"accountId": account_id}, auth=index.auth)
        except HttpFailure as exc:
            row.update(result="BLOCKED", reason=f"CONTENT_{exc}")
            rows.append(row)
            continue
        row["content_http"] = resp.status_code
        if resp.status_code != 200:
            row.update(result="BLOCKED", reason=f"CONTENT_HTTP_{resp.status_code}")
            rows.append(row)
            continue
        try:
            doc = unwrap(resp.json())
        except ValueError:
            row.update(result="BLOCKED", reason="CONTENT_INVALID_JSON")
            rows.append(row)
            continue
        doc_owner = doc.get("owner") if isinstance(doc.get("owner"), dict) else {}
        ts = parse_ts(doc.get("createdAt"))
        checks = {
            "id_match": str(doc.get("id") or "") == pid,
            "owner_id_match": str(doc_owner.get("id") or "") == str(owner_id),
            "url_valid": content_url_ok(doc.get("url"), username),
            "created_at_valid": ts is not None and ts <= datetime.now(timezone.utc),
            "text_match": normalize_text(doc.get("description")) == normalize_text(item.get("description")),
            "schedule_status_success": platform_state(item).strip().lower() == "success",
        }
        row.update({
            "url": doc.get("url"),
            "createdAt": doc.get("createdAt"),
            "checks": checks,
            "result": "PASS" if all(checks.values()) else "BLOCKED",
            "reason": None if all(checks.values())
                      else next(k for k, v in checks.items() if not v).upper(),
        })
        if ts:
            stamps.append(ts)
        rows.append(row)

    distinct = len(set(ids))
    order_ok = all(a <= b for a, b in zip(stamps, stamps[1:])) if len(stamps) > 1 else True
    proof["replies"] = {
        "count": len(rows),
        "distinct_ids": distinct,
        "order_nondecreasing": order_ok,
        "rows": rows,
        "result": "PASS" if (rows and all(r["result"] == "PASS" for r in rows)
                             and distinct == len(rows) and order_ok) else "BLOCKED",
    }
    proof["duplicate_post_ids"] = sorted({p for p in ids if p and ids.count(p) > 1})
    if proof["replies"]["result"] != "PASS":
        proof["reason"] = ("DUPLICATE_POST_ID" if proof["duplicate_post_ids"] else
                           "REPLY_ORDER_INVALID" if not order_ok else "REPLY_PROOF_INCOMPLETE")
        return proof

    role = "UNKNOWN"
    if proof["post_id_field"] == root.get("id"):
        role = "ROOT"
    elif proof["post_id_field"] in ids:
        role = "REPLY"
    proof["post_id_field_role"] = role
    proof["result"] = "PASS"
    proof["reason"] = "ROOT_AND_ALL_REPLIES_VERIFIED"
    return proof


# --------------------------------------------------------------------------- #
# Guard skema / promosi
# --------------------------------------------------------------------------- #
def promotion_gate(con, published_at_value):
    """(boleh, alasan). Gagal tertutup bila kontrak tidak lengkap."""
    if not PROMOTE:
        return False, "SHADOW_MODE"
    if PUBLISHED_AT_SOURCE not in ALLOWED_PUBLISHED_AT_SOURCES:
        return False, "PUBLISHED_AT_SOURCE_UNCONTRACTED"
    if published_at_value is None:
        return False, "PUBLISHED_AT_MISSING"
    columns = {row["name"]: row for row in con.execute("PRAGMA table_info(umkm_content_queue)")}
    for needed in ("published_at", "note", "platform_status"):
        if needed not in columns:
            return False, f"SCHEMA_MISSING_{needed.upper()}"
    if con.execute("SELECT count(*) FROM sqlite_master WHERE type='trigger' "
                   "AND tbl_name='umkm_content_queue'").fetchone()[0]:
        return False, "SCHEMA_TRIGGER_PRESENT"
    return True, "OK"


def promote(con, *, content_id, schedule_id, root_id, state, published_at, note):
    cur = con.execute("""
        UPDATE umkm_content_queue
        SET status='PUBLISHED',
            publish_status='PUBLISHED',
            repliz_post_id=?,
            platform_status=?,
            published_at=?,
            last_reconciled_at=?,
            reconcile_attempts=COALESCE(reconcile_attempts,0)+1,
            reconcile_error=NULL,
            note=?
        WHERE content_id=?
          AND repliz_schedule_id=?
          AND status IN ('SCHEDULED','READY')
          AND publish_status='SCHEDULED'
          AND (repliz_post_id IS NULL OR repliz_post_id='')
    """, (str(root_id), state, published_at, now_utc(), note, content_id, schedule_id))
    con.commit()
    return cur.rowcount == 1


def record_attempt(con, content_id, *, platform_status, error):
    con.execute("""
        UPDATE umkm_content_queue
        SET platform_status=?,
            last_reconciled_at=?,
            reconcile_attempts=COALESCE(reconcile_attempts,0)+1,
            reconcile_error=?
        WHERE content_id=?
    """, (platform_status, now_utc(), error, content_id))
    con.commit()


# --------------------------------------------------------------------------- #
# Job selection
# --------------------------------------------------------------------------- #
def select_jobs(con, include_ready: bool, limit: int = 50):
    statuses = ("SCHEDULED", "READY") if include_ready else ("SCHEDULED",)
    placeholders = ",".join("?" for _ in statuses)
    return con.execute(f"""
        SELECT content_id, repliz_schedule_id, scheduled_at, repliz_post_id, status
        FROM umkm_content_queue
        WHERE status IN ({placeholders})
          AND publish_status='SCHEDULED'
          AND repliz_schedule_id IS NOT NULL
          AND repliz_schedule_id<>''
          AND (repliz_post_id IS NULL OR repliz_post_id='')
        ORDER BY COALESCE(last_reconciled_at,'') ASC, scheduled_at ASC
        LIMIT ?
    """, (*statuses, limit)).fetchall()


def main() -> int:
    load_env(ENV)

    access_key = os.environ.get("REPLIZ_ACCESS_KEY")
    secret_key = os.environ.get("REPLIZ_SECRET_KEY")
    account = os.environ.get("REPLIZ_THREADS_ACCOUNT_ID")
    owner_id = os.environ.get("REPLIZ_THREADS_OWNER_ID")
    username = os.environ.get("REPLIZ_THREADS_USERNAME", "umkmnaikkelas.id")

    if not all([access_key, secret_key, account]):
        print("RECONCILE_CONFIG_INCOMPLETE")
        return 2
    if not owner_id:
        # Fail-closed: identitas pemilik tidak boleh ditebak dari nama tampilan.
        print("RECONCILE_OWNER_ID_NOT_CONFIGURED")
        return 2

    RESPONSES.mkdir(parents=True, exist_ok=True)
    auth = HTTPBasicAuth(access_key, secret_key)
    session = requests.Session()

    con = db()
    jobs = select_jobs(con, INCLUDE_READY)
    con.close()

    if not jobs:
        print("RECONCILE_QUEUE_EMPTY")
        return 0

    index = ContentIndex(session, auth, account)
    alerts = 0
    shadow_ready = 0
    promoted = 0

    for row in jobs:
        content_id = row["content_id"]
        schedule_id = row["repliz_schedule_id"]
        checked_at = now_utc()

        try:
            resp = http_get(session, f"{API}/schedule/{schedule_id}", auth=auth)
        except HttpFailure as exc:
            con = db()
            record_attempt(con, content_id, platform_status="UNKNOWN",
                           error=f"SCHEDULE_{exc}")
            con.close()
            print(f"{content_id}=SCHEDULE_{exc}")
            alerts += 1
            continue

        try:
            raw = resp.json()
        except ValueError:
            raw = {"raw": resp.text[:2000]}
        save_json(RESPONSES / f"{safe_name(content_id)}-reconcile.json",
                  {"http_status": resp.status_code, "checked_at": checked_at,
                   "mode": "PROMOTE" if PROMOTE else "SHADOW", "response": raw})

        if resp.status_code != 200:
            con = db()
            record_attempt(con, content_id, platform_status="UNKNOWN",
                           error=f"HTTP {resp.status_code}: "
                                 + json.dumps(raw, ensure_ascii=False)[:800])
            con.close()
            print(f"{content_id}=SCHEDULE_HTTP_{resp.status_code}")
            alerts += 1
            continue

        obj = unwrap(raw)

        # Akun wajib cocok bila provider menyebutkannya.
        actual_account = account_id(obj)
        if actual_account is not None and actual_account != str(account):
            con = db()
            record_attempt(con, content_id, platform_status=platform_state(obj) or "unknown",
                           error="WRONG_ACCOUNT_FROM_REPLIZ")
            con.close()
            print(f"{content_id}=WRONG_ACCOUNT_BLOCKED")
            alerts += 1
            continue

        state = platform_state(obj)
        state_norm = state.strip().lower()

        # R2.1 SECURITY GATE: No schedule-only fast path may promote a row.
        # A previous R2 branch allowed status=published/posted + publishedAt to
        # call promote() while SHADOW was active, and without owner/root proof.
        # The provider's postId can refer to the first reply, not the root.
        # All terminal-positive states must use full Content API thread proof
        # and the same explicit promotion_gate below.
        if state_norm not in {"success", "published", "posted"}:
            con = db()
            reason = ("REMOTE_TERMINAL:" + state_norm
                      if state_norm in {"failed", "error", "rejected", "cancelled"} else None)
            record_attempt(con, content_id, platform_status=state or "waiting", error=reason)
            con.close()
            print(f"{content_id}=WAITING state={state or 'unknown'}"
                  + (f" alert={reason}" if reason else ""))
            if reason:
                alerts += 1
            continue

        # Status success tanpa publishedAt: bukti Content API.
        if not index.loaded:
            index.load()
        proof = prove_thread(index, obj, owner_id=owner_id, username=username,
                             account_id=str(account))
        proof.update({"content_id": content_id, "checked_at": checked_at})
        save_json(RESPONSES / f"{safe_name(content_id)}-content-proof.json", proof)

        if proof["result"] != "PASS":
            con = db()
            record_attempt(con, content_id, platform_status=state,
                           error="CONTENT_PROOF_" + str(proof.get("reason")))
            con.close()
            print(f"{content_id}=CONTENT_PROOF_BLOCKED reason={proof.get('reason')}")
            alerts += 1
            continue

        root_created = proof["root"].get("createdAt")
        con = db()
        allowed, gate_reason = promotion_gate(
            con, root_created if PUBLISHED_AT_SOURCE == "root_createdAt" else None)
        if not allowed:
            record_attempt(con, content_id, platform_status=state,
                           error=None if gate_reason == "SHADOW_MODE"
                                 else "PROMOTION_GATE:" + gate_reason)
            con.close()
            if gate_reason == "SHADOW_MODE":
                shadow_ready += 1
                print(f"{content_id}=CONTENT_PROOF_PASS_SHADOW root={proof['root']['id']} "
                      f"replies={proof['replies']['count']}")
            else:
                alerts += 1
                print(f"{content_id}=PROMOTION_BLOCKED reason={gate_reason}")
            continue

        ok = promote(con, content_id=content_id, schedule_id=schedule_id,
                     root_id=proof["root"]["id"], state=state,
                     published_at=root_created,
                     note=("Reconciled via Repliz Content API; published_at from "
                           "root post createdAt (source=root_createdAt)"))
        con.close()
        if ok:
            promoted += 1
            print(f"{content_id}=PUBLISHED source=CONTENT_API root={proof['root']['id']}")
        else:
            alerts += 1
            print(f"{content_id}=NO_CHANGE (row changed under us)")

    print(f"RECONCILE_MODE={'PROMOTE' if PROMOTE else 'SHADOW'}")
    print(f"RECONCILE_PROOF_READY={shadow_ready}")
    print(f"RECONCILE_PROMOTED={promoted}")
    print(f"RECONCILE_ALERT_COUNT={alerts}")
    return 0 if alerts == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
