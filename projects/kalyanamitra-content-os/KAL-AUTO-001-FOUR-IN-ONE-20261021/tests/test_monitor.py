import importlib.util
import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime,timezone,timedelta
from pathlib import Path
from unittest.mock import patch

p=Path(__file__).resolve().parents[1]/'src/publication_monitor.py'
spec=importlib.util.spec_from_file_location('mon',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
WORDS='Sebuah kalimat Dharma yang berisi teks cukup panjang untuk pembuktian keterlihatan konten.'
ID='KAL-AUTO-1234567890ABCDE12345'
SID='6ad814e47e1804fa7c9430d0'
URLS=['https://www.threads.com/@ruangkalyanamitra/post/DevSTDcieDf',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSVB3iV_S',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSZzIiQQM',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSeitCRUx',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSjWuiaee',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSoAyiS4h',
 'https://www.threads.com/@ruangkalyanamitra/post/DevSsxKCW5f']
IDS=[str(18373177039215205+i) for i in range(7)]
TEXTS=[WORDS+str(i) for i in range(7)]
TIME='2026-10-21T02:00:00Z'

class FakeApi:
    def __init__(self,reply_ids=True):
        self.calls=[]
        self.schedule={'accountId':m.ACCOUNT,'status':'success','description':TEXTS[0],
                       'account':{'generatedId':'28137012079294786'},'scheduleAt':TIME,
                       'replies':[{'description':TEXTS[i],'status':'success','errorMessage':None,'postId':IDS[i] if reply_ids else None} for i in range(1,7)]}
        self.docs={id:{'id':id,'description':TEXTS[i],'owner':{'id':'28137012079294786'},
                  'url':URLS[i],'createdAt':f'2026-10-21T02:0{i}:30Z'} for i,id in enumerate(IDS)}
    def get(self,path,params=None):
        self.calls.append((path,params))
        if path=='/schedule/'+SID:return self.schedule
        if path=='/content':return {'docs':[self.docs[IDS[0]]]}
        if path.startswith('/content/'):return self.docs[path.split('/')[-1]]
        raise AssertionError('unexpected API route: '+path)
    def get_public(self,link,text):return 'VERIFIED'
    def parent(self,id,token):
        idx=IDS.index(id)
        return {'replied_to':{'id':IDS[idx-1]},'root_post':{'id':IDS[0]}}

class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.data=self.root/'state/kalauto'
        self.data.mkdir(parents=True)
        for k,v in [('ROOT',self.root),('DATA',self.data),('PROOF_DB',self.data/'publication_proof.sqlite'),('SOURCE_DB',self.data/'intent.sqlite'),('NOTIFY_FILE',self.root/'telegram-notify.json'),('META_FILE',self.root/'meta-threads-ro.token')]:
            self.addCleanup(lambda k=k,original=getattr(m,k):setattr(m,k,original))
            setattr(m,k,v)
        with sqlite3.connect(m.SOURCE_DB) as db:
            db.execute('CREATE TABLE jobs(id TEXT,schedule_id TEXT,slot_utc TEXT,state TEXT)')
            db.execute('INSERT INTO jobs VALUES(?,?,?,?)',(ID,SID,TIME,'SCHEDULED'))
        self.job={'id':ID,'schedule_id':SID,'slot_utc':TIME}
    def test_basic_public_and_meta_verified(self):
        api=FakeApi()
        r=m.evaluate(self.job,api.schedule,api,'xyz',True)
        self.assertEqual([r['proof_status'],r['visibility'],r['parent_child']],['CONTENT_CONFIRMED','VERIFIED','VERIFIED'])
        self.assertEqual(r['post_count'],7)
        self.assertEqual(r['post_urls'],URLS)
    def test_not_fake_parent(self):
        api=FakeApi()
        r=m.evaluate(self.job,api.schedule,api,None,True)
        self.assertEqual(r['parent_child'],'NOT_VERIFIED')
    def test_missing_reply_id(self):
        api=FakeApi(False)
        r=m.evaluate(self.job,api.schedule,api,None,False)
        self.assertEqual(r['proof_status'],'REPLIZ_SUCCESS')
        self.assertEqual(r['reason'],'REPLY_IDS_MISSING_OR_DUPLICATE')
    def test_wrong_slot(self):
        api=FakeApi();api.schedule['scheduleAt']='2026-10-21T23:00:00Z'
        r=m.evaluate(self.job,api.schedule,api,None,False)
        self.assertEqual(r['reason'],'SLOT_MISMATCH')
    def test_wrong_account(self):
        api=FakeApi();api.schedule['accountId']='wrong'
        r=m.evaluate(self.job,api.schedule,api,None,True)
        self.assertEqual(r['proof_status'],'INCOMPLETE')
        self.assertEqual(r['reason'],'ACCOUNT_MISMATCH')
    def test_wrong_owner(self):
        api=FakeApi();api.docs[IDS[2]]['owner']['id']='wrong'
        r=m.evaluate(self.job,api.schedule,api,None,True)
        self.assertEqual(r['reason'],'OWNER_MISMATCH_3')
    def test_text_mismatch(self):
        api=FakeApi();api.docs[IDS[4]]['description']='changed'
        r=m.evaluate(self.job,api.schedule,api,None,True)
        self.assertEqual(r['reason'],'CONTENT_MISMATCH_5')
    def test_missing_root(self):
        api=FakeApi();api.docs[IDS[0]]['description']='wrong'
        r=m.evaluate(self.job,api.schedule,api,None,True)
        self.assertEqual(r['reason'],'ROOT_NOT_FOUND')
    def test_reply_failed(self):
        api=FakeApi();api.schedule['replies'][4]['status']='error'
        self.assertEqual(m.evaluate(self.job,api.schedule,api)['reason'],'REPLY_NOT_SUCCESS')
    def test_schedule_pending(self):
        api=FakeApi();api.schedule['status']='pending'
        self.assertEqual(m.evaluate(self.job,api.schedule,api)['proof_status'],'PENDING')
    def test_wrong_permalink(self):
        api=FakeApi();api.docs[IDS[1]]['url']='https://fake-threads.com/post/x'
        self.assertEqual(m.evaluate(self.job,api.schedule,api)['reason'],'LINK_OR_TIMESTAMP_MISSING_2')
    def test_duplicate_permalink(self):
        api=FakeApi();api.docs[IDS[1]]['url']=URLS[0]
        self.assertEqual(m.evaluate(self.job,api.schedule,api)['reason'],'DUPLICATE_LINKS')
    def test_content_proof_and_public_js_wall(self):
        api=FakeApi();api.get_public=lambda *a:'NOT_VERIFIED'
        proof=m.evaluate(self.job,api.schedule,api)
        self.assertEqual(proof['proof_status'],'CONTENT_CONFIRMED')
        self.assertEqual(proof['visibility'],'NOT_VERIFIED')
    def test_html_200_not_enough(self):
        self.assertFalse(m.html_content_evidence('<html><title>Threads</title></html>',TEXTS[0]))
    def test_html_metadata_exact(self):
        self.assertTrue(m.html_content_evidence('<meta property="og:description" content="'+TEXTS[0]+'">',TEXTS[0]))
    def test_parent_conflict(self):
        api=FakeApi();api.parent=lambda *a:{'replied_to':{'id':'999999999999999999'}}
        self.assertEqual(m.evaluate(self.job,api.schedule,api,'tok')['parent_child'],'CONFLICT')
    def test_historic_seed_needs_real_content_get(self):
        api=FakeApi()
        api.schedule['_id']=SID
        # historic root seed is only an ID locator, fresh GET verifies the text
        api.docs[IDS[0]]['description']='not the expected post'
        proof=m.collect_content(api,api.schedule,TEXTS)
        self.assertEqual(proof['reason'],'CONTENT_MISMATCH_1')
    def test_no_jobs_future(self):
        t=datetime(2026,10,20,tzinfo=timezone.utc)
        self.assertEqual(m.jobs_due(t),[])
    def test_monitor_once_send_once_and_no_put(self):
        api=FakeApi();messages=[]
        clock=datetime(2026,10,21,3,tzinfo=timezone.utc)
        def send(conf,text):messages.append(text);return '1234'
        with patch.object(m,'telegram_send',side_effect=send):
            a=m.run_once(clock,api,notifier={'token':'not-in-use'},public=False)
            b=m.run_once(clock+timedelta(minutes=7),api,notifier={'token':'not-in-use'},public=False)
        self.assertEqual(a['checked'],1)
        self.assertEqual(b['checked'],0)
        self.assertEqual(len(messages),1)
        self.assertEqual([x[0] for x in api.calls if x[0].startswith('/schedule/')],['/schedule/'+SID])
        self.assertFalse(any(x[0] in ('/schedule','/content') and x[1] == 'POST' for x in api.calls))
        with sqlite3.connect(m.PROOF_DB) as db:
            self.assertEqual(db.execute('SELECT status FROM alerts').fetchone()[0],'SENT')
    def test_uncertain_telegram_no_auto_retry(self):
        api=FakeApi();clock=datetime(2026,10,21,3,tzinfo=timezone.utc)
        with patch.object(m,'telegram_send',side_effect=TimeoutError):
            m.run_once(clock,api,notifier={},public=False)
        with sqlite3.connect(m.PROOF_DB) as db:
            self.assertEqual(db.execute('SELECT status FROM alerts').fetchone()[0],'UNCERTAIN')
        with patch.object(m,'telegram_send',side_effect=AssertionError('duplicate alert')):
            m.run_once(clock+timedelta(hours=7),api,notifier={},public=False)
    def test_without_notifier_config_alert_is_not_consumed(self):
        api=FakeApi();clock=datetime(2026,10,21,3,tzinfo=timezone.utc)
        m.run_once(clock,api,notifier=None,public=False)
        with sqlite3.connect(m.PROOF_DB) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM alerts').fetchone()[0],0)
    def test_job_unchanged(self):
        api=FakeApi();clock=datetime(2026,10,21,3,tzinfo=timezone.utc)
        with patch.object(m,'telegram_send',return_value='1'):
            m.run_once(clock,api,notifier={},public=False)
        with sqlite3.connect(m.SOURCE_DB) as db:
            self.assertEqual(db.execute('SELECT state,schedule_id FROM jobs').fetchone(),('SCHEDULED',SID))
    def test_mismatched_meta_no_unsafe_assertions(self):
        api=FakeApi();api.parent=lambda *a:None
        r=m.evaluate(self.job,api.schedule,api,'invalid')
        self.assertEqual(r['parent_child'],'NOT_VERIFIED')
    def test_status_schedule_post_id_ignored(self):
        api=FakeApi();api.schedule['postId']=IDS[1]
        self.assertEqual(m.evaluate(self.job,api.schedule,api)['post_count'],7)
    def test_private_key_validation(self):
        token_path=self.root/'tmp.json'; token_path.write_text('{}');token_path.chmod(0o644)
        with self.assertRaises(m.ProofError):m.private_json(token_path)

if __name__=='__main__':unittest.main()
