import hashlib
import contextlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import kalauto as k

class KalAutoTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.key=self.root/'signing.key';self.key.write_bytes(b'x'*64);self.key.chmod(0o600)
        self.env=patch.dict(os.environ, {
            'KAL_AUTO_HMAC_FILE':str(self.key),'KAL_AUTO_DATA_DIR':str(self.root/'data'),
            'KAL_AUTO_OWNER_ID':'100000001','KAL_AUTO_BACKEND':'disabled','KAL_AUTO_WRITE_ENABLED':'false'
        })
        self.env.start();self.addCleanup(self.env.stop)
        self.p={
            'owner_id':'100000001', 'message_id':'790412345:451', 'account_id':k.ACCOUNT,
            'intent':'SCHEDULE','slot_wib':(datetime.now(ZoneInfo('Asia/Jakarta'))+timedelta(days=2)).strftime('%Y-%m-%dT15:00'),
            'topic':'Dhamma dan persahabatan baik', 'tradition':'THERAVADA',
            'source_refs':['SN 45.2'], 'source_verified':True,
            'posts':[f'Bagian {i}: latihan kebajikan membutuhkan perhatian dan tanggung jawab.' for i in range(1,9)],
            'content_version':1
        }
    def signed(self,p=None):return k.sign_payload(p or self.p)
    def ingest(self,p=None):return k.ingest(self.signed(p))
    def test_accept_and_dedup(self):
        one=self.ingest(); self.assertEqual(one['state'],'READY')
        two=self.ingest();self.assertEqual(two['status'],'DUPLICATE_NO_POST')
        self.assertEqual(one['job_id'],two['job_id'])
        with k.open_store() as db:self.assertEqual(db.execute('select count(*) from jobs').fetchone()[0],1)
    def test_cross_message_same_source_same_slot(self):
        one=self.ingest();p={**self.p,'message_id':'790412345:452'}
        two=self.ingest(p);self.assertEqual(two['status'],'DUPLICATE_NO_POST')
        self.assertEqual(one['job_id'],two['job_id'])
    def test_wrong_owner(self):
        p={**self.p,'owner_id':'bad'}
        with self.assertRaisesRegex(k.Blocked,'OWNER_NOT_ALLOWLISTED'): self.ingest(p)
    def test_wrong_account(self):
        p={**self.p,'account_id':'another'}
        with self.assertRaisesRegex(k.Blocked,'ACCOUNT_NOT_ALLOWLISTED'):self.ingest(p)
    def test_unverified_source(self):
        p={**self.p,'source_verified':False}
        with self.assertRaisesRegex(k.Blocked,'QA_SOURCE_NOT_VERIFIED'):self.ingest(p)
    def test_missing_source(self):
        p={**self.p,'source_refs':[]}
        with self.assertRaisesRegex(k.Blocked,'QA_SOURCE_NOT_VERIFIED'):self.ingest(p)
    def test_unknown_command(self):
        with self.assertRaisesRegex(k.Blocked,'INTENT_NOT_AUTHORIZED'):self.ingest({**self.p,'intent':'CANCEL'})
    def test_message_id_invalid(self):
        with self.assertRaisesRegex(k.Blocked,'INVALID_TELEGRAM_MESSAGE_ID'):self.ingest({**self.p,'message_id':'inject;rm -rf /'})
    def test_historic_guard(self):
        with self.assertRaisesRegex(k.Blocked,'HISTORIC_PILOT_GUARD'):self.ingest({**self.p,'topic':'KAL-PILOT-001'})
    def test_bad_signature(self):
        doc=self.signed(); doc['payload']['topic']='changed'
        with self.assertRaisesRegex(k.Blocked,'INVALID_SIGNATURE'):k.ingest(doc)
    def test_old_timestamp(self):
        doc=k.sign_payload(self.p,now=1)
        with self.assertRaisesRegex(k.Blocked,'ENVELOPE_EXPIRED'):k.ingest(doc)
    def test_unknown_field(self):
        with self.assertRaisesRegex(k.Blocked,'INVALID_PAYLOAD_FIELDS'):self.ingest({**self.p,'arbitrary_param':1})
    def test_too_many_parts(self):
        with self.assertRaisesRegex(k.Blocked,'INVALID_POSTS_MAX_500_BYTES'):self.ingest({**self.p,'posts':['Hello']*9})
    def test_single_post_publish_blocked(self):
        with self.assertRaisesRegex(k.Blocked,'PUBLISHER_REQUIRES_6_TO_8_PARTS'):self.ingest({**self.p,'posts':['Satu']})
    def test_oversize_utf8(self):
        with self.assertRaisesRegex(k.Blocked,'INVALID_POSTS_MAX_500_BYTES'):self.ingest({**self.p,'posts':['仏'*200]*8})
    def test_slot_old(self):
        with self.assertRaisesRegex(k.Blocked,'SLOT_TOO_SOON'):self.ingest({**self.p,'slot_wib':'2024-04-01T15:00'})
    def test_slot_far(self):
        with self.assertRaisesRegex(k.Blocked,'SLOT_BEYOND_WINDOW'):self.ingest({**self.p,'slot_wib':'2090-04-01T15:00'})
    def test_draft_no_post(self):
        p={**self.p,'intent':'DRAFT','slot_wib':None,'posts':['Satu konten'],'source_verified':False,'source_refs':[]}
        result=self.ingest(p);self.assertEqual(result['state'],'DRAFT')
        with self.assertRaisesRegex(k.Blocked,'NOT_READY_OR_ALREADY_CLAIMED'):
            with patch.dict(os.environ, {'KAL_AUTO_BACKEND':'mock'}):k.dispatch(result['job_id'])
    def test_mock_schedule(self):
        j=self.ingest()['job_id']
        with patch.dict(os.environ, {'KAL_AUTO_BACKEND':'mock'}):
            r=k.dispatch(j);self.assertEqual(r['network_posts'],0)
            with self.assertRaisesRegex(k.Blocked,'NOT_READY_OR_ALREADY_CLAIMED'):k.dispatch(j)
        self.assertEqual(k.status(j)['state'],'MOCK_SCHEDULED')
    def test_no_live_without_switch(self):
        j=self.ingest()['job_id']
        with patch.dict(os.environ, {'KAL_AUTO_BACKEND':'publisher_vps2'}):
            with self.assertRaisesRegex(k.Blocked,'WRITE_KILL_SWITCH_OFF'):k.dispatch(j)
        self.assertEqual(k.status(j)['state'],'READY')
    def test_bad_permission_secret(self):
        self.key.chmod(0o644)
        with self.assertRaisesRegex(k.Blocked,'SECRET_PERMISSIONS_NOT_PRIVATE'):k.sign_payload(self.p)
    def test_parallel_ingest_no_duplicate(self):
        docs=[self.signed() for _ in range(8)]
        outputs=[]; errors=[]
        def run(doc):
            try:outputs.append(k.ingest(doc))
            except Exception as e:errors.append(str(e))
        threads=[threading.Thread(target=run,args=(d,)) for d in docs]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertFalse(errors,errors)
        self.assertEqual(sum(x['status']=='ACCEPTED_NO_PUBLISH' for x in outputs),1)
        self.assertEqual(sum(x['status']=='DUPLICATE_NO_POST' for x in outputs),7)
    def test_live_mock_publisher_in_clone(self):
        db=self.root/'fakeclone.sqlite'
        with contextlib.closing(sqlite3.connect(db)) as con:
            con.execute('''CREATE TABLE content_queue (
             id INTEGER PRIMARY KEY,content_id TEXT UNIQUE NOT NULL,tradition TEXT,topic TEXT,status TEXT,
             priority INTEGER,attempts INTEGER,output_path TEXT,review_status TEXT,validator_status TEXT,
             note TEXT,publish_status TEXT,repliz_schedule_id TEXT,scheduled_at TEXT)''')
        script=self.root/'mock_pub.py'
        script.write_text('''import sys,sqlite3
args=sys.argv
cid=args[args.index("--content-id")+1]
db=args[args.index("--db")+1]
con=sqlite3.connect(db)
con.execute("UPDATE content_queue SET publish_status=?,repliz_schedule_id=? WHERE content_id=?",("SCHEDULED","MOCK-123",cid))
con.commit();con.close()
''')
        fp=self.root/'fingerprint_kalyanamitra.py'
        fp.write_bytes((Path(__file__).resolve().parent/'fixtures'/'fingerprint_kalyanamitra.py').read_bytes())
        h=hashlib.sha256(script.read_bytes()).hexdigest()
        j=self.ingest()['job_id']
        with patch.dict(os.environ,{'KAL_AUTO_BACKEND':'publisher_vps2','KAL_AUTO_WRITE_ENABLED':'true',
                      'KAL_AUTO_PUBLISHER':str(script),'KAL_AUTO_PUBLISHER_SHA256':h,
                      'KAL_AUTO_FINGERPRINT_PATH':str(fp),'KAL_AUTO_PRODUCTION_DB':str(db)}):
            result=k.dispatch(j)
            self.assertEqual(result['state'],'SCHEDULED')
            with self.assertRaisesRegex(k.Blocked,'NOT_READY_OR_ALREADY_CLAIMED'):k.dispatch(j)
        with contextlib.closing(sqlite3.connect(db)) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM content_queue').fetchone()[0],1)
            self.assertEqual(con.execute('SELECT repliz_schedule_id FROM content_queue').fetchone()[0],'MOCK-123')
    def test_publish_asap_is_scheduled_not_instant(self):
        p={**self.p,'intent':'PUBLISH_ASAP','slot_wib':None}
        slot=k.validate_payload(p)['slot_utc']
        self.assertIsNotNone(slot)
        from datetime import timezone
        t=datetime.fromisoformat(slot.replace('Z','+00:00'))
        delta=(t-datetime.now(timezone.utc)).total_seconds()
        self.assertGreater(delta,600)
        self.assertLess(delta,1200)
    def test_bad_publisher_hash_blocks_without_claim(self):
        j=self.ingest()['job_id']
        with patch.dict(os.environ,{'KAL_AUTO_BACKEND':'publisher_vps2','KAL_AUTO_WRITE_ENABLED':'true',
                                    'KAL_AUTO_PUBLISHER_SHA256':'0'*64}):
            with self.assertRaisesRegex(k.Blocked,'PUBLISHER_HASH_MISMATCH'):
                k.dispatch(j)
        self.assertEqual(k.status(j)['state'],'READY')
    def test_schema_preflight_fails(self):
        db=self.root/'other.sqlite'
        with contextlib.closing(sqlite3.connect(db)) as con:con.execute('CREATE TABLE content_queue (content_id TEXT)')
        with contextlib.closing(sqlite3.connect(db)) as con:
            with self.assertRaisesRegex(k.Blocked,'PRODUCTION_QUEUE_SCHEMA_MISMATCH'):k.check_queue_schema(con)

if __name__=='__main__':unittest.main(verbosity=2)
