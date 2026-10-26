import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import receiver_vps2 as r
import verify_owner_binding_vps4 as v
import kalauto as k


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.secret = root / 'key'
        self.secret.write_bytes(b'A' * 64)
        self.secret.chmod(0o600)
        self.envfile = root / 'receiver.env'
        self.envfile.write_text('\n'.join([
            'KAL_AUTO_OWNER_ID=999999',
            f'KAL_AUTO_HMAC_FILE={self.secret}',
            f'KAL_AUTO_DATA_DIR={root / "state"}',
        ])+'\n')
        self.envfile.chmod(0o600)
        self.env = patch.dict(os.environ, {
                        'KAL_AUTO_OWNER_ID': '999999',
            'KAL_AUTO_HMAC_FILE': str(self.secret),
            'KAL_AUTO_DATA_DIR': str(root / 'state'),
        })
        self.env.start(); self.addCleanup(self.env.stop)
        patcher = patch.object(r, 'CONFIG_PATH', self.envfile)
        patcher.start(); self.addCleanup(patcher.stop)
        self.doc = k.sign_payload({'owner_id':'999999','account_id':k.ACCOUNT,
                                  'message_id':'999999:1','intent':'DRAFT',
                                  'topic':'Materi baru','posts':['Draft uji'],
                                  'source_refs':[],'source_verified':False})

    def test_receive_draft_only(self):
        result = r.receive(io.BytesIO(json.dumps(self.doc).encode()))
        self.assertEqual(result['status'], 'ACCEPTED_NO_PUBLISH')
        self.assertEqual(result['state'], 'DRAFT')

    def test_duplicate_no_publish(self):
        data = json.dumps(self.doc).encode()
        self.assertEqual(r.receive(io.BytesIO(data))['status'], 'ACCEPTED_NO_PUBLISH')
        self.assertEqual(r.receive(io.BytesIO(data))['status'], 'DUPLICATE_NO_POST')

    def test_forbid_remote_commands(self):
        with patch.dict(os.environ, {'SSH_ORIGINAL_COMMAND':'bash -c true'}):
            with self.assertRaisesRegex(k.Blocked,'REMOTE_COMMAND_FORBIDDEN'):
                r.receive(io.BytesIO(json.dumps(self.doc).encode()))

    def test_forbid_unsigned_payload(self):
        with self.assertRaisesRegex(k.Blocked, 'BAD_ENVELOPE'):
            r.receive(io.BytesIO(json.dumps({'payload':{}}).encode()))

    def test_forbid_invalid_signature(self):
        bad=json.loads(json.dumps(self.doc)); bad['signature']='0'*64
        with self.assertRaisesRegex(k.Blocked, 'INVALID_SIGNATURE'):
            r.receive(io.BytesIO(json.dumps(bad).encode()))

    def test_too_large(self):
        with self.assertRaisesRegex(k.Blocked, 'PAYLOAD_TOO_LARGE'):
            r.receive(io.BytesIO(b'x'*65537))

    def test_config_permissions(self):
        self.envfile.chmod(0o666)
        with self.assertRaisesRegex(k.Blocked, 'UNSAFE_CONFIG_PERMISSIONS'):
            r.receive(io.BytesIO(json.dumps(self.doc).encode()))

    def test_block_non_numeric_owner_allowlist(self):
        cfg={'channels':{'telegram':{'dmPolicy':'allowlist', 'allowFrom':['*'], 'accounts':{'kalyanamitra':{'dmPolicy':'allowlist','allowFrom':['123']}}}}, 'bindings':[{'agentId':'kalyanamitra','match':{'channel':'telegram','accountId':'kalyanamitra'}}]}
        self.assertEqual(v.verify(cfg)['status'], 'BLOCKED')

    def test_valid_binding_but_runtime_unverified(self):
        cfg={'channels':{'telegram':{'dmPolicy':'allowlist', 'allowFrom':[123], 'accounts':{'kalyanamitra':{'dmPolicy':'allowlist','allowFrom':['123']}}}}, 'bindings':[{'agentId':'kalyanamitra','match':{'channel':'telegram','accountId':'kalyanamitra'}}]}
        d=v.verify(cfg)
        self.assertEqual(d['status'], 'CONFIG_BINDING_PASS')
        self.assertFalse(d['runtime_sender_metadata_verified'])


if __name__=='__main__': unittest.main()
