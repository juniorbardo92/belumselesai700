import io, json, os, sqlite3, sys, tempfile, unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import kalauto, receiver_vps2, worker_vps2, sender_vps4

class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.root.chmod(0o700)
        self.patches=[patch.object(receiver_vps2,'CONFIG_PATH',self.root/'receiver.env'),
                      patch.object(receiver_vps2,'KEY_PATH',self.root/'hmac.key'),
                      patch.object(receiver_vps2,'DATA_PATH',self.root/'state/kalauto'),
                      patch.dict(os.environ,{'KAL_AUTO_OWNER_ID':'100000001','KAL_AUTO_HMAC_FILE':str(self.root/'hmac.key'),
                          'KAL_AUTO_DATA_DIR':str(self.root/'state/kalauto')})]
        for p in self.patches:p.start();self.addCleanup(p.stop)
        self.payload={'owner_id':'100000001','message_id':'7904026667:303','intent':'SCHEDULE',
          'account_id':kalauto.ACCOUNT,
          'posts':['Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh'],
          'topic':'Uji Gampopa','tradition':'VAJRAYANA','source_refs':['https://tergar.org/'],
          'source_verified':True,'public_practice_safe':True,
          'sources':[{'name':'Tergar','title':'Test source','url':'https://tergar.org/', 'verified':True}],
          'claims':[{'id':'C1','claim_type':'DOCTRINAL','status':'SUPPORTED','source_indexes':[0]}],
          'content_version':1,'slot_wib':(datetime.now(ZoneInfo('Asia/Jakarta'))+timedelta(days=2)).strftime('%Y-%m-%dT06:00')}
    def do_bootstrap(self):
        out=receiver_vps2.bootstrap({'operation':'BOOTSTRAP','owner_id':'100000001','secret':'a'*64})
        self.assertEqual(out['status'],'BOOTSTRAP_READY')
    def test_source_claim_schema_valid(self):
        out=kalauto.validate_payload(self.payload)
        self.assertIsNotNone(out['slot_utc'])
        draft=kalauto.make_draft(self.payload,'KAL-AUTO-'+'F'*20)
        self.assertEqual(draft['review']['public_practice_safe'],True)
        self.assertEqual(len(draft['sources']),1)
        self.assertEqual(len(draft['claims']),1)
    def test_cannot_accept_draft_schema_as_schedule(self):
        self.payload.pop('sources')
        with self.assertRaisesRegex(kalauto.Blocked,'QA_STRUCTURED_SOURCES_REQUIRED'):kalauto.validate_payload(self.payload)
    def test_missing_claims_blocks(self):
        self.payload['claims']=[]
        with self.assertRaisesRegex(kalauto.Blocked,'QA_CLAIMS_REQUIRED'):kalauto.validate_payload(self.payload)
    def test_fake_unverified_sources_block(self):
        self.payload['sources'][0]['verified']=False
        with self.assertRaisesRegex(kalauto.Blocked,'QA_SOURCE_FIELDS_INVALID'):kalauto.validate_payload(self.payload)
    def test_vajrayana_public_safety_required(self):
        self.payload['public_practice_safe']=False
        with self.assertRaisesRegex(kalauto.Blocked,'QA_PUBLIC_PRACTICE_NOT_VERIFIED'):kalauto.validate_payload(self.payload)
    def test_unsupported_claim_blocks(self):
        self.payload['claims'][0]['status']='UNSUPPORTED'
        with self.assertRaisesRegex(kalauto.Blocked,'QA_UNSUPPORTED_CLAIM'):kalauto.validate_payload(self.payload)
    def test_editorial_incorrect_reference_blocks(self):
        self.payload['claims'][0]['status']='EDITORIAL'
        with self.assertRaisesRegex(kalauto.Blocked,'QA_EDITORIAL_MUST_NOT_USE_SOURCE'):kalauto.validate_payload(self.payload)
    def test_backend_requires_six_posts(self):
        self.payload['posts']=['one']
        with self.assertRaisesRegex(kalauto.Blocked,'PUBLISHER_REQUIRES_6_TO_8_PARTS'):kalauto.validate_payload(self.payload)
    def test_bootstrap_then_no_rebootstrap(self):
        self.do_bootstrap()
        with self.assertRaisesRegex(kalauto.Blocked,'BOOTSTRAP_ALREADY_PROVISIONED'):self.do_bootstrap()
    def test_signed_draft_ingest_and_status(self):
        self.do_bootstrap()
        p=dict(self.payload, intent='DRAFT',source_verified=False)
        p.pop('slot_wib')
        env=kalauto.sign_payload(p)
        result=receiver_vps2.receive(io.BytesIO(json.dumps(env).encode()))
        self.assertEqual(result['state'],'DRAFT')
        request=kalauto.sign_payload({'operation':'STATUS','job_id':result['job_id'],'owner_id':'100000001'})
        receipt=receiver_vps2.receive(io.BytesIO(json.dumps(request).encode()))
        self.assertEqual(receipt['status'],'STATUS_OK')
        self.assertEqual(receipt['state'],'DRAFT')
    def test_schedule_ingest_generates_qa_complete_draft(self):
        self.do_bootstrap()
        result=receiver_vps2.receive(io.BytesIO(json.dumps(kalauto.sign_payload(self.payload)).encode()))
        self.assertEqual(result['state'],'READY')
        draft=(self.root/'state/kalauto/drafts'/f"{result['job_id']}.json")
        data=json.loads(draft.read_text())
        self.assertEqual(len(data['thread']),7)
        self.assertEqual(len(data['sources']),1)
        self.assertEqual(len(data['claims']),1)
        self.assertTrue(data['review']['source_verified'])
    def test_duplicate_ingest_prevented(self):
        self.do_bootstrap()
        env=kalauto.sign_payload(self.payload)
        d=io.BytesIO(json.dumps(env).encode())
        r1=receiver_vps2.receive(d)
        r2=receiver_vps2.receive(io.BytesIO(json.dumps(kalauto.sign_payload(self.payload)).encode()))
        self.assertEqual(r2['status'],'DUPLICATE_NO_POST')
        self.assertEqual(r1['job_id'],r2['job_id'])
    def test_unsigned_blocks_after_bootstrap(self):
        self.do_bootstrap()
        with self.assertRaisesRegex(kalauto.Blocked,'BAD_ENVELOPE'):
            receiver_vps2.receive(io.BytesIO(b'{}'))
    def test_status_wrong_owner_blocks(self):
        self.do_bootstrap()
        q=kalauto.sign_payload({'operation':'STATUS','owner_id':'123123','job_id':'KAL-AUTO-'+'A'*20})
        with self.assertRaisesRegex(kalauto.Blocked,'STATUS_OWNER_MISMATCH'):
            receiver_vps2.receive(io.BytesIO(json.dumps(q).encode()))
    def test_original_ssh_command_denied(self):
        with patch.dict(os.environ,{'SSH_ORIGINAL_COMMAND':'sh'}):
            with self.assertRaisesRegex(kalauto.Blocked,'REMOTE_COMMAND_FORBIDDEN'):
                receiver_vps2.receive(io.BytesIO(b'{}'))
    def test_validator_real_shape(self):
        from subprocess import run
        validator=Path(__file__).parent/'fixtures/validate_dharma_json.py'
        draft=kalauto.make_draft(self.payload,'KAL-AUTO-'+'F'*20)
        path=self.root/'draft.json';path.write_text(json.dumps(draft))
        r=run([sys.executable,str(validator),str(path)],capture_output=True,text=True)
        self.assertEqual(r.returncode,0, r.stdout+r.stderr)
    def test_publisher_hash_baseline(self):
        import hashlib
        p=Path(__file__).parent/'fixtures/publisher_kalyanamitra.py'
        self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),worker_vps2.PUBLISHER_HASH)

if __name__=='__main__':unittest.main()

class WorkerPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.root.chmod(0o700)
        self.data=self.root/'state/kalauto';self.data.mkdir(parents=True,mode=0o700)
        (self.root/'receiver.env').write_text(f'KAL_AUTO_OWNER_ID=100000001\nKAL_AUTO_HMAC_FILE={self.root}/hmac.key\nKAL_AUTO_DATA_DIR={self.data}\n')
        self.patches=[patch.object(worker_vps2,'ROOT',self.root),patch.object(worker_vps2,'CONFIG',self.root/'receiver.env')]
        for p in self.patches:p.start();self.addCleanup(p.stop)
    def test_no_jobs_no_post(self):
        self.assertEqual(worker_vps2.load()['KAL_AUTO_DATA_DIR'],str(self.data))
        # Config is path-pinned; a substituted spool location fails closed.
        (self.root/'receiver.env').write_text('KAL_AUTO_HMAC_FILE=/wrong\nKAL_AUTO_DATA_DIR=/wrong\n')
        with self.assertRaisesRegex(RuntimeError,'CONFIG_PATH_MISMATCH'):
            worker_vps2.load()
    def test_timer_service_is_not_legacy_timer(self):
        unit=(Path(__file__).parents[1]/'systemd/kalauto-schedule-worker.timer').read_text()
        self.assertNotIn('kalyanamitra-threads-auto-v1.timer',unit)
        self.assertIn('kalauto-schedule-worker.service',unit)
    def test_receiver_never_dispatches(self):
        source=(Path(__file__).parents[1]/'src/receiver_vps2.py').read_text()
        self.assertNotIn('post_schedule(',source)
        self.assertNotIn('dispatch(',source)

class SenderToReceiverMockTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.root.chmod(0o700)
        self.ssh=self.root/'ssh';self.ssh.mkdir(mode=0o700)
        self.intake=self.root/'intake';self.intake.mkdir(mode=0o700)
        self.conf=self.root/'openclaw.json'
        self.conf.write_text(json.dumps({'channels':{'telegram':{
            'dmPolicy':'allowlist','allowFrom':['7904026667'],
            'accounts':{'kalyanamitra':{'dmPolicy':'allowlist','allowFrom':['7904026667']}}}},
            'bindings':[{'agentId':'kalyanamitra','match':{'channel':'telegram','accountId':'kalyanamitra'}}]}))
        pts=[patch.object(sender_vps4,'SSH_ROOT',self.ssh),patch.object(sender_vps4,'CONFIG',self.ssh/'schedule.json'),
          patch.object(sender_vps4,'SECRET',self.ssh/'kalauto-hmac.key'),patch.object(sender_vps4,'OPENCLAW',self.conf),
          patch.object(receiver_vps2,'CONFIG_PATH',self.intake/'receiver.env'),
          patch.object(receiver_vps2,'KEY_PATH',self.intake/'hmac.key'),
          patch.object(receiver_vps2,'DATA_PATH',self.intake/'state/kalauto'),
          patch('sender_vps4.ssh_send',side_effect=lambda host,doc:receiver_vps2.receive(io.BytesIO(json.dumps(doc).encode())))]
        for p in pts:p.start();self.addCleanup(p.stop)
    def test_mocked_ssh_bootstrap_draft_status(self):
        b=sender_vps4.bootstrap('10.11.0.10')
        self.assertEqual(b['status'],'SIGNED_BRIDGE_BOOTSTRAPPED')
        self.assertEqual((self.intake/'hmac.key').read_text(),(self.ssh/'kalauto-hmac.key').read_text())
        draft={'message_id':'7904026667:501','intent':'DRAFT','topic':'Dharma',
               'tradition':'VAJRAYANA','posts':['satu','dua'],
               'source_refs':[],'source_verified':False,'content_version':1}
        path=self.root/'draft.json';path.write_text(json.dumps(draft))
        result=sender_vps4.execute('submit',str(path))
        self.assertEqual(result['state'],'DRAFT')
        status=sender_vps4.execute('status',result['job_id'])
        self.assertEqual(status['state'],'DRAFT')
    def test_allowlist_mismatch_blocks(self):
        obj=json.loads(self.conf.read_text());obj['channels']['telegram']['accounts']['kalyanamitra']['allowFrom']=['11111']
        self.conf.write_text(json.dumps(obj))
        with self.assertRaisesRegex(kalauto.Blocked,'SENDER_ALLOWLIST_MISMATCH'):
            sender_vps4.owner_from_openclaw()
