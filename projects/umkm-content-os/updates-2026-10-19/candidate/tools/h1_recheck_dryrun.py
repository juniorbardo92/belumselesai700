#!/usr/bin/env python3
"""H+1 metric re-check (GET only, no writes).

Menjawab temuan: metrik H+1 diukur sekali, lalu baris berstatus INCOMPLETE tidak
pernah diukur ulang. Skrip ini membaca salinan database, mengambil statistik
terbaru dari Repliz, dan melaporkan berapa baris akan berubah status bila
pengukuran diulang. Tidak menulis ke database mana pun.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

API = "https://api.repliz.com/public"


def load_env(path):
    out = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="salinan database (read-only)")
    ap.add_argument("--env", default="/opt/umkm-engine/.env.publisher")
    ap.add_argument("--account-id", default=None)
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    cfg = load_env(args.env)
    account = args.account_id or cfg["REPLIZ_THREADS_ACCOUNT_ID"]
    auth = HTTPBasicAuth(cfg["REPLIZ_ACCESS_KEY"], cfg["REPLIZ_SECRET_KEY"])
    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute("""
        SELECT content_id, repliz_post_id, views, measured_at, status, reason
        FROM umkm_h1_metrics
        WHERE status='INCOMPLETE' AND repliz_post_id IS NOT NULL AND repliz_post_id<>''
        ORDER BY measured_at DESC LIMIT ?
    """, (args.limit,)).fetchall()
    con.close()

    out, flipped = [], 0
    for r in rows:
        try:
            resp = requests.get(f"{API}/content/{r['repliz_post_id']}/statistic",
                                params={"accountId": account}, auth=auth, timeout=30,
                                allow_redirects=False)
            body = resp.json() if resp.status_code == 200 else {}
        except (requests.RequestException, ValueError):
            resp, body = None, {}
        views = body.get("views") if isinstance(body, dict) else None
        interactions = None
        if isinstance(body, dict):
            parts = [body.get(k) for k in ("like", "replies", "repost", "quotes")]
            if all(isinstance(p, (int, float)) for p in parts):
                interactions = int(sum(parts))
        complete = isinstance(views, (int, float)) and views > 0 and interactions is not None
        if complete:
            flipped += 1
        out.append({
            "content_id": r["content_id"], "post_id": r["repliz_post_id"],
            "stored_views": r["views"], "measured_at": r["measured_at"],
            "live_views": views, "live_interactions": interactions,
            "would_be": "COMPLETE" if complete else "INCOMPLETE",
            "engagement_rate": round(interactions / views * 100, 4) if complete else None,
        })
        print(f"{r['content_id']}: stored={r['views']} live={views} -> "
              f"{'COMPLETE' if complete else 'INCOMPLETE'}")

    summary = {
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sampled": len(out), "would_flip_to_complete": flipped,
        "still_incomplete": len(out) - flipped, "rows": out,
        "note": "Dry-run; tidak ada UPDATE. Statistik Repliz dapat berubah antar waktu.",
    }
    Path(args.out).write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
