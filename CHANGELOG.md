# Changelog

All notable changes to this project are documented here.

## Unreleased

### Changed

- Renamed the public project and display title to `Bitwarden Agent Vault MCP`
  for clearer MCP discoverability while preserving the stable
  `bitwarden-agent-vault` plugin ID.

## 0.2.0 - 2026-07-09

### Added

- Public installation, configuration, security, and contribution documentation.
- MIT license, CI, Dependabot, and release metadata.
- Private configuration example with command execution disabled by default.
- Explicit opt-in for plaintext secret retrieval.
- Explicit executable allowlisting and selected-secret injection.

### Changed

- Secret overwrite now requires `overwrite: true`.
- Command tools are marked destructive for MCP clients.
- Command subprocesses receive a minimal environment without the Bitwarden
  machine token.

### Security

- `run_with_secrets` no longer injects every secret in a project.
- Arbitrary command execution is no longer enabled by default.
