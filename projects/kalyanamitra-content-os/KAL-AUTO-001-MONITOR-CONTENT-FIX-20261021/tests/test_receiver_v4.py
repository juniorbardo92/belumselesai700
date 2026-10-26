import io, importlib.util, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests/fixtures'))
import kalauto
spec=importlib.util.spec_from_file_location('receiver_v4',ROOT/'src/receiver_vps2_v4.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        p=Path(self.tmp.name);p.chmod(0o700)
        for k,v in [('CONFIG_PATH',p/'receiver.env'),('KEY_PATH',p/'hmac.key'),('DATA_PATH',p/'state'),('NOTIFY_PATH',p/'telegram-notify.json')]:
            before=getattr(r,k);setattr(r,k,v);self.addCleanup(lambda k=k,before=before:setattr(r,k,before))
        token='abc0123456789abcdef'*4
        r.KEY_PATH.write_text(token+'\n');r.KEY_PATH.chmod(0o600)
        r.CONFIG_PATH.write_text('KAL_AUTO_OWNER_ID=100000001\nKAL_AUTO_HMAC_FILE='+str(r.KEY_PATH)+'\nKAL_AUTO_DATA_DIR='+str(r.DATA_PATH)+'\n')
        r.CONFIG_PATH.chmod(0o600)
        r.DATA_PATH.mkdir()
        self.env={'KAL_AUTO_HMAC_FILE':str(r.KEY_PATH),'KAL_AUTO_OWNER_ID':'100000001', 'KAL_AUTO_DATA_DIR':str(r.DATA_PATH)}
    def submit(self,doc):
        with patch.dict(os.environ,self.env,clear=False):
            wrapped=kalauto.sign_payload(doc)
            return r.receive(io.BytesIO(json.dumps(wrapped).encode()))
    def test_notify_provision_pass_once(self):
        doc={'operation':'PROVISION_NOTIFY','owner_id':'100000001','chat_id':'100000001',
             'bot_token':'000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}
        out=self.submit(doc)
        self.assertEqual(out['status'],'TELEGRAM_NOTIFY_CONFIGURED')
        self.assertEqual(r.NOTIFY_PATH.stat().st_mode & 0o777,0o600)
        self.assertTrue(r.NOTIFY_PATH.is_file())
        with self.assertRaises(kalauto.Blocked):self.submit(doc)
    def test_notify_owner_mismatch(self):
        doc={'operation':'PROVISION_NOTIFY','owner_id':'100000001','chat_id':'88888',
             'bot_token':'000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}
        with self.assertRaises(kalauto.Blocked):self.submit(doc)
    def test_notify_bad_token(self):
        doc={'operation':'PROVISION_NOTIFY','owner_id':'100000001','chat_id':'100000001','bot_token':'xx'}
        with self.assertRaises(kalauto.Blocked):self.submit(doc)
    def test_notify_bad_signature(self):
        doc={'operation':'PROVISION_NOTIFY','owner_id':'100000001','chat_id':'100000001','bot_token':'x'}
        with patch.dict(os.environ,self.env,clear=False):
            wrapper=kalauto.sign_payload(doc);wrapper['signature']='0'*64
            with self.assertRaises(kalauto.Blocked):r.receive(io.BytesIO(json.dumps(wrapper).encode()))
    def test_remote_cmd_still_forbidden(self):
        with patch.dict(os.environ,{'SSH_ORIGINAL_COMMAND':'bash -c id'},clear=False):
            with self.assertRaises(kalauto.Blocked):r.receive(io.BytesIO(b'{}'))

if __name__=='__main__':unittest.main()
