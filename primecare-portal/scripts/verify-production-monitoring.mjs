#!/usr/bin/env node
/**
 * RC-2 production monitoring certification — runs automated health probes.
 * Exit 0 = all probes PASS/WARN acceptable; exit 1 = any FAIL.
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PROBES = [
  { id: "MON-09", label: "Bounded Reads", script: "verify-bounded-reads.mjs" },
  { id: "MON-10", label: "Golden Path", script: "verify-primecare-production-golden-path.mjs" },
  { id: "MON-11", label: "Financial Reconciliation", script: "verify-financial-reconciliation.mjs" },
  { id: "MON-11b", label: "Inventory Reconciliation", script: "verify-inventory-reconciliation.mjs" },
  { id: "MON-11c", label: "Transaction Integrity RPCs", script: "verify-transaction-integrity-rpcs.mjs" },
  { id: "MON-12", label: "Pilot Hardening SQL", script: "verify-pilot-hardening-sql.mjs" },
  { id: "MON-13", label: "HQ RLS Reads", script: "verify-hq-rls-reads.mjs" },
  { id: "MON-14", label: "Performance Certification", script: "run-hq-performance-certification.mjs", env: { PERF_SKIP_SEED: "1" } },
  { id: "MON-15", label: "Predator Validation", script: "run-hq-predator-certification.mjs" },
];

const results = [];

function runProbe(probe) {
  const scriptPath = resolve(root, "scripts", probe.script);
  if (!existsSync(scriptPath)) {
    results.push({ id: probe.id, status: "FAIL", detail: `Missing script ${probe.script}` });
    return;
  }
  const env = { ...process.env, ...(probe.env || {}) };
  const out = spawnSync("node", [scriptPath], { cwd: root, env, encoding: "utf8", stdio: "pipe" });
  const combined = `${out.stdout || ""}\n${out.stderr || ""}`.trim();
  if (out.status === 0) {
    results.push({ id: probe.id, status: "PASS", detail: `${probe.label} OK` });
  } else {
    const tail = combined.split("\n").slice(-6).join(" | ");
    results.push({ id: probe.id, status: "FAIL", detail: `${probe.label}: ${tail || `exit ${out.status}`}` });
  }
}

function checkMonitoringDocs() {
  const docs = [
    "docs/operations/HQ_MONITORING_PLAN.md",
    "docs/operations/HQ_ALERTING_RUNBOOK.md",
    "docs/operations/HQ_BACKUP_RECOVERY_RUNBOOK.md",
  ];
  const missing = docs.filter((d) => !existsSync(resolve(root, d)));
  if (missing.length) {
    results.push({ id: "MON-20", status: "FAIL", detail: `Missing ops docs: ${missing.join(", ")}` });
    return;
  }
  const plan = readFileSync(resolve(root, docs[0]), "utf8");
  const hasMatrix = /alert matrix|monitor matrix|probe/i.test(plan);
  results.push({
    id: "MON-20",
    status: hasMatrix ? "PASS" : "WARN",
    detail: hasMatrix ? "Monitoring plan documented" : "Monitoring plan exists; expand probe matrix",
  });
}

function main() {
  for (const probe of PROBES) runProbe(probe);
  checkMonitoringDocs();

  console.log("\n=== PrimeCare Production Monitoring Certification ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(`\nSummary: PASS=${results.filter((r) => r.status === "PASS").length} WARN=${results.filter((r) => r.status === "WARN").length} FAIL=${fails.length}`);
  if (fails.length) process.exit(1);
}

main();
