# Bitwarden Agent Vault MCP

An unofficial, open-source Codex plugin and local MCP server for using
[Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/) as
durable credential storage for agent workflows.

The server runs locally over MCP stdio. It does not open a network port and it
does not contain a Bitwarden token, organization ID, project ID, password, or
API key. Every installation must supply its own Bitwarden machine account and
private configuration.

> This community project is not affiliated with or endorsed by Bitwarden, Inc.

## What it does

- Stores and rotates stable agent credentials in Bitwarden Secrets Manager.
- Lists projects and secret metadata without returning values.
- Retrieves a secret when plaintext is explicitly required.
- Injects selected secrets into an allowlisted executable without placing them
  in the normal command output.
- Opens the Bitwarden Secrets Manager web vault on macOS.
- Includes a Codex skill for automatically saving durable credentials that
  Codex creates, receives, or discovers.

## Security model

```text
Codex MCP client
    | local JSON-RPC over stdin/stdout
    v
Bitwarden Agent Vault MCP server
    | machine token from macOS Keychain or BWS_ACCESS_TOKEN
    v
Bitwarden Secrets Manager API via bws
```

- The MCP server uses stdio and has no HTTP listener.
- The machine token is read from macOS Keychain by default. On other platforms,
  it must be supplied to the MCP process as `BWS_ACCESS_TOKEN`.
- Bitwarden project and secret permissions remain the authoritative access
  boundary. Use a least-privilege machine account.
- `store_secret` refuses to overwrite an existing key unless `overwrite: true`
  is explicitly supplied.
- `get_secret` is disabled by default and requires an explicit private
  `allowPlaintextReveal` opt-in.
- `run_with_secrets` is disabled by default. When enabled, it requires an
  absolute executable allowlist and injects only the requested secret keys.
- Command output is redacted for exact secret values. Redaction cannot prevent
  an executable from encoding, transforming, writing, or transmitting a
  secret. Only allowlist purpose-built programs you trust.
- `get_secret` intentionally returns plaintext to the MCP client. Do not expose
  this server to untrusted clients or untrusted prompt sources.

See [SECURITY.md](SECURITY.md) for reporting and operational guidance.

## Requirements

- Node.js 20 or later
- A Bitwarden Secrets Manager organization, project, and machine account
- Bitwarden Secrets Manager CLI (`bws`)
- Codex with local plugin/MCP support
- macOS for the included Keychain helper; Linux can use an MCP-process
  environment variable

The server may work on Windows when `bws` is installed and
`BWS_ACCESS_TOKEN` is provided, but the helper scripts are currently tested for
macOS and Linux shells only.

## Install

Clone the repository into the conventional personal plugin source location:

```bash
git clone https://github.com/ceweldy/bitwarden-agent-vault-mcp.git \
  "$HOME/plugins/bitwarden-agent-vault"
cd "$HOME/plugins/bitwarden-agent-vault"
npm ci
```

Install `bws` with the checksum-verifying helper, or install it from Bitwarden's
official release process:

```bash
./scripts/install-bws.sh
```

Create a Bitwarden Secrets Manager project and a machine account with only the
required project permissions. Copy the machine access token once.

On macOS, store the token in Keychain without placing it in a file or shell
history:

```bash
./scripts/store-machine-token.sh
```

On non-macOS systems, configure `BWS_ACCESS_TOKEN` only in the MCP host's
private process environment. Do not commit it or place it in a shared shell
profile.

Create the private configuration:

```bash
mkdir -p "$HOME/.config/bitwarden-agent-vault"
cp config.example.json "$HOME/.config/bitwarden-agent-vault/config.json"
chmod 600 "$HOME/.config/bitwarden-agent-vault/config.json"
```

Replace `defaultProjectId` with your Bitwarden project UUID. The UUID is not a
secret, but keeping deployment metadata outside the repository avoids leaking
your vault structure.

Check the live connection:

```bash
./scripts/doctor.sh
```

## Add the Codex plugin

Add this entry to the `plugins` array in your personal Codex marketplace at
`~/.agents/plugins/marketplace.json`. Preserve any entries already in that
file.

```json
{
  "name": "bitwarden-agent-vault",
  "source": {
    "source": "local",
    "path": "./plugins/bitwarden-agent-vault"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

Then install it:

```bash
codex plugin add bitwarden-agent-vault@personal
```

Start a new Codex task so the MCP tools and skill are loaded.

## Configuration

The server reads `~/.config/bitwarden-agent-vault/config.json` unless
`BITWARDEN_AGENT_CONFIG` points to another file.

| Field | Required | Meaning |
| --- | --- | --- |
| `serverUrl` | No | Bitwarden API server; defaults to Bitwarden cloud. |
| `defaultProjectId` | Recommended | Project used when a tool call omits `project_id`. |
| `allowPlaintextReveal` | No | Must be exactly `true` to enable `get_secret`. |
| `allowCommandExecution` | No | Must be exactly `true` to enable `run_with_secrets`. |
| `allowedExecutables` | When enabled | Absolute paths to trusted executable files. |

To opt into command execution, use a private configuration such as:

```json
{
  "serverUrl": "https://vault.bitwarden.com",
  "defaultProjectId": "replace-with-your-bitwarden-project-id",
  "allowPlaintextReveal": false,
  "allowCommandExecution": true,
  "allowedExecutables": [
    "/absolute/path/to/a-purpose-built-tool"
  ]
}
```

Avoid allowlisting shells, general-purpose interpreters, download tools, or
network clients. They defeat the purpose of an executable allowlist.

## MCP tools

| Tool | Behavior |
| --- | --- |
| `status` | Checks local token, CLI, optional remote access, and command-execution state. |
| `list_projects` | Returns accessible project metadata. |
| `list_secrets` | Returns secret names and metadata, never values. |
| `get_secret` | Returns one exact secret value when privately enabled. |
| `store_secret` | Creates a secret or explicitly rotates an exact-key match. |
| `run_with_secrets` | Runs an enabled, allowlisted executable with selected secret keys. |
| `open_bitwarden` | Opens the Bitwarden Secrets Manager web UI on macOS. |

## Development

```bash
npm ci
npm run check
npm audit --omit=dev
```

Tests use a fake `bws` fixture and contain no real credentials. Never add live
tokens, vault exports, `.env` files, personal configuration, or customer data
to tests or issue reports.

## License

[MIT](LICENSE)
