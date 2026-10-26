import importlib.util
from pathlib import Path
from unittest import TestCase, main, mock

FILE=Path(__file__).resolve().parents[1]/'src'/'seo_audit.py'
spec=importlib.util.spec_from_file_location('audit_v2',FILE)
a=importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
SITE='https://umkmnaikkelas.id/'


def base(n=2):
    pages=[{'url':SITE if i==0 else SITE+f'artikel/{i}', 'status':200,
            'title':'UMKM Naik Kelas — Jangan Berbisnis Tanpa Peta',
            'h1':[], 'canonical':'', 'description':'Generic'} for i in range(n)]
    issues=[]
    for p in pages:
        for code in ('missing_h1','missing_canonical','duplicate_title'):
            issues.append(a.issue('medium',code,code,p['url']))
    return {'website':SITE,'scanned_at':'2026-10-13', 'pages_scanned':n, 'crawl_limit':60,
            'sitemap_discovered_urls':n,'robots_http_status':200,
            'pages':pages,'issues':issues,'issue_counts':{}}


def fake_good(urls,host):
    return {'status':'ok','message':'sukses','pages':[
        {'url':u,'status':'ok','title':f'Judul Unik {i}',
         'description':f'Deskripsi {i}', 'h1':[f'H1 {i}'],
         'canonical':u, 'robots':'', 'root_children':3} for i,u in enumerate(urls)]}

class V2Tests(TestCase):
    def test_171_raw_warnings_are_not_171_render_errors(self):
        result=a.reclassify_audit(base(57),render_limit=57,renderer=fake_good)
        self.assertEqual(len(result['raw_html_warnings']),171)
        self.assertEqual(result['raw_html_warning_counts']['duplicate_title'],57)
        self.assertEqual(len(result['issues']),0)
        self.assertEqual(result['rendered_html']['coverage'],'complete')
        self.assertEqual(result['rendered_html']['verified_count'],57)

    def test_missing_rendered_metadata_is_confirmed(self):
        def missing(urls,host):
            return {'status':'ok','message':'test','pages':[
                {'url':urls[0],'status':'ok','title':'','description':'',
                'h1':[],'canonical':'','robots':'','root_children':1}]}
        result=a.reclassify_audit(base(1),render_limit=1,renderer=missing)
        self.assertIn('render_missing_title',result['issue_counts'])
        self.assertIn('render_missing_h1',result['issue_counts'])
        self.assertIn('render_missing_canonical',result['issue_counts'])

    def test_renderer_unavailable_is_not_pass(self):
        def offline(urls,host):return {'status':'unavailable','message':'Browser absent','pages':[]}
        result=a.reclassify_audit(base(2),render_limit=2,renderer=offline)
        self.assertEqual(result['rendered_html']['coverage'],'partial_or_unavailable')
        self.assertEqual(result['rendered_html']['verified_count'],0)
        self.assertEqual(result['raw_html_warning_counts']['missing_h1'],2)
        report=a.report_md(result,{'status':'not_configured','message':'skip'})
        self.assertIn('belum mencakup seluruh halaman',report)

    def test_only_tested_pages_count_toward_coverage(self):
        result=a.reclassify_audit(base(3),render_limit=2,renderer=fake_good)
        self.assertEqual(result['rendered_html']['verified_count'],2)
        self.assertEqual(result['rendered_html']['eligible_count'],3)
        self.assertEqual(result['rendered_html']['coverage'],'partial_or_unavailable')

    def test_sitemap_alt_html_is_optional_if_main_valid(self):
        def fake_fetch(url,*args,**kwargs):
            if url.endswith('sitemap.xml'):
                body=b'<urlset><url><loc>https://umkmnaikkelas.id/buku</loc></url></urlset>'
            elif url.endswith('sitemap_index.xml'):
                body=b'<html>this is SPA fallback</html>'
            else:
                body=b''
            return {'status':200 if body else 404,'url':url,'body':body,
                    'truncated':False,'type':'text/html','error':''}
        with mock.patch.object(a,'fetch',side_effect=fake_fetch):
            urls,docs,errs=a.sitemap_urls(SITE,'umkmnaikkelas.id','')
        self.assertEqual(urls,[SITE+'buku'])
        self.assertEqual(errs,[])
        self.assertTrue(any(d['url'].endswith('sitemap_index.xml') for d in docs))

    def test_declared_invalid_sitemap_remains_error(self):
        def fake_fetch(url,*args,**kwargs):
            if url.endswith('custom.xml'):
                body=b'<html>not xml'
            elif url.endswith('sitemap.xml'):
                body=b'<urlset><url><loc>https://umkmnaikkelas.id/buku</loc></url></urlset>'
            else:
                body=b''
            return {'status':200 if body else 404,'url':url,'body':body,
                    'truncated':False,'type':'text/html','error':''}
        with mock.patch.object(a,'fetch',side_effect=fake_fetch):
            urls,docs,errs=a.sitemap_urls(SITE,'umkmnaikkelas.id',
                'Sitemap: https://umkmnaikkelas.id/custom.xml')
        self.assertEqual(len(errs),1)
        self.assertIn('robots.txt',errs[0])

    def test_sitemap_xml_alternative_root_ignored(self):
        def fake_fetch(url,*args,**kwargs):
            if url.endswith('sitemap.xml'):body=b'<urlset><url><loc>https://umkmnaikkelas.id/buku</loc></url></urlset>'
            else:body=b'<html></html>'
            return {'status':200,'url':url,'body':body,'truncated':False,'type':'text/html','error':''}
        with mock.patch.object(a,'fetch',side_effect=fake_fetch):
            urls,_,errs=a.sitemap_urls(SITE,'umkmnaikkelas.id','')
        self.assertEqual(errs,[])

    def test_gsc_read_only_function_still_present(self):
        self.assertTrue(callable(a.gsc_audit))
        self.assertEqual(a.cfg('THIS_DUMMY_VAR','missing'), 'missing')

if __name__=='__main__':main()
