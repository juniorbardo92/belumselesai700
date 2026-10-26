from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
items=json.loads((root/'EXPORT_INVENTORY.json').read_text())['files']
bad=[]
for item in items:
 p=root/item['path']
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
  bad.append(item['path'])
print(json.dumps({'checked':len(items),'mismatches':bad},ensure_ascii=False))
sys.exit(bool(bad))
