#!/usr/bin/env node
/**
 * Inventory ledger integrity — Sprint 1A alias for verify-inventory-reconciliation.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "scripts/verify-inventory-reconciliation.mjs");

console.log("Delegating to verify-inventory-reconciliation.mjs (ledger / negative-stock integrity)…\n");
const run = spawnSync("node", [target], { stdio: "inherit", cwd: root, env: process.env });
process.exit(run.status ?? 1);
