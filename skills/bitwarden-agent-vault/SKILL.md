---
name: bitwarden-agent-vault
description: Mandatory persistent credential workflow backed by Bitwarden Secrets Manager. Use implicitly whenever Codex creates, generates, receives, discovers, needs, stores, retrieves, updates, rotates, shares, or uses a password, API key, access token, client secret, deployment credential, or other stable secret; before asking the user to provide a credential again; when a task reports a missing credential or environment variable; or when the user asks to open Bitwarden. Save every durable credential created within Codex immediately, before continuing the task. Prefer runtime injection, but reveal plaintext without another confirmation when the user explicitly asks for the secret value.
---

# Bitwarden Agent Vault MCP

Use the `bitwarden-agent-vault` MCP tools as the source of truth for stable agent credentials.

## Required behavior

1. Call `status` before the first vault operation in a task. If authorization is healthy, continue without involving the user.
2. Before asking the user for a credential they may have supplied previously, call `list_secrets` or `get_secret` and search Bitwarden first.
3. When Codex successfully creates or generates a stable credential, call `store_secret` immediately, before using it elsewhere, handing it off, or finishing the task. Do this without asking the user to participate.
4. When the user supplies or Codex discovers a stable credential intended for future agent use, store it before continuing. If a credential authenticates beyond the current task, treat it as durable unless evidence shows that it expires shortly.
5. Use the exact environment-variable name as the secret key when one exists, such as `SERVICE_API_KEY`. Otherwise use a clear uppercase key such as `SERVICE_PROD_ADMIN_PASSWORD`.
6. Add a non-secret structured note with the available fields: `workspace`, `service`, `environment`, `account`, `source`, and `created`. Never duplicate the value in the note.
7. Call `store_secret` with `overwrite: true` to rotate an existing value. Never create duplicates with the same key in one project.
8. Before finishing a task that created, received, discovered, or rotated a durable credential, verify its secret metadata with `list_secrets`. Do not reveal the value during verification.
9. Do not automatically store one-time passwords, MFA codes, session cookies, short-lived access tokens, recovery codes, or temporary signed URLs unless the user explicitly asks.
10. Prefer `run_with_secrets` when command execution is privately enabled, the executable is explicitly allowlisted, and a trusted command can consume selected secrets as environment variables. Never request more secret keys than the command needs. This keeps values out of normal model output and redacts exact known values from returned stdout and stderr.
11. Call `get_secret` when private configuration enables plaintext reveal and the user explicitly asks to see a password or key, or when the task cannot use runtime injection. Return the requested value directly without an additional confirmation.
12. Call `open_bitwarden` when the user asks to open the vault. Open the narrowest project page available.

## Security boundaries

- Never write secret values into Git, source files, `.env` files, `AGENTS.md`, skills, plugin configuration, Codex memory, logs, or task summaries.
- Never reveal the Bitwarden machine access token. It is a bootstrap credential stored in the OS keychain.
- Never invent a missing value. If Bitwarden is unavailable or has no match, report the exact missing dependency.
- Treat command execution as high risk. It is disabled by default, requires an absolute executable allowlist, and must never use a shell, interpreter, or network client unless the user has deliberately accepted that program's exfiltration risk in private configuration.
- Treat a user request to share a credential as an access-control change when possible. Do not copy a plaintext value to an unrelated recipient unless the user explicitly requests plaintext disclosure.
- Use project boundaries for selective sharing because Bitwarden Secrets Manager machine and human access is project-scoped.

## Naming

Use names such as `OPENAI_API_KEY`, `VERCEL_TOKEN`, `STRIPE_TEST_SECRET_KEY`, or `SERVICE_ADMIN_PASSWORD`. Preserve exact environment-variable names so `run_with_secrets` can inject them without translation. Use the note for workspace and service organization. Keep development, test, and production credentials in separate projects whenever their access differs.
