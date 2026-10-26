#!/usr/bin/env python3
"""Guarded, owner-approved exception to blanket 'Never publish anything' skill.
Only change one matching line after trusted write integration is available.
"""
from pathlib import Path
import os,sys
p=Path.home()/'.openclaw/workspace-kalyanamitra/skills/kalyanamitra-dharma-engine/SKILL.md'
if not p.is_file() or p.is_symlink():print('BLOCKED_SKILL_PATH_NOT_FOUND');sys.exit(3)
s=p.read_text()
lines=s.splitlines(keepends=True)
matches=[i for i,line in enumerate(lines) if 'Never publish anything' in line]
if len(matches)!=1 or (p.parent/'SKILL.md.pre-kal-auto-001.bak').exists():print('BLOCKED_SKILL_DIFF_OR_BACKUP_EXISTS');sys.exit(3)
old=lines[matches[0]]
lines[matches[0]]=old.replace('Never publish anything', 'Never publish anything without a direct owner Telegram scheduling/publishing instruction and a verified KAL-AUTO-001 VPS2 schedule receipt; owner-authorized KAL-AUTO-001 scheduling via kalauto-repliz-schedule skill is permitted, while unverified source materials and unsolicited publication remain forbidden')
backup=p.parent/'SKILL.md.pre-kal-auto-001.bak'
backup.write_text(s);os.chmod(backup,0o600)
p.write_text(''.join(lines))
print('OWNER_SCHEDULE_EXCEPTION_INSTALLED')
print('ORIGINAL_SKILL_BACKUP='+str(backup))
