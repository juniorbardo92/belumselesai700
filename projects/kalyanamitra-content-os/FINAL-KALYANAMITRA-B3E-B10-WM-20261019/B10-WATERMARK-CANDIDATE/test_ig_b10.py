import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import date,datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch

import kalyanamitra_ig_b10 as render_mod
import kalyanamitra_b10_pilot as m


def good_doc(cid='KAL-TEST-001'):
 return {
  'content_id':cid,'tradition':'THERAVADA','topic':'Persahabatan','title':'Sahabat Baik dan Belajar Dharma',
  'sources':[{'name':'SC','title':'Sutta','url':'https://suttacentral.net/sn45.2/en/sujato','verified':True}],
  'claims':[{'id':'C1','claim_type':'EDITORIAL','status':'EDITORIAL','source_indexes':[]}],
  'review':{'status':'APPROVED','source_verified':True,'public_practice_safe':True,'unsupported_claims':[]},
  'thread':[{'post':j,'text':'Latihan refleksi tentang sahabat yang baik. '+str(j)} for j in range(1,9)]
 }

class FakeResponse:
 def __init__(self,obj,status=200):self.obj=obj;self.status_code=status;self.ok=200<=status<300
 def json(self):return self.obj
 def raise_for_status(self):
  if not self.ok:raise m.requests.HTTPError('Failed')

class WatermarkTests(unittest.TestCase):
 def test_manifest_and_visual_footer_every_slide(self):
  from PIL import Image
  with tempfile.TemporaryDirectory() as t:
   folder=render_mod.render(good_doc(),t)
   manifest=json.loads((folder/'render-manifest.json').read_text())
   self.assertEqual(manifest['watermark'],'RK')
   self.assertEqual(manifest['watermark_box'],[698,1314,755,1368])
   accent=tuple(int(v,16) for v in ('36','6B','51'))
   for i in range(1,8):
    with Image.open(folder/f'slide-{i:02d}.png') as im:
     self.assertEqual(im.size,(1080,1440))
     patch=im.crop((698,1314,755,1368))
     self.assertIn(accent,patch.get_flattened_data(),f'RK not drawn on slide {i}')
     self.assertGreater(len(set(patch.get_flattened_data())),2)
 def test_old_manifest_cannot_be_uploaded(self):
  with tempfile.TemporaryDirectory() as t:
   folder=render_mod.render(good_doc(),t)
   mf=folder/'render-manifest.json'
   manifest=json.loads(mf.read_text())
   manifest.pop('watermark')
   mf.write_text(json.dumps(manifest))
   old=m.STAGE
   try:
    m.STAGE=Path(t)
    with self.assertRaisesRegex(m.Blocked,'WATERMARK_RK_REQUIRED'):
     m.read_manifest('KAL-TEST-001')
   finally:m.STAGE=old
 def test_empty_watermark_field_rejected(self):
  with tempfile.TemporaryDirectory() as t:
   folder=render_mod.render(good_doc(),t)
   mf=folder/'render-manifest.json'
   manifest=json.loads(mf.read_text())
   manifest['watermark']=''
   mf.write_text(json.dumps(manifest))
   old=m.STAGE
   try:
    m.STAGE=Path(t)
    with self.assertRaisesRegex(m.Blocked,'WATERMARK_RK_REQUIRED'):
     m.read_manifest('KAL-TEST-001')
   finally:m.STAGE=old

class RendererTests(unittest.TestCase):
 def test_allowed(self):self.assertEqual(render_mod.validate(good_doc()),'KAL-TEST-001')
 def test_unapproved(self):
  d=good_doc();d['review']['status']='REJECTED'
  with self.assertRaises(ValueError):render_mod.validate(d)
 def test_source(self):
  d=good_doc();d['sources']=[]
  with self.assertRaises(ValueError):render_mod.validate(d)
 def test_no_claims(self):
  d=good_doc();d.pop('claims')
  with self.assertRaises(ValueError):render_mod.validate(d)
 def test_prohibitions(self):
  for field,value in [('do_not_publish',True),('automatic_publish',False),('publisher_mode','draft_only')]:
   d=good_doc();d[field]=value
   with self.assertRaises(ValueError):render_mod.validate(d)
 def test_source_sequence(self):
  d=good_doc();d['thread'][2]['post']=99
  with self.assertRaises(ValueError):render_mod.validate(d)
 def test_caption_is_verbatim_post_8(self):
  d=good_doc();self.assertIn(d['thread'][-1]['text'],render_mod.caption(d));self.assertIn(d['sources'][0]['url'],render_mod.caption(d))
 def test_native_validator_actual(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'draft.json';p.write_text(json.dumps(good_doc(),ensure_ascii=False),encoding='utf8')
   r=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('validate_dharma_json.py')),str(p)],capture_output=True,text=True)
   self.assertEqual(r.returncode,0,r.stdout);self.assertIn('VALIDATION=PASS',r.stdout)
 def test_images_7_and_reject_overwrite(self):
  with tempfile.TemporaryDirectory() as t:
   d=render_mod.render(good_doc(),t)
   self.assertEqual(len(list(d.glob('slide-*.png'))),7)
   from PIL import Image
   for p in d.glob('slide-*.png'):
    with Image.open(p) as x:self.assertEqual(x.size,(1080,1440))
   with self.assertRaises(FileExistsError):render_mod.render(good_doc(),t)
 def test_sanitized_source_full(self):
  obj=json.loads(Path(__file__).with_name('approved_kalyanamitra_content_sanitized.json').read_text(encoding='utf-8'))
  self.assertEqual(len(obj['source_documents']),4)
  with tempfile.TemporaryDirectory() as t:
   for d in obj['source_documents']:
    p=render_mod.render(d,t,True)
    self.assertEqual(len(list(p.glob('slide-*.png'))),7)
    self.assertIn(d['thread'][7]['text'],(p/'caption.txt').read_text(encoding='utf8'))

class PublisherTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.dir=Path(self.tmp.name)
  self.doc=good_doc()
  self.src=self.dir/'original.json';self.src.write_text(json.dumps(self.doc,ensure_ascii=False),encoding='utf8')
  self.db=self.dir/'source.db';co=sqlite3.connect(self.db);co.execute('CREATE TABLE content_queue (content_id text,output_path text,status text,review_status text,priority integer,id integer)');co.execute('INSERT INTO content_queue VALUES (?,?,?,?,?,?)',(self.doc['content_id'],str(self.src),'READY','APPROVED',1,1));co.commit();co.close()
  self.stage=self.dir/'stage';self.ledger=self.dir/'ig-ledger.db'
  self.patchers=[patch.object(m,'DB',self.db),patch.object(m,'STAGE',self.stage),patch.object(m,'LEDGER',self.ledger),patch.object(m,'VALIDATOR',Path(__file__).with_name('validate_dharma_json.py'))]
  for p in self.patchers:p.start()
  self.c={'REPLIZ_ACCESS_KEY':'test-secret','REPLIZ_SECRET_KEY':'test-secret'}
 def tearDown(self):
  for p in reversed(self.patchers):p.stop()
  self.tmp.cleanup()
 def stage_images(self):m.stage([self.doc['content_id']])
 def prepared(self):
  self.stage_images()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'upload_file',side_effect=['https://cdn.example.org/'+str(i)+'.png' for i in range(7)]):
   self.assertEqual(m.upload_one(self.c,self.doc['content_id']),'MEDIA_UPLOADED_7')
 def test_native_source(self):
  p,d=m.native_doc(self.doc['content_id']);self.assertEqual(p,self.src)
 def test_native_rejected(self):
  self.doc['review']['status']='REJECTED';self.src.write_text(json.dumps(self.doc,ensure_ascii=False))
  with self.assertRaises(ValueError):m.native_doc(self.doc['content_id'])
 def test_stage_idempotent(self):
  self.stage_images();m.stage([self.doc['content_id']]);self.assertEqual(len(list((self.stage/self.doc['content_id']).glob('slide-*.png'))),7)
 def test_tampering_detected(self):
  self.stage_images();p=self.stage/self.doc['content_id']/'slide-01.png';p.write_bytes(b'changed')
  with self.assertRaises(m.Blocked):m.read_manifest(self.doc['content_id'])
 def test_account_correct(self):
  d={'id':m.IG_ID,'type':'instagram','username':'ruangkalyanamitra','isConnected':True}
  with patch.object(m.requests,'get',return_value=FakeResponse(d)):m.account(self.c)
 def test_account_wrong(self):
  d={'id':m.IG_ID,'type':'threads','username':'ruangkalyanamitra','isConnected':True}
  with patch.object(m.requests,'get',return_value=FakeResponse(d)):
   with self.assertRaises(m.Blocked):m.account(self.c)
 def test_https_protection(self):
  self.assertTrue(m.safe_https('https://cdn.example.org/a.png'))
  for url in ['file:///etc/passwd','http://cdn.example.org/a.png','https://x:p@example.org/a.png','http://127.0.0.1']:
   self.assertFalse(m.safe_https(url))
 def test_remote_empty(self):
  with patch.object(m.requests,'get',return_value=FakeResponse({'docs':[],'totalPages':1})):
   self.assertEqual(m.get_remote_day(self.c,date(2026,10,19)),[])
 def test_remote_missing_account_fail(self):
  with patch.object(m.requests,'get',return_value=FakeResponse({'docs':[{'id':'id1','scheduleAt':'2026-10-19T11:00:00Z'}],'totalPages':1})):
   with self.assertRaises(m.Blocked):m.get_remote_day(self.c,date(2026,10,19))
 def test_remote_nested_account_occupied(self):
  with patch.object(m.requests,'get',return_value=FakeResponse({'docs':[{'id':'id1','accountId':{'_id':m.IG_ID},'scheduleAt':'2026-10-19T11:00:00Z'}],'totalPages':1})):
   self.assertEqual(len(m.get_remote_day(self.c,date(2026,10,19))),1)
 def test_remote_duplicate_page_block(self):
  with patch.object(m.requests,'get',return_value=FakeResponse({'docs':[{'id':'id1','accountId':{'_id':m.IG_ID},'scheduleAt':'2026-10-19T11:00:00Z'}],'totalPages':2})):
   with self.assertRaises(m.Blocked):m.get_remote_day(self.c,date(2026,10,19))
 def test_upload_idempotent(self):
  self.prepared()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'upload_file',side_effect=AssertionError('No duplicate upload')):
   self.assertEqual(m.upload_one(self.c,self.doc['content_id']),'ALREADY_UPLOADED_NO_RETRY')
 def test_ambiguous_upload_never_auto_retry(self):
  self.stage_images()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'upload_file',side_effect=m.Blocked('NETWORK')):
   with self.assertRaises(m.Blocked):m.upload_one(self.c,self.doc['content_id'])
  with patch.object(m,'account',lambda _c:None),patch.object(m,'upload_file',side_effect=AssertionError('should not retry')):
   with self.assertRaises(m.Blocked):m.upload_one(self.c,self.doc['content_id'])
 def test_publish_requires_explicit_confirm(self):
  self.prepared()
  with self.assertRaises(m.Blocked):m.publish_one(self.c,self.doc['content_id'],'2026-12-20T15:00:00+07:00','')
 def test_pilot_schedule_once(self):
  self.prepared();slot=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[]),patch.object(m.requests,'post',return_value=FakeResponse({'id':'sched1'})) as post:
   result=m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE');self.assertEqual(result['schedule_id'],'sched1');self.assertEqual(post.call_count,1)
   with self.assertRaises(m.Blocked):m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE')
   self.assertEqual(post.call_count,1)
 def test_pilot_ambiguous_post_reconcile_only(self):
  self.prepared();slot=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[]),patch.object(m.requests,'post',return_value=FakeResponse({'ok':True})) as post:
   with self.assertRaises(m.Blocked):m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE')
   con=m.ledger();self.assertEqual(m.row(con,self.doc['content_id'])['status'],'RECONCILE');con.close()
   with self.assertRaises(m.Blocked):m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE')
   self.assertEqual(post.call_count,1)
 def test_pilot_day_occupied_blocks_post(self):
  self.prepared();slot=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[{'id':'other'}]),patch.object(m.requests,'post',side_effect=AssertionError('not allowed')):
   with self.assertRaises(m.Blocked):m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE')
 def test_reconcile_requires_post_proof(self):
  self.prepared();slot=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[]),patch.object(m.requests,'post',return_value=FakeResponse({'id':'sched1'})):
   m.publish_one(self.c,self.doc['content_id'],slot,'I_AUTHORIZE_ONE_IG_SCHEDULE')
  remote={'id':'sched1','status':'published','accountId':m.IG_ID,'scheduleAt':slot,'postId':'p1'}
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[remote]):
   self.assertEqual(m.reconcile(self.c,self.doc['content_id'])['status'],'SCHEDULED_OR_UNVERIFIED')
  remote['publishedAt']=datetime.now(timezone.utc).isoformat()
  with patch.object(m,'account',lambda _c:None),patch.object(m,'get_remote_day',return_value=[remote]):
   self.assertEqual(m.reconcile(self.c,self.doc['content_id'])['status'],'REPLIZ_PUBLISHED_WITH_POST_ID_AND_TIME')

if __name__=='__main__':unittest.main(verbosity=2)
