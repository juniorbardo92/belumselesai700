# Hermes AI -> OpenClaw Project Advisor (VPS4)

This is a minimal Hermes-native skill with an explicitly bounded CLI bridge to the already working OpenClaw `main` advisor. It does not modify existing Hermes service configuration or launcher; it adds one new skill folder under `~/.hermes/skills/`. No restart required for fresh sessions according to current Hermes Agent documentation.

Prerequisites from live tests:
- OpenClaw `main` exposes `project-advisor` and `obsidian-vault`.
- Vault symlink: `/home/ubuntu/.openclaw/workspace/ObsidianVault`.
- `hermes`, `openclaw`, `python3` commands accessible under the same account that runs Hermes.

Usage (from unpacked ZIP on VPS4):

```
bash install.sh
hermes skills list | grep project-advisor-openclaw
python3 ~/.hermes/skills/project-advisor-openclaw/scripts/bridge.py smoke
hermes chat --toolsets skills,terminal --skills project-advisor-openclaw -Q -q 'Gunakan skill project-advisor-openclaw untuk menjalankan smoke test Obsidian melalui bridge. Laporkan judul dan tiga tujuan dari catatan yang benar-benar dibaca. Jangan mengubah apa pun.'
```

Then, after smoke passes, project review (requires actual project evidence accessible to OpenClaw):

```
python3 ~/.hermes/skills/project-advisor-openclaw/scripts/bridge.py review bazi
```

The bridge is an advisory-only workflow by instruction, **not** an OS-level immutable sandbox. Do not give it writable production credentials or broad tool permissions. Full gateway chat test is separate from CLI test; use a *new conversation* so Hermes refreshes skill discovery. No claims of gateway integration until that test passes. Existing skill name is never overwritten by installer.

Supported review slugs: bazi, repliz, umkm, kalyanamitra, guardian, hermes-seo.
