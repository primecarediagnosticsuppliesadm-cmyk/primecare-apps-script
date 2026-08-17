#!/usr/bin/env node
/**
 * Assert currently linked Supabase project matches expected PrimeCare env.
 *
 * Usage:
 *   node scripts/assert-supabase-environment.mjs            # print linked env
 *   node scripts/assert-supabase-environment.mjs --expect=qa
 *   node scripts/assert-supabase-environment.mjs --expect=prod
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  formatEnvBanner,
  resolveKnownEnv,
  PRIMECARE_PROJECT_REF_BY_ENV,
} from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readLinkedProjectRef() {
  const candidates = [
    resolve(root, "supabase/.temp/project-ref"),
    resolve(root, "../supabase/.temp/project-ref"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8").trim();
    const ref = raw.replace(/[^a-z0-9]/gi, "");
    if (ref.length >= 10) return ref;
  }

  const listed = spawnSync("supabase", ["projects", "list", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Fallback: parse `supabase status` is local-only; prefer dry-run env dump.
  const dry = spawnSync("supabase", ["db", "dump", "--linked", "--dry-run"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = `${dry.stdout || ""}\n${dry.stderr || ""}`;
  const m = out.match(/cli_login_postgres\.([a-z0-9]+)/i) || out.match(/project-ref[=:\s]+([a-z0-9]+)/i);
  if (m?.[1]) return m[1];
  if (listed.status === 0 && listed.stdout) {
    // no linked indicator in list; ignore
  }
  return null;
}

function parseExpect() {
  const arg = process.argv.find((a) => a.startsWith("--expect="));
  if (!arg) return null;
  return String(arg.slice("--expect=".length)).trim().toLowerCase();
}

const linkedRef = readLinkedProjectRef();
if (!linkedRef) {
  console.error("FAIL  could not determine linked Supabase project ref");
  console.error("       Run: supabase link --project-ref <qa|prod-ref>");
  process.exit(1);
}

const known = resolveKnownEnv(linkedRef);
console.log(formatEnvBanner(known, linkedRef));

if (!known) {
  console.error(`FAIL  unknown project ref: ${linkedRef}`);
  console.error("       Expected QA zipuzmfkwwucbchlphcj or PRODUCTION alxhrnotnvwpblsiadxj");
  process.exit(1);
}

const expect = parseExpect();
if (expect) {
  const expectedRef = PRIMECARE_PROJECT_REF_BY_ENV[expect];
  if (!expectedRef) {
    console.error(`FAIL  invalid --expect=${expect} (use qa|prod)`);
    process.exit(1);
  }
  if (linkedRef !== expectedRef) {
    console.error(`FAIL  linked ${known.env} (${linkedRef}) but expected ${expect} (${expectedRef})`);
    process.exit(1);
  }
  console.log(`PASS  linked environment matches --expect=${expect}`);
}

process.exit(0);
