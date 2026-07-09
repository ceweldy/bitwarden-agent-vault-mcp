#!/usr/bin/env node
import process from "node:process";

if (process.env.BWS_ACCESS_TOKEN !== "unit-test-token") {
  process.stderr.write("missing test token\n");
  process.exit(9);
}

const args = process.argv.slice(2);
const commandIndex = args.findIndex((value) => ["project", "secret"].includes(value));
const command = args.slice(commandIndex);
const project = {
  id: "project-1",
  name: "Agent Vault",
  organizationId: "org-1",
  revisionDate: "2026-07-09T00:00:00Z",
};
const secret = {
  id: "secret-1",
  key: "TEST_API_KEY",
  value: "unit-test-secret",
  note: "test fixture",
  projectId: "project-1",
  organizationId: "org-1",
  revisionDate: "2026-07-09T00:00:00Z",
};

if (command[0] === "project" && command[1] === "list") {
  process.stdout.write(JSON.stringify([project]));
} else if (command[0] === "secret" && command[1] === "list") {
  process.stdout.write(JSON.stringify([secret]));
} else if (command[0] === "secret" && command[1] === "create") {
  process.stdout.write(JSON.stringify({ ...secret, id: "secret-created", key: command[2], value: command[3] }));
} else if (command[0] === "secret" && command[1] === "edit") {
  const valueIndex = command.indexOf("--value");
  process.stdout.write(JSON.stringify({ ...secret, value: command[valueIndex + 1] }));
} else {
  process.stderr.write(`unsupported fake command: ${command.join(" ")}\n`);
  process.exit(8);
}
