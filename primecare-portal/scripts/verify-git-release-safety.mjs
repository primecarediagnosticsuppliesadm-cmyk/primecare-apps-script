#!/usr/bin/env node
/**
 * Pre-release Git safety checks (read-only).
 *
 * Detects MERGE_HEAD, conflicts, dirty tracked files, critical untracked migrations,
 * branch, and origin divergence. Backup dumps under backups/ are allowlisted.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const repoRoot = resolve(root, "..");

let failures = 0;
let warnings = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function warn(id, msg) {
  console.warn(`WARN  ${id}: ${msg}`);
  warnings += 1;
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}

function git(args, cwd = repoRoot) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: r.status ?? 1,
    out: (r.stdout || "").trim(),
    err: (r.stderr || "").trim(),
  };
}

console.log("\n=== GIT RELEASE SAFETY ===\n");

const branch = git(["branch", "--show-current"]);
pass("branch", branch.out || "(detached)");

if (existsSync(resolve(repoRoot, ".git/MERGE_HEAD"))) {
  fail("merge", "unresolved merge in progress (MERGE_HEAD present)");
} else pass("merge", "no MERGE_HEAD");

const unmerged = git(["diff", "--name-only", "--diff-filter=U"]);
if (unmerged.out) fail("conflicts", `unmerged files:\n${unmerged.out}`);
else pass("conflicts", "no unmerged paths");

const status = git(["status", "--porcelain"]);
const lines = status.out ? status.out.split("\n") : [];
const allowUntracked = (p) =>
  p.startsWith("primecare-portal/backups/") ||
  p.startsWith("backups/") ||
  p.endsWith(".dump") ||
  p.includes("production_backup") ||
  p.startsWith("supabase/.temp/");

const dirtyTracked = lines.filter((l) => !l.startsWith("??") && l.trim());
const untracked = lines
  .filter((l) => l.startsWith("??"))
  .map((l) => l.replace(/^\?\?\s+/, ""));

const allowDirty = String(process.env.CERTIFY_ALLOW_DIRTY || "").trim() === "1";

if (dirtyTracked.length) {
  if (allowDirty) {
    warn("dirty", `tracked changes present (${dirtyTracked.length}) — allowed by CERTIFY_ALLOW_DIRTY=1`);
  } else {
    fail("dirty", `tracked changes present (${dirtyTracked.length}). Commit or stash before release.`);
    dirtyTracked.slice(0, 20).forEach((l) => console.error(`  ${l}`));
  }
} else pass("dirty", "no dirty tracked files");

const criticalUntracked = untracked.filter(
  (p) =>
    !allowUntracked(p) &&
    (p.includes("supabase/migrations/") || /notification_.*\.sql$/.test(p) || /_parity\.sql$/.test(p))
);
if (criticalUntracked.length) {
  fail(
    "untracked_migrations",
    `critical untracked SQL/migrations:\n${criticalUntracked.map((p) => `  ${p}`).join("\n")}`
  );
} else pass("untracked_migrations", "no critical untracked migration files");

const benign = untracked.filter((p) => allowUntracked(p));
if (benign.length) warn("untracked_allowlisted", `${benign.length} allowlisted backup/temp paths`);

const upstream = git(["rev-parse", "--abbrev-ref", "@{upstream}"]);
if (upstream.status !== 0) {
  warn("upstream", "no upstream tracking branch");
} else {
  const behind = git(["rev-list", "--count", "HEAD..@{upstream}"]);
  const ahead = git(["rev-list", "--count", "@{upstream}..HEAD"]);
  pass("upstream", `${upstream.out} ahead=${ahead.out || 0} behind=${behind.out || 0}`);
  if (Number(behind.out || 0) > 0) {
    warn("behind", "local branch is behind origin — pull/rebase before promote");
  }
}

console.log(
  failures
    ? `\nGIT SAFETY: BLOCKED (${failures} fail, ${warnings} warn)\n`
    : `\nGIT SAFETY: PASS (${warnings} warn)\n`
);
process.exit(failures ? 1 : 0);
