#!/usr/bin/env node
/**
 * Deployment commit verification helpers (no secrets).
 *
 * Usage:
 *   node scripts/verify-deploy-commit.mjs
 *   node scripts/verify-deploy-commit.mjs --expect-branch=qa
 *   node scripts/verify-deploy-commit.mjs --expect-ref=origin/main
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const repoRoot = resolve(root, "..");

function git(args) {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return (r.stdout || "").trim();
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

const head = git(["rev-parse", "HEAD"]);
const short = head.slice(0, 12);
const branch = git(["branch", "--show-current"]);
const originQa = git(["rev-parse", "origin/qa"]);
const originMain = git(["rev-parse", "origin/main"]);

console.log("\n=== DEPLOY COMMIT IDENTITY ===\n");
console.log(`LOCAL_HEAD          ${short}`);
console.log(`LOCAL_BRANCH        ${branch || "(detached)"}`);
console.log(`ORIGIN_QA           ${(originQa || "").slice(0, 12) || "missing"}`);
console.log(`ORIGIN_MAIN         ${(originMain || "").slice(0, 12) || "missing"}`);

// Vite injects VITE_APP_COMMIT_HASH at build time — document expected wiring.
const vite = readFileSync(resolve(root, "vite.config.js"), "utf8");
const stamp = readFileSync(resolve(root, "src/utils/buildStamp.js"), "utf8");
let failures = 0;
if (/VITE_APP_COMMIT_HASH/.test(vite) && /getAppBuildStamp/.test(stamp)) {
  console.log("PASS  build stamp wiring present (VITE_APP_COMMIT_HASH + getAppBuildStamp)");
} else {
  console.error("FAIL  build stamp wiring incomplete");
  failures += 1;
}

const expectBranch = arg("--expect-branch");
if (expectBranch && branch !== expectBranch) {
  console.error(`FAIL  branch is ${branch}, expected ${expectBranch}`);
  failures += 1;
}

const expectRef = arg("--expect-ref");
if (expectRef) {
  const target = git(["rev-parse", expectRef]);
  if (!target) {
    console.error(`FAIL  cannot resolve ${expectRef}`);
    failures += 1;
  } else if (target !== head) {
    console.error(
      `FAIL  HEAD ${short} does not match ${expectRef} ${target.slice(0, 12)}`
    );
    failures += 1;
  } else {
    console.log(`PASS  HEAD matches ${expectRef}`);
  }
}

console.log(
  "\nBrowser check: open https://app.primecarediagnostics.in (Production) or the QA host."
);
console.log(
  "Compare Operations Center build identity (Daily view) or window.__PRIMECARE_BUILD__.commit to ORIGIN_QA / ORIGIN_MAIN."
);
console.log("Do not UAT Production on an old *.vercel.app URL.\n");
process.exit(failures ? 1 : 0);
