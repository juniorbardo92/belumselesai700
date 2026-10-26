#!/usr/bin/env python3
"""UMKM R2.1: guarded *operator-run* shadow test using a SQLite online backup.

No production writes. No POST. Invokes candidate script with a clone-only DB.
Must be explicitly executed by the operator on VPS2, not an installer.
"""
from __future__ import annotations
import hashlib
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

HOST='VM-0-10-ubuntu'
PROD=Path('/opt/umkm-engine/data/system.db')
ENV=Path('/opt/umkm-engine/.env.publisher')
CAND=Path(__file__).resolve().parent.parent/'code/reconcile_repliz.py'
EXPECTED_SHA='24332b34ff5f207fc1b6edf47e30b8f45e586b71c07a25b5e249bd7521405410'
ACCOUNT='6a8e2fc362caae1e04063419'
OWNER='28108610098795775'
KEEP=('content_id','status','publish_status','repliz_post_id','published_at')

def halt(message):
 print('BLOCKED:',message)
 raise SystemExit(2)

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def data_fingerprint(conn):
 # Rows sorted to guarantee deterministic comparison before / after shadow.
 sql='SELECT '+','.join(KEEP)+' FROM umkm_content_queue ORDER BY content_id'
 h=hashlib.sha256()
 for row in conn.execute(sql):
  h.update(repr(tuple(row)).encode('utf-8'));h.update(b'\n')
 return h.hexdigest()

def main():
 import socket
 if socket.gethostname()!=HOST:halt('WRONG_HOST')
 if not all(x.is_file() and not x.is_symlink() for x in (CAND,ENV,PROD)):
  halt('MISSING_OR_SYMLINK')
 if digest(CAND)!=EXPECTED_SHA:halt('CANDIDATE_HASH_DRIFT')
 if os.environ.get('UMKM_CONTENT_PROOF_PROMOTE')=='1':
  print('WARNING: parent PROMOTE=1 explicitly overridden to 0')
 # Read only known public identifiers from environment file; do not print secrets.
 keys={}
 for line in ENV.read_text().splitlines():
  x=line.strip()
  if x and not x.startswith('#') and '=' in x:
   k,v=x.split('=',1)
   if k.strip() in ('REPLIZ_THREADS_ACCOUNT_ID','REPLIZ_THREADS_OWNER_ID'):
    keys[k.strip()]=v.strip().strip('"\'')
 if keys.get('REPLIZ_THREADS_ACCOUNT_ID')!=ACCOUNT:halt('UMKM_ACCOUNT_ID_MISMATCH')
 if keys.get('REPLIZ_THREADS_OWNER_ID') not in (None,OWNER):halt('OWNER_ID_CONFLICT')
 with tempfile.TemporaryDirectory(prefix='umkm-r21-shadow-') as td:
  base=Path(td)
  clone=base/'clone.sqlite'
  with sqlite3.connect(f'file:{PROD}?mode=ro',uri=True) as src:
   with sqlite3.connect(clone) as dst:src.backup(dst)
  with sqlite3.connect(clone) as con:
   if con.execute('PRAGMA integrity_check').fetchone()[0]!='ok':halt('CLONE_INTEGRITY_FAIL')
   baseline=data_fingerprint(con)
   n=con.execute('SELECT count(*) FROM umkm_content_queue').fetchone()[0]
  print('CLONE_CREATED rows=',n,'baseline_data_sha256=',baseline)
  env=os.environ.copy()
  env.update({
   'UMKM_RECONCILE_DB':str(clone),
   'UMKM_RECONCILE_RESPONSES':str(base/'responses'),
   'UMKM_RECONCILE_ENV':str(ENV),
   'UMKM_CONTENT_PROOF_PROMOTE':'0',
   'UMKM_CONTENT_PROOF_PUBLISHED_AT':'',
   'UMKM_RECONCILE_HTTP_RETRIES':'0',
   'REPLIZ_THREADS_OWNER_ID':OWNER,
   'REPLIZ_THREADS_USERNAME':'umkmnaikkelas.id',
  })
  rc=subprocess.run([sys.executable,'-B',str(CAND)],env=env,
     stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=300)
  allowed=('CONTENT_PROOF_PASS_SHADOW','CONTENT_PROOF_BLOCKED','WAITING state=',
           'SCHEDULE_', 'WRONG_ACCOUNT_BLOCKED','PROMOTION_BLOCKED',
           'RECONCILE_', 'NO_CHANGE','RECONCILE_QUEUE_EMPTY')
  # Emit only known diagnostic lines, not provider's raw response or API credentials.
  for line in rc.stdout.splitlines():
   if any(x in line for x in allowed):print(line[:240])
  with sqlite3.connect(clone) as con:
   if con.execute('PRAGMA integrity_check').fetchone()[0]!='ok':halt('AFTER_INTEGRITY_FAIL')
   after=data_fingerprint(con)
  print('STATUS_FIELDS_IMMUTABLE:',baseline==after)
  print('RECONCILE_EXIT:',rc.returncode)
  if baseline!=after:halt('SHADOW_CHANGED_PUBLICATION_FIELDS')
  if 'RECONCILE_PROMOTED=0' not in rc.stdout:halt('UNEXPECTED_PROMOTION')
  if rc.returncode not in (0,2):halt('UNEXPECTED_RECONCILER_EXIT')
  if rc.returncode==2:
   print('SHADOW_SAFE_BUT_RECONCILE_ALERTS_OPEN')
   return 2
  print('SHADOW_CLONE_PASS_NO_PROMOTION')
  return 0

if __name__=='__main__':
 try:sys.exit(main())
 except subprocess.TimeoutExpired:
  print('BLOCKED:TEST_TIMEOUT');sys.exit(2)
