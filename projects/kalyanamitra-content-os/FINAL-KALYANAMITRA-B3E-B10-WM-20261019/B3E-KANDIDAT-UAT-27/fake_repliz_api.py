#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fake_repliz_api.py  (Jalur B — HANYA untuk UAT sandbox)
=======================================================
API tiruan Repliz (stdlib saja, tanpa dependensi eksternal) yang dipakai UAT.
Mendukung:

    GET  /account/{id}     -> objek akun
    GET  /account          -> daftar akun
    GET  /schedule         -> daftar jadwal (di-seed dari baseline)
    GET  /schedule/{id}    -> detail jadwal (override independen dari daftar)
    POST /schedule         -> membuat jadwal (mode diatur UAT)

Mode POST:
    "ok"     200 {"_id": "FAKE-..."} ; jadwal dicatat
    "500"    500 {"error": ...}
    "400"    400 {"error": ...}
    "drop"   koneksi diputus TANPA respons -> menyerupai timeout setelah POST

Penjaga sisi server (independen dari dedup klien): POST ke
(accountId, scheduleAt) yang sudah ada ditolak dengan 409.

Semua request dicatat; `.posts` berisi POST yang benar-benar diterima, jadi
UAT bisa membandingkan jumlah POST yang dikirim modul vs yang diterima server.
"""

from __future__ import annotations

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class _State:
    def __init__(self, accounts, schedules, schedule_details=None):
        self.accounts = {a["_id"]: a for a in accounts}
        self.schedules = list(schedules)
        self.details = dict(schedule_details or {})
        self.mode = "ok"
        self.posts = []
        self.paths = []
        self.counter = 0
        self.lock = threading.Lock()


def _make_handler(state: _State):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):  # senyap
            pass

        def _json(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urlparse(self.path)
            with state.lock:
                state.paths.append(("GET", self.path))
            parts = [p for p in parsed.path.split("/") if p]

            if parts and parts[-1] == "account":
                return self._json(200, {"docs": list(state.accounts.values()),
                                        "hasNextPage": False})
            if len(parts) >= 2 and parts[-2] == "account":
                acc = state.accounts.get(parts[-1])
                if not acc:
                    return self._json(404, {"error": "ACCOUNT_NOT_FOUND"})
                return self._json(200, acc)
            if parts and parts[-1] == "schedule":
                qs = parse_qs(parsed.query)
                page = int(qs.get("page", ["1"])[0])
                limit = int(qs.get("limit", ["100"])[0])
                start = (page - 1) * limit
                batch = state.schedules[start:start + limit]
                has_next = (start + limit) < len(state.schedules)
                return self._json(200, {
                    "docs": batch,
                    "hasNextPage": has_next,
                    "nextPage": page + 1 if has_next else None,
                })
            if len(parts) >= 2 and parts[-2] == "schedule":
                requested = parts[-1]
                doc = state.details.get(requested)
                if doc is None:
                    doc = next((s for s in state.schedules
                                if str(s.get("_id")) == requested), None)
                if doc is None:
                    return self._json(404, {"error": "SCHEDULE_NOT_FOUND"})
                return self._json(200, doc)
            return self._json(404, {"error": "NOT_FOUND", "path": parsed.path})

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8"))
            except Exception:
                payload = {"_raw": raw.decode("utf-8", "replace")}

            parsed = urlparse(self.path)
            with state.lock:
                state.paths.append(("POST", self.path))
                mode = state.mode

            if parsed.path.rstrip("/").endswith("schedule"):
                if mode == "drop":
                    # putuskan tanpa membalas: menyerupai timeout setelah POST
                    with state.lock:
                        state.posts.append({"mode": "drop", "payload": payload,
                                            "responded": False})
                    try:
                        self.connection.shutdown(socket.SHUT_RDWR)
                    except Exception:
                        pass
                    self.connection.close()
                    self.close_connection = True
                    return
                if mode == "500":
                    with state.lock:
                        state.posts.append({"mode": "500", "payload": payload,
                                            "responded": True})
                    return self._json(500, {"error": "SIMULATED_SERVER_ERROR"})
                if mode == "400":
                    with state.lock:
                        state.posts.append({"mode": "400", "payload": payload,
                                            "responded": True})
                    return self._json(400, {"error": "SIMULATED_BAD_REQUEST"})

                # mode ok + penjaga duplikat sisi server
                with state.lock:
                    dup = [
                        s for s in state.schedules
                        if str(s.get("accountId")) == str(payload.get("accountId"))
                        and s.get("scheduleAt") == payload.get("scheduleAt")
                    ]
                    if dup:
                        state.posts.append({"mode": "ok-duplikat", "payload": payload,
                                            "responded": True})
                        return self._json(409, {
                            "error": "DUPLICATE_ACCOUNT_SLOT",
                            "existing": dup[0].get("_id"),
                        })
                    state.counter += 1
                    new_id = f"FAKE-{state.counter:04d}"
                    state.schedules.append({
                        "_id": new_id,
                        "accountId": payload.get("accountId"),
                        "scheduleAt": payload.get("scheduleAt"),
                        "status": "pending",
                        "postId": None,
                        "description_prefix": str(payload.get("description", ""))[:60],
                    })
                    state.posts.append({"mode": "ok", "payload": payload,
                                        "responded": True, "id": new_id})
                return self._json(201, {"_id": new_id, "status": "pending"})

            with state.lock:
                state.posts.append({"mode": "other", "payload": payload})
            return self._json(404, {"error": "NOT_FOUND"})

    return Handler


class FakeRepliz:
    def __init__(self, accounts, schedules, host="127.0.0.1", schedule_details=None):
        self.state = _State(accounts, schedules, schedule_details)
        self._seed_accounts = [dict(a) for a in accounts]
        self._seed_schedules = [dict(s) for s in schedules]
        self._seed_details = dict(schedule_details or {})
        self.httpd = ThreadingHTTPServer((host, 0), _make_handler(self.state))
        self.host, self.port = self.httpd.server_address[0], self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def reset(self) -> None:
        """Kembalikan daftar akun/jadwal ke kondisi seed (POST tetap tercatat)."""
        self.state.accounts = {a["_id"]: dict(a) for a in self._seed_accounts}
        self.state.schedules = [dict(s) for s in self._seed_schedules]
        self.state.details = dict(self._seed_details)
        self.state.mode = "ok"

    def set_account(self, account_id: str, **fields) -> None:
        if account_id in self.state.accounts:
            self.state.accounts[account_id].update(fields)

    def baseline_pairs(self):
        return {(str(s.get("accountId")), s.get("scheduleAt")) for s in self._seed_schedules}

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}/public"

    @property
    def posts(self) -> list:
        return self.state.posts

    @property
    def post_count(self) -> int:
        return len(self.state.posts)

    def set_mode(self, mode: str) -> None:
        self.state.mode = mode

    def schedule_pairs(self):
        return {
            (str(s.get("accountId")), s.get("scheduleAt"))
            for s in self.state.schedules
        }

    def start(self):
        self.thread.start()
        return self

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
