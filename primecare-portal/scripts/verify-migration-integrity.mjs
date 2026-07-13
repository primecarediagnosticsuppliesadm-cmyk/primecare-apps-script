#!/usr/bin/env node
/**
 * Sprint 3A migration integrity — inventory, duplicate detection, manifest generation.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlDir = resolve(root, "supabase/sql");
const migDir = resolve(root, "supabase/migrations");
const manifestJson = resolve(root, "docs/operations/Sprint3A_Migration_Manifest.json");
const manifestMd = resolve(root, "docs/operations/Sprint3A_Migration_Manifest.md");
const remediationMd = resolve(root, "docs/operations/Sprint3A_Migration_Remediation_Plan.md");

function listSql(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => resolve(dir, f))
    .sort();
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

function normalizeName(file) {
  return basename(file).replace(/^\d+_/, "").replace(/_migration\.sql$/, ".sql");
}

function main() {
  console.log("\n=== Migration integrity (Sprint 3A) ===\n");

  const trackA = listSql(sqlDir);
  const trackB = listSql(migDir);
  const trackANames = new Map(trackA.map((p) => [normalizeName(p), p]));
  const trackBNames = new Map(trackB.map((p) => [basename(p), p]));

  const duplicates = [];
  for (const [norm, pathA] of trackANames) {
    for (const [nameB, pathB] of trackBNames) {
      if (nameB.includes(norm.replace(".sql", "")) || norm.includes(nameB.replace(/^\d+_/, ""))) {
        duplicates.push({ trackA: relative(root, pathA), trackB: relative(root, pathB), norm });
      }
    }
  }

  const manifestOnly = trackA.filter((p) => {
    const norm = normalizeName(p);
    return ![...trackBNames.keys()].some((b) => b.includes(norm.replace(".sql", "")));
  });

  const migrationsOnly = trackB.map((p) => relative(root, p));

  const inventory = {
    generated_at: new Date().toISOString(),
    track_a_sql_count: trackA.length,
    track_b_migrations_count: trackB.length,
    duplicate_pairs: duplicates.length,
    manifest_only_count: manifestOnly.length,
    files: {
      track_a: trackA.map((p) => ({
        path: relative(root, p),
        sha256_16: hashFile(p),
        size_bytes: statSync(p).size,
      })),
      track_b: trackB.map((p) => ({
        path: relative(root, p),
        sha256_16: hashFile(p),
        size_bytes: statSync(p).size,
      })),
    },
    duplicate_candidates: duplicates.slice(0, 50),
    manifest_only_paths: manifestOnly.map((p) => relative(root, p)),
  };

  writeFileSync(manifestJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const md = `# Sprint 3A Migration Manifest

Generated: ${inventory.generated_at}

| Track | Count | Path |
|-------|------:|------|
| A — manual \`supabase/sql/\` | ${trackA.length} | Track A per HQ_SQL_MIGRATION_MANIFEST.md |
| B — CLI \`supabase/migrations/\` | ${trackB.length} | \`supabase db push\` |

## Duplicate / overlap candidates

${duplicates.length ? duplicates.map((d) => `- **${d.norm}**: \`${d.trackA}\` ↔ \`${d.trackB}\``).join("\n") : "_None detected by filename heuristic._"}

## SQL-only (not in migrations/)

${manifestOnly.length ? manifestOnly.map((p) => `- \`${relative(root, p)}\``).join("\n") : "_None._"}

## Migrations track B

${migrationsOnly.map((p) => `- \`${p}\``).join("\n")}

## Machine-readable

See \`Sprint3A_Migration_Manifest.json\`.
`;

  const remediation = `# Sprint 3A Migration Remediation Plan

**Status:** Plan only — legacy SQL not deleted (WS3 gate).

## P0 — Before Production cutover

1. **Pick one deploy track per environment** — Track A (manual manifest) or Track B (CLI migrations); never both for same objects (GAP-BP-001 / TD-007).
2. **Consolidate projection SQL** — Ensure Sprint 3A migration \`20260702170000_sprint3a_production_safety_hardening.sql\` applied after Phase 2 migrations.
3. **Verify** — \`node scripts/verify-migration-integrity.mjs\` on every release candidate.

## P1 — Next sprint

4. Generate unified migration chain from Track A manifest (automated squash — do not hand-merge without review).
5. Mark orphan \`supabase/sql/\` files as DIAGNOSTIC or ARCHIVE in HQ_SQL_MIGRATION_MANIFEST.md.
6. Add CI gate: migration manifest drift fails PR when new SQL lacks registry entry.

## P2 — Future

7. Retire Track A manual apply after Track B parity proven on staging + prod.
8. Enable Supabase PITR on production project.

## Do NOT (this sprint)

- Delete \`supabase/sql/**\` files
- Auto-apply orphan SQL without manifest classification
`;

  writeFileSync(manifestMd, md, "utf8");
  writeFileSync(remediationMd, remediation, "utf8");

  console.log(`PASS  inventory — track A=${trackA.length} track B=${trackB.length}`);
  console.log(`PASS  duplicates — ${duplicates.length} candidate pairs`);
  console.log(`PASS  manifest.json — ${manifestJson}`);
  console.log(`PASS  manifest.md — ${manifestMd}`);
  console.log(`PASS  remediation — ${remediationMd}`);
}

main();
