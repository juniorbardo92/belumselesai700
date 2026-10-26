#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" != 0 ] || { echo 'BLOCKED: RUN_AS_UBUNTU_NOT_ROOT'; exit 3; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
python3 - <<'PY'
from pathlib import Path
import json, os, shutil, hashlib, time
base=Path(__file__).resolve().parent if '__file__' in globals() and __file__ != '<stdin>' else Path.cwd()
conf=Path.home()/'.openclaw/openclaw.json'
if not conf.is_file(): raise SystemExit('BLOCKED: OPENCLAW_CONFIG_MISSING')
d=json.loads(conf.read_text())
agent=d.get('agents',{}).get('entries',{}).get('kalyanamitra')
if not isinstance(agent,dict): raise SystemExit('BLOCKED: KALYANAMITRA_AGENT_NOT_FOUND')
workspace=Path(agent.get('workspace') or Path.home()/'.openclaw/workspace-kalyanamitra').expanduser().resolve()
if workspace != (Path.home()/'.openclaw/workspace-kalyanamitra').resolve():
    raise SystemExit('BLOCKED: UNEXPECTED_KAL_WORKSPACE='+str(workspace))
if not workspace.is_dir():raise SystemExit('BLOCKED: WORKSPACE_MISSING')
skill=workspace/'skills/kalyanamitra-terima-materi/SKILL.md'
tool=workspace/'tools/kalauto_material_intake.py'
source_skill=base/'skill/SKILL.md'
source_tool=base/'src/intake.py'
for src in (source_skill,source_tool):
    if not src.is_file():raise SystemExit('BLOCKED: PACKAGE_INCOMPLETE')
for target in (skill,tool):
    if target.is_symlink():raise SystemExit('BLOCKED: SYMLINK_TARGET')
    if target.exists():
        src=source_skill if target==skill else source_tool
        if target.read_bytes()!=src.read_bytes():
            raise SystemExit('BLOCKED: TARGET_EXISTS_WITH_DIFFERENT_CONTENT='+str(target))
for src,target in ((source_skill,skill),(source_tool,tool)):
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        temp=target.with_suffix(target.suffix+'.tmp')
        shutil.copy2(src,temp);os.chmod(temp,0o600);temp.replace(target)
(workspace/'inbox').mkdir(exist_ok=True,mode=0o700)
os.chmod(workspace/'inbox',0o700)
print('KAL_MATERIAL_INTAKE_INSTALLED')
print('SKILL='+str(skill))
print('TOOL='+str(tool))
print('INBOX='+str(workspace/'inbox'))
print('OPENCLAW_CONFIG=UNCHANGED')
print('GATEWAY=UNCHANGED')
print('REPLIZ_POST=0')
PY
