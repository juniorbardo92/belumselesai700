import os, sys, tempfile, json
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
os.environ['KALYANAMITRA_FINGERPRINT_DIR'] = str(ROOT / 'provisioning')
sys.path.insert(0,str(ROOT))
import publisher_kalyanamitra as P
from fake_repliz_api import FakeRepliz

ID = '6ab3779a0723d7da8860d6bc'
ACCOUNT = P.AKUN_KALYANAMITRA['threads']
base_texts = ['Agar latihan tetap jernih, kita merawat setiap langkah dengan perhatian.' + (' x' * 10)] + [f'Balasan nomor {n} memiliki teks untuk diuji secara serius dan panjang.' for n in range(1,7)]
doc = {'_id':ID,'accountId':ACCOUNT, 'scheduleAt':'2026-12-22T03:54:00.000Z', 'description':base_texts[0], 'replies':[{'description':t} for t in base_texts[1:]]}
summary = {k:doc[k] for k in ('_id','accountId','scheduleAt')}
summary['fingerprint_kanonis_utas'] = P.fp_utas(base_texts)
summary['fingerprint_kanonis'] = P.fp_teks(base_texts[0])
acc = {'_id':ACCOUNT,'type':'threads','username':'ruangkalyanamitra','isConnected':True}

def fail_unless(cond, title):
    if not cond: raise AssertionError(title)
    print('PASS',title)

with tempfile.TemporaryDirectory() as td:
    baseline=Path(td)/'baseline.json'
    baseline.write_text(json.dumps({'jadwal':[summary]}))
    p=P.lapis2_bangun_pustaka([doc],baseline)
    api=FakeRepliz([acc],[summary],schedule_details={ID:doc}).start()
    try:
        c=SimpleNamespace(api=api.base_url, access_key='uat-access',secret_key='uat-secret')
        client=P.ReplizClient(c)
        def result(p,txts,detail=True,source_id=None):
            return P.lapis2_putuskan(p,'threads',P.fp_teks(txts[0]),P.fp_utas(txts),source_id, texts=txts,detail_fetcher=client.get_schedule if detail else None)
        r=result(p,base_texts)
        fail_unless(r and r[0]=='DUPLIKAT_BASELINE','exact_live_blocked')
        spaced=base_texts.copy(); spaced[1]=spaced[1].replace(' ','  ',2)
        fail_unless(P.fp_utas(spaced)==P.fp_utas(base_texts),'canonical_same_as_expected')
        fail_unless(result(p,spaced) is None,'whitespace_live_allowed')
        edge=base_texts.copy(); edge[1] = ' '+edge[1]+' '
        fail_unless(result(p,edge) is None,'leading_trailing_allowed')
        p0=P.lapis2_bangun_pustaka([summary],baseline)
        r=result(p0,base_texts)
        fail_unless(r and r[0]=='DUPLIKAT_BASELINE','exact_baseline_GET_blocked')
        fail_unless(result(p0,spaced) is None,'whitespace_baseline_GET_allowed')
        api.state.details.clear()
        r=result(p0,base_texts)
        fail_unless(r and r[0]=='BLOCKED_VERIFY_DUPLIKAT','missing_detail_fail_closed')
        r=result(p0,spaced)
        fail_unless(r and r[0]=='BLOCKED_VERIFY_DUPLIKAT','missing_detail_spaced_fail_closed')
        # Berkas tidak lengkap bahkan untuk respons 200 harus ditahan
        api.state.details[ID] = {**doc, 'replies': []}
        r=result(p0,spaced)
        fail_unless(r and r[0]=='BLOCKED_VERIFY_DUPLIKAT','incomplete_detail_fail_closed')
        api.state.details[ID] = doc
        p0['sumber']['LINK-1']={'_id':ID}
        fail_unless(result(p0,spaced,source_id='LINK-1')[0]=='DUPLIKAT_EKSPLISIT','explicit_link_blocks')
        fail_unless(P.lapis2_putuskan(p0,'instagram',P.fp_teks(base_texts[0]),P.fp_utas(base_texts),None, texts=base_texts,detail_fetcher=client.get_schedule) is None,'cross_platform_isolated')
        p1=P.lapis2_bangun_pustaka([doc, {**doc,'_id':'SECOND'}],baseline)
        fail_unless(len(p1['utas']['threads'][P.fp_utas(base_texts)])==2,'multiple_equal_hash_references_preserved')
        fail_unless(P.lapis2_putuskan(p1,'threads',P.fp_teks(base_texts[0]),P.fp_utas(base_texts),None,texts=spaced,detail_fetcher=client.get_schedule) is None, 'two_verified_matches_spaced_allowed')
        print('POST_TO_FAKE',api.post_count)
    finally:
        api.stop()
