#!/bin/zsh
set -euo pipefail

readonly env_file="apps/web/.env.local"

if [[ ! -f "$env_file" ]]; then
  print -u2 "Missing $env_file. Copy the local Meld environment before running the workspace."
  exit 1
fi

set -a
source "$env_file"
set +a

exec pnpm --parallel --filter web --filter @meld/gateway dev
