#!/usr/bin/env python3
"""Export VPS project source. Does not run pipeline or include state/secrets."""
import argparse,zipfile,json,hashlib,datetime
from pathlib import Path
ap=argparse.ArgumentParser()
ap.add_argument("--root",default="/opt/umkm-engine")
ap.add_argument("--output",default="Source_VPS_UMKM_Kalyanamitra.zip")
a=ap.parse_args();root=Path(a.root).resolve();out=Path(a.output).resolve()
if not root.is_dir():raise SystemExit("Folder proyek tidak ditemukan: "+str(root))
if out.exists():raise SystemExit("Output sudah ada; pilih nama lain.")
skip_dirs={".git",".venv","venv","node_modules","__pycache__",".cache","logs","data","backups","credentials","secrets"}
skip_ext={".sqlite",".sqlite3",".db",".p12",".jks",".pem",".key",".log",".pyc"}
files=[];excluded=[];out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.resolve()==out:continue
        rel=p.relative_to(root);n=p.name.lower()
        if p.is_symlink() or set(rel.parts)&skip_dirs or n.startswith(".env") or p.suffix.lower() in skip_ext or any(k in n for k in ["credential","secret","password","signingkey",".bak"]):
            excluded.append(str(rel));continue
        b=p.read_bytes();z.writestr(str(rel),b);files.append({"path":str(rel),"size_bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
    z.writestr("EXPORT_SOURCE_REPORT.json",json.dumps({"created_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"source_root":str(root),"scope":"source only; no databases, secrets, logs, or production-state snapshot","files":files,"excluded":excluded},indent=2))
print("SOURCE_EXPORT_OK",out,"FILES",len(files))
