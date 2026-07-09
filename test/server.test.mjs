import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

function parseText(result) {
  return JSON.parse(result.content[0].text);
}

test("Bitwarden MCP exposes credential tools and redacts runtime output", async () => {
  const testDirectory = mkdtempSync(path.join(tmpdir(), "bitwarden-agent-vault-"));
  const configPath = path.join(testDirectory, "config.json");
  const executable = realpathSync(process.execPath);
  writeFileSync(configPath, JSON.stringify({
    defaultProjectId: "project-1",
    allowPlaintextReveal: true,
    allowCommandExecution: true,
    allowedExecutables: [executable],
  }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "mcp", "server.mjs")],
    env: {
      ...process.env,
      BWS_BIN: path.join(here, "fake-bws.mjs"),
      BWS_ACCESS_TOKEN: "unit-test-token",
      BITWARDEN_AGENT_CONFIG: configPath,
    },
  });
  const client = new Client({ name: "bitwarden-agent-vault-test", version: "0.2.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["get_secret", "list_projects", "list_secrets", "open_bitwarden", "run_with_secrets", "status", "store_secret"],
    );

    const status = parseText(await client.callTool({ name: "status", arguments: { verify_remote: true } }));
    assert.equal(status.ready, true);
    assert.equal(status.projectCount, 1);
    assert.equal(status.plaintextRevealEnabled, true);
    assert.equal(status.commandExecutionEnabled, true);

    const listed = parseText(await client.callTool({ name: "list_secrets", arguments: { query: "test" } }));
    assert.equal(listed.length, 1);
    assert.equal(Object.hasOwn(listed[0], "value"), false);

    const revealed = parseText(await client.callTool({ name: "get_secret", arguments: { identifier: "TEST_API_KEY" } }));
    assert.equal(revealed.value, "unit-test-secret");

    const refusedOverwrite = await client.callTool({
      name: "store_secret",
      arguments: { key: "TEST_API_KEY", value: "should-not-be-stored", project_id: "project-1" },
    });
    assert.equal(refusedOverwrite.isError, true);
    assert.match(refusedOverwrite.content[0].text, /overwrite is false/);

    const stored = parseText(await client.callTool({
      name: "store_secret",
      arguments: { key: "TEST_API_KEY", value: "rotated-test-secret", project_id: "project-1", overwrite: true },
    }));
    assert.equal(stored.action, "updated");
    assert.equal(JSON.stringify(stored).includes("rotated-test-secret"), false);

    const run = parseText(await client.callTool({
      name: "run_with_secrets",
      arguments: {
        project_id: "project-1",
        secret_keys: ["TEST_API_KEY"],
        executable,
        args: [path.join(here, "print-selected-env.mjs")],
      },
    }));
    assert.equal(run.stdout.includes("unit-test-secret"), false);
    assert.equal(run.stdout.includes("unit-test-token"), false);
    assert.match(run.stdout, /secret=\[REDACTED\]/);
    assert.match(run.stdout, /token=missing/);

    writeFileSync(configPath, JSON.stringify({
      defaultProjectId: "project-1",
      allowPlaintextReveal: false,
      allowCommandExecution: false,
      allowedExecutables: [],
    }));
    const blockedReveal = await client.callTool({
      name: "get_secret",
      arguments: { identifier: "TEST_API_KEY", project_id: "project-1" },
    });
    assert.equal(blockedReveal.isError, true);
    assert.match(blockedReveal.content[0].text, /Plaintext secret reveal is disabled/);

    const blockedRun = await client.callTool({
      name: "run_with_secrets",
      arguments: {
        project_id: "project-1",
        secret_keys: ["TEST_API_KEY"],
        executable,
        args: [path.join(here, "print-selected-env.mjs")],
      },
    });
    assert.equal(blockedRun.isError, true);
    assert.match(blockedRun.content[0].text, /Command execution is disabled/);
  } finally {
    await client.close();
    rmSync(testDirectory, { recursive: true, force: true });
  }
});
