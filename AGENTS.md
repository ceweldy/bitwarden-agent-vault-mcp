# Agent Instructions

This is a public security-sensitive plugin repository.

- Never add real credentials, machine tokens, vault exports, private Bitwarden
  identifiers, customer data, `.env` files, or personal configuration.
- Use only the fake `bws` implementation under `test/`.
- Keep MCP on local stdio unless a separately authenticated remote transport is
  intentionally designed and reviewed.
- Keep command execution disabled in `config.example.json`.
- Keep plaintext reveal disabled in `config.example.json`.
- Do not weaken executable allowlisting or selected-secret injection.
- Treat changes to `get_secret`, `store_secret`, `run_with_secrets`, token
  handling, subprocess environments, or output redaction as security changes.
- Run `npm run check` and `npm audit --omit=dev` before committing.
- Update `CHANGELOG.md` for user-visible behavior changes.
