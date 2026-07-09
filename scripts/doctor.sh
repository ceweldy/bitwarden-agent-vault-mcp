#!/usr/bin/env bash
set -euo pipefail

service="${BITWARDEN_AGENT_KEYCHAIN_SERVICE:-codex-bitwarden-agent-vault}"
account="${BITWARDEN_AGENT_KEYCHAIN_ACCOUNT:-${USER:-codex}}"
bws_bin="${BWS_BIN:-$HOME/.local/bin/bws}"

if [[ ! -x "$bws_bin" ]]; then
  printf 'BWS_CLI=missing path=%s\n' "$bws_bin"
  exit 1
fi
printf 'BWS_CLI=ready version=%s\n' "$($bws_bin --version)"

if [[ -n "${BWS_ACCESS_TOKEN:-}" ]]; then
  token="$BWS_ACCESS_TOKEN"
  printf 'MACHINE_TOKEN=ready source=environment\n'
elif [[ "$(uname -s)" == "Darwin" ]]; then
  if ! token=$(/usr/bin/security find-generic-password -a "$account" -s "$service" -w 2>/dev/null); then
    printf 'MACHINE_TOKEN=missing source=keychain service=%s\n' "$service"
    exit 2
  fi
  printf 'MACHINE_TOKEN=ready source=keychain service=%s\n' "$service"
else
  printf 'MACHINE_TOKEN=missing source=environment variable=BWS_ACCESS_TOKEN\n'
  exit 2
fi

if BWS_ACCESS_TOKEN="$token" "$bws_bin" --color no --output none project list >/dev/null 2>&1; then
  printf 'BITWARDEN_API=ready\n'
else
  printf 'BITWARDEN_API=failed\n'
  unset token
  exit 3
fi
unset token
