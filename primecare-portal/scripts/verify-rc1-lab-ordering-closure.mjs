#!/usr/bin/env node
/**
 * RC1 lab ordering modes closure — live mode probes with --apply.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const r = spawnSync("node", [resolve(root, "scripts", "verify-lab-ordering-flow.mjs"), "--apply"], {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit",
});

process.exit(r.status ?? 1);
