import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import concurrent.futures
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from gate import Gate, GateError, initialize, parse_checklist, validate_policy, ingest
BASE=Path(__file__).resolve().parents[1]

class TestGate(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)/'state'
        initialize(self.root,BASE/'checklist.md',BASE/'policy.json')
        self.g=Gate(self.root)
        self.artifact=Path(self.temp.name)/'proof.txt'
        self.artifact.write_text('ACTUAL TEST OUTPUT: 1 pass 0 fail\n')
    def tearDown(self):
        self.g.close();self.temp.cleanup()
    def receipt(self,task,token,actor='reviewer',scope='operations',**kw):
        x={'task_id':task,'token':token,'run_id':'run-test-001','actor':actor,'scope':scope,'baseline':'checkpoint-validated','tests':{'command':'python3 -m unittest','total':1,'passed':1,'failed':0,'exit_code':0},'artifacts':[{'path':str(self.artifact),'sha256':hashlib.sha256(self.artifact.read_bytes()).hexdigest()}]}
        x.update(kw);return x
    def test_81_initial_states(self):
        r=self.g.audit()
        self.assertEqual(r['task_count'],81)
        self.assertEqual(r['status_counts'],{'CLOSED':22,'CLOSED_DEV':9,'HOLD':5,'OPEN':30,'PARTIAL':12,'STOPPED':3})
    def test_closed_and_hold_refuse_claim(self):
        for x in ('H01','B11','X01','H15'):
            with self.assertRaises(GateError):self.g.claim(x,'agent')
    def test_claim_replay_rejected(self):
        self.g.claim('K05','reviewer')
        with self.assertRaises(GateError):self.g.claim('K05','reviewer')
    def test_unknown_or_fake_token_rejected(self):
        self.g.claim('K05','reviewer')
        with self.assertRaises(GateError):self.g.submit(self.receipt('K05','false'))
    def test_false_artifact_hash_rejected(self):
        token=self.g.claim('K05','reviewer')['token']
        bad=self.receipt('K05',token);bad['artifacts'][0]['sha256']='a'*64
        with self.assertRaisesRegex(GateError,'ARTIFACT_SHA256_MISMATCH'):self.g.submit(bad)
    def test_failed_test_does_not_close(self):
        token=self.g.claim('K05','reviewer')['token'];r=self.receipt('K05',token)
        r['tests']['failed']=1;r['tests']['passed']=0;r['tests']['exit_code']=1
        self.assertEqual(self.g.submit(r)['result'],'BLOCKED_TEST')
        self.assertEqual(self.g.row('K05')['state'],'OPEN')
        self.assertEqual(self.g.row('K05')['phase'],'BLOCKED_TEST')
    def test_valid_structural_proof_still_open(self):
        token=self.g.claim('K05','reviewer')['token']
        self.assertEqual(self.g.submit(self.receipt('K05',token))['result'],'STRUCTURAL_PASS_OWNER_PENDING')
        self.assertEqual(self.g.row('K05')['state'],'OPEN')
        self.assertEqual(self.g.row('K05')['phase'],'VERIFIED_PENDING_OWNER')
        self.assertEqual(self.g.audit()['result'],'AUDIT_PASS')
    def test_skip_start_dependency_blocked(self):
        with self.assertRaisesRegex(GateError,'BLOCKED_START_DEPENDENCIES'):
            self.g.claim('K06','reviewer')
        self.assertEqual(self.g.row('K06')['state'],'OPEN')
        t=self.g.claim('K05','reviewer')['token'];self.g.submit(self.receipt('K05',t))
        self.g.approve('K05','CLOSED','owner','Confirmed GET proof')
        token=self.g.claim('K06','reviewer')['token']
        self.g.submit(self.receipt('K06',token))
        self.assertEqual(self.g.approve('K06','CLOSED','owner','Confirmed seven replies')['state'],'CLOSED')
    def test_all_explicit_dependencies_fail_closed_at_dispatch(self):
        for dependent in ('K06','B09','C04','U04'):
            with self.assertRaisesRegex(GateError,'BLOCKED_START_DEPENDENCIES'):
                self.g.claim(dependent,'orchestrator')
    def test_scope_prod_receipt_cannot_close_as_dev(self):
        t=self.g.claim('H07','reviewer')['token']
        self.g.submit(self.receipt('H07',t,scope='production'))
        with self.assertRaisesRegex(GateError,'SCOPE_MISMATCH_CLOSE_DEV'):
            self.g.approve('H07','CLOSED_DEV','owner','Not a developer source')
        self.assertEqual(self.g.row('H07')['state'],'OPEN')
    def test_structural_proof_cannot_fake_external_proof(self):
        t=self.g.claim('K05','reviewer')['token']
        self.g.submit(self.receipt('K05',t,scope='publication'))
        self.assertEqual(self.g.row('K05')['state'],'OPEN')
        self.assertEqual(self.g.row('K05')['phase'],'VERIFIED_PENDING_OWNER')
    def test_duplicate_ingest_rejected_and_not_closed(self):
        t=self.g.claim('K05','reviewer')['token'];r=self.receipt('K05',t)
        (self.root/'inbox'/'one.json').write_text(json.dumps(r))
        (self.root/'inbox'/'two.json').write_text(json.dumps(r))
        result=ingest(self.g)
        self.assertEqual(result['count'],2)
        self.assertEqual({v['result'] for v in result['receipts']},{'STRUCTURAL_PASS_OWNER_PENDING','REJECTED'})
        self.assertEqual(self.g.row('K05')['state'],'OPEN')
    def test_dev_cannot_be_closed_as_production(self):
        token=self.g.claim('B10','reviewer')['token']
        self.g.submit(self.receipt('B10',token,scope='dev'))
        with self.assertRaisesRegex(GateError,'DEV_PROOF_CANNOT_CLOSE_PRODUCTION'):
            self.g.approve('B10','CLOSED','owner','Developer proof only')
        self.assertEqual(self.g.approve('B10','CLOSED_DEV','owner','Accepted DEV implementation')['state'],'CLOSED_DEV')
    def test_existing_closed_baseline_not_reopened(self):
        x=self.g.row('B14')
        self.assertEqual((x['state'],x['phase']),('CLOSED','BASELINE_CLOSED'))
    def test_ingest_file_event(self):
        token=self.g.claim('K05','reviewer')['token'];r=self.receipt('K05',token)
        (self.root/'inbox'/'receipt.json').write_text(json.dumps(r))
        o=ingest(self.g)
        self.assertEqual(o['receipts'][0]['result'],'STRUCTURAL_PASS_OWNER_PENDING')
        self.assertFalse((self.root/'inbox'/'receipt.json').exists())
        self.assertTrue((self.root/'processed'/'receipt.json').exists())
        self.assertEqual(ingest(self.g)['count'],0)
    def test_concurrent_claim_only_one_succeeds(self):
        def attempt(i):
            gate=Gate(self.root)
            try:
                try:return gate.claim('H07',f'actor{i}')['result']
                except GateError as e:return str(e)
            finally:gate.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(attempt,[1,2]))
        self.assertEqual(results.count('CLAIM_ACCEPTED'),1)
        self.assertEqual(results.count('TASK_ALREADY_IN_FLIGHT'),1)
    def test_symlink_receipt_quarantined_not_followed(self):
        p=self.root/'inbox'/'unsafe.json'
        p.symlink_to(self.artifact)
        result=ingest(self.g)
        self.assertEqual(result['receipts'][0]['result'],'REJECTED_UNSAFE_RECEIPT')
        self.assertFalse(p.exists())
        self.assertTrue((self.root/'rejected'/'unsafe.json').is_symlink())
        self.assertTrue(self.artifact.exists())
    def test_chain_tamper_detected(self):
        self.g.db.execute("UPDATE events SET hash=? WHERE seq=1",('0'*64,));self.g.db.commit()
        with self.assertRaisesRegex(GateError,'EVENT_CHAIN_CORRUPT'):
            self.g.audit()
    def test_policy_cycles_fail(self):
        p=json.loads((BASE/'policy.json').read_text())
        p['dependencies_for_close']['K05']=['K06']
        with self.assertRaisesRegex(GateError,'DEPENDENCY_CYCLE'):validate_policy(p,{x[0] for x in parse_checklist(BASE/'checklist.md')})

if __name__=='__main__':unittest.main()
