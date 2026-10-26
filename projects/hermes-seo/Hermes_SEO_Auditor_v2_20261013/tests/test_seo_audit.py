import importlib.util
import os
from pathlib import Path
from unittest import TestCase, main, mock

SCRIPT=Path(__file__).resolve().parents[1]/'src'/'seo_audit.py'
spec=importlib.util.spec_from_file_location('seo_audit',SCRIPT)
seo=importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)

class SEOAuditTests(TestCase):
    def test_scope_blocks_external_and_sibling_hosts(self):
        self.assertTrue(seo.in_scope('https://umkmnaikkelas.id/panglima','umkmnaikkelas.id'))
        self.assertTrue(seo.in_scope('https://www.umkmnaikkelas.id/','umkmnaikkelas.id'))
        self.assertFalse(seo.in_scope('https://evil-umkmnaikkelas.id/','umkmnaikkelas.id'))
        self.assertFalse(seo.in_scope('ftp://umkmnaikkelas.id/','umkmnaikkelas.id'))

    def test_page_parser(self):
        p=seo.PageParser()
        p.feed('''<title>Halaman UMKM</title><meta name="description" content="Pedoman UMKM">
          <link rel="canonical" href="https://umkmnaikkelas.id/panglima">
          <h1>Panglima UMKM</h1><a href="/buku">Buku</a>
          <script type="application/ld+json">{}</script>''')
        self.assertEqual(p.title,'Halaman UMKM')
        self.assertEqual(p.h1,['Panglima UMKM'])
        self.assertEqual(p.meta['description'],'Pedoman UMKM')
        self.assertEqual(p.structured,1)

    def test_sitemap_index_then_urlset(self):
        data={
            'https://umkmnaikkelas.id/sitemap.xml':b'''<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://umkmnaikkelas.id/posts.xml</loc></sitemap></sitemapindex>''',
            'https://umkmnaikkelas.id/posts.xml':b'''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://umkmnaikkelas.id/buku</loc></url><url><loc>https://elsewhere.com/</loc></url></urlset>'''
        }
        def fake(u,*args,**kwargs):
            return {'status':200 if u in data else 404,'url':u,'body':data.get(u,b''),'truncated':False,'type':'application/xml','error':''}
        with mock.patch.object(seo,'fetch',side_effect=fake):
            urls,docs,errs=seo.sitemap_urls('https://umkmnaikkelas.id/','umkmnaikkelas.id','')
        self.assertEqual(urls,['https://umkmnaikkelas.id/buku'])
        self.assertEqual(errs,[])
        self.assertIn('https://umkmnaikkelas.id/posts.xml',[d['url'] for d in docs])

    def test_full_crawl_flags_missing_description_and_noindex(self):
        htmls={
            'https://umkmnaikkelas.id/':b'<html><title>Utama</title><h1>Beranda</h1><a href="/buku">Buku</a></html>',
            'https://umkmnaikkelas.id/buku':b'<html><title>Buku</title><meta name="robots" content="noindex"><h1>Buku</h1></html>',
        }
        def fake(u,*args,**kwargs):
            if u.endswith('robots.txt'):return {'status':404,'url':u,'body':b'','truncated':False,'type':'text/plain','error':'Not Found'}
            if u.endswith('sitemap.xml') or u.endswith('sitemap_index.xml'):return {'status':404,'url':u,'body':b'','truncated':False,'type':'','error':'Not Found'}
            if u in htmls:return {'status':200,'url':u,'body':htmls[u],'truncated':False,'type':'text/html','error':''}
            return {'status':404,'url':u,'body':b'','truncated':False,'type':'text/html','error':'Not Found'}
        with mock.patch.object(seo,'fetch',side_effect=fake):
            a=seo.public_audit('https://umkmnaikkelas.id/',limit=3)
        self.assertEqual(a['pages_scanned'],2)
        self.assertEqual(a['sitemap_discovered_urls'],0)
        self.assertTrue(any(i['code']=='noindex' for i in a['issues']))
        self.assertTrue(any(i['code']=='missing_description' for i in a['issues']))

    def test_gsc_missing_creds_does_not_fake_metrics(self):
        with mock.patch.dict(os.environ, {'SEO_GSC_CREDENTIALS':''}):
            v=seo.gsc_audit()
        self.assertEqual(v['status'],'not_configured')
        self.assertNotIn('current',v)

    def test_report_explains_sampling(self):
        public={'website':'https://umkmnaikkelas.id/','scanned_at':'2026-10-13T07:00:00+07:00',
                'pages_scanned':1,'crawl_limit':60,'sitemap_discovered_urls':2,'robots_http_status':200,'issues':[]}
        body=seo.report_md(public,{'status':'not_configured','message':'Belum aktif'})
        self.assertIn('bukan seluruh URL tidak terindeks',body)
        self.assertIn('not_configured',body)

if __name__=='__main__':main()
