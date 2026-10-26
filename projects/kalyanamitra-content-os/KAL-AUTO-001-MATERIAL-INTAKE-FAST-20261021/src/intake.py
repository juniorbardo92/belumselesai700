#!/usr/bin/env python3
"""A zero-network, zero-publishing local material inbox for Kalyanamitra."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ALLOWED = {'.txt','.md','.pdf','.doc','.docx','.epub','.jpg','.jpeg','.png','.webp','.json','.csv','.rtf','.odt','.pptx'}
MAX_FILE = 30 * 1024 * 1024
MAX_TEXT = 250_000


def owner_dir(p):
    p = Path(p).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(p, 0o700)
    return p


def validate_file(arg):
    candidate = Path(arg).expanduser()
    if candidate.is_symlink():
        raise ValueError('SYMLINK_NOT_ALLOWED')
    candidate = candidate.resolve(strict=True)
    if not candidate.is_file() or candidate.suffix.lower() not in ALLOWED:
        raise ValueError('UNSUPPORTED_ATTACHMENT')
    if candidate.stat().st_size > MAX_FILE:
        raise ValueError('FILE_TOO_LARGE')
    return candidate


def digest(data): return hashlib.sha256(data).hexdigest()


def ingest(inbox, text, files, instruction='', message_id='', source='telegram'):
    if source != 'telegram':
        raise ValueError('SOURCE_NOT_TELEGRAM')
    if len(text.encode('utf-8')) > MAX_TEXT or len(instruction.encode('utf-8')) > 10_000:
        raise ValueError('TEXT_TOO_LARGE')
    sources = [validate_file(f) for f in files]
    if not text.strip() and not sources:
        raise ValueError('NO_MATERIAL')
    base = owner_dir(inbox)
    content = []
    for f in sources:
        bs = f.read_bytes()
        content.append((f, bs, digest(bs)))
    payload_hash = digest(json.dumps({
        'text': text, 'instruction': instruction,
        'files': [z[2] for z in content], 'message_id': str(message_id)
    }, ensure_ascii=False, sort_keys=True).encode())
    jobid = 'KALMAT-' + payload_hash[:20].upper()
    directory = base / jobid
    if directory.is_dir():
        return {'status': 'ALREADY_RECEIVED', 'id': jobid, 'files': len(content)}
    scratch = Path(tempfile.mkdtemp(prefix='.intake-', dir=base))
    try:
        os.chmod(scratch, 0o700)
        if text.strip():
            (scratch / 'materi.txt').write_text(text, encoding='utf-8')
            os.chmod(scratch / 'materi.txt', 0o600)
        attachments = []
        for ix, (f, bs, sha) in enumerate(content, 1):
            # Extension survives; filenames supplied via Telegram are never trusted.
            safe = f'attachment-{ix:02d}{f.suffix.lower()}'
            p = scratch / safe
            with p.open('xb') as fp: fp.write(bs)
            os.chmod(p, 0o600)
            attachments.append({'file':safe,'sha256':sha,'bytes':len(bs)})
        manifest = {
            'schema': 'kalyanamitra.material.v1', 'id': jobid,
            'state': 'RECEIVED_INBOX', 'qa_status': 'NOT_REVIEWED',
            'publish_status': 'NOT_REQUESTED_OR_EXECUTED',
            'created_at_utc': datetime.now(timezone.utc).isoformat(),
            'source': 'telegram', 'message_id': str(message_id),
            'instruction': instruction, 'text_chars': len(text),
            'attachments': attachments
        }
        (scratch / 'receipt.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        os.chmod(scratch / 'receipt.json', 0o600)
        try: scratch.rename(directory)
        except FileExistsError:
            shutil.rmtree(scratch)
            return {'status': 'ALREADY_RECEIVED', 'id': jobid, 'files': len(content)}
    except Exception:
        shutil.rmtree(scratch, ignore_errors=True)
        raise
    return {'status': 'RECEIVED_INBOX', 'id': jobid, 'files': len(content)}


def cli(argv=None):
    p=argparse.ArgumentParser(description='Kalyanamitra material inbox (never publishes)')
    p.add_argument('action', choices=('add','status'))
    p.add_argument('--inbox', default=str(Path.home()/'.openclaw/workspace-kalyanamitra/inbox'))
    p.add_argument('--text', default='')
    p.add_argument('--stdin', action='store_true')
    p.add_argument('--file', action='append', default=[])
    p.add_argument('--instruction', default='')
    p.add_argument('--message-id', default='')
    ns=p.parse_args(argv)
    try:
        if ns.action=='status':
            base=Path(ns.inbox).expanduser()
            result={'status':'INBOX_READY' if base.is_dir() else 'INBOX_MISSING',
                    'entries': len([p for p in base.glob('KALMAT-*') if p.is_dir()]) if base.is_dir() else 0}
        else:
            text=ns.text
            if ns.stdin:
                raw=sys.stdin.buffer.read(MAX_TEXT + 1)
                if len(raw)>MAX_TEXT: raise ValueError('TEXT_TOO_LARGE')
                text += raw.decode('utf-8')
            result=ingest(ns.inbox,text,ns.file,ns.instruction,ns.message_id)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True));return 0
    except (ValueError, OSError, UnicodeError) as e:
        print(json.dumps({'status':'BLOCKED','reason':str(e)},ensure_ascii=False));return 3

if __name__=='__main__': sys.exit(cli())
