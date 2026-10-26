#!/usr/bin/env bash
set -euo pipefail

prompt_file="${1:?prompt file is required}"

if [[ ! -f "$prompt_file" ]]; then
  printf 'Prompt file not found: %s\n' "$prompt_file" >&2
  exit 2
fi

if ! command -v hermes >/dev/null 2>&1; then
  printf 'Hermes command is not available in WSL.\n' >&2
  exit 3
fi

cd -- "$(dirname -- "$prompt_file")"
hermes chat -q "$(cat -- "$prompt_file")"
