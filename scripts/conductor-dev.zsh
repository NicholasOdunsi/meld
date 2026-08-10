#!/bin/zsh
set -euo pipefail

readonly env_file="apps/web/.env.local"
readonly required_node_version="22.23.2"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  print -u2 "Missing $NVM_DIR/nvm.sh. Install Node $required_node_version before running Meld."
  exit 1
fi

source "$NVM_DIR/nvm.sh"
nvm use "$required_node_version" >/dev/null

if [[ ! -f "$env_file" ]]; then
  print -u2 "Missing $env_file. Copy the local Meld environment before running the workspace."
  exit 1
fi

set -a
source "$env_file"
set +a

exec pnpm --parallel --filter web --filter @meld/gateway dev
