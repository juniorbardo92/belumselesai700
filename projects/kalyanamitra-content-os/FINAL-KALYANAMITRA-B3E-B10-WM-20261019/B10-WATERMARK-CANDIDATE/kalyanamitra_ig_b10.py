#!/usr/bin/env python3
"""Kalyanamitra IG B10: deterministic 3:4 carousel renderer; no network or publishing.

Input: native approved Dharma JSON or sanitized source_docs from user capture.
Output: 7 PNG per content item, caption, and SHA256 manifest. No changes to the
Threads DB, configuration, Repliz or production scheduler.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import textwrap
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1440
FONTS = {
 'regular': ['/usr/share/fonts/opentype/inter/Inter-Regular.otf','/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
 'bold': ['/usr/share/fonts/opentype/inter/Inter-Bold.otf','/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
}
COLORS = {
 'THERAVADA': ('#F4F8F4', '#366B51', '#DDEBDC'),
 'MAHAYANA': ('#FAF4EB', '#9A622C', '#F1E0C5'),
 'VAJRAYANA': ('#F2F3FB', '#55589C', '#DEE2F7'),
 'GENERAL_BUDDHISM': ('#F6F5F5', '#536E78', '#E3E9EB'),
}
BLOCKING = {'do_not_publish', 'do_not_post', 'publication_prohibited', 'publish_prohibited'}
AUTO = {'automatic_publish','auto_publish','autopublish'}


def sha(path):
 return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@lru_cache(maxsize=128)
def font(kind, size):
 for name in FONTS[kind]:
  if Path(name).is_file():return ImageFont.truetype(name,size)
 raise RuntimeError('FONT_NOT_AVAILABLE')


def denied(obj, depth=0):
 if depth>12:raise ValueError('DOCUMENT_TOO_DEEP')
 if isinstance(obj,dict):
  for key,val in obj.items():
   k=str(key).lower().replace('-','_').replace(' ','_')
   if k in BLOCKING and val is True:return True
   if k in AUTO and val is False:return True
   if k in ('publisher_mode','publication_mode') and val in ('draft_only','draft-only','do-not-publish'):return True
   if k=='content_status' and val in ('draft','needs-review','draft_only'):return True
   if isinstance(val,(dict,list)) and denied(val,depth+1):return True
 elif isinstance(obj,list):
  for val in obj:
   if isinstance(val,(dict,list)) and denied(val,depth+1):return True
 return False


def validate(doc, allow_sanitized=False):
 if not isinstance(doc,dict):raise ValueError('INVALID_DOC')
 cid=doc.get('content_id')
 if not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,150}',cid):raise ValueError('INVALID_ID')
 if doc.get('tradition') not in COLORS:raise ValueError('INVALID_TRADITION')
 rv=doc.get('review')
 if not isinstance(rv,dict) or rv.get('status')!='APPROVED' or rv.get('source_verified') is not True:raise ValueError('REVIEW_NOT_APPROVED_VERIFIED')
 if denied(doc):raise ValueError('PUBLISH_PROHIBITED')
 src=doc.get('sources')
 if not isinstance(src,list) or not src:raise ValueError('SOURCES_MISSING')
 if allow_sanitized:
  # sanitized source only proves a previous review, not native validator PASS.
  if any(not isinstance(s,dict) or not str(s.get('url','')).startswith('https://') for s in src):raise ValueError('SOURCE_NOT_HTTPS')
 else:
  if not isinstance(doc.get('claims'),list) or not doc['claims']:raise ValueError('CLAIMS_MISSING_NATIVE_VALIDATOR_REQUIRED')
 posts=doc.get('thread')
 if not isinstance(posts,list) or len(posts)!=8:raise ValueError('B10_REQUIRES_8_THREAD_POSTS')
 if [p.get('post') if isinstance(p,dict) else None for p in posts]!=list(range(1,9)):raise ValueError('INVALID_POST_SEQUENCE')
 if any(not isinstance(p.get('text'),str) or not p['text'].strip() for p in posts):raise ValueError('EMPTY_TEXT')
 if not isinstance(doc.get('title'),str) or not doc['title'].strip():raise ValueError('TITLE_MISSING')
 return cid


def wrap_paragraph(draw, paragraph, ff, width):
 # Explicitly measure every line, and break long tokens at character boundary.
 if not paragraph.strip():return ['']
 result=[]; line=''
 def widthof(t):
  bb=draw.textbbox((0,0),t,font=ff)
  return bb[2]-bb[0]
 for word in paragraph.split():
  candidate=(line+' '+word).strip()
  if widthof(candidate)<=width:
   line=candidate;continue
  if line:result.append(line);line=''
  if widthof(word)<=width:
   line=word;continue
  chunk=''
  for char in word:
   if chunk and widthof(chunk+char)>width:
    result.append(chunk);chunk=char
   else:chunk+=char
  line=chunk
 if line:result.append(line)
 return result


def fit_text(draw, raw, width=875, max_height=940):
 # Binary search for the largest font size that retains ALL text.
 # This preserves 26..46 px and fails closed on overflow, while avoiding up
 # to 21 expensive full text-wrap/measurement passes on long Dharma paragraphs.
 def layout(size):
  ff=font('regular',size)
  leading=round(size*1.48)
  lines=[]
  for paragraph in raw.split('\n'):
   lines.extend(wrap_paragraph(draw,paragraph,ff,width))
  while lines and not lines[-1]:lines.pop()
  fits=len(lines)*leading<=max_height and all(
   draw.textbbox((0,0),line,font=ff)[2]<=width for line in lines)
  return fits,(ff,lines,leading)
 lo,hi=26,46
 best=None
 while lo<=hi:
  mid=(lo+hi)//2
  fits,formatted=layout(mid)
  if fits:
   best=formatted
   lo=mid+1
  else:
   hi=mid-1
 if best is None:
  raise ValueError(f'TEXT_OVERFLOW_NO_TRUNCATION:{len(raw)}')
 return best

def caption(doc):
 # Post 8 retained verbatim in caption. Sources are attributed; no fabricated citations.
 text='\n\n'.join([
  doc['title'].strip(),
  doc['thread'][7]['text'].strip(),
  'Sumber rujukan:',
  *[s['url'] for s in doc['sources'] if isinstance(s,dict) and isinstance(s.get('url'),str)]
 ])
 if len(text)>2200:raise ValueError('CAPTION_TOO_LONG_REQUIRES_EDITOR')
 return text


def render(doc, output_root, allow_sanitized=False):
 cid=validate(doc,allow_sanitized)
 output_root=Path(output_root)
 output_root.mkdir(parents=True,exist_ok=True)
 dest=output_root/cid
 if dest.exists():raise FileExistsError(f'NO_OVERWRITE:{dest}')
 bg,accent,pale=COLORS[doc['tradition']]
 staged=Path(tempfile.mkdtemp(prefix=f'.{cid}-',dir=output_root))
 rendered=[]
 try:
  for n,post in enumerate(doc['thread'][:7],start=1):
   img=Image.new('RGB',(W,H),bg)
   draw=ImageDraw.Draw(img)
   draw.rounded_rectangle((56,55,1024,1385),radius=40,fill='#FFFFFF')
   draw.rounded_rectangle((97,104,983,201),radius=24,fill=pale)
   draw.text((125,134),'RUANG KALYANAMITRA',font=font('bold',30),fill=accent)
   draw.text((820,136),f'{n} / 7',font=font('bold',27),fill=accent)
   trad=doc['tradition'].replace('_',' ').title()
   draw.text((104,239),trad.upper(),font=font('bold',27),fill=accent)
   headline=doc['title'].strip()
   tff=font('bold',36)
   titlelines=wrap_paragraph(draw,headline,tff,856)
   if len(titlelines)>4:raise ValueError('TITLE_OVERFLOW')
   y=294
   for s in titlelines:
    draw.text((104,y),s,font=tff,fill='#182639')
    y+=52
   y+=35
   txt=post['text']
   ff,lines,leading=fit_text(draw,txt,max_height=1215-y)
   for line in lines:
    if line:draw.text((104,y),line,font=ff,fill='#2A3441')
    y+=leading
   if y>1255:raise ValueError('TEXT_OVERFLOW')
   draw.line((104,1300,976,1300),fill=pale,width=4)
   draw.text((105,1321),'Sumber tercantum di caption',font=font('regular',25),fill='#64748B')
   # Mark identitas tetap, terpisah dari teks Dharma, sumber dan content_id.
   # Render nyata pada setiap slide; tidak hanya menulis watermark di manifest.
   draw.rounded_rectangle((698,1314,755,1368),radius=15,fill=pale)
   draw.text((704,1325),'RK',font=font('bold',26),fill=accent)
   draw.text((786,1321),f'{cid[-13:]}',font=font('regular',19),fill='#64748B')
   fp=staged/f'slide-{n:02d}.png'
   img.save(fp,'PNG',optimize=True)
   with Image.open(fp) as check:
    if check.size!=(W,H):raise ValueError('WRONG_DIMENSIONS')
   rendered.append((fp.name,sha(fp)))
  (staged/'caption.txt').write_text(caption(doc),encoding='utf-8')
  digest={'content_id':cid,'slides':rendered,'caption_sha256':sha(staged/'caption.txt'),'size':[W,H],'source_kind':'sanitized-evidence-preview' if allow_sanitized else 'native-full-validator-required','published':False,'watermark':'RK','watermark_location':'footer','watermark_box':[698,1314,755,1368]}
  (staged/'render-manifest.json').write_text(json.dumps(digest,ensure_ascii=False,indent=2),encoding='utf-8')
  os.replace(staged,dest)
  return dest
 except Exception:
  import shutil
  shutil.rmtree(staged,ignore_errors=True)
  raise


def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('command',choices=['preview','render-native','selftest'])
 ap.add_argument('--source')
 ap.add_argument('--dest')
 args=ap.parse_args()
 if args.command=='selftest':
  base={'content_id':'TEST-01','title':'Uji','tradition':'THERAVADA','review':{'status':'APPROVED','source_verified':True},'sources':[{'url':'https://suttacentral.net/x'}],'thread':[{'post':i,'text':'Ini contoh teks. Sumber yang sah ditautkan.'} for i in range(1,9)]}
  validate(base,True)
  try:validate({**base,'review':{'status':'REJECTED','source_verified':True}},True)
  except ValueError:pass
  else:raise RuntimeError('REVIEW_GATE_FAILED')
  try:validate({**base,'do_not_publish':True},True)
  except ValueError:pass
  else:raise RuntimeError('BAN_GATE_FAILED')
  with tempfile.TemporaryDirectory() as tmp:
   p=render(base,tmp,True)
   assert len(list(p.glob('slide-*.png')))==7
   assert (p/'caption.txt').is_file()
  print('B10_RENDER_SELFTEST_PASS');return
 if not args.source or not args.dest:ap.error('--source and --dest are required')
 data=json.loads(Path(args.source).read_text(encoding='utf-8'))
 if args.command=='preview':
  if not isinstance(data.get('source_documents'),list):raise ValueError('SANITIZED_SOURCE_DOCUMENTS_REQUIRED')
  for doc in data['source_documents']:
   print('PREVIEW_READY',render(doc,args.dest,True))
 elif args.command=='render-native':
  # Caller must first run validate_dharma_json.py against this same original file.
  print('NATIVE_RENDER_READY',render(data,args.dest,False))

if __name__=='__main__':main()
