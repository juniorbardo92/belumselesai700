#!/usr/bin/env python3
"""Hermes SEO v2: differentiate raw HTML from browser-rendered DOM.
Public-site audit is read-only. Search Console API remains read-only.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timedelta
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit, urlunsplit, quote
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

USER_AGENT = 'HermesSEOAudit/1.0 (+https://umkmnaikkelas.id/; read-only; max-60-pages)'
MAX_BYTES = 350_000
DEFAULT_HOME = 'https://umkmnaikkelas.id/'


def cfg(key, default=''):
    return os.environ.get(key, default)


def norm(url: str) -> str:
    p = urlsplit(url)
    scheme = p.scheme.lower()
    hostname = (p.hostname or '').lower()
    port = f':{p.port}' if p.port and p.port != (443 if scheme == 'https' else 80) else ''
    path = p.path or '/'
    return urlunsplit((scheme, hostname + port, path, p.query, ''))


def in_scope(url: str, host: str) -> bool:
    p = urlsplit(url)
    return p.scheme in ('http', 'https') and (p.hostname or '').lower() in (host, 'www.'+host)


class ScopedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        oldhost = urlsplit(req.full_url).hostname or ''
        if not in_scope(newurl,oldhost.removeprefix('www.')):
            raise HTTPError(req.full_url, code, 'redirect menuju luar domain tidak diikuti', headers, fp)
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def fetch(url: str, timeout=12, max_bytes=MAX_BYTES):
    req = Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html, application/xml, text/xml, text/plain;q=0.8'})
    try:
        with build_opener(ScopedRedirect()).open(req, timeout=timeout) as r:
            code = r.status
            content = r.read(max_bytes + 1)
            ctype = r.headers.get('Content-Type', '')
            return {'status': code, 'url': r.url, 'body': content[:max_bytes], 'truncated': len(content)>max_bytes, 'type': ctype, 'error': ''}
    except HTTPError as e:
        return {'status': e.code, 'url': url, 'body': b'', 'truncated': False, 'type': '', 'error': str(e)}
    except (URLError, TimeoutError, OSError, ValueError) as e:
        return {'status': 0, 'url': url, 'body': b'', 'truncated': False, 'type': '', 'error': str(e)[:200]}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.in_h1 = False
        self.title = ''
        self.h1 = []
        self.meta = {}
        self.canonical = ''
        self.links = []
        self.structured = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title': self.in_title = True
        if tag == 'h1':
            self.in_h1 = True
            self.h1.append('')
        if tag == 'meta':
            key = (attrs.get('name') or attrs.get('property') or '').lower()
            if key and key not in self.meta:
                self.meta[key] = (attrs.get('content') or '').strip()
        if tag == 'link' and 'canonical' in (attrs.get('rel') or '').lower().split():
            self.canonical = (attrs.get('href') or '').strip()
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'script' and 'ld+json' in (attrs.get('type') or '').lower():
            self.structured += 1

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'h1': self.in_h1 = False

    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.in_h1 and self.h1: self.h1[-1] += data


def issue(level, code, detail, url=''):
    return {'level':level, 'code':code, 'detail':detail, 'url':url}


def discover_sitemaps(home, host, robots_text):
    found = []
    for line in robots_text.splitlines():
        if line.lower().startswith('sitemap:'):
            url = line.split(':', 1)[1].strip()
            if in_scope(url, host): found.append(norm(url))
    found += [urljoin(home, '/sitemap.xml'), urljoin(home, '/sitemap_index.xml')]
    return list(dict.fromkeys(found))


def sitemap_urls(home, host, robots_text, limit=300):
    # Paths discovered only by conventional names are OPTIONAL probes. A SPA
    # often serves index.html at unknown paths; this must not be a sitemap error
    # if a valid declared/default sitemap is present.
    declared = set()
    for line in robots_text.splitlines():
        if line.lower().startswith('sitemap:'):
            value = line.split(':', 1)[1].strip()
            if in_scope(value, host): declared.add(norm(value))
    pending = discover_sitemaps(home, host, robots_text)
    tried, docs, pages, errors = set(), [], [], []
    while pending and len(tried) < 12 and len(pages) < limit:
        url = pending.pop(0)
        if url in tried: continue
        tried.add(url)
        res = fetch(url)
        doc={'url':url, 'status':res['status'], 'declared_in_robots':url in declared}
        docs.append(doc)
        if res['status'] != 200:
            doc['validation']='not_found_or_http_error'
            if url in declared:
                errors.append(f'Sitemap dinyatakan di robots.txt tetapi HTTP {res["status"]}: {url}')
            continue
        try:
            root = ET.fromstring(res['body'])
        except ET.ParseError:
            doc['validation']='not_xml'
            if url in declared:
                errors.append(f'Sitemap dinyatakan di robots.txt tetapi XML tidak valid: {url}')
            continue
        kind = root.tag.rsplit('}', 1)[-1]
        locs = [(e.text or '').strip() for e in root.iter() if e.tag.rsplit('}', 1)[-1]=='loc']
        doc['validation'] = kind
        if kind == 'sitemapindex':
            pending += [norm(x) for x in locs if in_scope(x,host) and norm(x) not in tried]
        elif kind == 'urlset':
            pages += [norm(x) for x in locs if in_scope(x,host) and x.startswith('https://')]
        else:
            if url in declared:
                errors.append(f'Akar XML sitemap dinyatakan di robots.txt bukan urlset/sitemapindex: {url}')
    return list(dict.fromkeys(pages))[:limit], docs, errors


def public_audit(home=DEFAULT_HOME, limit=60):
    host = urlsplit(home).hostname or 'umkmnaikkelas.id'
    if not home.startswith('https://') or not host: raise ValueError('Homepage harus https:// dan host valid')
    robots_url = urljoin(home, '/robots.txt')
    robots_res = fetch(robots_url, max_bytes=80_000)
    robots_text = robots_res['body'].decode('utf-8','replace') if robots_res['status']==200 else ''
    rp = RobotFileParser()
    rp.parse(robots_text.splitlines() if robots_text else [])
    def allowed(url): return rp.can_fetch(USER_AGENT, url) if robots_text else True
    pages, sitemap_docs, sitemap_errors = sitemap_urls(home, host, robots_text)
    seed = pages[:] if pages else [norm(home)]
    if norm(home) not in seed: seed.insert(0,norm(home))
    queue = seed[:]
    visited, result, issues = set(), [], []
    while queue and len(result)<limit:
        url = queue.pop(0)
        if url in visited or not in_scope(url, host) or not url.startswith('https://'): continue
        visited.add(url)
        if not allowed(url):
            result.append({'url':url, 'status':None, 'robots_blocked':True})
            continue
        time.sleep(0.15)  # Good-citizen pacing for the public site.
        res = fetch(url)
        p = {'url':url,'status':res['status'],'final_url':res['url'],'truncated':res['truncated']}
        if res['status'] != 200:
            issues.append(issue('high' if res['status']>=400 else 'medium', 'http_error', f'HTTP {res["status"]}: {res["error"]}', url))
            result.append(p)
            continue
        if 'html' not in res['type'].lower():
            result.append({**p,'non_html':True})
            continue
        parser = PageParser()
        parser.feed(res['body'].decode('utf-8','replace'))
        internal = []
        for raw in parser.links:
            dest = norm(urljoin(res['url'],raw.strip()))
            if in_scope(dest,host) and dest.startswith('https://') and not re.search(r'\.(png|jpg|jpeg|webp|gif|pdf|zip|svg|mp4|css|js)(\?|$)',dest,re.I):
                internal.append(dest)
                if dest not in visited and dest not in queue and len(queue)<400: queue.append(dest)
        canon = norm(urljoin(res['url'],parser.canonical)) if parser.canonical else ''
        p.update({'title':parser.title.strip(),'description':parser.meta.get('description',''),
                  'h1':[x.strip() for x in parser.h1 if x.strip()],
                  'robots':parser.meta.get('robots',''), 'canonical':canon,
                  'structured_data_blocks':parser.structured,'internal_link_count':len(internal)})
        if not p['title']: issues.append(issue('medium','missing_title','Judul halaman kosong',url))
        if not p['description']: issues.append(issue('medium','missing_description','Meta description kosong',url))
        if not p['h1']: issues.append(issue('medium','missing_h1','H1 tidak ditemukan',url))
        if len(p['h1'])>1: issues.append(issue('low','multiple_h1',f'{len(p["h1"])} H1',url))
        if not canon: issues.append(issue('low','missing_canonical','Rel canonical tidak ditemukan',url))
        if 'noindex' in p['robots'].lower(): issues.append(issue('high','noindex','Meta robots memuat noindex',url))
        if canon and not in_scope(canon,host): issues.append(issue('medium','offsite_canonical','Canonical menunjuk luar domain',url))
        result.append(p)
    duplicates = Counter(p.get('title','').lower() for p in result if p.get('title'))
    for p in result:
        if p.get('title') and duplicates[p['title'].lower()]>1:
            issues.append(issue('medium','duplicate_title','Judul duplikat di halaman yang diaudit',p['url']))
    if robots_res['status'] not in (200,404):
        issues.append(issue('medium','robots_fetch',f'robots.txt HTTP {robots_res["status"]}',robots_url))
    if not pages:
        issues.append(issue('medium','sitemap_missing','Sitemap tidak ditemukan/terbaca pada kandidat yang diperiksa',home))
    for er in sitemap_errors: issues.append(issue('medium','sitemap_xml',er))
    counts = Counter(x['code'] for x in issues)
    return {'website':home,'scanned_at':datetime.now(ZoneInfo('Asia/Jakarta')).isoformat(),
            'crawl_limit':limit,'pages_scanned':len(result),'sitemap_discovered_urls':len(pages),
            'robots_http_status':robots_res['status'],'sitemaps':sitemap_docs,'issue_counts':dict(counts),
            'issues':issues,'pages':result,'note':'Sampling; bukan hasil crawling Google atau inventaris indeks menyeluruh.'}



RAW_META_CODES = frozenset({
    'missing_title', 'missing_description', 'missing_h1', 'multiple_h1',
    'missing_canonical', 'offsite_canonical', 'duplicate_title'
})


def render_metadata(urls, host, timeout_ms=13000):
    """Render a bounded same-site sample with one Playwright Chromium process.

    All image/media/font/third-party and all non-GET/HEAD requests are aborted.
    This performs no screenshots, does not touch source/site files, and blocks
    outbound analytics (Meta/GA). Any browser dependency failure is UNVERIFIED,
    not a clean bill of health.
    """
    if not urls:
        return {'status':'no_candidates', 'pages':[], 'message':'Tidak ada URL untuk dirender.'}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {'status':'unavailable', 'pages':[], 'message':
                'Playwright belum tersedia di Python/venv auditor. Raw HTML saja; jangan klaim hasil render.'}
    pages=[]
    try:
        with sync_playwright() as pw:
            try:
                browser=pw.chromium.launch(headless=True)
            except Exception as e:
                # An already-installed system Chromium can be reused without
                # downloading another browser onto the 4 GB VPS.
                system_browser=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
                if not system_browser or 'Executable doesn\'t exist' not in str(e):
                    raise
                browser=pw.chromium.launch(headless=True,executable_path=system_browser)
            context=browser.new_context(service_workers='block', ignore_https_errors=False,
                                        user_agent='HermesSEOAudit/2.0 (read-only rendered DOM audit)')
            def allow_route(route):
                req=route.request
                if (req.method not in ('GET','HEAD') or
                    not in_scope(req.url,host) or
                    req.resource_type in ('image','media','font','websocket')):
                    return route.abort()
                return route.continue_()
            context.route('**/*',allow_route)
            tab=context.new_page()
            tab.set_default_timeout(timeout_ms)
            for url in urls:
                x={'url':url, 'status':'render_error'}
                try:
                    response=tab.goto(url, wait_until='domcontentloaded', timeout=timeout_ms)
                    if not response or response.status >= 400 or not in_scope(tab.url,host):
                        x['error']='Navigasi gagal atau HTTP >=400 / luar domain'
                    else:
                        # Observe a mounted React root. If it is not ready, do
                        # not treat missing metadata as an actual rendered error.
                        try:
                            tab.wait_for_function('''document.querySelector('#root') && document.querySelector('#root').childElementCount > 0''',timeout=min(timeout_ms,8000))
                        except Exception:
                            pass
                        tab.wait_for_timeout(500)
                        x.update(tab.evaluate('''() => ({
                          title: document.title.trim(),
                          description: document.querySelector('meta[name="description"]')?.content?.trim() || '',
                          h1: Array.from(document.querySelectorAll('h1')).map(e => e.textContent.trim()).filter(Boolean),
                          canonical: document.querySelector('link[rel="canonical"]')?.href || '',
                          robots: document.querySelector('meta[name="robots"]')?.content || '',
                          root_children: document.querySelector('#root')?.childElementCount || 0
                        })'''))
                        x['final_url']=tab.url
                        if x['root_children'] == 0:
                            x['error']='React root tidak selesai di-render, hasil tidak valid'
                        else:
                            x['status']='ok'
                except Exception as e:
                    x['error']=f'{type(e).__name__}: {str(e).splitlines()[0][:180]}'
                pages.append(x)
            context.close()
            browser.close()
    except Exception as e:
        return {'status':'unavailable', 'pages':pages, 'message':
                f'Chromium tidak dapat dijalankan: {type(e).__name__}: {str(e).splitlines()[0][:220]}'}
    good=sum(x['status']=='ok' for x in pages)
    return {'status': 'ok' if good==len(pages) else 'partial' if good else 'failed',
            'pages':pages,'message':f'{good}/{len(pages)} DOM berhasil diperiksa'}


def validate_rendered(page, host):
    """Return confirmed issues for a browser-rendered page only."""
    if page.get('status')!='ok':return []
    url=page['url']
    found=[]
    if not page.get('title'):found.append(issue('medium','render_missing_title','Title tidak ada setelah JavaScript',url))
    if not page.get('description'):found.append(issue('medium','render_missing_description','Description tidak ada setelah JavaScript',url))
    if not page.get('h1'):found.append(issue('medium','render_missing_h1','H1 tidak ada setelah JavaScript',url))
    if len(page.get('h1',[]))>1:found.append(issue('low','render_multiple_h1','Lebih dari satu H1 setelah JavaScript',url))
    canonical=page.get('canonical','')
    if not canonical:found.append(issue('low','render_missing_canonical','Canonical tidak ada setelah JavaScript',url))
    elif not in_scope(canonical,host):found.append(issue('medium','render_offsite_canonical','Canonical di luar domain',url))
    if 'noindex' in page.get('robots','').lower():found.append(issue('high','render_noindex','Robots noindex setelah JavaScript',url))
    for item in found: item['classification']='RENDERED_HTML_ERROR'
    return found


def reclassify_audit(technical, render_limit=10, render_mode='auto', renderer=render_metadata):
    """Keep raw warnings as evidence but not as confirmed DOM failures."""
    raw=[{**x,'classification':'RAW_HTML_WARNING'} for x in technical['issues'] if x['code'] in RAW_META_CODES]
    confirmed=[x for x in technical['issues'] if x['code'] not in RAW_META_CODES]
    candidate=[p['url'] for p in technical['pages'] if p.get('status')==200 and p.get('title') is not None]
    chosen=candidate[:max(0,render_limit)]
    if render_mode=='off':
        rendered={'status':'disabled','pages':[],'message':'Render browser dinonaktifkan.'}
    elif not chosen:
        rendered={'status':'no_candidates','pages':[],'message':'Tidak ada halaman HTML untuk dirender.'}
    else:
        rendered=renderer(chosen, urlsplit(technical['website']).hostname or 'umkmnaikkelas.id')
    for p in rendered['pages']:
        confirmed.extend(validate_rendered(p,urlsplit(technical['website']).hostname or 'umkmnaikkelas.id'))
    good=[p for p in rendered['pages'] if p.get('status')=='ok']
    # Duplicate titles are only assessable amongst the pages actually rendered.
    dup=Counter(p.get('title','').strip().casefold() for p in good if p.get('title'))
    for p in good:
        if p.get('title') and dup[p['title'].strip().casefold()]>1:
            confirmed.append({**issue('medium','render_duplicate_title',
                         'Title sama pada sampel halaman yang telah dirender',p['url']),
                         'classification':'RENDERED_HTML_ERROR'})
    technical['raw_html_warnings']=raw
    technical['raw_html_warning_counts']=dict(Counter(x['code'] for x in raw))
    technical['issues']=confirmed
    technical['issue_counts']=dict(Counter(x['code'] for x in confirmed))
    technical['rendered_html']={
        **rendered,'requested_count':len(chosen),'eligible_count':len(candidate),
        'verified_count':len(good),'confirmed_issues':sum(x['code'].startswith('render_') for x in confirmed),
        'coverage':'complete' if len(good)==len(candidate) else 'partial_or_unavailable',
        'note':'0 confirmed issues tidak berarti semua halaman aman bila coverage bukan complete.'
    }
    return technical

def gsc_audit(home=DEFAULT_HOME, limit_inspect=8):
    keyfile = cfg('SEO_GSC_CREDENTIALS')
    oauthfile = cfg('SEO_GSC_OAUTH_FILE')
    site = cfg('SEO_GSC_PROPERTY','sc-domain:umkmnaikkelas.id')
    if not keyfile and not oauthfile:
        return {'status':'not_configured','message':'SEO_GSC_CREDENTIALS atau SEO_GSC_OAUTH_FILE belum tersedia; data GSC tidak ditarik.'}
    if not Path(keyfile or oauthfile).is_file():
        return {'status':'error','message':'File kredensial GSC tidak ditemukan.'}
    try:
        from google.oauth2 import service_account
        from google.oauth2.credentials import Credentials as UserCredentials
        from google.auth.transport.requests import Request as GoogleRequest
    except ImportError:
        return {'status':'missing_dependency','message':'Install: python3 -m pip install google-auth requests (di venv terpisah).'}
    try:
        scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
        creds = (service_account.Credentials.from_service_account_file(keyfile, scopes=scopes)
                 if keyfile else UserCredentials.from_authorized_user_file(oauthfile, scopes=scopes))
        if not creds.valid and not creds.refresh_token and not keyfile:
            return {'status':'error','message':'OAuth token tidak memiliki refresh_token; ulangi otorisasi dengan akses offline.'}
        creds.refresh(GoogleRequest())
        bearer = creds.token
        def api(url, payload=None):
            headers={'Authorization':'Bearer '+bearer,'Accept':'application/json'}
            if payload is not None: headers['Content-Type']='application/json'
            req=Request(url, data=json.dumps(payload).encode('utf-8') if payload is not None else None, headers=headers,
                        method='POST' if payload is not None else 'GET')
            try:
                with urlopen(req,timeout=30) as r: return json.load(r)
            except HTTPError as e:
                raise RuntimeError(f'Google API HTTP {e.code} untuk {url.split("?")[0]}') from None
        sites=api('https://www.googleapis.com/webmasters/v3/sites').get('siteEntry',[])
        authorized=[s.get('siteUrl') for s in sites]
        if site not in authorized:
            return {'status':'error','message':'Properti GSC tidak ada dalam daftar akses service account; cek SEO_GSC_PROPERTY dan izin user di GSC.', 'accessible_properties':authorized}
        end=datetime.now(ZoneInfo('America/Los_Angeles')).date()-timedelta(days=3)
        start=end-timedelta(days=27)
        prev_end=start-timedelta(days=1)
        prev_start=prev_end-timedelta(days=27)
        endpoint=f'https://www.googleapis.com/webmasters/v3/sites/{quote(site,safe="")}/searchAnalytics/query'
        def query(st, en, dimensions, n):
            body={'startDate':st.isoformat(),'endDate':en.isoformat(),'dimensions':dimensions,
                  'rowLimit':n,'type':'web','dataState':'final'}
            return api(endpoint,body).get('rows',[])
        def total(st,en):
            r=query(st,en,[],1)
            if not r:return {'clicks':0,'impressions':0,'ctr':0.0,'position':None}
            x=r[0]
            return {k:x.get(k) for k in ('clicks','impressions','ctr','position')}
        curr=total(start,end)
        prev=total(prev_start,prev_end)
        qrows=query(start,end,['query'],100)
        prows=query(start,end,['page'],100)
        rows=lambda rr:[{'key':x.get('keys',[''])[0],**{k:x.get(k) for k in ('clicks','impressions','ctr','position')}} for x in rr]
        inspected=[]
        if limit_inspect>0:
            candidates=[r.get('keys',[''])[0] for r in prows]
            for url in candidates[:min(limit_inspect,15)]:
                if not in_scope(url,urlsplit(home).hostname or ''):continue
                try:
                    data=api('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
                             {'inspectionUrl':url,'siteUrl':site,'languageCode':'id-ID'})
                    idx=data.get('inspectionResult',{}).get('indexStatusResult',{})
                    inspected.append({'url':url,'coverageState':idx.get('coverageState'),
                                      'indexingState':idx.get('indexingState'),
                                      'verdict':idx.get('verdict'),
                                      'lastCrawlTime':idx.get('lastCrawlTime')})
                except RuntimeError as ex:
                    inspected.append({'url':url,'error':str(ex)})
        return {'status':'ok','site_property':site,'period':{'start':start.isoformat(),'end':end.isoformat()},
                'previous_period':{'start':prev_start.isoformat(),'end':prev_end.isoformat()},
                'current':curr,'previous':prev,'queries':rows(qrows),'pages':rows(prows),'index_inspection':inspected,
                'note':'Data GSC final dapat terlambat. Inspection ini sampel, tidak menyediakan seluruh daftar URL excluded.'}
    except Exception as e:
        return {'status':'error','message':f'Gagal mengambil data GSC: {type(e).__name__}: {str(e)[:250]}'}


def fmt(n, digs=0):
    return f'{n:,.{digs}f}' if isinstance(n,(int,float)) else 'n/a'


def report_md(public, gsc):
    a=[]; add=a.append
    add('# Hermes SEO — Laporan Harian')
    add(f'**Website:** {public["website"]}  ')
    add(f'**Audit:** {public["scanned_at"]}  ')
    add('**Mode:** BACA SAJA (tidak mengubah situs atau Search Console)')
    add('\n## Audit Teknis')
    add(f'- Halaman diuji: **{public["pages_scanned"]}** (batas {public["crawl_limit"]})')
    add(f'- URL ditemukan di sitemap: **{public["sitemap_discovered_urls"]}**')
    add(f'- robots.txt HTTP: {public["robots_http_status"]}')
    raw=public.get('raw_html_warnings')
    if raw is None:
        add(f'- Temuan HTML awal (legacy): **{len(public["issues"])}**')
    else:
        add(f'- **RAW_HTML_WARNING: {len(raw)}** (belum tentu error DOM setelah JavaScript)')
        add(f'- **Masalah terkonfirmasi / teknis lain: {len(public["issues"])}**')
        for code,n in sorted(public.get('raw_html_warning_counts',{}).items()):
            add(f'  - `{code}` (raw): {n}')
        r=public.get('rendered_html',{})
        add('\n### Pemeriksaan setelah JavaScript')
        add(f'- Renderer: **{r.get("status","unavailable")}**; halaman terverifikasi: '
            f'**{r.get("verified_count",0)}/{r.get("eligible_count",0)}**; '
            f'cakupan **{r.get("coverage","unknown")}**')
        add(f'- RENDERED_HTML_ERROR (DOM terverifikasi): **{r.get("confirmed_issues",0)}** '
            '(hanya dari halaman yang berhasil dirender)')
        add(f'- Keterangan: {r.get("message", "n/a")}')
        if r.get('coverage')!='complete':
            add('- **PERINGATAN: hasil render belum mencakup seluruh halaman; '
                'jangan menyimpulkan metadata semua URL bebas masalah.**')
        for p in r.get('pages',[]):
            if p.get('status')!='ok':add(f'- RENDER ERROR {p.get("url")}: {p.get("error", "unknown")}')
        add('\n### Masalah yang terkonfirmasi / perlu ditindaklanjuti')
    for i in sorted(public['issues'],key=lambda x: {'high':0,'medium':1,'low':2}.get(x['level'],9))[:35]:
        add(f'- **{i["level"].upper()} / {i["code"]}:** {i["detail"]} — {i["url"]}')
    add('\n## Google Search Console')
    if gsc['status']=='ok':
        add(f'- Properti: `{gsc["site_property"]}`')
        add(f'- Periode: **{gsc["period"]["start"]} – {gsc["period"]["end"]}**, dibanding {gsc["previous_period"]["start"]} – {gsc["previous_period"]["end"]}')
        for lab,obj in [('Sekarang',gsc['current']),('Sebelumnya',gsc['previous'])]:
            add(f'- {lab}: **{fmt(obj["clicks"])} klik**, **{fmt(obj["impressions"])} impresi**, **{fmt((obj["ctr"] or 0)*100,2)}% CTR**, posisi rata-rata **{fmt(obj["position"],1)}**')
        add('\n### Peluang halaman (impresi tinggi; CTR rendah)')
        opp=[x for x in gsc['pages'] if (x['impressions'] or 0)>=20 and (x['ctr'] or 0)<0.03]
        for x in sorted(opp,key=lambda x:x['impressions'],reverse=True)[:10]:
            add(f'- {x["key"]}: {fmt(x["impressions"])} impresi; CTR {fmt((x["ctr"] or 0)*100,2)}%; posisi {fmt(x["position"],1)}')
        if not opp:add('- Tidak ada kandidat memenuhi ambang minimum pada sampel yang diterima.')
        add('\n### URL Inspection (sampel, bukan seluruh URL tidak terindeks)')
        for x in gsc['index_inspection']:
            add(f'- {x["url"]}: {x.get("verdict",x.get("error","n/a"))}; {x.get("coverageState", "")}')
    else:
        add(f'- **{gsc["status"]}:** {gsc.get("message", "")}')
    add('\n## Tindak Lanjut')
    add('1. Prioritaskan error HTTP, noindex yang tidak disengaja, dan sitemap rusak.')
    add('2. Periksa status URL Not Indexed dari daftar terbaru Search Console; jangan mengasumsikan jumlah lama masih berlaku.')
    add('3. Lakukan perubahan kode/metadata hanya setelah review, backup, dan izin eksplisit.')
    add('\n_Catatan: Ini audit otomatis berbasis sampel, bukan seluruh URL tidak terindeks. Tidak boleh menyimpulkan posisi ranking, kondisi indeks lengkap, atau penyebab pasti hanya dari hasil ini._')
    return '\n'.join(a)+'\n'


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--out',default=str(Path.home()/'.openclaw/workspace-hermes-seo/reports'))
    ap.add_argument('--site',default=cfg('SEO_SITE_URL',DEFAULT_HOME))
    ap.add_argument('--max-pages',type=int,default=int(cfg('SEO_MAX_PAGES','60')))
    ap.add_argument('--inspect-limit',type=int,default=int(cfg('SEO_INSPECTION_LIMIT','8')))
    ap.add_argument('--render-mode',choices=('off','auto','on'),default=cfg('SEO_RENDER_MODE','auto'))
    ap.add_argument('--render-limit',type=int,default=int(cfg('SEO_RENDER_LIMIT','10')))
    args=ap.parse_args()
    if urlsplit(args.site).hostname not in ('umkmnaikkelas.id','www.umkmnaikkelas.id') or not args.site.startswith('https://'):
        ap.error('Hermes SEO hanya boleh audit https://umkmnaikkelas.id/')
    if not 1<=args.max_pages<=80: ap.error('max-pages harus 1-80')
    if not 0<=args.inspect_limit<=15: ap.error('inspect-limit harus 0-15')
    if not 0<=args.render_limit<=80: ap.error('render-limit harus 0-80')
    path=Path(args.out);path.mkdir(parents=True,exist_ok=True)
    public=public_audit(args.site,args.max_pages)
    public=reclassify_audit(public,args.render_limit,args.render_mode)
    gsc=gsc_audit(args.site,args.inspect_limit)
    data={'schema':'hermes-seo-v2','technical':public,'search_console':gsc}
    stamp=datetime.now(ZoneInfo('Asia/Jakarta')).strftime('%Y-%m-%d_%H%M%S')
    (path/f'{stamp}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (path/f'{stamp}.md').write_text(report_md(public,gsc),encoding='utf-8')
    (path/'LATEST.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (path/'LATEST.md').write_text(report_md(public,gsc),encoding='utf-8')
    print(f'AUDIT_OK report={path}/LATEST.md pages={public["pages_scanned"]} gsc={gsc["status"]}')

if __name__=='__main__': main()
