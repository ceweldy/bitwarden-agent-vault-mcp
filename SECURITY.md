# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not open a
public issue containing an exploit, access token, secret value, vault export,
organization identifier, project identifier, or customer data.

If private reporting is unavailable, open a public issue that only requests a
private contact channel and contains no sensitive technical detail.

## Operational guidance

- Create a dedicated, least-privilege Bitwarden machine account.
- Grant access only to the projects or individual secrets the agent needs.
- Keep the machine token in an operating-system credential store where
  possible.
- Never commit `BWS_ACCESS_TOKEN` or the private configuration file.
- Keep plaintext reveal disabled unless the connected MCP client is trusted and
  the workflow truly requires it.
- Keep command execution disabled unless it is required.
- If command execution is enabled, allowlist only purpose-built executables.
  Shells, interpreters, network clients, and package managers can bypass the
  intended boundary.
- Treat MCP clients and prompt sources as trusted components. `get_secret`
  intentionally returns plaintext to the connected client.
- Rotate the machine token and affected secrets immediately after suspected
  exposure.

Exact-value output redaction is defense in depth, not a data-loss-prevention
system. An executable can transform or transmit a secret in ways that exact
matching cannot detect.
