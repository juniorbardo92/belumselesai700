#!/usr/bin/env python3
"""Hermes project checklist gate v1. No network, SSH, publishing, or production writes.

Receipts can prove file hashes and reported test counts but not external truth.
No command (including ingestion) can auto-close a task. Owner approval is interactive.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import sys

ID_RE = re.compile(r"^[HBQKUSCX][0-9]{2}$")
ROW_RE = re.compile(r"^- \[([ x-])\] \*\*([A-Z][0-9]{2}) · ([^·]+) · ([A-Z_]+)\*\* — (.*)$")
HISTORICAL = {"CLOSED", "CLOSED_DEV", "OPEN", "PARTIAL", "HOLD", "STOPPED"}
ALLOWED_RECEIPT_SCOPES = {"dev", "production", "publication", "operations", "audit"}

class GateError(Exception): pass

def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def dumps(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def parse_checklist(path: Path):
    raw=path.read_text(encoding="utf-8")
    result=[]
    for line in raw.splitlines():
        m=ROW_RE.match(line)
        if not m: continue
        marker, task, priority, status, description=m.groups()
        if status not in HISTORICAL or not ID_RE.fullmatch(task):
            raise GateError(f"UNKNOWN_ID_OR_STATE:{task}:{status}")
        if (marker=="x") != (status in {"CLOSED", "CLOSED_DEV"}):
            raise GateError(f"MARKER_CONFLICT:{task}")
        if (marker=="-") != (status in {"HOLD", "STOPPED"}):
            raise GateError(f"MARKER_CONFLICT:{task}")
        if not priority.strip().startswith("P"):
            raise GateError(f"PRIORITY_INVALID:{task}")
        result.append((task,priority.strip(),status,description))
    if len(result)!=81 or len({t[0] for t in result})!=81:
        raise GateError(f"INVALID_MASTER_ITEM_COUNT:{len(result)}")
    return result

def validate_policy(policy, valid_ids):
    if policy.get("schema")!=1 or policy.get("allow_automatic_close") is not False:
        raise GateError("UNSAFE_POLICY")
    for typ in ("dependencies_for_start", "dependencies_for_close"):
        graph=policy.get(typ)
        if not isinstance(graph,dict): raise GateError("INVALID_DEPENDENCY_POLICY")
        for item, dep in graph.items():
            if item not in valid_ids or not isinstance(dep,list) or len(set(dep))!=len(dep):
                raise GateError("INVALID_DEPENDENCY")
            if any(x not in valid_ids or x==item for x in dep):
                raise GateError("UNKNOWN_OR_SELF_DEPENDENCY")
    graph={i:set(policy["dependencies_for_start"].get(i,[])+policy["dependencies_for_close"].get(i,[])) for i in valid_ids}
    def walk(k,path):
        if k in path: raise GateError("DEPENDENCY_CYCLE")
        for d in graph[k]: walk(d,path|{k})
    for k in graph:walk(k,set())

class Gate:
    def __init__(self,root):
        self.root=Path(root).expanduser().resolve()
        if not self.root.is_dir(): raise GateError("NOT_INITIALIZED")
        db=self.root/"ledger.sqlite"
        if not db.is_file() or db.is_symlink(): raise GateError("LEDGER_MISSING")
        self.db=sqlite3.connect(db, timeout=20)
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA busy_timeout=20000")
        self.policy=json.loads((self.root/"policy.json").read_text())
    def close(self):self.db.close()
    def evt(self,typ,payload):
        last=self.db.execute("SELECT hash FROM events ORDER BY seq DESC LIMIT 1").fetchone()
        prev=last[0] if last else "0"*64
        data=dumps({"time":stamp(),"kind":typ,"payload":payload,"prev":prev})
        digest=sha(data.encode())
        self.db.execute("INSERT INTO events(time,kind,payload,prev,hash) VALUES(?,?,?,?,?)",(stamp(),typ,dumps(payload),prev,digest))
        # Store the event canonical time in payload (the database time is independent metadata).
        self.db.execute("UPDATE events SET time=? WHERE seq=last_insert_rowid()",(json.loads(data)["time"],))
    def row(self,task):
        row=self.db.execute("SELECT * FROM tasks WHERE id=?",(task,)).fetchone()
        if row is None:raise GateError("UNKNOWN_TASK")
        return row
    def blockers(self,task,typ):
        b=[]
        for dep in self.policy[typ].get(task,[]):
            r=self.row(dep)
            if r["state"] not in ("CLOSED","CLOSED_DEV"):
                b.append({"task":dep,"state":r["state"]})
        return b
    def claim(self,task,actor):
        if not actor or len(actor)>96:raise GateError("INVALID_ACTOR")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            row=self.row(task)
            if row["state"] in ("CLOSED","CLOSED_DEV","HOLD","STOPPED"):
                raise GateError("TASK_NOT_ACTIVE")
            if row["phase"] in ("CLAIMED", "VERIFIED_PENDING_OWNER"):
                raise GateError("TASK_ALREADY_IN_FLIGHT")
            blockers=self.blockers(task,"dependencies_for_start")
            if blockers:raise GateError("BLOCKED_START_DEPENDENCIES:"+dumps(blockers))
            token=secrets.token_urlsafe(24)
            self.db.execute("UPDATE tasks SET phase='CLAIMED',actor=?,token_sha=?,revision=revision+1,updated_at=? WHERE id=?",(actor,sha(token.encode()),stamp(),task))
            self.evt("CLAIM_ACCEPTED",{"id":task,"actor":actor})
        return {"result":"CLAIM_ACCEPTED","task_id":task,"token":token,"note":"Store token privately; submit the receipt via the inbox."}
    def submit(self,receipt):
        if not isinstance(receipt,dict) or set(receipt)!=set(("task_id","token","run_id","actor","scope","baseline","tests","artifacts")):
            raise GateError("RECEIPT_SCHEMA_MISMATCH")
        task=receipt["task_id"]
        row=self.row(task)
        if row["phase"]!="CLAIMED":raise GateError("TASK_NOT_CLAIMED")
        if not isinstance(receipt["token"],str) or not secrets.compare_digest(row["token_sha"],sha(receipt["token"].encode())):
            raise GateError("INVALID_CLAIM_TOKEN")
        if receipt["actor"]!=row["actor"]:raise GateError("ACTOR_MISMATCH")
        if receipt["scope"] not in ALLOWED_RECEIPT_SCOPES:raise GateError("INVALID_SCOPE")
        if not isinstance(receipt["run_id"],str) or not re.fullmatch(r"[a-zA-Z0-9_\-.:]{6,100}",receipt["run_id"]):
            raise GateError("INVALID_RUN_ID")
        if not isinstance(receipt["baseline"],str) or not 6<=len(receipt["baseline"])<=250:
            raise GateError("BASELINE_REQUIRED")
        tests=receipt["tests"]
        if not isinstance(tests,dict) or set(tests)!={"command","total","passed","failed","exit_code"}:
            raise GateError("INVALID_TEST_SCHEMA")
        if not isinstance(tests["command"],str) or len(tests["command"].strip())<3:raise GateError("TEST_COMMAND_REQUIRED")
        if any(type(tests[x]) is not int or tests[x]<0 for x in ("total","passed","failed")) or type(tests["exit_code"]) is not int:
            raise GateError("INVALID_TEST_RESULT")
        if tests["total"]<1 or tests["passed"]!=tests["total"] or tests["failed"]!=0 or tests["exit_code"]!=0:
            with self.db:
                self.db.execute("BEGIN IMMEDIATE")
                locked=self.row(task)
                if locked["phase"]!="CLAIMED" or locked["token_sha"]!=sha(receipt["token"].encode()):raise GateError("CLAIM_CHANGED_CONCURRENTLY")
                self.db.execute("UPDATE tasks SET phase='BLOCKED_TEST',token_sha=NULL,updated_at=? WHERE id=?",(stamp(),task))
                self.evt("TEST_FAIL",{"id":task,"run_id":receipt["run_id"],"tests":tests})
            return {"result":"BLOCKED_TEST","task_id":task}
        items=receipt["artifacts"]
        if not isinstance(items,list) or not 1<=len(items)<=15:raise GateError("ARTIFACTS_REQUIRED")
        checked=[]
        for x in items:
            if not isinstance(x,dict) or set(x)!={"path","sha256"}:raise GateError("INVALID_ARTIFACT")
            if not isinstance(x["path"],str) or not isinstance(x["sha256"],str) or not re.fullmatch(r"[a-f0-9]{64}",x["sha256"]):
                raise GateError("ARTIFACT_METADATA_INVALID")
            p=Path(x["path"])
            if not p.is_absolute() or p.is_symlink() or not p.is_file() or not stat.S_ISREG(p.stat().st_mode):
                raise GateError("ARTIFACT_UNSAFE_OR_MISSING")
            if p.stat().st_size>128*1024*1024:raise GateError("ARTIFACT_TOO_LARGE")
            if sha(p.read_bytes())!=x["sha256"]:raise GateError("ARTIFACT_SHA256_MISMATCH")
            checked.append({"path":str(p),"sha256":x["sha256"]})
        # Closing prerequisites are intentionally evaluated at approval time so testing can be parallel.
        blockers=self.blockers(task,"dependencies_for_close")
        proof={k:v for k,v in receipt.items() if k!="token"}
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            locked=self.row(task)
            if locked["phase"]!="CLAIMED" or locked["token_sha"]!=sha(receipt["token"].encode()):raise GateError("CLAIM_CHANGED_CONCURRENTLY")
            self.db.execute("UPDATE tasks SET phase='VERIFIED_PENDING_OWNER',token_sha=NULL,updated_at=? WHERE id=?",(stamp(),task))
            self.db.execute("INSERT INTO proofs(task_id,receipt,verified_at) VALUES(?,?,?)",(task,dumps(proof),stamp()))
            self.evt("STRUCTURAL_PROOF_PASS",{"id":task,"run_id":receipt["run_id"],"scope":receipt["scope"],"artifact_count":len(checked),"close_blockers":blockers})
        return {"result":"STRUCTURAL_PASS_OWNER_PENDING","task_id":task,"close_blockers":blockers,"warning":"Test counts are reported by the submitter; owner must review the actual log and external proof."}
    def approve(self,task,decision,reviewer,reason):
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            row=self.row(task)
            if row["phase"]!="VERIFIED_PENDING_OWNER":raise GateError("NO_VERIFIED_RECEIPT")
            if not reviewer or not reason or len(reason)<8:raise GateError("REVIEWER_AND_REASON_REQUIRED")
            if decision not in ("CLOSED","CLOSED_DEV","REJECT"):
                raise GateError("INVALID_DECISION")
            if decision!="REJECT":
                blockers=self.blockers(task,"dependencies_for_close")
                if blockers:raise GateError("BLOCKED_CLOSE_DEPENDENCIES:"+dumps(blockers))
                proof=json.loads(self.db.execute("SELECT receipt FROM proofs WHERE task_id=? ORDER BY rowid DESC LIMIT 1",(task,)).fetchone()[0])
                if decision=="CLOSED_DEV" and proof["scope"]!="dev":raise GateError("SCOPE_MISMATCH_CLOSE_DEV")
                if decision=="CLOSED" and proof["scope"]=="dev":raise GateError("DEV_PROOF_CANNOT_CLOSE_PRODUCTION")
            state=row["state"] if decision=="REJECT" else decision
            phase="IDLE" if decision=="REJECT" else "CLOSED"
            self.db.execute("UPDATE tasks SET state=?,phase=?,token_sha=NULL,actor=NULL,revision=revision+1,updated_at=? WHERE id=?",(state,phase,stamp(),task))
            self.evt("OWNER_DECISION",{"id":task,"decision":decision,"reviewer":reviewer,"reason":reason})
        return {"result":"OWNER_REJECTED" if decision=="REJECT" else "CLOSED_OWNER_APPROVED","task_id":task,"state":state}
    def audit(self):
        events=self.db.execute("SELECT seq,time,kind,payload,prev,hash FROM events ORDER BY seq").fetchall()
        prev="0"*64
        for e in events:
            if e["prev"]!=prev or sha(dumps({"time":e["time"],"kind":e["kind"],"payload":json.loads(e["payload"]),"prev":prev}).encode())!=e["hash"]:
                raise GateError(f"EVENT_CHAIN_CORRUPT_AT:{e['seq']}")
            prev=e["hash"]
        counts=dict(self.db.execute("SELECT state,count(*) FROM tasks GROUP BY state"))
        problems=[]
        for row in self.db.execute("SELECT id,state,phase FROM tasks WHERE state IN ('CLOSED','CLOSED_DEV')"):
            if row["phase"] not in ("BASELINE_CLOSED","CLOSED"):
                problems.append({"id":row["id"],"issue":"CLOSED_PHASE_INVALID"})
        return {"result":"AUDIT_PASS" if not problems else "AUDIT_WARN","task_count":sum(counts.values()),"status_counts":counts,"event_count":len(events),"chain_valid":True,"warnings":problems}
    def list_tasks(self):
        res=[]
        for r in self.db.execute("SELECT id,priority,state,phase,description FROM tasks ORDER BY rowid"):
            d=dict(r);d["close_blockers"]=self.blockers(r["id"],"dependencies_for_close");res.append(d)
        return res

SCHEMA="""
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, priority TEXT NOT NULL,state TEXT NOT NULL,phase TEXT NOT NULL,description TEXT NOT NULL,actor TEXT,token_sha TEXT,revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,prev TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proofs(task_id TEXT NOT NULL REFERENCES tasks(id),receipt TEXT NOT NULL,verified_at TEXT NOT NULL);
"""

def initialize(root,checklist,policyfile):
    root=Path(root).expanduser().resolve()
    if root.exists() and any(root.iterdir()):raise GateError("REFUSE_OVERWRITE_EXISTING_STATE")
    rows=parse_checklist(Path(checklist))
    policy=json.loads(Path(policyfile).read_text(encoding="utf-8"))
    validate_policy(policy,{x[0] for x in rows})
    os.umask(0o077)
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    root.chmod(0o700)
    (root/"inbox").mkdir(mode=0o700)
    (root/"processed").mkdir(mode=0o700)
    (root/"rejected").mkdir(mode=0o700)
    (root/"policy.json").write_text(dumps(policy)+"\n",encoding="utf-8")
    (root/"policy.json").chmod(0o600)
    (root/"checklist-source.sha256").write_text(sha(Path(checklist).read_bytes())+"\n")
    db=sqlite3.connect(root/"ledger.sqlite")
    db.executescript(SCHEMA)
    with db:
        for task,priority,state,description in rows:
            db.execute("INSERT INTO tasks(id,priority,state,phase,description,updated_at) VALUES(?,?,?,?,?,?)",(task,priority,state,"BASELINE_CLOSED" if state in {"CLOSED","CLOSED_DEV"} else "IDLE",description,stamp()))
    db.close()
    g=Gate(root)
    with g.db:
        g.evt("BASELINE_IMPORTED",{"count":len(rows),"source_sha256":sha(Path(checklist).read_bytes()),"status_counts":g.audit()["status_counts"]})
    result=g.audit();g.close()
    return result

def read_receipt(path):
    path=Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size>128*1024:
        raise GateError("RECEIPT_UNSAFE_OR_TOO_LARGE")
    return json.loads(path.read_text(encoding="utf-8"))

def ingest(g):
    results=[]
    for p in sorted((g.root/"inbox").glob("*.json")):
        if p.is_symlink() or not p.is_file():
            target=g.root/"rejected"/p.name
            if target.exists():target=g.root/"rejected"/(p.stem+"-"+secrets.token_hex(4)+".json")
            p.rename(target)  # quarantine symlink itself; never follow target
            results.append({"file":p.name,"result":"REJECTED_UNSAFE_RECEIPT"})
            continue
        try:
            receipt=read_receipt(p)
            result=g.submit(receipt)
            target=g.root/"processed"/p.name
            if target.exists():raise GateError("DUPLICATE_RECEIPT_FILENAME")
            p.rename(target)
        except Exception as e:
            result={"result":"REJECTED","reason":type(e).__name__+":"+str(e)}
            target=g.root/"rejected"/p.name
            if target.exists(): target=g.root/"rejected"/(p.stem+"-"+secrets.token_hex(4)+".json")
            p.rename(target)
        results.append({"file":p.name,**result})
    return {"result":"INGEST_COMPLETE","count":len(results),"receipts":results}

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root",default=str(Path.home()/".local/state/hermes-quality-gate"))
    sub=ap.add_subparsers(dest="cmd",required=True)
    p=sub.add_parser("init");p.add_argument("--checklist",required=True);p.add_argument("--policy",required=True)
    p=sub.add_parser("claim");p.add_argument("--task",required=True);p.add_argument("--actor",required=True)
    p=sub.add_parser("submit");p.add_argument("--receipt",required=True)
    sub.add_parser("ingest")
    p=sub.add_parser("approve");p.add_argument("--task",required=True);p.add_argument("--decision",choices=["CLOSED","CLOSED_DEV","REJECT"],required=True);p.add_argument("--reviewer",required=True);p.add_argument("--reason",required=True)
    sub.add_parser("audit");sub.add_parser("status");sub.add_parser("next")
    a=ap.parse_args(argv)
    try:
        if a.cmd=="init":out=initialize(a.root,a.checklist,a.policy)
        else:
            g=Gate(a.root)
            try:
                if a.cmd=="claim":out=g.claim(a.task,a.actor)
                elif a.cmd=="submit":out=g.submit(read_receipt(a.receipt))
                elif a.cmd=="ingest":out=ingest(g)
                elif a.cmd=="audit":out=g.audit()
                elif a.cmd=="status":out={"tasks":g.list_tasks(),"count":81}
                elif a.cmd=="next":out={"tasks":[r for r in g.list_tasks() if r["state"] in ("OPEN","PARTIAL") and r["phase"] not in ("CLAIMED","VERIFIED_PENDING_OWNER") and not g.blockers(r["id"],"dependencies_for_start")]}
                else:
                    if not sys.stdin.isatty():raise GateError("OWNER_INTERACTIVE_TTY_REQUIRED")
                    expected=f"{a.decision} {a.task}"
                    print(f"OWNER CONFIRM: type exactly {expected}",file=sys.stderr)
                    if input().strip()!=expected:raise GateError("OWNER_CONFIRMATION_MISMATCH")
                    out=g.approve(a.task,a.decision,a.reviewer,a.reason)
            finally:g.close()
        print(json.dumps(out,ensure_ascii=False,indent=2))
    except (GateError, OSError, sqlite3.Error, ValueError, KeyError) as e:
        print(json.dumps({"result":"BLOCKED","reason":str(e)},ensure_ascii=False),file=sys.stderr)
        return 2
    return 0

if __name__=="__main__":sys.exit(main())
