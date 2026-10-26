#!/usr/bin/env python3
"""KAL-AUTO-001 guarded owner-intent -> EXISTING VPS2 publisher adapter.
No network writes outside the existing publisher. No timer, migration or daemon.
All commands default fail closed; use only in a dedicated, locked-down service account.
"""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import hmac
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ACCOUNT = "6a8d2c7862caae1e0405397a"
HISTORIC = {"KAL-PILOT-001", "6ad35c0f83496b501f49814f", "17937674628128307", "18181149934429102"}
TZ = ZoneInfo("Asia/Jakarta")
UTC = timezone.utc
REQUIRED_COLS = {"content_id", "tradition", "topic", "status", "priority", "attempts", "output_path", "review_status", "validator_status", "note", "publish_status", "repliz_schedule_id", "scheduled_at"}
ALLOWED_INTENTS = {"DRAFT", "SCHEDULE", "PUBLISH_ASAP"}

class Blocked(Exception):
    def __init__(self, code): self.code = code; super().__init__(code)

def env(name, default=None): return os.environ.get(name, default)
def base_dir(): return Path(env("KAL_AUTO_DATA_DIR", "/var/lib/kal-auto-001"))
def db_path(): return base_dir() / "intent.sqlite"
def sha256(raw: bytes): return hashlib.sha256(raw).hexdigest()
def canonical(data): return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()

@contextlib.contextmanager
def open_store():
    root=base_dir(); root.mkdir(parents=True, exist_ok=True, mode=0o700); os.chmod(root,0o700)
    con=sqlite3.connect(db_path(), timeout=15)
    try:
        con.execute("PRAGMA busy_timeout=15000")
        con.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY, message_id TEXT UNIQUE NOT NULL, dedup TEXT UNIQUE NOT NULL,
          owner_id TEXT NOT NULL, account_id TEXT NOT NULL,
          intent TEXT NOT NULL, slot_utc TEXT, source_hash TEXT NOT NULL,
          draft_path TEXT, state TEXT NOT NULL, schedule_id TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          error_code TEXT, attempts INTEGER NOT NULL DEFAULT 0
        );
        """)
        yield con
    finally:
        con.close()

def valid_text(s, maxlen=200):
    return isinstance(s,str) and 0<len(s.strip())<=maxlen and not any(ord(c)<32 and c not in "\n\t" for c in s)

def normalized_posts_hash(posts):
    # Uniqueness in *owner-intent ledger* only; canonical production fingerprint remains elsewhere.
    return sha256(canonical(posts))

def parse_slot(p):
    requested=p.get("slot_wib")
    if p["intent"] == "DRAFT":
        if requested is not None: raise Blocked("DRAFT_MUST_NOT_HAVE_SLOT")
        return None
    if p["intent"] == "PUBLISH_ASAP":
        if requested is not None: raise Blocked("ASAP_MUST_NOT_HAVE_SLOT")
        # Repliz is a scheduler; do NOT call this instant publication.
        now=datetime.now(TZ)
        slot=now.replace(second=0, microsecond=0)+timedelta(minutes=16)
    else:
        if not isinstance(requested,str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}",requested):
            raise Blocked("SLOT_WIB_REQUIRED_YYYY_MM_DDTHH_MM")
        try: slot=datetime.fromisoformat(requested).replace(tzinfo=TZ)
        except ValueError: raise Blocked("INVALID_WIB_SLOT")
    now=datetime.now(TZ)
    if slot < now+timedelta(minutes=10): raise Blocked("SLOT_TOO_SOON")
    if slot > now+timedelta(days=62): raise Blocked("SLOT_BEYOND_WINDOW")
    return slot.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00","Z")

def validate_payload(p):
    keys={"owner_id","message_id","intent","account_id","posts","topic","tradition","source_refs","source_verified","slot_wib","content_version","sources","claims","public_practice_safe"}
    if not isinstance(p,dict) or set(p)-keys: raise Blocked("INVALID_PAYLOAD_FIELDS")
    if str(p.get("owner_id"))!=env("KAL_AUTO_OWNER_ID", "__NOT_CONFIGURED__"): raise Blocked("OWNER_NOT_ALLOWLISTED")
    msg=str(p.get("message_id",""))
    if not re.fullmatch(r"\d{1,20}[:/][0-9]{1,20}", msg): raise Blocked("INVALID_TELEGRAM_MESSAGE_ID")
    if p.get("intent") not in ALLOWED_INTENTS: raise Blocked("INTENT_NOT_AUTHORIZED")
    if p.get("account_id")!=ACCOUNT: raise Blocked("ACCOUNT_NOT_ALLOWLISTED")
    posts=p.get("posts")
    if not isinstance(posts,list) or len(posts)>8 or len(posts)<1 or any(not valid_text(t,500) or len(t.encode())>500 for t in posts):
        raise Blocked("INVALID_POSTS_MAX_500_BYTES")
    topic=p.get("topic","")
    if not valid_text(topic,150): raise Blocked("INVALID_TOPIC")
    if p.get("tradition", "THERAVADA") not in {"THERAVADA","MAHAYANA","VAJRAYANA"}: raise Blocked("INVALID_TRADITION")
    ver=str(p.get("content_version", "1"))
    if not re.fullmatch(r"[1-9][0-9]{0,4}",ver): raise Blocked("INVALID_CONTENT_VERSION")
    refs=p.get("source_refs",[])
    if not isinstance(refs,list) or len(refs)>20 or any(not valid_text(v,500) for v in refs):raise Blocked("INVALID_SOURCE_REFS")
    if p["intent"]!="DRAFT":
        if p.get("source_verified") is not True or not refs: raise Blocked("QA_SOURCE_NOT_VERIFIED")
        # Do not claim review APPROVED if structured sources/claims do not exist.
        # The real Dharma validator requires sources, claims and public_practice_safe.
        sources=p.get("sources")
        claims=p.get("claims")
        if not isinstance(sources,list) or not sources or len(sources)>15:
            raise Blocked("QA_STRUCTURED_SOURCES_REQUIRED")
        if not all(isinstance(x,dict) and x.get("verified") is True and
                   valid_text(x.get("name"),200) and valid_text(x.get("title"),300) and
                   isinstance(x.get("url"),str) and x["url"].startswith("https://")
                   for x in sources):
            raise Blocked("QA_SOURCE_FIELDS_INVALID")
        if not isinstance(claims,list) or not claims or len(claims)>30:
            raise Blocked("QA_CLAIMS_REQUIRED")
        for x in claims:
            if not isinstance(x,dict) or not valid_text(x.get("id"),80):
                raise Blocked("QA_CLAIM_INVALID")
            if x.get("claim_type") not in {"DOCTRINAL","SOURCE_METADATA","TRANSLATOR_NOTE","EDITORIAL","PRACTICE","SAFETY"}:
                raise Blocked("QA_CLAIM_TYPE")
            if x.get("status") not in {"SUPPORTED","EDITORIAL"}:
                raise Blocked("QA_UNSUPPORTED_CLAIM")
            indexes=x.get("source_indexes",[])
            if not isinstance(indexes,list) or any(type(i) is not int or i<0 or i>=len(sources) for i in indexes):
                raise Blocked("QA_CLAIM_SOURCE_INDEX")
            if x["status"]=="SUPPORTED" and not indexes:
                raise Blocked("QA_CLAIM_MISSING_SOURCE")
            if x["status"]=="EDITORIAL" and indexes:
                raise Blocked("QA_EDITORIAL_MUST_NOT_USE_SOURCE")
        if p.get("public_practice_safe") is not True:
            raise Blocked("QA_PUBLIC_PRACTICE_NOT_VERIFIED")
        # Existing v2 publisher reads only 6-8 parts, so do not silently truncate a 1-part post.
        if len(posts)<6: raise Blocked("PUBLISHER_REQUIRES_6_TO_8_PARTS")
    slot=parse_slot(p)
    text=" ".join(posts)
    if any(x in text or x in topic for x in HISTORIC): raise Blocked("HISTORIC_PILOT_GUARD")
    # Do not authorize remote URLs/media within a text-only ingestion API.
    return {"slot_utc":slot,"message_id":msg,"source_hash":normalized_posts_hash(posts),"version":ver}

def signing_secret():
    path=env("KAL_AUTO_HMAC_FILE")
    if not path: raise Blocked("SIGNING_SECRET_UNCONFIGURED")
    q=Path(path)
    st=q.stat()
    if st.st_mode & 0o077: raise Blocked("SECRET_PERMISSIONS_NOT_PRIVATE")
    secret=q.read_bytes().strip()
    if len(secret)<32: raise Blocked("SIGNING_SECRET_TOO_SHORT")
    return secret

def verify_envelope(doc):
    if not isinstance(doc,dict) or set(doc)!={"payload","sent_at","nonce","signature"}:raise Blocked("BAD_ENVELOPE")
    if not isinstance(doc["sent_at"],int) or abs(time.time()-doc["sent_at"])>300:raise Blocked("ENVELOPE_EXPIRED")
    if not re.fullmatch(r"[a-f0-9]{32}",str(doc["nonce"])): raise Blocked("BAD_NONCE")
    signed={k:doc[k] for k in ("payload","sent_at","nonce")}
    expect=hmac.new(signing_secret(),canonical(signed),hashlib.sha256).hexdigest()
    if not isinstance(doc["signature"],str) or not hmac.compare_digest(expect,doc["signature"]):raise Blocked("INVALID_SIGNATURE")
    return doc["payload"]

def sign_payload(p, nonce=None, now=None):
    from secrets import token_hex
    signed={"payload":p,"sent_at":int(now if now is not None else time.time()),"nonce":nonce or token_hex(16)}
    return {**signed,"signature":hmac.new(signing_secret(),canonical(signed),hashlib.sha256).hexdigest()}

def atomic_file(path:Path, obj):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    raw=json.dumps(obj,ensure_ascii=False,indent=2).encode()
    temp=path.with_name(path.name+".temp."+str(os.getpid()))
    fd=os.open(temp, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd,'wb') as f: f.write(raw);f.flush();os.fsync(f.fileno())
        os.replace(temp,path)
    finally:
        with contextlib.suppress(FileNotFoundError): temp.unlink()

def make_draft(p, jid):
    return {"content_id":jid,"topic":p["topic"],"title":p["topic"],"tradition":p.get("tradition","THERAVADA"),
            "thread":[{"post":i,"purpose":"MATERI_PEMILIK","text":t} for i,t in enumerate(p["posts"],1)],
            "sources":p.get("sources",[]), "claims":p.get("claims",[]),
            "review":{"status":"APPROVED" if p["intent"]!="DRAFT" else "REVISION_REQUIRED", "source_verified":p.get("source_verified") is True,
                      "public_practice_safe":p.get("public_practice_safe") is True,
                      "unsupported_claims":[], "restricted_instruction_present":False,
                      "vajrayana_restriction_warning":False},
            "source_refs":p.get("source_refs",[]),"source_content_id":None}

def ingest(doc):
    p=verify_envelope(doc)
    info=validate_payload(p)
    slot=info["slot_utc"]
    # Same content/slot cannot produce a second job, even from a new telegram update.
    dedup=sha256(canonical([info["source_hash"],ACCOUNT,"threads",slot,info["version"]]))
    jid="KAL-AUTO-"+sha256(canonical([p["message_id"],dedup]))[:20].upper()
    now=datetime.now(UTC).isoformat()
    with open_store() as con:
        con.execute("BEGIN IMMEDIATE")
        row=con.execute("SELECT id,state FROM jobs WHERE message_id=? OR dedup=?", (p["message_id"],dedup)).fetchone()
        if row:
            con.commit();return {"status":"DUPLICATE_NO_POST","job_id":row[0],"state":row[1]}
        path=base_dir()/"drafts"/(jid+".json")
        atomic_file(path,make_draft(p,jid))
        con.execute("INSERT INTO jobs(id,message_id,dedup,owner_id,account_id,intent,slot_utc,source_hash,draft_path,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (jid,p["message_id"],dedup,str(p["owner_id"]),ACCOUNT,p["intent"],slot,info["source_hash"],str(path),"DRAFT" if p["intent"]=="DRAFT" else "READY",now,now))
        con.commit()
    return {"status":"ACCEPTED_NO_PUBLISH","job_id":jid,"state":"DRAFT" if p["intent"]=="DRAFT" else "READY", "slot_utc":slot}

def safe_read_job(con,jid):
    if not re.fullmatch(r"KAL-AUTO-[A-F0-9]{20}",jid):raise Blocked("INVALID_JOB_ID")
    con.row_factory=sqlite3.Row
    row=con.execute("SELECT * FROM jobs WHERE id=?",(jid,)).fetchone()
    if not row:raise Blocked("JOB_NOT_FOUND")
    return row

def check_queue_schema(con):
    cols={r[1] for r in con.execute("PRAGMA table_info(content_queue)")}
    if not REQUIRED_COLS <= cols:raise Blocked("PRODUCTION_QUEUE_SCHEMA_MISMATCH")
    # Any nonnullable column lacking a default & not supplied is a blocker.
    supplied={"content_id","tradition","topic","status","priority","attempts","output_path","review_status","validator_status","note","publish_status"}
    extra=[r[1] for r in con.execute("PRAGMA table_info(content_queue)") if r[3] and r[4] is None and not r[5] and r[1] not in supplied]
    if extra:raise Blocked("REQUIRED_QUEUE_COLUMNS_UNMAPPED")

def check_live_preflight(require_write=True):
    if require_write and env("KAL_AUTO_WRITE_ENABLED")!="true":raise Blocked("WRITE_KILL_SWITCH_OFF")
    script=Path(env("KAL_AUTO_PUBLISHER", "/opt/kalyanamitra/scripts/jalurb/publisher_kalyanamitra.py"))
    expected=env("KAL_AUTO_PUBLISHER_SHA256")
    if not expected or not re.fullmatch(r"[0-9a-f]{64}",expected):raise Blocked("PUBLISHER_HASH_NOT_PINNED")
    if not script.is_file() or sha256(script.read_bytes())!=expected:raise Blocked("PUBLISHER_HASH_MISMATCH")
    fp=Path(env("KAL_AUTO_FINGERPRINT_PATH","/opt/kalyanamitra/provisioning/fingerprint_kalyanamitra.py"))
    fp_hash="319db0062bdfb43c9203d2f5b83727b635309004f3bc90b64149d0f20cd2d930"
    if not fp.is_file() or sha256(fp.read_bytes())!=fp_hash:raise Blocked("FINGERPRINT_CANONICAL_HASH_MISMATCH")
    db=Path(env("KAL_AUTO_PRODUCTION_DB","/opt/kalyanamitra/data/kalyanamitra.db"))
    if not db.is_file(): raise Blocked("PRODUCTION_DB_NOT_FOUND")
    with sqlite3.connect(f"file:{db}?mode=ro",uri=True) as con:check_queue_schema(con)
    return script, db

def dispatch(jid):
    # Test-mode is a local mock only. No actual provider POST is possible in mock.
    mode=env("KAL_AUTO_BACKEND","disabled")
    if mode=="mock":
        with open_store() as con:
            con.execute("BEGIN IMMEDIATE")
            row=safe_read_job(con,jid)
            if row["state"]!="READY": raise Blocked("NOT_READY_OR_ALREADY_CLAIMED")
            con.execute("UPDATE jobs SET state='MOCK_SCHEDULED',attempts=attempts+1,updated_at=? WHERE id=?",(datetime.now(UTC).isoformat(),jid))
            con.commit()
        return {"job_id":jid,"state":"MOCK_SCHEDULED","network_posts":0}
    if mode!="publisher_vps2":raise Blocked("BACKEND_DISABLED")
    script, prod_db=check_live_preflight()
    with open_store() as con:
        con.execute("BEGIN IMMEDIATE")
        row=safe_read_job(con,jid)
        if row["state"]!="READY":raise Blocked("NOT_READY_OR_ALREADY_CLAIMED")
        # Persistent claim BEFORE touching queue/HTTP: never auto-retry after failure.
        con.execute("UPDATE jobs SET state='SUBMISSION_UNCERTAIN',attempts=attempts+1,updated_at=? WHERE id=?",(datetime.now(UTC).isoformat(),jid))
        con.commit()
    draft_path=Path(row["draft_path"])
    if not draft_path.is_file():raise Blocked("DRAFT_MISSING_RECONCILE_REQUIRED")
    # Using existing publisher/DB path; no independent Repliz create in this service.
    try:
        with sqlite3.connect(prod_db,timeout=12) as prod:
            prod.execute("BEGIN IMMEDIATE")
            check_queue_schema(prod)
            exists=prod.execute("SELECT content_id FROM content_queue WHERE content_id=?",(jid,)).fetchone()
            if not exists:
                data=json.loads(draft_path.read_text(encoding="utf-8"))
                prod.execute("INSERT INTO content_queue(content_id,tradition,topic,status,priority,attempts,output_path,review_status,validator_status,note,publish_status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (jid,data["tradition"],data["topic"],"READY",100,1,str(draft_path),"APPROVED","PASS","OWNER_INTENT_KAL_AUTO_001","NOT_SUBMITTED"))
            prod.commit()
    except Exception:
        # DB constraint or migration mismatch must stay uncertain until operator reconciles.
        raise Blocked("QUEUE_INSERT_FAILED_RECONCILE_REQUIRED")
    slot=datetime.fromisoformat(row["slot_utc"].replace("Z","+00:00")).astimezone(TZ).strftime("%Y-%m-%dT%H:%M")
    args=[sys.executable,str(script),"--akun","threads","--content-id",jid,"--slot",slot,"--strict-slot","--max-jobs","1","--db",str(prod_db)]
    try:
        r=subprocess.run(args,capture_output=True,text=True,timeout=140,env={**os.environ,"KALYANAMITRA_FINGERPRINT_DIR":str(Path(env("KAL_AUTO_FINGERPRINT_PATH", "/opt/kalyanamitra/provisioning/fingerprint_kalyanamitra.py")).parent)})
    except subprocess.TimeoutExpired:
        raise Blocked("PUBLISHER_TIMEOUT_RECONCILE_REQUIRED")
    # Never trust exit code alone; consult publisher DB for schedule ID/state.
    with sqlite3.connect(f"file:{prod_db}?mode=ro",uri=True) as prod:
        res=prod.execute("SELECT publish_status,repliz_schedule_id FROM content_queue WHERE content_id=?",(jid,)).fetchone()
    if not res or not res[1]:raise Blocked("SUBMISSION_UNKNOWN_RECONCILE_REQUIRED")
    state="SCHEDULED" if res[0]=="SCHEDULED" else "SUBMISSION_UNCERTAIN"
    with open_store() as con:
        con.execute("UPDATE jobs SET state=?,schedule_id=?,updated_at=? WHERE id=?",(state,str(res[1]),datetime.now(UTC).isoformat(),jid));con.commit()
    return {"job_id":jid,"state":state,"schedule_id":str(res[1]),"slot_utc":row["slot_utc"],"publisher_rc":r.returncode}

def status(jid):
    with open_store() as con:
        row=safe_read_job(con,jid)
        return {"job_id":jid,"state":row["state"],"slot_utc":row["slot_utc"],"schedule_id":row["schedule_id"],"attempts":row["attempts"],"error_code":row["error_code"]}

def main(argv=None):
    ap=argparse.ArgumentParser(description="KAL-AUTO-001: guarded staging adapter, fail closed")
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("sign",help="VPS4: stdin raw payload JSON, stdout signed envelope; protect stdout")
    sub.add_parser("ingest",help="VPS2: stdin signed envelope; no API calls")
    p=sub.add_parser("dispatch",help="VPS2 controlled single writer");p.add_argument("job_id")
    p=sub.add_parser("status");p.add_argument("job_id")
    sub.add_parser("preflight",help="read-only production preflight; blocked by default")
    a=ap.parse_args(argv)
    try:
        if a.cmd=="sign":
            p=json.load(sys.stdin);validate_payload(p)
            print(json.dumps(sign_payload(p),ensure_ascii=False));return 0
        if a.cmd=="ingest":
            # Bound stdin for safe TLS/SSH transport.
            raw=sys.stdin.buffer.read(65537)
            if len(raw)>65536:raise Blocked("PAYLOAD_TOO_LARGE")
            result=ingest(json.loads(raw))
        elif a.cmd=="dispatch":
            try:
                result=dispatch(a.job_id)
            except Blocked as exc:
                # The outer ledger is already SUBMISSION_UNCERTAIN after claiming;
                # preserve machine-readable reason across CLI process termination.
                with contextlib.suppress(sqlite3.Error, Blocked, OSError):
                    with open_store() as con:
                        con.execute("UPDATE jobs SET error_code=?, updated_at=? WHERE id=? AND state='SUBMISSION_UNCERTAIN'",
                            (exc.code,datetime.now(UTC).isoformat(),a.job_id));con.commit()
                raise
        elif a.cmd=="status":result=status(a.job_id)
        elif a.cmd=="preflight":
            script,db=check_live_preflight(require_write=False);result={"status":"LIVE_PREFLIGHT_PASS","publisher_sha256":sha256(script.read_bytes()),"production_db_exists":db.is_file()}
        else: raise Blocked("INVALID_COMMAND")
        print(json.dumps(result,ensure_ascii=False));return 0
    except (Blocked, json.JSONDecodeError, OSError,sqlite3.Error) as exc:
        # No private content / API response printed.
        code=exc.code if isinstance(exc,Blocked) else type(exc).__name__.upper()
        print(json.dumps({"status":"BLOCKED","reason":code}));return 3

if __name__=="__main__":raise SystemExit(main())
