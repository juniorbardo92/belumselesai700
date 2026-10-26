import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock

p=Path(__file__).resolve().parents[1]/'src/publication_monitor.py'
spec=importlib.util.spec_from_file_location('mon_content_fixed',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class EnforceAccount(unittest.TestCase):
    def test_repliz_one_content_request_includes_account_id(self):
        class FakeResp:
            status_code=200
            content=b'{}'
            def json(self):return {'id':'18373177039215205'}
        session=MagicMock()
        session.get.return_value=FakeResp()
        api=m.Api(('test_access','test_secret'),session)
        api.get('/content/18373177039215205',params={'accountId':m.ACCOUNT})
        self.assertEqual(session.get.call_args.kwargs['params'],{'accountId':m.ACCOUNT})
        self.assertEqual(session.get.call_args.args[0],'https://api.repliz.com/public/content/18373177039215205')
    def test_collect_content_sends_account_id_for_all_seven_posts(self):
        from test_monitor import FakeApi, IDS, TEXTS, SID
        class StrictApi(FakeApi):
            def get(self,path,params=None):
                if path.startswith('/content/') and params!={'accountId':m.ACCOUNT}:
                    raise RuntimeError('MISSING_ACCOUNT_ID')
                return super().get(path,params)
        api=StrictApi()
        api.schedule['_id']=SID
        proof=m.collect_content(api,api.schedule,TEXTS)
        self.assertEqual(proof['status'],'VERIFIED')
        calls=[(path,params) for path,params in api.calls if path.startswith('/content/')]
        self.assertEqual(len(calls),7)
        self.assertTrue(all(params=={'accountId':m.ACCOUNT} for _,params in calls))

if __name__=='__main__':unittest.main()
