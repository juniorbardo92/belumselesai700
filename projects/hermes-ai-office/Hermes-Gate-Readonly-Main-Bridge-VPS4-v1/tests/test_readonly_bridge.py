import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]

def mod(name,path):
    sp=importlib.util.spec_from_file_location(name,ROOT/path)
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);return m
E=mod('read_only_export','export_gate_snapshot.py')
R=mod('read_only_client','hermes_checklist_read.py')
I=mod('read_only_installer','install_ro_bridge.py')

ids=([f'H{i:02}' for i in range(1,16)]+[f'B{i:02}' for i in range(1,23)] +
     [f'Q{i:02}' for i in range(1,8)]+[f'K{i:02}' for i in range(1,12)]+
     [f'U{i:02}' for i in range(1,8)]+[f'S{i:02}' for i in range(1,11)]+
     [f'C{i:02}' for i in range(1,5)]+[f'X{i:02}' for i in range(1,6)])
assert len(ids)==81

def seed(p):
    p.mkdir();
    policy={'schema':1,'allow_automatic_close':False,'dependencies_for_start':{'K06':['K05']},'dependencies_for_close':{'K06':['K05']}}
    (p/'policy.json').write_text(json.dumps(policy))
    db=sqlite3.connect(p/'ledger.sqlite')
    db.executescript('''CREATE TABLE tasks(id TEXT PRIMARY KEY,priority TEXT,state TEXT,phase TEXT,description TEXT);
    CREATE TABLE events(seq INTEGER PRIMARY KEY,time TEXT,kind TEXT,payload TEXT,prev TEXT,hash TEXT);''')
    for x in ids:
        state='CLOSED' if x=='B03' else 'OPEN'
        db.execute('INSERT INTO tasks VALUES(?,?,?,?,?)',(x,'P1',state,'BASELINE_CLOSED' if state=='CLOSED' else 'IDLE','Synthetic test task '+x))
    payload={'count':81};t='2026-10-18T11:00:00Z';prev='0'*64
    content={'time':t,'kind':'BASELINE_IMPORTED','payload':payload,'prev':prev}
    h=E.sha(E.canonical(content).encode())
    db.execute('INSERT INTO events VALUES(?,?,?,?,?,?)',(1,t,'BASELINE_IMPORTED',E.canonical(payload),prev,h))
    db.commit();db.close()

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)
        self.ledger=self.base/'ledger';seed(self.ledger)
        self.now=dt.datetime(2026,10,18,11,45,tzinfo=dt.timezone.utc)
        self.live=self.base/'live';self.live.mkdir(mode=0o750)
        self.snapshot=self.live/'status.json'

    def object(self):return E.generate(self.ledger,now=self.now)
    def write(self,obj=None):
        self.snapshot.write_text(json.dumps(obj or self.object()))
        os.chmod(self.snapshot,0o640)

    def test_source_and_chain_valid(self):
        o=self.object();self.assertEqual(o['task_count'],81);self.assertTrue(o['chain_valid'])
        self.assertEqual(len(o['items']),81);self.assertFalse(o['automatic_close'])
    def test_correct_ids_and_dependency(self):
        x={t['id']:t for t in self.object()['items']}
        self.assertFalse(x['B03']['can_start'])
        self.assertTrue(x['K05']['can_start'])
        self.assertFalse(x['K06']['can_start']);self.assertEqual(x['K06']['start_blockers'],[{'id':'K05','state':'OPEN'}])
    def test_no_token_actor_from_state(self):
        self.assertNotIn('token_sha',json.dumps(self.object()))
        self.assertNotIn('"actor"',json.dumps(self.object()))
    def test_event_chain_tamper(self):
        with sqlite3.connect(self.ledger/'ledger.sqlite') as c:c.execute("UPDATE events SET hash='abc' WHERE seq=1")
        with self.assertRaisesRegex(E.ExportError,'EVENT_CHAIN_INVALID'):self.object()
    def test_wrong_count(self):
        with sqlite3.connect(self.ledger/'ledger.sqlite') as c:c.execute("DELETE FROM tasks WHERE id='H15'")
        with self.assertRaisesRegex(E.ExportError,'TASK_COUNT_NOT_81'):self.object()
    def test_duplicate_id_impossible_sqlite(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with sqlite3.connect(self.ledger/'ledger.sqlite') as c:
                c.execute("INSERT INTO tasks VALUES('B03','P1','OPEN','IDLE','duplicate')")
    def test_bad_policy_auto_close(self):
        p=json.loads((self.ledger/'policy.json').read_text());p['allow_automatic_close']=True
        (self.ledger/'policy.json').write_text(json.dumps(p))
        with self.assertRaisesRegex(E.ExportError,'POLICY_INVALID'):self.object()
    def test_policy_cycle(self):
        p=json.loads((self.ledger/'policy.json').read_text());p['dependencies_for_start']['K05']=['K06']
        (self.ledger/'policy.json').write_text(json.dumps(p))
        with self.assertRaisesRegex(E.ExportError,'POLICY_DEPENDENCY_CYCLE'):self.object()
    def test_policy_unknown(self):
        p=json.loads((self.ledger/'policy.json').read_text());p['dependencies_for_start']['K05']=['ZZ9']
        (self.ledger/'policy.json').write_text(json.dumps(p))
        with self.assertRaisesRegex(E.ExportError,'POLICY_ID_INVALID'):self.object()
    def test_source_symlink_denied(self):
        (self.ledger/'policy.json').rename(self.ledger/'policy-actual.json')
        (self.ledger/'policy.json').symlink_to('policy-actual.json')
        with self.assertRaisesRegex(E.ExportError,'UNSAFE_OR_MISSING_FILE'):self.object()
    def test_readonly_sqlite_no_mutation(self):
        b=(self.ledger/'ledger.sqlite').read_bytes(); self.object()
        self.assertEqual(b,(self.ledger/'ledger.sqlite').read_bytes())
    def test_published_file_atomic_and_mode(self):
        o=self.object()
        # Source destination normally uses setgid; unit test simulates inheriting own group.
        E.publish(o,self.snapshot)
        self.assertEqual(stat.S_IMODE(self.snapshot.stat().st_mode),0o640)
        self.assertEqual(json.loads(self.snapshot.read_text())['event_count'],1)
    def test_reader_valid(self):
        self.write()
        o=R.read(self.snapshot,['B03','K05','K06'],now=self.now+dt.timedelta(seconds=55))
        self.assertEqual(o['result'],'CHECKLIST_NAMESPACE_PASS')
        self.assertEqual(o['items'][-1]['start_blockers'][0]['id'],'K05')
    def test_reader_stale_blocks(self):
        self.write()
        with self.assertRaisesRegex(R.ReadError,'SNAPSHOT_STALE'):
            R.read(self.snapshot,['B03'],now=self.now+dt.timedelta(seconds=121))
    def test_reader_future_blocks(self):
        self.write()
        with self.assertRaisesRegex(R.ReadError,'SNAPSHOT_STALE'):
            R.read(self.snapshot,['B03'],now=self.now-dt.timedelta(seconds=1))
    def test_reader_invalid_duplicate_id(self):
        self.write()
        with self.assertRaisesRegex(R.ReadError,'INVALID_REQUEST_IDS'):
            R.read(self.snapshot,['B03','B03'],now=self.now)
    def test_reader_unexpected_policy(self):
        o=self.object();o['automatic_close']=True;self.write(o)
        with self.assertRaisesRegex(R.ReadError,'SNAPSHOT_HEADER_INVALID'):
            R.read(self.snapshot,['B03'],now=self.now)
    def test_reader_symlink_snapshot(self):
        actual=self.base/'actual.json';actual.write_text(json.dumps(self.object()))
        self.snapshot.symlink_to(actual)
        with self.assertRaisesRegex(R.ReadError,'SYMLINK_PATH_DENIED'):
            R.read(self.snapshot,['B03'],now=self.now)
    def test_reader_zero_fabrication(self):
        self.write();o=R.read(self.snapshot,['B03'],now=self.now)
        self.assertNotIn('ledger.sqlite',json.dumps(o));self.assertEqual(o['items'][0]['state'],'CLOSED')
    def test_installer_manifest_valid(self):
        I.package_check()
    def test_installer_manifest_tamper_fails(self):
        with mock.patch.object(I,'SOURCE',self.base):
            (self.base/'SHA256SUMS').write_text('x')
            with self.assertRaises(I.InstallError):I.package_check()

if __name__=='__main__':unittest.main()

class SOPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.p=self.root/'AGENTS.md';self.p.write_text('Existing Main instructions.\n')
        self.backup=self.root/'backups'
    def test_sop_additive_backup(self):
        import importlib.util
        sp=importlib.util.spec_from_file_location('sop_patch',ROOT/'patch_main_sop.py')
        m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
        before=self.p.read_bytes();o=m.apply(self.p,ROOT/'MAIN-AGENTS-READONLY-ADDENDUM.md',self.backup)
        self.assertEqual(o['status'],'SOP_READONLY_ADDENDUM_PASS')
        self.assertTrue(self.p.read_bytes().startswith(before.rstrip(b'\n')))
        backs=list(self.backup.glob('*.bak'));self.assertEqual(len(backs),1)
        self.assertEqual(backs[0].read_bytes(),before)
    def test_sop_idempotent(self):
        sp=importlib.util.spec_from_file_location('sop_patch2',ROOT/'patch_main_sop.py')
        m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
        m.apply(self.p,ROOT/'MAIN-AGENTS-READONLY-ADDENDUM.md',self.backup)
        self.assertEqual(m.apply(self.p,ROOT/'MAIN-AGENTS-READONLY-ADDENDUM.md',self.backup)['status'],'SOP_ALREADY_PRESENT')
        self.assertEqual(len(list(self.backup.glob('*.bak'))),1)
    def test_sop_symlink_denied(self):
        sp=importlib.util.spec_from_file_location('sop_patch3',ROOT/'patch_main_sop.py')
        m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
        self.p.rename(self.root/'REAL_AGENTS.md');self.p.symlink_to(self.root/'REAL_AGENTS.md')
        with self.assertRaisesRegex(m.SOPError,'SYMLINK'):m.planned(self.p,ROOT/'MAIN-AGENTS-READONLY-ADDENDUM.md')
