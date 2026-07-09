#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const macUserPathPrefix = ["/", "Users", "/"].join("");
const requiredFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "config.example.json",
  "mcp/server.mjs",
  "skills/bitwarden-agent-vault/SKILL.md",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) errors.push(`Missing ${relativePath}`);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`Invalid ${relativePath}: ${error.message}`);
    return {};
  }
}

const manifest = readJson(".codex-plugin/plugin.json");
const mcp = readJson(".mcp.json");
const packageJson = readJson("package.json");
const configExample = readJson("config.example.json");

if (manifest.name !== "bitwarden-agent-vault") errors.push("Unexpected plugin name");
if (String(manifest.version || "").split("+", 1)[0] !== packageJson.version) {
  errors.push("Plugin and package versions do not match");
}
if (manifest.mcpServers !== "./.mcp.json") errors.push("Plugin must reference ./.mcp.json");
if (!mcp.mcpServers?.["bitwarden-agent-vault"]) errors.push("MCP server entry is missing");
if (configExample.allowCommandExecution !== false) {
  errors.push("Public configuration must disable command execution by default");
}
if (configExample.allowPlaintextReveal !== false) {
  errors.push("Public configuration must disable plaintext reveal by default");
}
if (!Array.isArray(configExample.allowedExecutables) || configExample.allowedExecutables.length !== 0) {
  errors.push("Public configuration must start with an empty executable allowlist");
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) continue;
  const text = readFileSync(path.join(root, relativePath), "utf8");
  if (text.includes("[TODO:")) errors.push(`${relativePath} contains a TODO placeholder`);
  if (text.includes(macUserPathPrefix)) errors.push(`${relativePath} contains a macOS user path`);
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write("Release structure is valid.\n");
