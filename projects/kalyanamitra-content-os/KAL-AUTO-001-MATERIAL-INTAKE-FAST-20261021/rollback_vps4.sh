#!/usr/bin/env bash
set -euo pipefail
base="$HOME/.openclaw/workspace-kalyanamitra"
# Do not delete the inbox: received owner materials must survive rollback.
rm -f -- "$base/skills/kalyanamitra-terima-materi/SKILL.md"
rmdir -- "$base/skills/kalyanamitra-terima-materi" 2>/dev/null || true
rm -f -- "$base/tools/kalauto_material_intake.py"
echo 'KAL_INTAKE_SKILL_ROLLED_BACK; INBOX_PRESERVED'
