#!/usr/bin/env python3
"""Encrypt a Panglima PDF asset as PGLM1 (AES-256-GCM)."""

import argparse
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def decode_key(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    key = base64.urlsafe_b64decode(value + padding)
    if len(key) != 32:
        raise ValueError("module key must decode to exactly 32 bytes")
    return key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--key-env", required=True)
    args = parser.parse_args()

    key_value = os.environ.get(args.key_env, "").strip()
    if not key_value:
        raise ValueError(f"missing environment variable {args.key_env}")

    plaintext = args.input.read_bytes()
    nonce = os.urandom(12)
    ciphertext = AESGCM(decode_key(key_value)).encrypt(nonce, plaintext, None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(b"PGLM1" + nonce + ciphertext)


if __name__ == "__main__":
    main()
