#!/usr/bin/env python3
"""Bounded, account-verified Repliz reader (K07).

Masalah yang diselesaikan
-------------------------
1. `GET /public/schedule` mengabaikan `accountIds=<id>` (string biasa) sehingga
   hasil tercampur akun lain. Yang dihormati API adalah `accountIds[0]=<id>`.
   Pembaca ini selalu memakai bentuk berindeks dan tetap memverifikasi
   `accountId` setiap item; item tanpa akun atau akun lain -> BLOCKED/DBUANG.
2. `GET /public/content` mengabaikan `limit` (selalu 50 dokumen, ~60-68 KB),
   dan dokumentasi berisi URL CDN bertanda tangan yang panjang. Satu respons
   sebesar itu dikirim sebagai satu baris SSE -> `SSE_LINE_TOO_LARGE`.
   Pembaca ini memproyeksikan field, memotong deskripsi, dan menolak halaman
   yang melewati batas byte.
3. Paginasi: `/schedule` memakai page/totalPages, `/content` memakai nextToken.
   Keduanya ditangani dengan batas halaman eksplisit.

Hanya GET. Tidak ada POST, tidak menyentuh database.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests
from requests.auth import HTTPBasicAuth

API = "https://api.repliz.com/public"
DEFAULT_MAX_BYTES = 256 * 1024
DEFAULT_DESC_CHARS = 280


class ReaderBlocked(RuntimeError):
    pass


def load_env(path: str) -> dict:
    out = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def item_account(item: dict) -> str | None:
    raw = item.get("accountId") or item.get("account")
    if isinstance(raw, dict):
        raw = raw.get("id") or raw.get("_id")
    if isinstance(raw, (str, int)) and str(raw).strip():
        return str(raw)
    return None


def clip(value, limit: int):
    if not isinstance(value, str):
        return value
    return value if len(value) <= limit else value[:limit] + "…"


class Client:
    def __init__(self, access_key: str, secret_key: str, *, max_bytes: int = DEFAULT_MAX_BYTES,
                 desc_chars: int = DEFAULT_DESC_CHARS, timeout: int = 30,
                 session: requests.Session | None = None):
        self.auth = HTTPBasicAuth(access_key, secret_key)
        self.max_bytes = max_bytes
        self.desc_chars = desc_chars
        self.timeout = timeout
        self.session = session or requests.Session()
        self.stats = []

    def _get(self, path: str, params: dict):
        resp = self.session.get(f"{API}{path}", params=params, auth=self.auth,
                                timeout=self.timeout, allow_redirects=False)
        size = len(resp.content)
        oversized = size > self.max_bytes
        self.stats.append({"path": path, "bytes": size, "status": resp.status_code,
                           "oversized": oversized})
        if oversized:
            raise ReaderBlocked(f"RESPONSE_TOO_LARGE:{path}:{size}>{self.max_bytes}")
        if resp.status_code != 200:
            raise ReaderBlocked(f"HTTP_{resp.status_code}:{path}")
        try:
            return resp.json()
        except ValueError:
            raise ReaderBlocked(f"INVALID_JSON:{path}")

    # -- jadwal ------------------------------------------------------------
    def list_schedules(self, account_id: str, *, page_limit: int = 20,
                       max_pages: int = 300, from_date: str | None = None,
                       to_date: str | None = None) -> list[dict]:
        out, dropped = [], 0
        page = 1
        limit = page_limit
        self.effective_limit = limit
        while page <= max_pages:
            params = {"page": page, "limit": limit, "accountIds[0]": account_id}
            if from_date:
                params["fromDate"] = from_date
            if to_date:
                params["toDate"] = to_date
            try:
                body = self._get("/schedule", params)
            except ReaderBlocked as exc:
                # Satu halaman /schedule bisa >300 KB karena tiap jadwal membawa
                # seluruh balasan. Persempit halaman, bukan melonggarkan batas byte.
                if "RESPONSE_TOO_LARGE" in str(exc) and limit > 10:
                    # Halaman terlalu besar: perkecil limit dan mulai ulang dari
                    # halaman 1, karena penomoran halaman ikut berubah.
                    limit = max(1, limit // 2)
                    self.effective_limit = limit
                    out, dropped, page = [], 0, 1
                    continue
                raise
            docs = body.get("docs")
            if not isinstance(docs, list):
                raise ReaderBlocked("SCHEDULE_SHAPE")
            for item in docs:
                if not isinstance(item, dict):
                    raise ReaderBlocked("SCHEDULE_ITEM_SHAPE")
                acc = item_account(item)
                if acc is None:
                    # Filter akun tidak bisa dipercaya bila item tanpa akun.
                    raise ReaderBlocked("SCHEDULE_ITEM_WITHOUT_ACCOUNT")
                if acc != str(account_id):
                    dropped += 1
                    continue
                out.append(self._project_schedule(item))
            total_pages = body.get("totalPages")
            if not isinstance(total_pages, int):
                raise ReaderBlocked("SCHEDULE_TOTAL_PAGES_MISSING")
            if page >= total_pages:
                break
            page += 1
        else:
            raise ReaderBlocked("SCHEDULE_PAGE_LIMIT")
        self.dropped = dropped
        return out

    def _project_schedule(self, item: dict) -> dict:
        replies = item.get("replies") or []
        return {
            "id": str(item.get("id") or item.get("_id") or ""),
            "status": item.get("status"),
            "postId": str(item.get("postId") or ""),
            "accountId": item_account(item),
            "scheduleAt": item.get("scheduleAt"),
            "updatedAt": item.get("updatedAt"),
            "description": clip(item.get("description"), self.desc_chars),
            "reply_count": len(replies) if isinstance(replies, list) else 0,
            "reply_status": [r.get("status") for r in replies if isinstance(r, dict)],
            "reply_post_ids": [str(r.get("postId") or "") for r in replies if isinstance(r, dict)],
        }

    # -- konten ------------------------------------------------------------
    def list_content(self, account_id: str, *, max_pages: int = 40) -> list[dict]:
        out, token, page = [], None, 1
        while page <= max_pages:
            params = {"accountId": account_id}
            if token:
                params["nextToken"] = token
            body = self._get("/content", params)
            docs = body.get("docs")
            if not isinstance(docs, list):
                raise ReaderBlocked("CONTENT_SHAPE")
            for doc in docs:
                if not isinstance(doc, dict):
                    raise ReaderBlocked("CONTENT_ITEM_SHAPE")
                owner = doc.get("owner") if isinstance(doc.get("owner"), dict) else {}
                url = doc.get("url")
                try:
                    host = urlsplit(url).hostname if isinstance(url, str) else None
                except ValueError:
                    host = None
                out.append({
                    "id": str(doc.get("id") or ""),
                    "createdAt": doc.get("createdAt"),
                    "owner": owner.get("name"),
                    "owner_id": str(owner.get("id") or ""),
                    "host": host,
                    "url": clip(url, 200),
                    "description": clip(doc.get("description"), self.desc_chars),
                    "description_len": len(doc.get("description") or ""),
                })
            token = body.get("nextToken")
            if not token:
                break
            page += 1
        else:
            raise ReaderBlocked("CONTENT_PAGE_LIMIT")
        return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Bounded Repliz reader (GET only)")
    ap.add_argument("--env", required=True)
    ap.add_argument("--account-id", required=True)
    ap.add_argument("--kind", choices=["content", "schedule"], default="content")
    ap.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    ap.add_argument("--json-out")
    args = ap.parse_args(argv)

    cfg = load_env(args.env)
    client = Client(cfg["REPLIZ_ACCESS_KEY"], cfg["REPLIZ_SECRET_KEY"], max_bytes=args.max_bytes)
    started = time.time()
    try:
        if args.kind == "content":
            rows = client.list_content(args.account_id)
        else:
            rows = client.list_schedules(args.account_id)
    except ReaderBlocked as exc:
        print(json.dumps({"result": "BLOCKED", "reason": str(exc)}, ensure_ascii=False))
        return 2
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    info = {
        "result": "OK",
        "kind": args.kind,
        "items": len(rows),
        "payload_bytes": len(payload.encode()),
        "max_page_bytes": max((s["bytes"] for s in client.stats if not s["oversized"]),
                              default=0),
        "rejected_oversized_pages": sum(1 for s in client.stats if s["oversized"]),
        "raw_max_bytes": max((s["bytes"] for s in client.stats), default=0),
        "requests": len(client.stats),
        "seconds": round(time.time() - started, 2),
        "dropped_other_account": getattr(client, "dropped", 0),
        "effective_page_limit": getattr(client, "effective_limit", None),
        "primary_account_only": all(
            (r.get("accountId") or r.get("owner_id")) is not None for r in rows),
    }
    if args.json_out:
        Path(args.json_out).write_text(payload, encoding="utf-8")
    print(json.dumps(info, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
