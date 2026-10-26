import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import receiver_vps2 as r
import kalauto as k

class ConfigV2Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.envfile = self.root / 'receiver.env'
        self.setcfg()
        p=patch.object(r,'CONFIG_PATH',self.envfile);p.start();self.addCleanup(p.stop)
        e=patch.dict(os.environ,{},clear=False);e.start();self.addCleanup(e.stop)
    def setcfg(self, extra='', owner='789012345', key=None, data=None):
        self.envfile.write_text('\n'.join([
            f'KAL_AUTO_OWNER_ID={owner}',
            f'KAL_AUTO_HMAC_FILE={key or self.root / "secret"}',
            f'KAL_AUTO_DATA_DIR={data or self.root / "store"}',
            extra
        ])+'\n')
        self.envfile.chmod(0o600)
    def test_private_config_valid(self):
        r.load_private_config()
        self.assertEqual(os.environ['KAL_AUTO_OWNER_ID'], '789012345')
    def test_missing_is_blocked(self):
        self.envfile.unlink()
        with self.assertRaisesRegex(k.Blocked, 'RECEIVER_CONFIG_NOT_PROVISIONED'):r.load_private_config()
    def test_symlink_is_blocked(self):
        target=self.root/'real';self.envfile.rename(target);self.envfile.symlink_to(target)
        with self.assertRaisesRegex(k.Blocked,'CONFIG_SYMLINK_FORBIDDEN'):r.load_private_config()
    def test_owner_mismatch(self):
        with patch.object(r.os,'geteuid',return_value=999999):
            with self.assertRaisesRegex(k.Blocked,'CONFIG_OWNER_MISMATCH'):r.load_private_config()
    def test_insecure_mode(self):
        self.envfile.chmod(0o640)
        with self.assertRaisesRegex(k.Blocked,'UNSAFE_CONFIG_PERMISSIONS'):r.load_private_config()
    def test_inherited_env_overridden(self):
        with patch.dict(os.environ,{'KAL_AUTO_OWNER_ID':'malicious', 'KAL_AUTO_DATA_DIR':'/tmp/bad'}):
            r.load_private_config()
            self.assertEqual(os.environ['KAL_AUTO_OWNER_ID'],'789012345')
            self.assertNotEqual(os.environ['KAL_AUTO_DATA_DIR'],'/tmp/bad')
    def test_duplicate_config_key_blocked(self):
        self.setcfg(extra='KAL_AUTO_OWNER_ID=100000001')
        with self.assertRaisesRegex(k.Blocked,'INVALID_CONFIG_NAME'):r.load_private_config()
    def test_incomplete_config_blocked(self):
        self.envfile.write_text('KAL_AUTO_OWNER_ID=100000001\n');self.envfile.chmod(0o600)
        with self.assertRaisesRegex(k.Blocked,'MISSING_RECEIVER_CONFIG'):r.load_private_config()
    def test_non_numeric_owner_blocked(self):
        self.setcfg(owner='whoever')
        with self.assertRaisesRegex(k.Blocked,'OWNER_ID_MUST_BE_NUMERIC'):r.load_private_config()
    def test_relative_secret_path_blocked(self):
        self.setcfg(key='secret_file')
        with self.assertRaisesRegex(k.Blocked,'INVALID_CONFIG_PATH'):r.load_private_config()
    def test_size_limit(self):
        self.setcfg(extra='#'+'a'*4100)
        with self.assertRaisesRegex(k.Blocked,'CONFIG_TOO_LARGE'):r.load_private_config()

if __name__=='__main__':unittest.main()
