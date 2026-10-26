import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

BASE=Path(__file__).resolve().parents[1]
def module(name,rel):
    spec=importlib.util.spec_from_file_location(name,BASE/rel)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
q=module('insp','inspect_checklist_id.py')
i=module('installer','install_namespace_fix.py')
SEED=BASE/'tests'/'fixtures'  # portable synthetic fixture shipped with package
class GateSample(unittest.TestCase):
    def setUp(self):
        for x in ('ledger.sqlite', 'policy.json'):
            if not (SEED/x).is_file(): raise RuntimeError('BUNDLED_TEST_FIXTURE_MISSING:'+x)
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        for x in ('ledger.sqlite','policy.json'):shutil.copy2(SEED/x,self.root/x)
    def tearDown(self):self.tmp.cleanup()
    def test_b03_is_closed_no_start(self):
        r=q.inspect(self.root,['B03'])
        self.assertEqual(r['items'][0]['state'],'CLOSED')
        self.assertFalse(r['items'][0]['can_start'])
        self.assertIn('R27',r['items'][0]['description'])
    def test_k05_k06_ids_not_kpis(self):
        r=q.inspect(self.root,['K05','K06'])
        self.assertIn('KAL-PILOT-001',r['items'][0]['description'])
        self.assertIn('7 reply',r['items'][1]['description'])
    def test_k06_dependency_from_canonical_policy(self):
        r=q.inspect(self.root,['K06'])
        self.assertEqual(r['items'][0]['dependencies_for_start'],['K05'])
        self.assertEqual(r['items'][0]['start_blockers'],[{'id':'K05','state':'OPEN'}])
        self.assertFalse(r['items'][0]['can_start'])
    def test_k05_current_can_start(self):
        r=q.inspect(self.root,['K05'])
        self.assertTrue(r['items'][0]['can_start'])
    def test_namespace_not_b3(self):
        with self.assertRaisesRegex(q.InspectError,'INVALID_CHECKLIST_ID'):q.inspect(self.root,['B3'])
    def test_unknown_id(self):
        with self.assertRaisesRegex(q.InspectError,'UNKNOWN_CHECKLIST_ID'):q.inspect(self.root,['H99'])
    def test_duplicate_ids(self):
        with self.assertRaisesRegex(q.InspectError,'INVALID_CHECKLIST_ID'):q.inspect(self.root,['B03','B03'])
    def test_chain_tamper_fails_closed(self):
        db=sqlite3.connect(self.root/'ledger.sqlite');db.execute("UPDATE events SET hash=? WHERE seq=1",('f'*64,));db.commit();db.close()
        with self.assertRaisesRegex(q.InspectError,'EVENT_CHAIN_INVALID'):q.inspect(self.root,['B03'])
    def test_count_tamper_fails_closed(self):
        db=sqlite3.connect(self.root/'ledger.sqlite');db.execute("DELETE FROM tasks WHERE id='C01'");db.commit();db.close()
        with self.assertRaisesRegex(q.InspectError,'CHECKLIST_TASK_COUNT'):q.inspect(self.root,['B03'])
    def test_fixture_is_local_not_live(self):
        self.assertEqual(SEED.parent, BASE/'tests')
        self.assertNotIn('/mnt/data/gate-local-qa',str(SEED))
    def test_readonly_no_mutation(self):
        before=hashlib.sha256((self.root/'ledger.sqlite').read_bytes()).hexdigest()
        q.inspect(self.root,['B03','K05','K06'])
        after=hashlib.sha256((self.root/'ledger.sqlite').read_bytes()).hexdigest()
        self.assertEqual(before,after)
    def test_policy_false_auto_closure(self):
        data=json.loads((self.root/'policy.json').read_text());data['allow_automatic_close']=True
        (self.root/'policy.json').write_text(json.dumps(data))
        with self.assertRaisesRegex(q.InspectError,'POLICY_INVALID'):q.inspect(self.root,['K06'])

class InstallSample(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.orig=(i.APP,i.LEDGER,i.MAIN,i.BACKUPS,i.check_host,i.audit)
        i.APP=self.root/'app';i.APP.mkdir()
        i.LEDGER=self.root/'state';i.LEDGER.mkdir()
        i.MAIN=self.root/'AGENTS.md';i.MAIN.write_text('Existing SOP\n<!-- HERMES-CHECKLIST-GATE-BRIDGE-V1-START -->\n')
        i.BACKUPS=self.root/'backups'
        i.check_host=lambda:None
        i.audit=lambda:{'result':'AUDIT_PASS','task_count':81}
    def tearDown(self):
        i.APP,i.LEDGER,i.MAIN,i.BACKUPS,i.check_host,i.audit=self.orig
        self.tmp.cleanup()
    def test_preflight_requires_existing_bridge(self):
        i.MAIN.write_text('SOP without bridge')
        with self.assertRaisesRegex(i.InstallError,'BRIDGE_SOP_V1_REQUIRED'):i.preflight()
    def test_apply_preserves_prior_content_and_creates_backup(self):
        old=i.MAIN.read_bytes();r=i.apply()
        self.assertEqual(r['status'],'NAMESPACE_SOP_APPEND_PASS')
        self.assertTrue(i.MAIN.read_bytes().startswith(old))
        self.assertEqual(Path(r['backup']).read_bytes(),old)
        self.assertEqual(Path(r['backup']).stat().st_mode&0o777,0o600)
    def test_apply_idempotent(self):
        i.apply();before=i.MAIN.read_bytes();r=i.apply()
        self.assertEqual(r['status'],'NAMESPACE_ALREADY_APPLIED')
        self.assertEqual(i.MAIN.read_bytes(),before)
    def test_inspector_conflict_blocked(self):
        (i.APP/i.NEW_FILE).write_text('tampered')
        with self.assertRaisesRegex(i.InstallError,'INSPECTOR_DEST_CONFLICT'):i.preflight()
    def test_rollback_sop_byte_exact_only(self):
        old=i.MAIN.read_bytes()
        i.apply()
        r=i.rollback_sop()
        self.assertEqual(r['status'],'NAMESPACE_SOP_ROLLBACK_PASS')
        self.assertEqual(i.MAIN.read_bytes(),old)
    def test_rollback_refuses_concurrent_change(self):
        i.apply()
        with i.MAIN.open('ab') as f:f.write(b'concurrent edit\n')
        with self.assertRaisesRegex(i.InstallError,'ROLLBACK_BASELINE_NOT_UNIQUE'):
            i.rollback_sop()
    def test_manifest_source_valid(self):
        i.check_source()
    def test_diagnose_good_pinned_gate(self):
        import pathlib
        canonical=BASE.parent/'hermes-quality-gate-v1'/'gate.py'
        if canonical.is_file() and hashlib.sha256(canonical.read_bytes()).hexdigest()==i.PINNED_GATE_SHA:
            (i.APP/'gate.py').write_bytes(canonical.read_bytes())
        else:
            # The tests stay portable: fake source integrity with a fixture by
            # monkeypatching the pinned digest only for this test.
            (i.APP/'gate.py').write_bytes(b'synthetic test version')
            oldpin=i.PINNED_GATE_SHA
            i.PINNED_GATE_SHA=hashlib.sha256((i.APP/'gate.py').read_bytes()).hexdigest()
            self.addCleanup(setattr,i,'PINNED_GATE_SHA',oldpin)
        (i.APP/'CHECKSUMS.sha256').write_text(i.PINNED_GATE_SHA+'  gate.py\n')
        d=i.diagnose()
        self.assertEqual(d['status'],'GATE_INTEGRITY_PASS')
        self.assertTrue(d['gate_matches_manifest'])
        self.assertTrue(d['gate_matches_pinned'])
    def test_diagnose_shows_hash_failure_without_modification(self):
        with (i.APP/'gate.py').open('wb') as f:f.write(b'not-pinned')
        (i.APP/'CHECKSUMS.sha256').write_text(i.PINNED_GATE_SHA+'  gate.py\n')
        d=i.diagnose()
        self.assertEqual(d['status'],'GATE_INTEGRITY_BLOCKED')
        self.assertFalse(d['gate_matches_pinned'])
        self.assertNotIn('GATE_HASH_MISMATCH',d.get('error',''))
    def test_diagnose_nonexisting_gate(self):
        self.assertEqual(i.diagnose()['status'],'GATE_INTEGRITY_BLOCKED')

if __name__=='__main__':unittest.main()
