#!/bin/zsh
set -euo pipefail

readonly env_file="apps/web/.env.local"
readonly required_node_version="22.23.2"
readonly pinned_supabase_dir="$HOME/.local/share/supabase"

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

# Bring the local Supabase stack up before starting web + gateway. The gateway
# crashes at startup if Postgres/Supabase is unreachable, and its `tsx watch`
# wrapper won't retry — leaving the User Flows canvas stuck on "Syncing the
# shared canvas…" forever. These steps are idempotent (no-ops when already up).

# Prefer the pinned Supabase CLI (2.109.1); newer CLIs fail `supabase start`
# against Meld's migrations. Falls back to whatever `supabase` is on PATH.
if [[ -x "$pinned_supabase_dir/supabase" ]]; then
  export PATH="$pinned_supabase_dir:$PATH"
fi

if command -v supabase >/dev/null 2>&1; then
  # Supabase needs a Docker daemon (colima) at the repointed socket.
  export DOCKER_HOST="${DOCKER_HOST:-unix:///var/run/docker.sock}"
  if ! docker info >/dev/null 2>&1; then
    if command -v colima >/dev/null 2>&1; then
      print "Docker not reachable; starting colima…"
      colima start
    else
      print -u2 "Docker is not running and colima is not installed. Start your Docker daemon before running Meld."
      exit 1
    fi
  fi

  if ! supabase status >/dev/null 2>&1; then
    print "Starting local Supabase stack…"
    supabase start
  fi
else
  print -u2 "supabase CLI not found. Install it (pinned 2.109.1) before running Meld; the User Flows canvas needs it."
  exit 1
fi

exec pnpm --parallel --filter web --filter @meld/gateway dev
