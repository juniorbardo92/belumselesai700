from pathlib import Path
import struct, hashlib, zlib, zipfile, io, re, json
from PIL import Image, ImageChops
from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509

BASE=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2G_STABLE.apk')
HTML=Path('/mnt/data/apk_builder/phase2j_ui.html')
LOGO=Path('/mnt/data/LOGO SUN TZU(2).jpeg')
OUT=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2J_SAFE.apk')
AUD=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2J_SAFE_AUDIT.txt')
README=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2J_SAFE_README.txt')
ICONOUT=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2J_ICON.png')
SOURCEZIP=Path('/mnt/data/PanglimaAffiliateAdmin_Phase2J_SAFE_Source.zip')
KEY=Path('/mnt/data/PanglimaAffiliateAdmin_2B_SigningKey_BACKUP.p12')
PASSFILE=Path('/mnt/data/PanglimaAffiliateAdmin_2B_SigningKey_PASSWORD.txt')
PKG='id.umkmnaikkelas.panglimaadmin.safe2j'
ACT='id.umkmnaikkelas.panglimaadmin.safe2g.MainActivity'
LABEL='Panglima Admin 2J SAFE'
VERSION_NAME='0.2.11-phase2j-safe'
VERSION_CODE=11
RES_ICON=0x7f010000

def uleb_encode(v):
    out=bytearray()
    while True:
        b=v&0x7f;v>>=7
        if v:out.append(b|0x80)
        else:out.append(b);return bytes(out)
def uleb_decode(data,off):
    v=0;shift=0;i=off
    while True:
        b=data[i];i+=1;v|=(b&0x7f)<<shift
        if b<128:return v,i
        shift+=7
def mutf8_encode(s):
    out=bytearray()
    for ch in s:
        cp=ord(ch)
        if cp==0:out+=b'\xc0\x80'
        elif cp<=0x7f:out.append(cp)
        elif cp<=0x7ff:out+=bytes((0xc0|(cp>>6),0x80|(cp&0x3f)))
        elif cp<=0xffff:out+=bytes((0xe0|(cp>>12),0x80|((cp>>6)&0x3f),0x80|(cp&0x3f)))
        else:raise ValueError(f'non-BMP U+{cp:X}')
    return bytes(out)
def parse_string_item(d,o):
    units,pos=uleb_decode(d,o);end=d.index(0,pos);return units,pos,end,end+1
def patch_dex_exact_layout(dex,html):
    b=bytearray(dex);n,ids_off=struct.unpack_from('<II',b,56);offs=[struct.unpack_from('<I',b,ids_off+4*i)[0] for i in range(n)]
    idx=None
    for i,o in enumerate(offs):
        units,pos,end,item_end=parse_string_item(b,o)
        if bytes(b[pos:pos+15]).startswith(b'<!doctype html>'):
            idx=i;html_off=o;old_end=item_end;break
    if idx is None:raise RuntimeError('HTML DEX string not found')
    next_off=offs[idx+1]
    if old_end!=next_off:raise RuntimeError('base HTML string not contiguous')
    raw0=mutf8_encode(html);units0=len(html.encode('utf-16-le'))//2;target=next_off-html_off
    gap=target-(len(uleb_encode(units0))+len(raw0)+1)
    if gap<0:raise RuntimeError(f'2J HTML too large by {-gap} bytes')
    padded=html+(' '*gap);raw=mutf8_encode(padded);units=len(padded.encode('utf-16-le'))//2;item=uleb_encode(units)+raw+b'\x00'
    if len(item)!=target:raise RuntimeError('exact layout mismatch')
    b[html_off:next_off]=item
    b[12:32]=hashlib.sha1(bytes(b[32:])).digest();struct.pack_into('<I',b,8,zlib.adler32(bytes(b[12:]))&0xffffffff)
    _,_,_,end2=parse_string_item(b,html_off)
    if end2!=next_off:raise RuntimeError('final HTML item not contiguous')
    if b'Lid/umkmnaikkelas/panglimaadmin/safe2g/MainActivity;' not in b:raise RuntimeError('stable MainActivity missing')
    return bytes(b),gap

def make_icon():
    im=Image.open(LOGO).convert('RGB');bg=Image.new('RGB',im.size,'white');diff=ImageChops.difference(im,bg).convert('L').point(lambda p:255 if p>28 else 0);box=diff.getbbox() or (0,0,*im.size)
    x0,y0,x1,y1=box;pad=int(max(x1-x0,y1-y0)*.07);x0=max(0,x0-pad);y0=max(0,y0-pad);x1=min(im.width,x1+pad);y1=min(im.height,y1+pad);crop=im.crop((x0,y0,x1,y1));side=max(crop.size);sq=Image.new('RGB',(side,side),'white');sq.paste(crop,((side-crop.width)//2,(side-crop.height)//2));sq=sq.resize((512,512),Image.Resampling.LANCZOS);sq.save(ICONOUT,'PNG',optimize=True);return box

def enc_len8(n):
    if n<0x80:return bytes([n])
    return bytes([0x80|(n>>8),n&255])
def string_pool(strings):
    offs=[];data=bytearray()
    for s in strings:
        raw=s.encode();u16=len(s.encode('utf-16-le'))//2;offs.append(len(data));data+=enc_len8(u16)+enc_len8(len(raw))+raw+b'\0'
    while len(data)%4:data.append(0)
    hs=28;start=hs+4*len(strings);size=start+len(data)
    return struct.pack('<HHI',1,hs,size)+struct.pack('<IIIII',len(strings),0,0x100,start,0)+b''.join(struct.pack('<I',x) for x in offs)+data
def xml_node_hdr(t,size,line=1):return struct.pack('<HHIII',t,16,size,line,0xffffffff)
def ns_chunk(t,prefix,uri):return xml_node_hdr(t,24)+struct.pack('<II',prefix,uri)
def attr(ns,name,raw,vtype,data):return struct.pack('<IIIHBBI',ns,name,raw,8,0,vtype,data)
def start_elem(name,attrs,ns=0xffffffff,line=1):
    ext=struct.pack('<IIHHHHHH',ns,name,20,20,len(attrs),0,0,0);size=16+len(ext)+20*len(attrs);return xml_node_hdr(0x0102,size,line)+ext+b''.join(attrs)
def end_elem(name,ns=0xffffffff,line=1):return xml_node_hdr(0x0103,24,line)+struct.pack('<II',ns,name)
def build_manifest():
    S=['android','http://schemas.android.com/apk/res/android','manifest','uses-sdk','uses-permission','application','activity','intent-filter','action','category','package','versionCode','versionName','minSdkVersion','targetSdkVersion','label','name','exported','icon',PKG,VERSION_NAME,LABEL,ACT,'android.permission.INTERNET','android.intent.action.MAIN','android.intent.category.LAUNCHER'];I={s:i for i,s in enumerate(S)};sp=string_pool(S);res=[0]*len(S)
    for k,v in {'versionCode':0x0101021b,'versionName':0x0101021c,'minSdkVersion':0x0101020c,'targetSdkVersion':0x01010270,'label':0x01010001,'name':0x01010003,'exported':0x01010010,'icon':0x01010002}.items():res[I[k]]=v
    rm=struct.pack('<HHI',0x0180,8,8+4*len(res))+b''.join(struct.pack('<I',x) for x in res);A=I[S[1]];c=[sp,rm,ns_chunk(0x0100,I['android'],A)]
    c+=[start_elem(I['manifest'],[attr(A,I['versionCode'],0xffffffff,0x10,VERSION_CODE),attr(A,I['versionName'],I[VERSION_NAME],3,I[VERSION_NAME]),attr(0xffffffff,I['package'],I[PKG],3,I[PKG])],line=2)]
    c+=[start_elem(I['uses-sdk'],[attr(A,I['minSdkVersion'],0xffffffff,0x10,26),attr(A,I['targetSdkVersion'],0xffffffff,0x10,37)],line=3),end_elem(I['uses-sdk'],line=3)]
    c+=[start_elem(I['uses-permission'],[attr(A,I['name'],I['android.permission.INTERNET'],3,I['android.permission.INTERNET'])],line=4),end_elem(I['uses-permission'],line=4)]
    c+=[start_elem(I['application'],[attr(A,I['label'],I[LABEL],3,I[LABEL]),attr(A,I['icon'],0xffffffff,1,RES_ICON)],line=5),start_elem(I['activity'],[attr(A,I['name'],I[ACT],3,I[ACT]),attr(A,I['exported'],0xffffffff,0x12,0xffffffff)],line=6),start_elem(I['intent-filter'],[],line=7),start_elem(I['action'],[attr(A,I['name'],I['android.intent.action.MAIN'],3,I['android.intent.action.MAIN'])],line=8),end_elem(I['action'],line=8),start_elem(I['category'],[attr(A,I['name'],I['android.intent.category.LAUNCHER'],3,I['android.intent.category.LAUNCHER'])],line=9),end_elem(I['category'],line=9),end_elem(I['intent-filter'],line=7),end_elem(I['activity'],line=6),end_elem(I['application'],line=5),end_elem(I['manifest'],line=2),ns_chunk(0x0101,I['android'],A)]
    body=b''.join(c);return struct.pack('<HHI',3,8,8+len(body))+body
def utf16_name128(name):return (name.encode('utf-16le')+b'\0\0').ljust(256,b'\0')[:256]
def build_arsc():
    g=string_pool(['res/drawable/ic_launcher.png']);ts=string_pool(['drawable']);ks=string_pool(['ic_launcher']);spec=struct.pack('<HHI',0x0202,16,20)+struct.pack('<BBHI',1,0,0,1)+struct.pack('<I',0);config=struct.pack('<I',64)+b'\0'*60;hs=84;es=88;entry=struct.pack('<HHI',8,0,0)+struct.pack('<HBBI',8,0,3,0);tc=struct.pack('<HHI',0x0201,hs,es+len(entry))+struct.pack('<BBHII',1,0,0,1,es)+config+struct.pack('<I',0)+entry;ph=288;to=ph;ko=to+len(ts);body=ts+ks+spec+tc;pkg=struct.pack('<HHI',0x0200,ph,ph+len(body))+struct.pack('<I',0x7f)+utf16_name128(PKG)+struct.pack('<IIIII',to,1,ko,1,0)+body;return struct.pack('<HHI',2,12,12+len(g)+len(pkg))+struct.pack('<I',1)+g+pkg

def lp(x):return struct.pack('<I',len(x))+x
def chunked_digest(sections):
    chunks=[]
    for sec in sections:
        for i in range(0,len(sec),1048576):
            c=sec[i:i+1048576];chunks.append(hashlib.sha256(b'\xA5'+struct.pack('<I',len(c))+c).digest())
    return hashlib.sha256(b'\x5A'+struct.pack('<I',len(chunks))+b''.join(chunks)).digest()
def eocd(apk):
    p=apk.rfind(b'PK\x05\x06')
    if p<0:raise RuntimeError('EOCD')
    return p
def sign_v2(unsigned,key,cert):
    e=eocd(unsigned);cd=struct.unpack_from('<I',unsigned,e+16)[0];before=unsigned[:cd];central=unsigned[cd:e];eo=bytearray(unsigned[e:]);struct.pack_into('<I',eo,16,cd);dg=chunked_digest([before,central,bytes(eo)]);algo=0x0103;digests=lp(struct.pack('<I',algo)+lp(dg));certder=cert.public_bytes(serialization.Encoding.DER);sd=lp(digests)+lp(lp(certder))+lp(b'');sig=key.sign(sd,padding.PKCS1v15(),hashes.SHA256());signer=lp(sd)+lp(lp(struct.pack('<I',algo)+lp(sig)))+lp(cert.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo));v2=lp(lp(signer));pair=struct.pack('<Q',4+len(v2))+struct.pack('<I',0x7109871a)+v2;size=len(pair)+24;block=struct.pack('<Q',size)+pair+struct.pack('<Q',size)+b'APK Sig Block 42';out=bytearray(before+block+central+unsigned[e:]);struct.pack_into('<I',out,e+len(block)+16,cd+len(block));return bytes(out)
def verify_v2(apk):
    e=eocd(apk);cd=struct.unpack_from('<I',apk,e+16)[0]
    if apk[cd-16:cd]!=b'APK Sig Block 42':raise RuntimeError('v2 magic')
    sz=struct.unpack_from('<Q',apk,cd-24)[0];start=cd-(sz+8);pos=start+8;end=cd-24;val=None
    while pos<end:
        ln=struct.unpack_from('<Q',apk,pos)[0];ident=struct.unpack_from('<I',apk,pos+8)[0]
        if ident==0x7109871a:val=apk[pos+12:pos+8+ln]
        pos+=8+ln
    q=4;seq=val[q:q+struct.unpack_from('<I',val,0)[0]];q=4;signer=seq[q:q+struct.unpack_from('<I',seq,0)[0]];q=0;l=struct.unpack_from('<I',signer,q)[0];q+=4;sd=signer[q:q+l];q+=l;l=struct.unpack_from('<I',signer,q)[0];q+=4;sigs=signer[q:q+l];q+=l;l=struct.unpack_from('<I',signer,q)[0];q+=4;pub=signer[q:q+l];z=0;l=struct.unpack_from('<I',sd,z)[0];z+=4;digs=sd[z:z+l];z+=l;l=struct.unpack_from('<I',sd,z)[0];z+=4;certs=sd[z:z+l];z=4;rec=digs[z:z+struct.unpack_from('<I',digs,0)[0]];expected=rec[8:8+struct.unpack_from('<I',rec,4)[0]];z=4;srec=sigs[z:z+struct.unpack_from('<I',sigs,0)[0]];sig=srec[8:8+struct.unpack_from('<I',srec,4)[0]];z=4;certder=certs[z:z+struct.unpack_from('<I',certs,0)[0]];cert=x509.load_der_x509_certificate(certder);cert.public_key().verify(sig,sd,padding.PKCS1v15(),hashes.SHA256());eo=bytearray(apk[e:]);struct.pack_into('<I',eo,16,start);actual=chunked_digest([apk[:start],apk[cd:e],bytes(eo)])
    if actual!=expected:raise RuntimeError('v2 digest')
    return hashlib.sha256(certder).hexdigest()

html=HTML.read_text()
if any(ord(c)>0xffff for c in html):raise RuntimeError('non-BMP HTML')
# Guards before build
for bad in ["newStatus:'REJECTED'","newStatus:'SUSPENDED'",'admin_update_commission_status','admin_resend_affiliate_email']:
    if bad in html:raise RuntimeError('forbidden '+bad)
if html.count("newStatus:'APPROVED'")!=1:raise RuntimeError('approved payload count')
if 'Commission Monitor' not in html or 'comEarned' not in html or 'commissionSearch' not in html or "detailRow('Funnel'" not in html:raise RuntimeError('2J controls absent')
with zipfile.ZipFile(BASE) as z:dex0=z.read('classes.dex')
dex,gap=patch_dex_exact_layout(dex0,html)
iconmeta=make_icon();manifest=build_manifest();arsc=build_arsc();icon=ICONOUT.read_bytes()
bio=io.BytesIO()
with zipfile.ZipFile(bio,'w') as z:
    for name,data,ctype in [('AndroidManifest.xml',manifest,zipfile.ZIP_DEFLATED),('classes.dex',dex,zipfile.ZIP_DEFLATED),('resources.arsc',arsc,zipfile.ZIP_STORED),('res/drawable/ic_launcher.png',icon,zipfile.ZIP_STORED)]:
        zi=zipfile.ZipInfo(name);zi.date_time=(2026,8,23,9,10,0);zi.compress_type=ctype
        if ctype==zipfile.ZIP_STORED:
            base=bio.tell()+30+len(name.encode());r=(-base)%4
            if r:zi.extra=struct.pack('<HH',0xCAFE,r)+b'\0'*r
        z.writestr(zi,data)
pw=re.search(r'^Password:\s*\n([^\n\r]+)',PASSFILE.read_text(),re.M).group(1).encode();key,cert,_=load_key_and_certificates(KEY.read_bytes(),pw);signed=sign_v2(bio.getvalue(),key,cert);OUT.write_bytes(signed);cert_hash=verify_v2(signed)
with zipfile.ZipFile(OUT) as z:
    if z.testzip():raise RuntimeError('zip crc')
    dx=z.read('classes.dex')
if hashlib.sha1(dx[32:]).digest()!=dx[12:32]:raise RuntimeError('dex sha1')
if (zlib.adler32(dx[12:])&0xffffffff)!=struct.unpack_from('<I',dx,8)[0]:raise RuntimeError('dex adler')
sha=hashlib.sha256(signed).hexdigest();iconsha=hashlib.sha256(icon).hexdigest()
source=Path('/mnt/data/Phase2J_SAFE_Source');source.mkdir(exist_ok=True)
(source/'phase2j_ui.html').write_text(html);(source/'build_phase2j_safe.py').write_text(Path(__file__).read_text());(source/'README.txt').write_text('Phase 2J SAFE. Base 2G STBL; supplied logo; commission/payout monitoring plus affiliate funnel; APPROVED ONLY; backend unchanged.\n');Image.open(ICONOUT).save(source/'ic_launcher.png')
with zipfile.ZipFile(SOURCEZIP,'w',zipfile.ZIP_DEFLATED) as z:
    for p in source.iterdir():z.write(p,p.name)
AUD.write_text(f'''Panglima Affiliate Admin - Phase 2J SAFE

BASELINE
- Base DEX/class: Phase 2G STBL (device-proven)
- Package: {PKG}
- Activity: {ACT}
- versionCode: {VERSION_CODE}
- Exact DEX HTML padding: {gap} bytes

2J COMMISSION & PAYOUT MONITORING
- Commission Monitor: PRESENT
- Commission search: affiliate / code / transaction
- Local summary: Earned / Outstanding / Paid / Transaction count
- Filters: ALL / PENDING / APPROVED / PAID
- Affiliate performance funnel from 2I: RETAINED
- History search/date filters from 2H: RETAINED
- Source: admin_dashboard snapshot only
- Commission write endpoint: NONE
- New endpoint/schema: NONE

LOGO
- User supplied logo used as launcher icon
- 512x512 PNG SHA-256: {iconsha}

SECURITY
- Backend / Worker / GAS / DB / webhook modified: NO
- Allowed actions unchanged: 4
- Write: APPROVED ONLY
- REJECTED: ABSENT
- SUSPENDED: ABSENT
- Commission update: ABSENT
- Resend email: ABSENT
- Persistent app storage: NONE / RAM only

INTEGRITY
- ZIP CRC: VERIFIED
- DEX SHA-1: VERIFIED
- DEX Adler32: VERIFIED
- DEX string-data layout: CONTIGUOUS
- APK Signature v2: VERIFIED
- Signing certificate SHA-256: {cert_hash}
- APK SHA-256: {sha}
''')
README.write_text('''PHASE 2J SAFE

1. Keep Phase 2I SAFE, Phase 2H SAFE, and Phase 2G STBL as rollback.
2. Phase 2J installs side-by-side as Panglima Admin 2J SAFE.
3. Launcher icon remains the supplied red Sun Tzu/UMKM logo.
4. Commission page adds read-only Earned/Outstanding/Paid/transaction summaries plus search.
5. Affiliate funnel and History filters remain available.
6. No backend changes. No commission write. Approval remains APPROVED ONLY.
''')
print(json.dumps({'apk':str(OUT),'size':len(signed),'sha256':sha,'dex_padding':gap,'source_zip':str(SOURCEZIP)},indent=2))
