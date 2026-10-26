#!/usr/bin/env python3
"""Guarded, one-item Kalyanamitra Instagram pilot. Not an autoscheduler.

* Uses original production DB only in SQLite read-only mode.
* Requires native Dharma validator PASS for original draft.
* Separate Instagram ledger never alters content_queue / Threads status.
* Uploads at most one item's media; ambiguous upload errors stop retries.
* Repliz schedule POST is an explicit, one-shot opt-in and never retried.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import stat
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

import requests
from requests.auth import HTTPBasicAuth

from kalyanamitra_ig_b10 import render, validate, sha

ROOT=Path('/opt/kalyanamitra')
ENV=ROOT/'.env'
DB=ROOT/'data/kalyanamitra.db'
LEDGER=ROOT/'data/kalyanamitra-instagram-b10.sqlite'
STAGE=Path('/home/ubuntu/kalyanamitra-ig-b10-stage')
VALIDATOR=ROOT/'scripts/validate_dharma_json.py'
API='https://api.repliz.com/public'
IG_ID='6a8d2c6762caae1e04053962'
IG_USER='ruangkalyanamitra'
EXPECTED_HOST='VM-0-10-ubuntu'
TZ=ZoneInfo('Asia/Jakarta')

class Blocked(Exception):pass

def fail(message):raise Blocked(message)

def regular(p):
 if p.is_symlink() or not p.is_file():fail('MISSING_OR_SYMLINK:'+str(p))
 return p

def config():
 lines=regular(ENV).read_text(encoding='utf-8').splitlines()
 c={}
 for line in lines:
  s=line.strip()
  if s and not s.startswith('#') and '=' in s:
   k,v=s.split('=',1);c[k.strip()]=v.strip().strip('"\'')
 return c

def conf_gate(c):
 import socket
 if socket.gethostname()!=EXPECTED_HOST:fail('WRONG_HOST')
 if c.get('REPLIZ_KALYANAMITRA_IG_ACCOUNT_ID')!=IG_ID:fail('IG_ACCOUNT_ID_MISMATCH')
 if c.get('REPLIZ_KALYANAMITRA_IG_USERNAME')!=IG_USER:fail('IG_USERNAME_MISMATCH')
 if not c.get('REPLIZ_ACCESS_KEY') or not c.get('REPLIZ_SECRET_KEY'):fail('REPLIZ_CREDENTIALS_MISSING')
 if c.get('REPLIZ_API_BASE',API).rstrip('/')!=API:fail('UNEXPECTED_API')
 if c.get('INSTAGRAM_ENABLED')!='false':fail('INSTAGRAM_MUST_REMAIN_OFF_UNTIL_ACCEPTANCE')
 if c.get('REPLIZ_TARGET_AKUN')!='threads':fail('THREADS_TARGET_UNEXPECTED')
 if c.get('REVIEW_REQUIRED')!='true' or c.get('SOURCE_AUDIT_REQUIRED')!='true':fail('REVIEW_GATES_DISABLED')
 regular(VALIDATOR)
 regular(DB)
 if stat.S_IMODE(regular(ENV).stat().st_mode)!=0o600:fail('ENV_MODE_NOT_0600')
 return c

@contextmanager
def exclusive():
 lock=STAGE/'.b10-lock'
 STAGE.mkdir(parents=True,exist_ok=True)
 with lock.open('a+') as f:
  fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  yield

def native_doc(cid):
 if not re.fullmatch('[A-Za-z0-9_.-]{1,150}',cid):fail('INVALID_CONTENT_ID')
 con=sqlite3.connect('file:'+quote(str(DB),safe='/')+'?mode=ro',uri=True)
 con.row_factory=sqlite3.Row
 try:
  row=con.execute('''SELECT content_id,output_path,status,review_status FROM content_queue
    WHERE content_id=? LIMIT 1''',(cid,)).fetchone()
 finally:con.close()
 if not row or row['status']!='READY' or row['review_status']!='APPROVED':fail('NOT_READY_APPROVED')
 p=Path(row['output_path'] or '')
 regular(p)
 if p.stat().st_size>2_000_000:fail('DRAFT_TOO_LARGE')
 d=json.loads(p.read_text(encoding='utf-8'))
 validate(d,allow_sanitized=False)
 if d['content_id']!=cid:fail('CONTENT_ID_MISMATCH')
 check=subprocess.run([sys.executable,'-B',str(VALIDATOR),str(p)],capture_output=True,text=True,timeout=30)
 if check.returncode!=0 or 'VALIDATION=PASS' not in check.stdout:fail('NATIVE_VALIDATOR_FAIL')
 return p,d

def auth(c):return HTTPBasicAuth(c['REPLIZ_ACCESS_KEY'],c['REPLIZ_SECRET_KEY'])

def account(c):
 try:
  r=requests.get(f'{API}/account/{IG_ID}',auth=auth(c),timeout=20)
  r.raise_for_status()
  x=r.json()
  for key in ('data','account','doc'):
   if isinstance(x,dict) and isinstance(x.get(key),dict):x=x[key]
  if not isinstance(x,dict):fail('REPLIZ_ACCOUNT_RESPONSE_INVALID')
  if str(x.get('id') or x.get('_id'))!=IG_ID:fail('REPLIZ_ID_MISMATCH')
  if str(x.get('username','')).lstrip('@').lower()!=IG_USER:fail('REPLIZ_USERNAME_MISMATCH')
  if str(x.get('type') or x.get('platform','')).lower()!='instagram':fail('REPLIZ_PLATFORM_MISMATCH')
  if x.get('isConnected') is not True:fail('REPLIZ_ACCOUNT_DISCONNECTED')
 except (requests.RequestException,ValueError,KeyError) as e:
  raise Blocked('REPLIZ_ACCOUNT_GET_FAILED') from e

def ledger():
 if LEDGER.is_symlink():fail('LEDGER_SYMLINK')
 if not LEDGER.exists():
  LEDGER.parent.mkdir(parents=True,exist_ok=True)
 con=sqlite3.connect(LEDGER,timeout=10,isolation_level=None)
 con.execute('PRAGMA busy_timeout=10000')
 con.execute('''CREATE TABLE IF NOT EXISTS ig_pilots(
   content_id TEXT PRIMARY KEY, content_sha TEXT NOT NULL,
   account_id TEXT NOT NULL, status TEXT NOT NULL, media_json TEXT,
   schedule_at TEXT, schedule_id TEXT, last_error TEXT,
   updated_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
 return con

def row(con,cid):
 con.row_factory=sqlite3.Row
 return con.execute('SELECT * FROM ig_pilots WHERE content_id=?',(cid,)).fetchone()

def photo_dir(cid):return STAGE/cid

def safe_https(url):
 if not isinstance(url,str):return False
 try:p=urlsplit(url)
 except ValueError:return False
 return p.scheme=='https' and bool(p.netloc) and p.username is None and p.password is None and len(url)<2048

def read_manifest(cid):
 d=photo_dir(cid)
 if not d.is_dir() or d.is_symlink():fail('RENDER_NOT_STAGED')
 m=json.loads(regular(d/'render-manifest.json').read_text(encoding='utf-8'))
 if m.get('content_id')!=cid or len(m.get('slides',[]))!=7:fail('MANIFEST_INVALID')
 # Berkas stage lawas TANPA watermark harus ditolak, tidak boleh di-upload.
 if m.get('watermark')!='RK' or m.get('watermark_location')!='footer' or m.get('watermark_box')!=[698,1314,755,1368]:
  fail('WATERMARK_RK_REQUIRED_RESTAGE_MANUALLY')
 for i,pair in enumerate(m['slides'],start=1):
  if pair[0]!=f'slide-{i:02d}.png' or sha(regular(d/pair[0]))!=pair[1]:fail('IMAGE_HASH_MISMATCH')
 if sha(regular(d/'caption.txt'))!=m['caption_sha256']:fail('CAPTION_HASH_MISMATCH')
 return d,m

def stage(cids):
 out=[]
 for cid in cids:
  source,doc=native_doc(cid)
  dest=photo_dir(cid)
  if dest.exists():
   d,m=read_manifest(cid)
   if m.get('native_original_sha256')!=sha(source):fail('SOURCE_CHANGED_ALREADY_STAGED')
   out.append(cid);continue
  d=render(doc,STAGE,allow_sanitized=False)
  mf=d/'render-manifest.json'
  m=json.loads(mf.read_text(encoding='utf-8'))
  m['native_original_sha256']=sha(source)
  mf.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
  out.append(cid)
 return out

def pending_candidates():
 con=sqlite3.connect('file:'+quote(str(DB),safe='/')+'?mode=ro',uri=True)
 try:
  return [x[0] for x in con.execute('''SELECT content_id FROM content_queue
    WHERE status='READY' AND review_status='APPROVED' ORDER BY priority ASC,id ASC LIMIT 50''')]
 finally:con.close()

def get_remote_day(c,day):
 start=datetime.combine(day,datetime.min.time(),TZ)
 end=start+timedelta(days=1)
 seen=set(); all_docs=[]; expected=None
 for page in range(1,21):
  r=requests.get(f'{API}/schedule',params={'page':page,'limit':100,'fromDate':start.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),'toDate':end.astimezone(timezone.utc).isoformat().replace('+00:00','Z')},auth=auth(c),timeout=30)
  if not r.ok:fail('SCHEDULE_LIST_HTTP_ERROR')
  obj=r.json()
  if not isinstance(obj,dict) or not isinstance(obj.get('docs'),list):fail('SCHEDULE_LIST_UNEXPECTED_FORMAT')
  n=obj.get('totalPages')
  if not isinstance(n,int) or n<1 or n>20:fail('SCHEDULE_PAGINATION_UNTRUSTED')
  if expected is None:expected=n
  if n!=expected:fail('SCHEDULE_PAGINATION_CHANGED')
  for v in obj['docs']:
   if not isinstance(v,dict):fail('SCHEDULE_ITEM_INVALID')
   doc_id=v.get('id') or v.get('_id')
   if not doc_id or doc_id in seen:fail('SCHEDULE_DUPLICATE_OR_MISSING_ID')
   seen.add(doc_id)
   aid=v.get('accountId')
   if isinstance(aid,dict):aid=aid.get('_id') or aid.get('id')
   if not aid:fail('SCHEDULE_ACCOUNT_AMBIGUOUS')
   if str(aid)==IG_ID:
    dt=v.get('scheduleAt')
    try:
     when=datetime.fromisoformat(str(dt).replace('Z','+00:00')).astimezone(TZ)
    except Exception:fail('REMOTE_TIME_AMBIGUOUS')
    if when.date()==day:all_docs.append(v)
  if page==n:return all_docs
 fail('SCHEDULE_TRUNCATED')

def upload_file(c,path):
 # Provider API contract modeled on existing UMKM IG H+1 publisher.
 sz=regular(path).stat().st_size
 try:
  init=requests.post(f'{API}/storage/file/init',json={'filename':path.name,'size':sz,'mimetype':'image/png'},auth=auth(c),timeout=30)
  if not init.ok:fail('UPLOAD_INIT_FAILED')
  obj=init.json()
  if isinstance(obj.get('data'),dict):obj=obj['data']
  fid=obj.get('id'); dst=obj.get('upload'); public=obj.get('url')
  if not fid or not safe_https(dst) or not safe_https(public):fail('UPLOAD_INIT_RESPONSE_INVALID')
  with path.open('rb') as f:
   put=requests.put(dst,data=f,headers={'Content-Type':'image/png'},timeout=120)
  if not put.ok:fail('UPLOAD_PUT_FAILED')
  complete=requests.post(f'{API}/storage/file/{fid}/complete',auth=auth(c),timeout=30)
  if not complete.ok:fail('UPLOAD_COMPLETE_FAILED')
  return public
 except (requests.RequestException,ValueError) as e:
  raise Blocked('UPLOAD_TRANSPORT_UNKNOWN_NO_RETRY') from e

def upload_one(c,cid):
 account(c);src,doc=native_doc(cid);d,m=read_manifest(cid)
 if m.get('native_original_sha256')!=sha(src):fail('NATIVE_DRAFT_CHANGED')
 con=ledger()
 try:
  x=row(con,cid)
  if x:
   if x['content_sha']!=sha(src):fail('LEDGER_SOURCE_CHANGED')
   if x['status']=='UPLOADED':return 'ALREADY_UPLOADED_NO_RETRY'
   fail('LEDGER_NOT_NEW:'+x['status'])
  con.execute('INSERT INTO ig_pilots(content_id,content_sha,account_id,status) VALUES (?,?,?,?)',(cid,sha(src),IG_ID,'UPLOAD_RECONCILE'))
  medias=[]
  for i in range(1,8):medias.append(upload_file(c,d/f'slide-{i:02d}.png'))
  con.execute('UPDATE ig_pilots SET status=?,media_json=?,updated_at=CURRENT_TIMESTAMP WHERE content_id=?',('UPLOADED',json.dumps(medias),cid))
  return 'MEDIA_UPLOADED_7'
 finally:con.close()

def make_payload(cid,slot,medias):
 text=regular(photo_dir(cid)/'caption.txt').read_text(encoding='utf-8')
 return {'title':'','description':text,'topic':'','type':'album',
    'medias':[{'alt':f'Ruang Kalyanamitra slide {i}','customThumbnail':False,'type':'image','thumbnail':u,'url':u} for i,u in enumerate(medias,1)],
    'meta':{'title':'','description':'','url':''},
    'additionalInfo':{'isAiGenerated':True,'isDraft':False,'isAutoAddMusic':False,'isShareToFeed':False,'collaborators':[],'mentions':[],'tags':[],'targetCountries':[]},
    'replies':[],'accountId':IG_ID,'scheduleAt':slot}

def publish_one(c,cid,slot,confirm):
 if confirm!='I_AUTHORIZE_ONE_IG_SCHEDULE':fail('EXPLICIT_PILOT_CONFIRM_REQUIRED')
 account(c);src,doc=native_doc(cid);d,m=read_manifest(cid)
 if m.get('native_original_sha256')!=sha(src):fail('NATIVE_DRAFT_CHANGED')
 try:dt=datetime.fromisoformat(slot.replace('Z','+00:00'))
 except ValueError:fail('SLOT_INVALID')
 if dt.tzinfo is None:fail('SLOT_NEEDS_TIMEZONE')
 if dt < datetime.now(timezone.utc)+timedelta(minutes=20):fail('SLOT_TOO_SOON')
 day=dt.astimezone(TZ).date()
 con=ledger()
 try:
  x=row(con,cid)
  if not x or x['status']!='UPLOADED' or x['content_sha']!=sha(src):fail('MEDIA_NOT_UPLOADED_OR_ALREADY_CLAIMED')
  medias=json.loads(x['media_json'])
  if len(medias)!=7 or any(not safe_https(u) for u in medias):fail('MEDIA_URLS_INVALID')
  if get_remote_day(c,day):fail('IG_DAY_ALREADY_OCCUPIED')
  # Durable lock BEFORE network POST, no blind retry ever.
  mark=con.execute("UPDATE ig_pilots SET status='RECONCILE',schedule_at=?,updated_at=CURRENT_TIMESTAMP WHERE content_id=? AND status='UPLOADED'",(dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),cid))
  if mark.rowcount!=1:fail('CONCURRENT_JOB_CLAIM')
  payload=make_payload(cid,dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),medias)
  try:
   r=requests.post(f'{API}/schedule',auth=auth(c),json=payload,timeout=50)
   if not r.ok:fail('PUBLISH_HTTP_RESPONSE_AMBIGUOUS_NO_RETRY')
   obj=r.json()
   if isinstance(obj.get('data'),dict):obj=obj['data']
   sid=obj.get('id') or obj.get('_id') or obj.get('scheduleId')
   if not sid:fail('PUBLISH_ID_MISSING_RECONCILE')
  except (requests.RequestException,ValueError) as e:
   raise Blocked('PUBLISH_TRANSPORT_UNKNOWN_NO_RETRY') from e
  con.execute("UPDATE ig_pilots SET status='SCHEDULED',schedule_id=?,updated_at=CURRENT_TIMESTAMP WHERE content_id=? AND status='RECONCILE'",(str(sid),cid))
  return {'status':'SCHEDULED_IN_REPLIZ_NOT_PLATFORM_PUBLISHED','schedule_id':str(sid)}
 finally:con.close()

def reconcile(c,cid):
 account(c)
 con=ledger()
 try:
  x=row(con,cid)
  if not x or x['status'] not in ('RECONCILE','SCHEDULED','PUBLISHED'):fail('NOT_A_RECONCILE_JOB')
  if not x['schedule_at']:fail('SLOT_NOT_RECORDED')
  dt=datetime.fromisoformat(x['schedule_at'].replace('Z','+00:00')).astimezone(TZ)
  items=get_remote_day(c,dt.date())
  matching=[v for v in items if str(v.get('id') or v.get('_id'))==str(x['schedule_id'])] if x['schedule_id'] else []
  if len(matching)!=1:return {'status':'RECONCILE_REQUIRED','reason':'ID_ABSENT_OR_AMBIGUOUS','post_attempted':False}
  doc=matching[0]
  state=str(doc.get('status','')).strip().lower()
  postid=doc.get('postId') or doc.get('post_id')
  published_at=doc.get('publishedAt') or doc.get('published_at')
  schedule_ok=False;date_ok=False
  try:
   remote_slot=datetime.fromisoformat(str(doc.get('scheduleAt')).replace('Z','+00:00'))
   schedule_ok=remote_slot.tzinfo is not None and remote_slot.astimezone(timezone.utc)==dt.astimezone(timezone.utc)
   published=datetime.fromisoformat(str(published_at).replace('Z','+00:00'))
   date_ok=published.tzinfo is not None and published<=datetime.now(timezone.utc)+timedelta(minutes=5)
  except (ValueError,TypeError):pass
  if state=='published' and postid and date_ok and schedule_ok:
   con.execute("UPDATE ig_pilots SET status='PUBLISHED',updated_at=CURRENT_TIMESTAMP WHERE content_id=?",(cid,))
   return {'status':'REPLIZ_PUBLISHED_WITH_POST_ID_AND_TIME','schedule_id':str(x['schedule_id'])}
  return {'status':'SCHEDULED_OR_UNVERIFIED','remote_state':state,'post_attempted':False}
 finally:con.close()

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('cmd',choices=['preflight','stage','upload-one','publish-one','reconcile','selftest'])
 parser.add_argument('--content-id')
 parser.add_argument('--at')
 parser.add_argument('--confirm')
 opts=parser.parse_args()
 try:
  if opts.cmd=='selftest':
   assert safe_https('https://example.org/a.png')
   assert not safe_https('http://example.org/a.png')
   assert not safe_https('https://u:pass@example.org/a.png')
   print('B10_PILOT_SELFTEST_PASS');return
  c=conf_gate(config())
  if opts.cmd=='preflight':
   acc='CONFIG_VERIFIED_NOT_REMOTE'; ready=[]
   for cid in pending_candidates():
    try:native_doc(cid);ready.append(cid)
    except Exception:pass
   account(c)
   print(json.dumps({'status':'B10_READONLY_PREFLIGHT_PASS','instagram_flag':'OFF','threads':'UNCHANGED','native_validated_content_ids':ready,'account_get':'PASS','publication':'NOT_ATTEMPTED'}));return
  with exclusive():
   if opts.cmd=='stage':
    if not opts.content_id:fail('CONTENT_ID_REQUIRED')
    items=stage([opts.content_id]); print(json.dumps({'status':'B10_STAGE_RENDER_PASS','ids':items,'repliz_post':False}));return
   if not opts.content_id:fail('CONTENT_ID_REQUIRED')
   if opts.cmd=='upload-one':
    print(json.dumps({'status':upload_one(c,opts.content_id),'schedule_post':False}));return
   if opts.cmd=='publish-one':
    print(json.dumps(publish_one(c,opts.content_id,opts.at or '',opts.confirm),ensure_ascii=False));return
   if opts.cmd=='reconcile':
    print(json.dumps(reconcile(c,opts.content_id),ensure_ascii=False));return
 except (Blocked,ValueError,FileExistsError,sqlite3.Error,requests.RequestException) as e:
  reason=str(e).split(':')[0][:100]
  print(json.dumps({'status':'B10_BLOCKED','reason':reason,'no_auto_retry':True}))
  raise SystemExit(2)

if __name__=='__main__':main()
