import io,json,os,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import bridge_vps4 as b
import kalauto as k

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.secret=self.root/'key';self.secret.write_bytes(b'A'*64);self.secret.chmod(0o600)
        self.key=self.root/'id_ssh';self.key.write_text('dummy');self.key.chmod(0o600)
        self.e=patch.dict(os.environ,{'KAL_AUTO_HMAC_FILE':str(self.secret),'KAL_AUTO_DATA_DIR':str(self.root/'state'),
            'KAL_AUTO_OWNER_ID':'12345','KAL_AUTO_TRANSPORT_ENABLED':'true',
            'KAL_AUTO_VERIFIED_TELEGRAM_PEER':'true', 'KAL_AUTO_SSH_KEY_FILE':str(self.key),
            'KAL_AUTO_VPS2_SSH_HOST':'10.0.0.12'})
        self.e.start();self.addCleanup(self.e.stop)
        self.payload={'message_id':'12345:5','intent':'DRAFT','topic':'Belajar welas asih',
                      'posts':['Bahan utuh untuk draf'], 'source_refs':[], 'source_verified':False}
    def run_bridge(self,payload=None,ssh=None):
        old_stdin=sys.stdin
        try:
            fake=SimpleNamespace(buffer=io.BytesIO(json.dumps(payload if payload is not None else self.payload).encode()))
            with patch.object(sys,'stdin',fake),patch('bridge_vps4.subprocess.run',return_value=ssh or SimpleNamespace(returncode=0,stdout='{"status":"ACCEPTED_NO_PUBLISH","job_id":"KAL-AUTO-MOCK","state":"DRAFT"}')) as call:
                with patch('builtins.print') as printer:
                    rc=b.main()
                return rc,call,printer
        finally:sys.stdin=old_stdin
    def test_success_outbound_strict_ssh(self):
        rc,call,out=self.run_bridge();self.assertEqual(rc,0)
        argv=call.call_args.args[0];self.assertIn('StrictHostKeyChecking=yes',argv)
        self.assertIn('ClearAllForwardings=yes',argv)
        self.assertIn('kalauto-intake@10.0.0.12',argv)
        envelope=json.loads(call.call_args.kwargs['input'])
        self.assertEqual(k.verify_envelope(envelope)['account_id'],k.ACCOUNT)
        self.assertEqual(k.verify_envelope(envelope)['owner_id'],'12345')
    def test_missing_sender_binding_blocks(self):
        with patch.dict(os.environ,{'KAL_AUTO_VERIFIED_TELEGRAM_PEER':'false'}):
            rc,call,out=self.run_bridge();self.assertEqual(rc,3);call.assert_not_called()
    def test_transport_off_blocks(self):
        with patch.dict(os.environ,{'KAL_AUTO_TRANSPORT_ENABLED':'false'}):
            rc,call,out=self.run_bridge();self.assertEqual(rc,3);call.assert_not_called()
    def test_unsafe_host_blocks(self):
        with patch.dict(os.environ,{'KAL_AUTO_VPS2_SSH_HOST':'-oEvil=1'}):
            rc,call,out=self.run_bridge();self.assertEqual(rc,3);call.assert_not_called()
    def test_remote_fail_no_post_claim(self):
        rc,call,out=self.run_bridge(ssh=SimpleNamespace(returncode=255,stderr='TOKEN_PRIVATE',stdout=''))
        self.assertEqual(rc,3);self.assertNotIn('TOKEN_PRIVATE',str(out.call_args))

if __name__=='__main__':unittest.main()
