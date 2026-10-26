#!/usr/bin/env python3
"""Hermes SEO phase 3: page-query opportunities, READ ONLY.

Reads the existing Hermes SEO v2 report, optionally asks the Google Search
Analytics API for queries filtered to each prioritized page, and writes only
an opportunity report in the agent's own reports directory.
Never writes to the site, GSC, configuration, jobs, or OpenClaw settings.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

BASE = 'https://umkmnaikkelas.id'
HOME = Path.home()
DEFAULT_REPORTS = HOME / '.openclaw/workspace-hermes-seo/reports'
DEFAULT_CONFIG = HOME / '.config/hermes-seo/seo.env'
FOCUS_SLUGS = (
    'negosiasi-diskon-klien-umkm',
    'stok-tidak-merata-umkm',
    'leadership-leader-mlm-direct-selling',
    'mengatasi-perang-harga-ecommerce-umkm',
)
SUGGESTIONS = {
    FOCUS_SLUGS[0]: {
        'candidate_title': 'Klien Minta Diskon? Negosiasi Tanpa Merusak Margin',
        'rationale': 'Tekankan masalah permintaan diskon dan tujuan menjaga margin; cocokkan dulu dengan query yang muncul.',
    },
    FOCUS_SLUGS[1]: {
        'candidate_title': 'Stok Tidak Merata? Cara Atur Stok dan Transfer Antarlokasi',
        'rationale': 'Tekankan solusi pengaturan stok per lokasi, transfer, dan replenishment sesuai isi artikel.',
    },
    FOCUS_SLUGS[2]: {
        'candidate_title': 'Leadership MLM: Cara Bangun Tim Mandiri lewat Coaching',
        'rationale': 'Fokus pada manfaat coaching dan membentuk anggota mandiri yang dibahas artikel.',
    },
    FOCUS_SLUGS[3]: {
        'candidate_title': 'Perang Harga Marketplace? Cara Menjaga Margin UMKM',
        'rationale': 'Fokus pada masalah perang harga dan margin; pastikan query memang terkait marketplace.',
    },
}


def same_site(url):
    try:
        p = urlsplit(url)
        return p.scheme == 'https' and p.hostname == 'umkmnaikkelas.id' and not (p.username or p.password)
    except (ValueError, TypeError):
        return False


def safe_md(v):
    # Search queries are untrusted data, never instructions.
    return str(v if v is not None else '').replace('|', '\\|').replace('`', "'").replace('\r', ' ').replace('\n', ' ').replace('<', '&lt;').replace('>', '&gt;')[:300]


def read_cfg(path):
    result = {}
    allow = {'SEO_GSC_OAUTH_FILE', 'SEO_GSC_CREDENTIALS', 'SEO_GSC_PROPERTY'}
    if not path.is_file():
        return result
    for line in path.read_text(encoding='utf-8').splitlines():
        match = re.match(r'^\s*(SEO_[A-Z_]+)=(.*)$', line)
        if match and match.group(1) in allow:
            result[match.group(1)] = match.group(2).strip().strip('"\'')
    return result


def primary_slug(url):
    p = urlsplit(url)
    return p.path.rstrip('/').rsplit('/', 1)[-1]


def choose_pages(gsc, limit=4):
    page_rows = []
    for row in gsc.get('pages', []):
        url = row.get('key', '')
        try:
            impr, ctr = float(row.get('impressions') or 0), float(row.get('ctr') or 0)
            pos = float(row.get('position') or 99)
        except (ValueError, TypeError):
            continue
        if not same_site(url) or impr < 15 or ctr >= .04 or pos > 20:
            continue
        page_rows.append({
            'url': url,
            'slug': primary_slug(url),
            'clicks': int(row.get('clicks') or 0),
            'impressions': int(impr),
            'ctr': ctr,
            'position': pos,
        })
    favored = sorted((r for r in page_rows if r['slug'] in FOCUS_SLUGS),
                     key=lambda r: FOCUS_SLUGS.index(r['slug']))
    others = sorted((r for r in page_rows if r['slug'] not in FOCUS_SLUGS),
                    key=lambda r: (-r['impressions'], r['position']))
    return (favored + others)[:limit]


def authorize(cfg):
    file = cfg.get('SEO_GSC_OAUTH_FILE') or cfg.get('SEO_GSC_CREDENTIALS')
    if not file:
        raise RuntimeError('Kredensial GSC belum disetel di seo.env')
    if not Path(file).is_file():
        raise RuntimeError('File kredensial GSC tidak ditemukan di path yang dikonfigurasi')
    try:
        from google.oauth2.credentials import Credentials as OAuthCredentials
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleRequest
    except ImportError:
        raise RuntimeError('Dependensi google-auth tidak ditemukan pada interpreter ini') from None
    scope = ['https://www.googleapis.com/auth/webmasters.readonly']
    if cfg.get('SEO_GSC_OAUTH_FILE'):
        creds = OAuthCredentials.from_authorized_user_file(file, scopes=scope)
    else:
        creds = service_account.Credentials.from_service_account_file(file, scopes=scope)
    if not creds.valid:
        creds.refresh(GoogleRequest())
    if not creds.token:
        raise RuntimeError('Gagal memperoleh access token baca-saja')
    return creds.token


def build_query_request(site, start, end, url):
    if not same_site(url) or site != 'sc-domain:umkmnaikkelas.id':
        raise ValueError('Properti atau URL di luar izin')
    return {
        'startDate': start, 'endDate': end,
        'dimensions': ['query'], 'type': 'web', 'dataState': 'final',
        'aggregationType': 'auto', 'rowLimit': 250,
        'dimensionFilterGroups': [{'groupType': 'and', 'filters': [
            {'dimension': 'page', 'operator': 'equals', 'expression': url}
        ]}],
    }


def fetch_queries(token, site, start, end, page, timeout=35):
    body = build_query_request(site, start, end, page)
    endpoint = f'https://www.googleapis.com/webmasters/v3/sites/{quote(site, safe="")}/searchAnalytics/query'
    req = Request(endpoint, method='POST',
                  data=json.dumps(body).encode('utf-8'),
                  headers={'Authorization': 'Bearer ' + token,
                           'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urlopen(req, timeout=timeout) as resp:
            result = json.load(resp)
    except HTTPError as exc:
        # Intentionally do not log headers, body, credentials or token.
        raise RuntimeError(f'Google Search Analytics HTTP {exc.code}') from None
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f'Jaringan Google API gagal ({type(exc).__name__})') from None
    if not isinstance(result, dict):
        raise RuntimeError('Respons API GSC bukan objek JSON')
    vals = []
    for r in result.get('rows', []):
        if not isinstance(r, dict): continue
        query = (r.get('keys') or [''])[0]
        if not isinstance(query, str) or not query.strip(): continue
        vals.append({
            'query': query[:300],
            'impressions': int(r.get('impressions') or 0),
            'clicks': int(r.get('clicks') or 0),
            'ctr': float(r.get('ctr') or 0),
            'position': round(float(r.get('position') or 0), 1),
        })
    return sorted(vals, key=lambda x:(-x['impressions'], -x['clicks']))


def prepare(source, cfg, max_pages, get_queries=None, offline=False):
    if source.get('search_console', {}).get('status') != 'ok':
        raise ValueError('LATEST.json belum berisi data GSC yang valid')
    gsc = source['search_console']
    site = gsc.get('site_property', '')
    if site != 'sc-domain:umkmnaikkelas.id':
        raise ValueError('Properti GSC tidak cocok dengan scope Hermes SEO')
    period = gsc.get('period') or {}
    start, end = period.get('start'), period.get('end')
    if not all(isinstance(x,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',x) for x in (start, end)):
        raise ValueError('Periode GSC tidak lengkap')
    chosen = choose_pages(gsc, max_pages)
    rendered = {p.get('url'):p for p in source.get('technical',{}).get('rendered_html',{}).get('pages',[])
                if isinstance(p,dict) and p.get('status')=='ok'}
    token = None
    credential_note = None
    if not offline:
        try:
            token = authorize(cfg)
        except Exception as exc:
            credential_note = f'{type(exc).__name__}: {str(exc)[:180]}'
    pages = []
    for item in chosen:
        r = rendered.get(item['url'], {})
        entry = {**item, 'current_title': r.get('title'),
                 'current_description': r.get('description'), 'current_h1': r.get('h1'),
                 'hypothesis': SUGGESTIONS.get(item['slug']),
                 'queries': [], 'query_status': 'not_fetched'}
        if token:
            try:
                entry['queries'] = (get_queries or fetch_queries)(token, site, start, end, item['url'])
                entry['query_status'] = 'ok' if entry['queries'] else 'no_rows_disclosed'
            except Exception as exc:
                entry['query_status'] = 'error'
                entry['query_error'] = f'{type(exc).__name__}: {str(exc)[:140]}'
        pages.append(entry)
    return {
        'schema':'hermes-seo-opportunities-v1',
        'generated_at':datetime.now(ZoneInfo('Asia/Jakarta')).isoformat(),
        'mode':'READ_ONLY_RECOMMENDATIONS', 'website':BASE,
        'site_property':site, 'period':period,
        'current':gsc.get('current',{}),
        'credentials_status':'offline' if offline else ('ok' if token else 'error'),
        'credentials_note':credential_note,
        'pages':pages,
        'limitations':'Row query dapat tidak lengkap karena anonimisasi/penyaringan oleh GSC. Rekomendasi draft tidak pernah diterapkan otomatis.',
    }


def to_markdown(data):
    out = ['# Hermes SEO — Peluang CTR (baca saja)', '',
           f'**Website:** {BASE}  ',
           f'**Periode GSC:** {data["period"]["start"]} – {data["period"]["end"]}  ',
           '**Status:** usulan/editorial, belum mengubah situs atau gambar.', '',
           f'**Akses query per halaman:** {data["credentials_status"]}', '']
    if data.get('credentials_note'):
        out.append('Catatan akses: ' + safe_md(data['credentials_note']))
        out.append('')
    out += ['## Prioritas halaman', '',
            '| URL | Klik | Impresi | CTR | Posisi | Query |',
            '|---|---:|---:|---:|---:|---|']
    for x in data['pages']:
        out.append(f'| {safe_md(x["url"])} | {x["clicks"]} | {x["impressions"]} | {x["ctr"]*100:.2f}% | {x["position"]:.1f} | {x["query_status"]} |')
    if not data['pages']:
        out.append('\nTidak ditemukan kandidat yang memenuhi ambang impresi >=15, CTR <4%, posisi <=20.')
    for item in data['pages']:
        out += ['',f'## {safe_md(item["slug"])}', '',
                f'- Halaman: {safe_md(item["url"])}',
                f'- Judul setelah render: **{safe_md(item.get("current_title") or "belum tersedia")}**',
                f'- H1 setelah render: {safe_md("; ".join(item.get("current_h1") or []) or "belum tersedia")}',
                f'- Kualitas data query: **{item["query_status"]}**']
        if item.get('query_error'):
            out.append('- Error query: '+safe_md(item['query_error']))
        out += ['', '| Query pencarian | Impresi | Klik | CTR | Posisi |',
                '|---|---:|---:|---:|---:|']
        if item['queries']:
            for q in item['queries'][:15]:
                out.append(f'| {safe_md(q["query"])} | {q["impressions"]} | {q["clicks"]} | {q["ctr"]*100:.2f}% | {q["position"]:.1f} |')
        else:
            out.append('| Belum ada query tersedia (bukan berarti 0 pencarian) | — | — | — | — |')
        note = item.get('hypothesis')
        if note:
            out += ['', '**Hipotesis perbaikan — BELUM DITERAPKAN**', '',
                    f'- Kandidat judul untuk evaluasi: {safe_md(note["candidate_title"])}',
                    f'- Alasan: {safe_md(note["rationale"])}',
                    '- Verifikasi dulu kecocokan dengan query berimpresi tertinggi dan isi artikel.']
        out += ['', '- Periksa judul/snippet yang tampil di Google; hasil Google dapat berbeda dari tag `<title>`.',
                '- Jangan mengubah featured image, URL, slug, canonical atau CTA tanpa audit terpisah.']
    out += ['', '## Aturan keputusan', '',
            '1. Prioritaskan relevansi query dan intent pencari, bukan CTR agregat semata.',
            '2. Hindari keputusan berdasarkan 0 klik pada sampel kecil atau query yang disembunyikan GSC.',
            '3. Setelah perubahan editorial disetujui, ukur 28 hari berikutnya dan bandingkan dengan baseline.',
            '4. Sistem ini tidak menerbitkan, tidak mengubah file Hostinger, dan tidak mengirim permintaan indexing.',
            '', '_Google dapat membentuk title/snippet sendiri. Peningkatan CTR tidak dijamin._', '']
    return '\n'.join(out)


def main():
    p=argparse.ArgumentParser(description='Read-only GSC page-query opportunity analysis')
    p.add_argument('--latest',type=Path,default=DEFAULT_REPORTS/'LATEST.json')
    p.add_argument('--output',type=Path,default=DEFAULT_REPORTS)
    p.add_argument('--config',type=Path,default=DEFAULT_CONFIG)
    p.add_argument('--max-pages',type=int,default=4)
    p.add_argument('--offline',action='store_true',help='Generate from LATEST.json without GSC API calls')
    args=p.parse_args()
    if not 1<=args.max_pages<=8:
        p.error('--max-pages harus 1–8')
    if not args.latest.is_file():
        p.error('LATEST.json tidak tersedia; jalankan Hermes SEO audit v2 dahulu')
    source=json.loads(args.latest.read_text(encoding='utf-8'))
    data=prepare(source,read_cfg(args.config),args.max_pages,offline=args.offline)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'OPPORTUNITIES-LATEST.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (args.output/'OPPORTUNITIES-LATEST.md').write_text(to_markdown(data),encoding='utf-8')
    counts=sum(p['query_status']=='ok' for p in data['pages'])
    print(f'OPPORTUNITIES_OK pages={len(data["pages"])} query_pages={counts} credentials={data["credentials_status"]} report={args.output}/OPPORTUNITIES-LATEST.md')

if __name__=='__main__':
    main()
