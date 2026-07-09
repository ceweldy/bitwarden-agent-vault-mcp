#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'This helper requires macOS Keychain. Configure BWS_ACCESS_TOKEN in the MCP process environment on this platform.\n' >&2
  exit 1
fi

service="${BITWARDEN_AGENT_KEYCHAIN_SERVICE:-codex-bitwarden-agent-vault}"
account="${BITWARDEN_AGENT_KEYCHAIN_ACCOUNT:-${USER:-codex}}"

read -r -s -p "Paste the Bitwarden Secrets Manager machine access token: " token
printf '\n'

if [[ -z "$token" ]]; then
  printf 'No token supplied. Nothing changed.\n' >&2
  exit 1
fi

/usr/bin/security add-generic-password -U -a "$account" -s "$service" -w "$token" >/dev/null
unset token
printf 'Stored the Bitwarden machine token in macOS Keychain service %s.\n' "$service"
