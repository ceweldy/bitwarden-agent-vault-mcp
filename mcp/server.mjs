import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_NAME = "bitwarden-agent-vault";
const SERVER_VERSION = "0.2.0";
const KEYCHAIN_SERVICE = process.env.BITWARDEN_AGENT_KEYCHAIN_SERVICE || "codex-bitwarden-agent-vault";
const KEYCHAIN_ACCOUNT = process.env.BITWARDEN_AGENT_KEYCHAIN_ACCOUNT || process.env.USER || "codex";
const CONFIG_PATH = process.env.BITWARDEN_AGENT_CONFIG || path.join(homedir(), ".config", "bitwarden-agent-vault", "config.json");
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const SECRET_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_ENV_KEYS = ["HOME", "LANG", "LC_ALL", "PATH", "SHELL", "TMPDIR", "USER"];

function loadConfig() {
  try {
    const value = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Invalid Bitwarden Agent Vault config at ${CONFIG_PATH}: ${error.message}`);
  }
}

function findBws() {
  const candidates = [
    process.env.BWS_BIN,
    path.join(homedir(), ".local", "bin", "bws"),
    "/opt/homebrew/bin/bws",
    "/usr/local/bin/bws",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "bws";
}

function existingRealpath(candidate, label) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  try {
    return realpathSync(candidate);
  } catch {
    throw new Error(`${label} does not exist: ${candidate}`);
  }
}

function resolveAllowedExecutable(executable) {
  const config = loadConfig();
  if (config.allowCommandExecution !== true) {
    throw new Error("Command execution is disabled. Set allowCommandExecution to true in the private config to opt in.");
  }
  if (!Array.isArray(config.allowedExecutables) || config.allowedExecutables.length === 0) {
    throw new Error("Command execution requires at least one absolute path in allowedExecutables.");
  }
  const resolvedExecutable = existingRealpath(executable, "executable");
  const allowed = config.allowedExecutables.map((candidate, index) =>
    existingRealpath(candidate, `allowedExecutables[${index}]`),
  );
  if (!allowed.includes(resolvedExecutable)) {
    throw new Error(`Executable is not allowlisted: ${executable}`);
  }
  return resolvedExecutable;
}

function selectSecretsForEnvironment(secrets, requestedKeys) {
  const uniqueKeys = [...new Set(requestedKeys)];
  if (uniqueKeys.length !== requestedKeys.length) {
    throw new Error("secret_keys must not contain duplicates.");
  }
  return uniqueKeys.map((key) => {
    if (!SECRET_ENV_KEY.test(key)) {
      throw new Error(`Secret key is not a valid environment variable name: ${key}`);
    }
    const matches = secrets.filter((secret) => keyOf(secret) === key);
    if (matches.length === 0) throw new Error(`No Bitwarden secret matches ${key} in the selected project.`);
    if (matches.length > 1) throw new Error(`Multiple Bitwarden secrets match ${key} in the selected project.`);
    return matches[0];
  });
}

function commandEnvironment(secrets) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  for (const secret of secrets) env[keyOf(secret)] = String(secret.value ?? "");
  return env;
}

function redact(text, values) {
  let result = String(text ?? "");
  const ordered = [...new Set(values.filter((value) => typeof value === "string" && value.length >= 4))]
    .sort((a, b) => b.length - a.length);
  for (const value of ordered) result = result.split(value).join("[REDACTED]");
  return result;
}

function spawnCaptured(command, args, { env = process.env, cwd, timeoutMs = 60_000, sensitive = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= OUTPUT_LIMIT) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= OUTPUT_LIMIT) stderr.push(chunk);
    });
    child.on("error", (error) => finish(reject, new Error(redact(error.message, sensitive))));
    child.on("close", (code, signal) => {
      const out = redact(Buffer.concat(stdout).toString("utf8"), sensitive);
      const err = redact(Buffer.concat(stderr).toString("utf8"), sensitive);
      finish(resolve, {
        code: code ?? 1,
        signal,
        stdout: stdoutBytes > OUTPUT_LIMIT ? `${out}\n[output truncated]` : out,
        stderr: stderrBytes > OUTPUT_LIMIT ? `${err}\n[output truncated]` : err,
      });
    });
  });
}

async function keychainToken() {
  if (process.env.BWS_ACCESS_TOKEN?.trim()) return process.env.BWS_ACCESS_TOKEN.trim();
  if (process.platform !== "darwin") {
    throw new Error("BWS_ACCESS_TOKEN is not set. Configure the Bitwarden machine token for this host.");
  }
  const result = await spawnCaptured("/usr/bin/security", [
    "find-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
  ]);
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error(`Bitwarden machine token is not configured in macOS Keychain service ${KEYCHAIN_SERVICE}.`);
  }
  return result.stdout.trim();
}

async function runBws(args, { timeoutMs = 60_000, sensitive = [] } = {}) {
  const token = await keychainToken();
  const config = loadConfig();
  const commandArgs = ["--color", "no", "--output", "json"];
  if (config.serverUrl) commandArgs.push("--server-url", String(config.serverUrl));
  commandArgs.push(...args);
  const result = await spawnCaptured(findBws(), commandArgs, {
    timeoutMs,
    sensitive: [token, ...sensitive],
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
  });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `bws exited with code ${result.code}`;
    throw new Error(`Bitwarden CLI error: ${detail}`);
  }
  return result.stdout;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bitwarden returned invalid JSON for ${label}.`);
  }
}

async function listProjectsRaw() {
  const result = parseJson(await runBws(["project", "list"]), "project list");
  return Array.isArray(result) ? result : [];
}

async function listSecretsRaw(projectId) {
  const args = ["secret", "list"];
  if (projectId) args.push(projectId);
  const result = parseJson(await runBws(args), "secret list");
  return Array.isArray(result) ? result : [];
}

async function resolveProjectId(projectId) {
  if (projectId) return projectId;
  const config = loadConfig();
  if (config.defaultProjectId) return String(config.defaultProjectId);
  const projects = await listProjectsRaw();
  if (projects.length === 1) return String(projects[0].id);
  throw new Error("A project_id is required because no default project is configured and more than one project is accessible.");
}

function keyOf(secret) {
  return String(secret.key ?? secret.name ?? "");
}

function metadata(secret) {
  return {
    id: secret.id,
    key: keyOf(secret),
    projectId: secret.projectId,
    organizationId: secret.organizationId,
    note: secret.note || "",
    revisionDate: secret.revisionDate,
  };
}

async function resolveSecret(identifier, projectId) {
  const secrets = await listSecretsRaw(projectId);
  const exactId = secrets.find((secret) => String(secret.id) === identifier);
  if (exactId) return exactId;
  const matches = secrets.filter((secret) => keyOf(secret).toLowerCase() === identifier.toLowerCase());
  if (matches.length === 0) throw new Error(`No Bitwarden secret matches ${identifier}.`);
  if (matches.length > 1) throw new Error(`Multiple Bitwarden secrets match ${identifier}; provide a project_id or secret UUID.`);
  return matches[0];
}

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(error) {
  return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
}

const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    instructions:
      "Use this server as the durable source of agent credentials. Store every stable credential created, generated, received, or discovered during a Codex task immediately, before continuing. Use run_with_secrets only when command execution is privately enabled and the executable is explicitly allowlisted. Use get_secret only when plaintext is explicitly requested or runtime injection cannot satisfy the task. Never reveal the machine access token.",
  },
);

server.registerTool(
  "status",
  {
    title: "Check Bitwarden Agent Vault",
    description: "Check local CLI installation, machine-token availability, and optional live Bitwarden access without exposing credentials.",
    inputSchema: { verify_remote: z.boolean().default(true) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ verify_remote }) => {
    try {
      await keychainToken();
      const config = loadConfig();
      const result = {
        ready: true,
        bws: findBws(),
        credentialSource: process.env.BWS_ACCESS_TOKEN ? "environment" : "macOS Keychain",
        plaintextRevealEnabled: config.allowPlaintextReveal === true,
        commandExecutionEnabled:
          config.allowCommandExecution === true &&
          Array.isArray(config.allowedExecutables) &&
          config.allowedExecutables.length > 0,
        remoteVerified: false,
      };
      if (verify_remote) {
        const projects = await listProjectsRaw();
        result.remoteVerified = true;
        result.projectCount = projects.length;
      }
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "list_projects",
  {
    title: "List Bitwarden projects",
    description: "List Bitwarden Secrets Manager projects accessible to this machine identity. Returns metadata only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      const projects = await listProjectsRaw();
      return textResult(projects.map((project) => ({
        id: project.id,
        name: project.name,
        organizationId: project.organizationId,
        revisionDate: project.revisionDate,
      })));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "list_secrets",
  {
    title: "Find Bitwarden secrets",
    description: "List secret names and metadata, optionally filtered by project or search text. Values are never returned by this tool.",
    inputSchema: {
      project_id: z.string().optional(),
      query: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ project_id, query }) => {
    try {
      let secrets = await listSecretsRaw(project_id);
      if (query) {
        const needle = query.toLowerCase();
        secrets = secrets.filter((secret) => keyOf(secret).toLowerCase().includes(needle));
      }
      return textResult(secrets.map(metadata));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "get_secret",
  {
    title: "Reveal a Bitwarden secret",
    description: "Return one secret value in plaintext by UUID or exact key when private configuration explicitly enables plaintext reveal.",
    inputSchema: {
      identifier: z.string().min(1),
      project_id: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ identifier, project_id }) => {
    try {
      if (loadConfig().allowPlaintextReveal !== true) {
        throw new Error("Plaintext secret reveal is disabled. Set allowPlaintextReveal to true in the private config to opt in.");
      }
      const secret = await resolveSecret(identifier, project_id);
      return textResult({ ...metadata(secret), value: secret.value });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "store_secret",
  {
    title: "Store or rotate a Bitwarden secret",
    description: "Create a stable secret or update the existing exact-key match in one project. The returned result omits the secret value.",
    inputSchema: {
      key: z.string().min(1),
      value: z.string().min(1),
      project_id: z.string().optional(),
      note: z.string().optional(),
      overwrite: z.boolean().default(false),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ key, value, project_id, note, overwrite }) => {
    try {
      const resolvedProjectId = await resolveProjectId(project_id);
      const secrets = await listSecretsRaw(resolvedProjectId);
      const matches = secrets.filter((secret) => keyOf(secret).toLowerCase() === key.toLowerCase());
      if (matches.length > 1) throw new Error(`Multiple secrets already use key ${key}; resolve the duplicates before storing.`);
      if (matches.length === 1) {
        if (!overwrite) throw new Error(`Secret ${key} already exists and overwrite is false.`);
        const args = ["secret", "edit", "--value", value];
        if (note !== undefined) args.push("--note", note);
        args.push(String(matches[0].id));
        const updated = parseJson(await runBws(args, { sensitive: [value] }), "secret edit");
        return textResult({ action: "updated", secret: metadata(updated) });
      }
      const args = ["secret", "create", key, value, resolvedProjectId];
      if (note) args.push("--note", note);
      const created = parseJson(await runBws(args, { sensitive: [value] }), "secret create");
      return textResult({ action: "created", secret: metadata(created) });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "run_with_secrets",
  {
    title: "Run a trusted command with Bitwarden secrets",
    description: "Run one privately allowlisted executable with only the selected project secrets injected as environment variables. Command execution is disabled by default. Exact secret values are redacted from returned output.",
    inputSchema: {
      project_id: z.string().optional(),
      secret_keys: z.array(z.string()).min(1).max(50),
      executable: z.string().min(1),
      args: z.array(z.string()).default([]),
      working_directory: z.string().optional(),
      timeout_seconds: z.number().int().min(1).max(300).default(120),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ project_id, secret_keys, executable, args, working_directory, timeout_seconds }) => {
    try {
      const resolvedExecutable = resolveAllowedExecutable(executable);
      const resolvedProjectId = await resolveProjectId(project_id);
      const secrets = await listSecretsRaw(resolvedProjectId);
      const selectedSecrets = selectSecretsForEnvironment(secrets, secret_keys);
      const secretValues = selectedSecrets.map((secret) => secret.value).filter(Boolean);
      const result = await spawnCaptured(resolvedExecutable, args, {
        cwd: working_directory,
        timeoutMs: timeout_seconds * 1000,
        sensitive: secretValues,
        env: commandEnvironment(selectedSecrets),
      });
      return textResult({
        exitCode: result.code,
        signal: result.signal,
        stdout: result.stdout.trimEnd(),
        stderr: result.stderr.trimEnd(),
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "open_bitwarden",
  {
    title: "Open Bitwarden Secrets Manager",
    description: "Open the Bitwarden Secrets Manager web vault, narrowed to a project when a project UUID is supplied.",
    inputSchema: { project_id: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ project_id }) => {
    try {
      let url = "https://vault.bitwarden.com/#/sm";
      if (project_id) {
        const projects = await listProjectsRaw();
        const project = projects.find((candidate) => String(candidate.id) === project_id);
        if (!project) throw new Error(`Project ${project_id} is not accessible.`);
        url = `https://vault.bitwarden.com/#/sm/${project.organizationId}/projects/${project.id}`;
      }
      if (process.platform !== "darwin") return textResult({ opened: false, url });
      const result = await spawnCaptured("/usr/bin/open", [url]);
      if (result.code !== 0) throw new Error(result.stderr.trim() || "Unable to open Bitwarden.");
      return textResult({ opened: true, url });
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
