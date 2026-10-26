#!/usr/bin/env python3
"""Apply ONLY SEO build integration to a Hostinger Horizons export checkout.
No images, components, JS app, content files or deployment assets are edited.
"""
from pathlib import Path
import json, shutil, sys, datetime

root = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
web = root / 'apps' / 'web'
pkgpath = web / 'package.json'
newtool = Path(__file__).parent / 'apps' / 'web' / 'tools' / 'generate-static-seo.mjs'
target = web / 'tools' / 'generate-static-seo.mjs'
if not pkgpath.is_file() or not (web / 'src' / 'data' / 'site.js').is_file():
    sys.exit('ERROR: Jalankan untuk direktori source yang memiliki apps/web/package.json dan src/data/site.js')
pkg = json.loads(pkgpath.read_text(encoding='utf-8'))
build = pkg.get('scripts', {}).get('build', '')
cmd = 'node tools/generate-static-seo.mjs'
if 'vite build' not in build:
    sys.exit('ERROR: Script build bukan Vite; tidak mengubah project')
if cmd in build:
    print('ALREADY_PATCHED: integrasi build SEO sudah ada')
else:
    stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup=pkgpath.with_name(f'package.json.bak-seo-{stamp}')
    shutil.copy2(pkgpath, backup)
    pkg['scripts']['build'] = build + ' && ' + cmd
    pkgpath.write_text(json.dumps(pkg, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    print('BACKUP:', backup)
if not target.is_file() or target.read_bytes()!=newtool.read_bytes():
    if target.exists():
        shutil.copy2(target,target.with_name(target.name+'.bak-seo'))
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(newtool,target)
print('PATCH_OK: Build SEO saja. Semua file apps/web/src/ tidak diubah.')
print('PENTING: lakukan npm build dan uji staging sebelum publish. Jangan mengganti proyek live dengan export lama.')
