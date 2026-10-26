#!/usr/bin/env python3
"""KAL-AUTO-001 V4. Read-only Repliz/Threads proof + separate evidence ledger + once-only Telegram alerts.
NEVER calls a Repliz write endpoint or modifies existing KAL-AUTO jobs / publisher.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import fcntl
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

try:
    import requests
except ImportError:
    requests = None

ROOT = Path('/var/lib/kal-auto-intake')
DATA = ROOT / 'state' / 'kalauto'
PROOF_DB = DATA / 'publication_proof.sqlite'
SOURCE_DB = DATA / 'intent.sqlite'
NOTIFY_FILE = ROOT / 'telegram-notify.json'
META_FILE = ROOT / 'meta-threads-ro.token'
ENV_FILE = Path('/opt/kalyanamitra/.env')
REPLIZ = 'https://api.repliz.com/public'
ACCOUNT = '6a8d2c7862caae1e0405397a'
THREADS_OWNER = '28137012079294786'
# Root ID independently observed via Repliz Content API in the historical Gampopa UAT.
# Still require fresh GET /content/{id} before accepting as proof.
ROOT_SEEDS={'6ad814e47e1804fa7c9430d0':'18373177039215205'}
UTC = timezone.utc

class ProofError(Exception): pass

def now(): return datetime.now(UTC)
def iso(dt): return dt.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00','Z')
def parse_time(s):
    try: return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(UTC)
    except (ValueError,AttributeError,TypeError): return None

def private_json(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_mode & 0o077: raise ProofError('PRIVATE_CONFIG_NOT_AVAILABLE')
    return json.loads(path.read_text())

def read_env(path):
    values={}
    for line in path.read_text().splitlines():
        s=line.strip()
        if not s or s.startswith('#') or '=' not in s:continue
        key,val=s.split('=',1)
        values[key.strip().removeprefix('export ')]=val.strip().strip("'\"")
    return values

def unpack(obj):
    if isinstance(obj,dict):
        if isinstance(obj.get('data'),dict):return obj['data']
        if isinstance(obj.get('result'),dict):return obj['result']
    return obj

def post_texts(schedule):
    replies=schedule.get('replies')
    if not isinstance(replies,list) or any(not isinstance(x,dict) for x in replies):raise ProofError('INVALID_REPLIES')
    texts=[schedule.get('description')]+[x.get('description') for x in replies]
    if not 1<=len(texts)<=8 or any(not isinstance(x,str) or not x.strip() for x in texts):raise ProofError('INVALID_SCHEDULE_TEXTS')
    return texts

def numeric_id(value):
    val=str(value or '')
    return val if re.fullmatch(r'\d{14,24}', val) else None

def verified_permalink(value):
    if not isinstance(value,str):return None
    u=urlsplit(value)
    if u.scheme!='https' or u.hostname not in ('www.threads.com','threads.com') or u.port not in (None,443):return None
    if not re.fullmatch(r'/@ruangkalyanamitra/post/[A-Za-z0-9_-]{6,30}/?',u.path):return None
    return 'https://www.threads.com'+u.path.rstrip('/')

def owner_id(doc):
    holder=doc.get('owner') or {}
    return str(holder.get('id') or doc.get('ownerId') or '') if isinstance(holder,dict) else str(doc.get('ownerId') or '')

def normalize(s):return re.sub(r'\s+',' ',html.unescape(s or '')).strip()

def html_content_evidence(body,text):
    """Require identifiable, content-bearing HTML, not a 200/login/JS skeleton."""
    import html as html_lib
    meta=re.findall(r'<meta\s+[^>]*(?:property|name)=["\'](?:og:description|description)["\'][^>]*>',body,re.I)
    desc=' '.join(html_lib.unescape(re.search(r'content=["\']([^"\']+)',t,re.I).group(1))
                  for t in meta if re.search(r'content=["\']([^"\']+)',t,re.I))
    reference=normalize(text)
    return len(reference)>=50 and len(normalize(desc))>=50 and normalize(desc).startswith(reference[:50])

class Api:
    def __init__(self, auth, session=None):
        if requests is None:raise ProofError('REQUESTS_NOT_INSTALLED')
        self.session=session or requests.Session()
        self.auth=auth
    def get(self,path,params=None):
        if not re.fullmatch(r'/[a-zA-Z0-9/_-]+',path):raise ProofError('INVALID_API_PATH')
        r=self.session.get(REPLIZ+path,auth=self.auth,params=params,timeout=(5,12),allow_redirects=False)
        if r.status_code!=200:raise ProofError(f'REPLIZ_HTTP_{r.status_code}')
        if len(r.content)>2_000_000:raise ProofError('API_RESPONSE_TOO_LARGE')
        return unpack(r.json())
    def get_public(self,link,text):
        try:
            if not verified_permalink(link):return 'INVALID_URL'
            resp=self.session.get(link,timeout=(4,8),allow_redirects=False,headers={'Accept':'text/html'})
            if resp.status_code!=200 or len(resp.content)>1_500_000:return 'NOT_VERIFIED'
            return 'VERIFIED' if html_content_evidence(resp.text,text) else 'NOT_VERIFIED'
        except Exception:return 'NOT_VERIFIED'
    def parent(self, id, token):
        # Official Meta Threads read-only. Access token is optional and never echoed.
        try:
            r=self.session.get(f'https://graph.threads.net/v1.0/{id}',params={'fields':'id,replied_to,root_post'},headers={'Authorization':'Bearer '+token},timeout=(4,10),allow_redirects=False)
            return r.json() if r.status_code==200 else None
        except Exception:return None

def list_recent_roots(api,expected,owner,limit_pages=3):
    token=None
    for _ in range(limit_pages):
        params={'accountId':ACCOUNT}
        if token: params['nextToken']=token
        obj=api.get('/content',params)
        if isinstance(obj,list): docs=obj; token=None
        elif isinstance(obj,dict):
            docs=obj.get('docs') or obj.get('contents') or []
            token=obj.get('nextToken')
        else: raise ProofError('CONTENT_LIST_INVALID')
        if not isinstance(docs,list):raise ProofError('CONTENT_LIST_INVALID')
        for item in docs:
            if not isinstance(item,dict):continue
            if item.get('description')!=expected:continue
            if owner and owner_id(item) and owner_id(item)!=owner:continue
            if numeric_id(item.get('id')):
                return item
        if not token:break
    return None

def collect_content(api,schedule,texts):
    generated=str((schedule.get('account') or {}).get('generatedId') or '')
    if generated and generated!=THREADS_OWNER:
        return {'status':'INCOMPLETE','reason':'SCHEDULE_PLATFORM_OWNER_MISMATCH','posts':[]}
    expected_owner=THREADS_OWNER
    seed=ROOT_SEEDS.get(str(schedule.get('_id') or schedule.get('id') or ''))
    root={'id':seed} if seed else list_recent_roots(api,texts[0],expected_owner)
    if not root:return {'status':'INCOMPLETE','reason':'ROOT_NOT_FOUND','posts':[]}
    ids=[numeric_id(root.get('id'))]
    for reply in schedule.get('replies',[]):
        ids.append(numeric_id(reply.get('postId') or reply.get('contentId') or reply.get('platformPostId')))
    if not all(ids) or len(set(ids))!=len(ids):
        return {'status':'INCOMPLETE','reason':'REPLY_IDS_MISSING_OR_DUPLICATE','posts':[]}
    posts=[]
    for i,(content_id,text) in enumerate(zip(ids,texts)):
        doc=api.get('/content/'+content_id,params={'accountId':ACCOUNT})
        if not isinstance(doc,dict) or str(doc.get('id'))!=content_id or doc.get('description')!=text:
            return {'status':'INCOMPLETE','reason':f'CONTENT_MISMATCH_{i+1}','posts':posts}
        if expected_owner and owner_id(doc)!=expected_owner:
            return {'status':'INCOMPLETE','reason':f'OWNER_MISMATCH_{i+1}','posts':posts}
        link=verified_permalink(doc.get('url'))
        stamp=parse_time(doc.get('createdAt'))
        if not link or not stamp:return {'status':'INCOMPLETE','reason':f'LINK_OR_TIMESTAMP_MISSING_{i+1}','posts':posts}
        posts.append({'id':content_id,'url':link,'createdAt':iso(stamp),'parent':doc.get('replied_to') or doc.get('parentId') or doc.get('repliedTo')})
    if len({p['url'] for p in posts})!=len(posts):return {'status':'INCOMPLETE','reason':'DUPLICATE_LINKS','posts':posts}
    times=[parse_time(p['createdAt']) for p in posts]
    if times!=sorted(times):return {'status':'INCOMPLETE','reason':'NON_CHRONOLOGICAL','posts':posts}
    return {'status':'VERIFIED','posts':posts,'reason':None}

def parent_proof(api,posts,meta_token=None):
    if len(posts)<2:return 'NOT_VERIFIED'
    parent_fields=[]
    for p in posts[1:]:
        val=p.get('parent')
        if isinstance(val,dict):val=val.get('id')
        if not val and meta_token:
            doc=api.parent(p['id'],meta_token)
            val=(doc or {}).get('replied_to') if isinstance(doc,dict) else None
            if isinstance(val,dict):val=val.get('id')
        parent_fields.append(str(val or ''))
    if not all(parent_fields):return 'NOT_VERIFIED'
    known=[p['id'] for p in posts]
    for i, pid in enumerate(parent_fields,1):
        if pid not in known[:i]:return 'CONFLICT'
    return 'VERIFIED'

def evaluate(job,schedule,api,meta_token=None,check_public=True):
    output={'job_id':job['id'],'schedule_id':job['schedule_id'],'slot_utc':job['slot_utc'],
            'proof_status':'INCOMPLETE','visibility':'NOT_VERIFIED','parent_child':'NOT_VERIFIED',
            'content_status':'NOT_VERIFIED','post_count':0,'post_urls':[], 'reason':None}
    if schedule.get('accountId')!=ACCOUNT:output['reason']='ACCOUNT_MISMATCH';return output
    if parse_time(schedule.get('scheduleAt'))!=parse_time(job.get('slot_utc')):
        output['reason']='SLOT_MISMATCH';return output
    try: texts=post_texts(schedule)
    except ProofError as e: output['reason']=str(e);return output
    if len(texts)<6:output['reason']='INVALID_THREAD_LENGTH';return output
    if schedule.get('status')!='success':
        output['proof_status']='PENDING' if schedule.get('status')=='pending' else 'REPLIZ_FAILED'
        output['reason']='REPLIZ_'+str(schedule.get('status'))
        return output
    if any(r.get('status')!='success' or r.get('errorMessage') for r in schedule.get('replies',[])):
        output['reason']='REPLY_NOT_SUCCESS';return output
    output['proof_status']='REPLIZ_SUCCESS'
    try: proof=collect_content(api,schedule,texts)
    except Exception as e:
        output['reason']='CONTENT_API_UNAVAILABLE' if not isinstance(e,ProofError) else str(e)
        return output
    output['reason']=proof['reason']
    if proof['status']!='VERIFIED':return output
    posts=proof['posts']
    output['post_count']=len(posts)
    output['post_urls']=[p['url'] for p in posts]
    output['proof_status']='CONTENT_CONFIRMED'
    output['content_status']='VERIFIED'
    output['parent_child']=parent_proof(api,posts,meta_token)
    if check_public:
        vals=[api.get_public(p['url'],t) for p,t in zip(posts,texts)]
        output['visibility']='VERIFIED' if all(v=='VERIFIED' for v in vals) else 'NOT_VERIFIED'
    return output

@contextmanager
def open_proofs():
    DATA.mkdir(parents=True,exist_ok=True,mode=0o700)
    con=sqlite3.connect(PROOF_DB,timeout=20)
    os.chmod(PROOF_DB,0o600)
    con.execute('PRAGMA busy_timeout=20000')
    con.executescript('''CREATE TABLE IF NOT EXISTS proofs (
    job_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, evidence TEXT NOT NULL,
    state TEXT NOT NULL, checked_at TEXT NOT NULL, next_check TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS alerts (
    job_id TEXT NOT NULL, milestone TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, response_code TEXT,
    PRIMARY KEY(job_id,milestone));''')
    try:
        yield con
    finally:
        con.close()

def jobs_due(clock):
    if not SOURCE_DB.is_file():return []
    con=sqlite3.connect('file:'+str(SOURCE_DB)+'?mode=ro',uri=True)
    con.row_factory=sqlite3.Row
    try:
        rows=con.execute("SELECT id,schedule_id,slot_utc,state FROM jobs WHERE state='SCHEDULED' AND schedule_id IS NOT NULL AND id LIKE 'KAL-AUTO-%' ORDER BY slot_utc DESC LIMIT 80").fetchall()
        return [dict(r) for r in rows if (dt:=parse_time(r['slot_utc'])) and dt<=clock+timedelta(minutes=2) and dt>=clock-timedelta(days=15)]
    finally:con.close()

def telegram_send(doc,text,session=None):
    if requests is None:raise ProofError('REQUESTS_NOT_INSTALLED')
    session=session or requests.Session()
    token=str(doc.get('bot_token',''))
    chat=str(doc.get('chat_id',''))
    if not re.fullmatch(r'\d{6,12}:[A-Za-z0-9_-]{25,}',token) or not re.fullmatch(r'\d{2,20}',chat):
        raise ProofError('INVALID_TELEGRAM_CONFIG')
    r=session.post('https://api.telegram.org/bot'+token+'/sendMessage',json={
        'chat_id':chat,'text':text,'disable_web_page_preview':True},timeout=(5,15),allow_redirects=False)
    if r.status_code!=200 or not r.json().get('ok'):raise ProofError('TELEGRAM_SEND_UNCERTAIN')
    return str(r.json().get('result',{}).get('message_id',''))

def message(proof):
    intro='✅ KAL-AUTO: utas Threads terbit' if proof['proof_status']=='CONTENT_CONFIRMED' else '⚠️ KAL-AUTO: publikasi perlu pemeriksaan'
    lines=[intro, 'Job: '+proof['job_id'],'Schedule: '+proof['schedule_id'],
           'Bukti: '+proof['proof_status'],
           'Publik: '+proof['visibility'], 'Parent-child: '+proof['parent_child'],
           'Jumlah Content API: '+str(proof['post_count'])]
    if proof.get('reason'):lines.append('Catatan: '+proof['reason'])
    if proof['post_urls']:lines.extend(proof['post_urls'])
    return '\n'.join(lines)[:3900]

def run_once(clock=None,api=None,notifier=None,public=True,limit=6):
    clock=clock or now()
    cfg=read_env(ENV_FILE) if api is None else {}
    if api is None:
        if not cfg.get('REPLIZ_ACCESS_KEY') or not cfg.get('REPLIZ_SECRET_KEY'):raise ProofError('REPLIZ_CREDENTIALS_MISSING')
        api=Api((cfg['REPLIZ_ACCESS_KEY'],cfg['REPLIZ_SECRET_KEY']))
    meta_token=None
    if META_FILE.is_file() and not META_FILE.is_symlink():
        if META_FILE.stat().st_mode & 0o077:raise ProofError('UNSAFE_META_TOKEN')
        meta_token=META_FILE.read_text().strip()
    events=[]
    with open_proofs() as ledger:
        for job in jobs_due(clock):
            old=ledger.execute('SELECT state,next_check FROM proofs WHERE job_id=?',(job['id'],)).fetchone()
            if old and parse_time(old[1]) and parse_time(old[1])>clock:continue
            if len(events)>=limit:break
            try:
                schedule=api.get('/schedule/'+job['schedule_id'])
                if not isinstance(schedule,dict):raise ProofError('SCHEDULE_INVALID')
                proof=evaluate(job,schedule,api,meta_token,public)
            except Exception as e:
                proof={'job_id':job['id'],'schedule_id':job['schedule_id'],'slot_utc':job['slot_utc'],
                       'proof_status':'API_UNAVAILABLE','visibility':'NOT_VERIFIED',
                       'parent_child':'NOT_VERIFIED','content_status':'NOT_VERIFIED',
                       'post_count':0,'post_urls':[], 'reason':type(e).__name__ if not isinstance(e,ProofError) else str(e)}
            next_delay=2 if proof['proof_status']=='PENDING' else 15 if proof['proof_status'] in ('REPLIZ_SUCCESS','INCOMPLETE','API_UNAVAILABLE') else 60
            if proof['proof_status']=='CONTENT_CONFIRMED':
                next_delay=360 if (notifier is not None or NOTIFY_FILE.is_file()) else 2
                # Until notification config is provided, continue cheap 2-min checks for pending alert.
            ledger.execute('INSERT INTO proofs(job_id,schedule_id,evidence,state,checked_at,next_check) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET evidence=excluded.evidence,state=excluded.state,checked_at=excluded.checked_at,next_check=excluded.next_check',
                (job['id'],job['schedule_id'],json.dumps(proof,ensure_ascii=False),proof['proof_status'],iso(clock),iso(clock+timedelta(minutes=next_delay))))
            ledger.commit()
            status=proof['proof_status']
            milestone='PUBLISHED' if status=='CONTENT_CONFIRMED' else 'FAILED' if status=='REPLIZ_FAILED' else None
            if status=='REPLIZ_SUCCESS' and parse_time(job['slot_utc'])<clock-timedelta(minutes=30):milestone='EVIDENCE_PENDING'
            if milestone and notifier is None and not NOTIFY_FILE.is_file():
                milestone=None  # no token yet: do NOT claim an alert that cannot be sent
            if milestone:
                old_alert=ledger.execute('SELECT status FROM alerts WHERE job_id=? AND milestone=?',(job['id'],milestone)).fetchone()
                if not old_alert:
                    # Claim BEFORE sending (intentional at-most-once; ambiguous timeout needs manual review).
                    ledger.execute('INSERT INTO alerts(job_id,milestone,status,created_at) VALUES(?,?,?,?)',(job['id'],milestone,'CLAIMED',iso(clock)))
                    ledger.commit()
                    try:
                        conf=notifier if notifier is not None else private_json(NOTIFY_FILE)
                        receipt=telegram_send(conf,message(proof))
                        ledger.execute('UPDATE alerts SET status=?,response_code=? WHERE job_id=? AND milestone=?',('SENT',receipt,job['id'],milestone))
                        proof['notification']='SENT'
                    except Exception:
                        ledger.execute('UPDATE alerts SET status=? WHERE job_id=? AND milestone=?',('UNCERTAIN',job['id'],milestone))
                        proof['notification']='UNCERTAIN_NO_AUTO_RETRY'
                    ledger.commit()
            events.append({k:proof[k] for k in ('job_id','proof_status','visibility','parent_child','post_count')})
    return {'status':'MONITOR_READ_ONLY_PASS','checked':len(events),'results':events,'repliz_write_attempts':0}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=('once','status','preflight'))
    parser.add_argument('--job-id',default=None)
    args=parser.parse_args()
    try:
        if args.command=='preflight':
            print(json.dumps({'status':'MONITOR_PREFLIGHT', 'source_db':SOURCE_DB.is_file(), 'config_file':NOTIFY_FILE.is_file(), 'repliz_env':ENV_FILE.is_file()}));return 0
        if os.geteuid()!=0:raise ProofError('RUN_AS_ROOT_VPS2')
        if os.uname().nodename.split('.')[0]!='VM-0-10-ubuntu':raise ProofError('WRONG_HOST')
        if args.command=='status':
            if not re.fullmatch(r'KAL-AUTO-[A-F0-9]{20}',args.job_id or ''):raise ProofError('INVALID_JOB_ID')
            with open_proofs() as db:
                r=db.execute('SELECT evidence FROM proofs WHERE job_id=?',(args.job_id,)).fetchone()
            print(r[0] if r else json.dumps({'status':'PROOF_NOT_YET_COLLECTED'}));return 0
        fd=os.open(DATA/'publication-monitor.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            out=run_once()
        except BlockingIOError:out={'status':'MONITOR_ALREADY_RUNNING'}
        finally:os.close(fd)
        print(json.dumps(out,ensure_ascii=False));return 0
    except Exception as e:
        print(json.dumps({'status':'MONITOR_BLOCKED','reason':str(e) if isinstance(e,ProofError) else type(e).__name__}));return 3

if __name__=='__main__':raise SystemExit(main())
