import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'seo_opportunities.py'
spec = importlib.util.spec_from_file_location('seo_opportunities', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def report():
    pages = [
        ('negosiasi-diskon-klien-umkm', 76, 0, 5.6),
        ('mengatasi-perang-harga-ecommerce-umkm', 61, 1, 7.1),
        ('stok-tidak-merata-umkm', 52, 0, 8.8),
        ('kapasitas-produksi-umkm', 40, 1, 7.6),
        ('leadership-leader-mlm-direct-selling', 38, 0, 5.8),
    ]
    return {'technical':{'rendered_html':{'pages':[
        {'url': f'https://umkmnaikkelas.id/artikel/{slug}', 'status':'ok',
         'title': 'Judul halaman asli', 'h1':['H1 halaman asli'],
         'description':'Deskripsi artikel'} for slug,*_ in pages
    ]}}, 'search_console': {
        'status':'ok','site_property':'sc-domain:umkmnaikkelas.id',
        'period':{'start':'2026-09-13','end':'2026-10-10'},
        'current':{'clicks':14,'impressions':791,'ctr':.0177,'position':7.2},
        'pages':[{'key':f'https://umkmnaikkelas.id/artikel/{slug}',
                  'impressions': imp, 'clicks':clk,
                  'ctr': (clk/imp), 'position':pos} for slug,imp,clk,pos in pages],
    }}

class OpportunityTest(unittest.TestCase):
    def test_scope(self):
        self.assertTrue(mod.same_site('https://umkmnaikkelas.id/artikel/test'))
        for u in ['http://umkmnaikkelas.id/', 'https://evil.com',
                  'https://umkmnaikkelas.id.evil.org/', 'file:///secret']:
            self.assertFalse(mod.same_site(u))

    def test_focus_priority(self):
        selected = mod.choose_pages(report()['search_console'],4)
        self.assertEqual([x['slug'] for x in selected],list(mod.FOCUS_SLUGS))

    def test_query_filter_is_exact_read_only(self):
        url='https://umkmnaikkelas.id/artikel/stok-tidak-merata-umkm'
        body=mod.build_query_request('sc-domain:umkmnaikkelas.id','2026-09-13','2026-10-10',url)
        self.assertEqual(body['dimensions'],['query'])
        self.assertEqual(body['dimensionFilterGroups'][0]['filters'][0],{
            'dimension':'page','operator':'equals','expression':url})
        self.assertEqual(body['dataState'],'final')
        self.assertEqual(body['type'],'web')

    def test_reject_foreign_query(self):
        with self.assertRaises(ValueError):
            mod.build_query_request('sc-domain:umkmnaikkelas.id','2026-09-13','2026-10-10','https://other.tld/foo')

    def test_offline_keeps_missing_queries_explicit(self):
        result=mod.prepare(report(),{},4,offline=True)
        self.assertEqual(result['credentials_status'],'offline')
        self.assertEqual(len(result['pages']),4)
        self.assertTrue(all(p['query_status']=='not_fetched' for p in result['pages']))
        self.assertEqual(result['pages'][0]['current_h1'],['H1 halaman asli'])

    def test_query_drilldown_injection_for_test(self):
        calls=[]
        def fake(token, site, start, end, url):
            calls.append((site,start,end,url))
            return [{'query':'negosiasi diskon klien','impressions':30,'clicks':0,'ctr':0,'position':5.5}]
        old=mod.authorize
        try:
            mod.authorize=lambda cfg: 'dummy-not-secret'
            data=mod.prepare(report(),{'SEO_GSC_OAUTH_FILE':'dummy'},4,get_queries=fake)
        finally:
            mod.authorize=old
        self.assertEqual(len(calls),4)
        self.assertEqual(calls[0][1:3],('2026-09-13','2026-10-10'))
        self.assertEqual(data['pages'][0]['query_status'],'ok')
        self.assertIn('negosiasi diskon klien',mod.to_markdown(data))

    def test_query_api_failure_keeps_report(self):
        old=mod.authorize
        try:
            mod.authorize=lambda cfg:'t'
            data=mod.prepare(report(),{},2,get_queries=lambda *args: (_ for _ in ()).throw(RuntimeError('api unavailable')))
        finally:
            mod.authorize=old
        self.assertEqual([p['query_status'] for p in data['pages']],['error','error'])
        self.assertIn('api unavailable',mod.to_markdown(data))

    def test_config_parser_is_not_shell(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'seo.env'
            p.write_text("#SEO_GSC_OAUTH_FILE=/nope\nSEO_GSC_OAUTH_FILE='/tmp/gsc.json'\nUNSAFE=$(touch /tmp/foo)\nSEO_GSC_PROPERTY=sc-domain:umkmnaikkelas.id\n")
            cfg=mod.read_cfg(p)
            self.assertEqual(cfg['SEO_GSC_OAUTH_FILE'],'/tmp/gsc.json')
            self.assertNotIn('UNSAFE',cfg)

    def test_invalid_property(self):
        a=report();a['search_console']['site_property']='https://another.com'
        with self.assertRaises(ValueError): mod.prepare(a,{},4,offline=True)

    def test_no_false_rows_claim(self):
        s=report();s['search_console']['pages']=[]
        data=mod.prepare(s,{},4,offline=True)
        self.assertIn('Tidak ditemukan kandidat',mod.to_markdown(data))

    def test_markdown_data_sanitization(self):
        self.assertEqual(mod.safe_md('cheap | \n<script>'), 'cheap \\|  &lt;script&gt;')

    def test_small_impressions_excluded(self):
        s=report();s['search_console']['pages'][0]['impressions']=2
        a=mod.choose_pages(s['search_console'],4)
        self.assertNotIn('negosiasi-diskon-klien-umkm',[x['slug'] for x in a])

if __name__ == '__main__': unittest.main()
