#!/usr/bin/env python3
"""Conservative local bridge from Hermes to an already-configured OpenClaw main.

Only invokes the pre-existing OpenClaw agent in analysis mode. It cannot enforce
an OS read-only sandbox; user and skill instructions still matter.
"""
import argparse
import shutil
import subprocess
import sys

PROJECTS = {
    'bazi': 'BaZi Consultant Pro v3.0',
    'repliz': 'Repliz',
    'umkm': 'UMKM Naik Kelas',
    'kalyanamitra': 'Kalyanamitra',
    'guardian': 'Hermes Guardian VPS2/VPS4',
    'hermes-seo': 'Hermes SEO',
}

SMOKE = (
    'Gunakan skill project-advisor dan obsidian-vault. Baca Tes-Integrasi.md '
    'dalam vault yang sudah dikonfigurasi. Laporkan judul dan tepat tiga tujuan '
    'sesuai catatan, lalu identifikasi satu batas bukti. '
    'Jangan membuat atau mengubah file, database, konfigurasi, atau layanan. '
    'Jika tidak bisa membaca, katakan BLOCKED.'
)


def build_review(slug: str) -> str:
    return (
        'Gunakan skill project-advisor dan obsidian-vault untuk review proyek '
        f'{PROJECTS[slug]}. '
        'Mulai dari kontrak dan keputusan pemilik yang paling mutakhir yang '
        'memang tersedia, lalu cocokkan dengan checklist, hasil pengujian, '
        'kode DEV atau log yang dapat diperiksa. Jangan mengasumsikan dokumen '
        'atau sumber kode tersedia; laporkan keterbatasan akses. '
        'Temukan maksimal tiga masalah paling berdampak yang benar-benar '
        'didukung bukti, dengan lokasi bukti, solusi minimal, dan acceptance test. '
        'Jangan menambah persyaratan kontrak. Bedakan missing evidence dari '
        'not implemented; gunakan status VERIFIED/PARTIAL/UNVERIFIED/BLOCKED/'
        'NOT_TESTED. Sebutkan level bukti DOCUMENT_ONLY, SOURCE_INSPECTED, '
        'DEV_TESTED atau PRODUCTION_VERIFIED yang sebenarnya. '
        'Jangan mengubah file, database, konfigurasi, layanan, atau produksi.'
    )


def main() -> int:
    p = argparse.ArgumentParser(description='Hermes -> OpenClaw project-advisor bridge')
    p.add_argument('action', choices=['smoke', 'review'])
    p.add_argument('project', nargs='?', choices=sorted(PROJECTS))
    args = p.parse_args()

    if args.action == 'review' and args.project is None:
        p.error('review requires a project slug')
    if args.action == 'smoke' and args.project is not None:
        p.error('smoke accepts no project slug')

    executable = shutil.which('openclaw')
    if not executable:
        print('BRIDGE_BLOCKED: openclaw executable not found in PATH', file=sys.stderr)
        return 2

    task = SMOKE if args.action == 'smoke' else build_review(args.project)
    key = 'hermes-advisor-smoke-v1' if args.action == 'smoke' else f'hermes-advisor-{args.project}-v1'
    cmd = [executable, 'agent', '--agent', 'main', '--session-key', key,
           '--timeout', '90', '--message', task]

    # No shell=True; all user-facing inputs are fixed enums.
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        print('BRIDGE_BLOCKED: OpenClaw request timed out', file=sys.stderr)
        return 124
    except OSError as exc:
        print(f'BRIDGE_BLOCKED: failed to launch OpenClaw: {type(exc).__name__}', file=sys.stderr)
        return 2

    if result.returncode:
        print('BRIDGE_BLOCKED: OpenClaw exit code', result.returncode, file=sys.stderr)
        # Avoid printing potentially sensitive stderr from installed tools.
        return result.returncode
    if not result.stdout.strip():
        print('BRIDGE_BLOCKED: no OpenClaw response', file=sys.stderr)
        return 3
    print(result.stdout.rstrip()[:25000])
    if len(result.stdout) > 25000:
        print('\n[OUTPUT_TRUNCATED — review directly in OpenClaw for complete evidence]')
    return 0


if __name__ == '__main__':
    sys.exit(main())
