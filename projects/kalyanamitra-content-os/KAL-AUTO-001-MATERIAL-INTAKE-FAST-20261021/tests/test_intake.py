import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('intake',str(Path(__file__).parents[1]/'src/intake.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class InboxTests(unittest.TestCase):
  def setUp(self):
    self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name)
  def tearDown(self):self.t.cleanup()
  def test_text(self):
    out=m.ingest(self.root/'inbox','Namo Buddhaya',[])
    self.assertEqual(out['status'],'RECEIVED_INBOX')
    self.assertEqual((self.root/'inbox'/out['id']/'materi.txt').read_text(),'Namo Buddhaya')
    r=json.loads((self.root/'inbox'/out['id']/'receipt.json').read_text())
    self.assertEqual(r['publish_status'],'NOT_REQUESTED_OR_EXECUTED')
  def test_dedupe(self):
    a=m.ingest(self.root/'inbox','x',[]);b=m.ingest(self.root/'inbox','x',[])
    self.assertEqual(a['id'],b['id']);self.assertEqual(b['status'],'ALREADY_RECEIVED')
  def test_dedupe_by_message_id(self):
    a=m.ingest(self.root/'inbox','x',[],message_id='12');b=m.ingest(self.root/'inbox','x',[],message_id='13')
    self.assertNotEqual(a['id'],b['id'])
  def test_requires_material(self):
    with self.assertRaisesRegex(ValueError,'NO_MATERIAL'):m.ingest(self.root/'inbox',' ',[])
  def test_bad_source(self):
    with self.assertRaisesRegex(ValueError,'SOURCE_NOT_TELEGRAM'):m.ingest(self.root/'inbox','x',[],source='public')
  def test_file(self):
    f=self.root/'dharma.pdf';f.write_bytes(b'%PDF-1.7 sample')
    result=m.ingest(self.root/'inbox','', [f]);self.assertEqual(result['files'],1)
    self.assertEqual((self.root/'inbox'/result['id']/'attachment-01.pdf').read_bytes(),f.read_bytes())
  def test_symlink(self):
    f=self.root/'dharma.pdf';f.write_bytes(b'a');s=self.root/'link.pdf';s.symlink_to(f)
    with self.assertRaisesRegex(ValueError,'SYMLINK_NOT_ALLOWED'):m.ingest(self.root/'inbox','', [s])
  def test_bad_extension(self):
    f=self.root/'secret.env';f.write_text('a')
    with self.assertRaisesRegex(ValueError,'UNSUPPORTED_ATTACHMENT'):m.ingest(self.root/'inbox','', [f])
  def test_large(self):
    with self.assertRaisesRegex(ValueError,'TEXT_TOO_LARGE'):m.ingest(self.root/'inbox','x'*250001,[])
  def test_file_size(self):
    f=self.root/'x.pdf'
    with f.open('wb') as fp:fp.truncate(m.MAX_FILE+1)
    with self.assertRaisesRegex(ValueError,'FILE_TOO_LARGE'):m.ingest(self.root/'inbox','', [f])
  def test_instruction_stored(self):
    r=m.ingest(self.root/'inbox','mati?',[],instruction='buat konten, jangan publish')
    data=json.loads((self.root/'inbox'/r['id']/'receipt.json').read_text())
    self.assertEqual(data['instruction'],'buat konten, jangan publish')
  def test_inbox_permissions(self):
    import stat
    m.ingest(self.root/'inbox','a',[])
    self.assertEqual(stat.S_IMODE((self.root/'inbox').stat().st_mode),0o700)
  def test_utf8(self):
    r=m.ingest(self.root/'inbox','Dharma 🙏 dan mettā',[])
    self.assertEqual((self.root/'inbox'/r['id']/'materi.txt').read_text(),'Dharma 🙏 dan mettā')
  def test_no_network_import(self):
    self.assertFalse(hasattr(m,'requests'))
if __name__=='__main__':unittest.main()
