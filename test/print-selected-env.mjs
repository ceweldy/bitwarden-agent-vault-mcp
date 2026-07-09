#!/usr/bin/env node
import process from "node:process";

const secret = process.env.TEST_API_KEY || "missing";
const token = process.env.BWS_ACCESS_TOKEN || "missing";
process.stdout.write(`secret=${secret} token=${token}\n`);
