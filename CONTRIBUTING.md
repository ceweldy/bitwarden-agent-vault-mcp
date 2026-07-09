# Contributing

Contributions are welcome through GitHub issues and pull requests.

## Development setup

```bash
npm ci
npm run check
npm audit --omit=dev
```

Use only the fake `bws` fixture in automated tests. Never use or commit a real
machine token, password, API key, vault export, private configuration file, or
customer identifier.

## Pull requests

- Keep changes focused and explain their security impact.
- Add or update tests for behavior changes.
- Preserve stdio as the default MCP transport unless a separate authenticated
  remote design is being proposed.
- Do not weaken the default-disabled command-execution policy.
- Update `CHANGELOG.md` for user-visible changes.

Security reports belong in GitHub private vulnerability reporting rather than
public issues. See [SECURITY.md](SECURITY.md).
