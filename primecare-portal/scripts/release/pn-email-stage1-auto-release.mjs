#!/usr/bin/env node
/**
 * PN-EMAIL Stage 1 Production auto-release runner.
 *
 * Default: --dry-run (identity, backup, hashes, live read, static verifiers).
 * Never uses `supabase db push`, never --linked, never backups restore, never PITR.
 *
 * Execute mode (later enablement only) requires ALL of:
 *   --execute-prod
 *   PRIMECARE_CONFIRM_PROD=YES
 *   APPLY_PN_EMAIL_STAGE1=YES
 *   PN_EMAIL_STAGE1_ALLOW_EXECUTE=true
 * and must NOT have PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN=true.
 *
 * This commit's GitHub workflow always forces dry-run.
 * pull_request events can never unlock execute, even if env/argv are tampered with.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BACKUP_MAX_AGE_MS,
  CANDIDATE_BRANCH,
  CANONICAL_HOST,
  DISPATCH_FUNCTION,
  DRY_RUN_SECRET_NAMES,
  EXECUTE_SECRET_NAMES,
  EXPECTED_CANDIDATE_SHA,
  HOLD_BACKUP,
  HOLD_PREFIX,
  MAIN_BRANCH,
  MIGRATION_ALLOWLIST,
  MIGRATION_REL_PREFIX,
  PN_EMAIL_CANDIDATE_SHA,
  PRE_RELEASE_PRODUCT_BASELINE_SHA,
  PROD_PROJECT_REF,
  PRODUCT_DRIFT,
  QA_PROJECT_REF,
  READY_BANNER,
  STAGE1_EMAIL_SECRETS,
} from "./pnEmailStage1Constants.mjs";
import { classifyGitRange } from "./pnEmailMainDrift.mjs";
import { ciForceDryRun, isExecuteUnlocked, isPullRequestEvent } from "./pnEmailExecuteGuard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(__dirname, "../..");
const repoRoot = resolve(portalRoot, "..");
const LIVE_PROBE = resolve(__dirname, "sql/pn_email_stage1_live_probe.sql");
const FUNCTION_FILES = [
  "primecare-portal/supabase/functions/dispatch-notification-email/index.ts",
  "primecare-portal/supabase/functions/dispatch-notification-email/policy.js",
];
const COMMIT_PREFIX = EXPECTED_CANDIDATE_SHA.slice(0, 12);
const DISPATCH_URL = `https://${PROD_PROJECT_REF}.supabase.co/functions/v1/${DISPATCH_FUNCTION}`;
const AUTH_HEALTH_URL = `https://${PROD_PROJECT_REF}.supabase.co/auth/v1/health`;

const STATIC_VERIFIERS = [
  ["verify-notification-contract", "scripts/verify-notification-contract.mjs"],
  ["verify-prospect-email-1b1", "scripts/verify-prospect-email-1b1.mjs"],
  ["verify-prospect-email-1b2", "scripts/verify-prospect-email-1b2.mjs"],
  ["verify-agent-prospect-2a", "scripts/verify-agent-prospect-2a.mjs"],
  ["verify-agent-prospect-2b", "scripts/verify-agent-prospect-2b.mjs"],
  ["verify-agent-prospect-2c", "scripts/verify-agent-prospect-2c.mjs"],
  ["verify-agent-prospect-2e", "scripts/verify-agent-prospect-2e.mjs"],
  ["verify-lab-ordering-1a", "scripts/verify-lab-ordering-1a-security.mjs"],
  ["verify-lab-ordering-1b", "scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs"],
  ["verify-lab-ordering-1c", "scripts/verify-lab-ordering-1c-hq-order-search.mjs"],
  ["verify-lab-ordering-1f", "scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs"],
  ["verify-lab-ordering-1h", "scripts/verify-lab-ordering-1h-ar-and-projection.mjs"],
  ["verify-flow-3a", "scripts/verify-flow-3a.mjs"],
];

const CREATE_PROSPECT_SIG = "p_lab_name text, p_owner_name text, p_phone text, p_area text";
const ACTIVATE_PROSPECT_SIG = "p_lab_id text, p_initial_agent_id text";
const PN1B1_QUEUE_COLS = [
  "attempt_count",
  "error_code",
  "error_summary",
  "failed_at",
  "last_attempt_at",
  "next_attempt_at",
  "provider",
  "recipient_email",
  "recipient_user_id",
  "sent_at",
];
const PN1B1_INDEXES = [
  "idx_notification_delivery_log_email_dispatch",
  "notification_delivery_log_email_null_recipient_uidx",
  "notification_delivery_log_email_recipient_uidx",
];

const report = {
  mode: "DRY_RUN",
  gates: [],
  completed: [],
  backup: null,
  migrations: [],
  secretsPresent: [],
  mainUnchanged: null,
  mainClass: null,
  edge: null,
  vercel: null,
  dispatcher: null,
  dbMigrated: false,
  appPromoted: false,
  recovery: null,
};
let holdReason = null;
let supabaseCmd = null;

function log(msg) {
  console.log(msg);
}
function gate(id, status, detail) {
  const row = { id, status, detail };
  report.gates.push(row);
  log(`${status.padEnd(4)}  ${id}: ${detail}`);
  return status === "PASS";
}
function hold(reason) {
  holdReason = reason.startsWith("PN-EMAIL") ? reason : `${HOLD_PREFIX}${reason}`;
  log(`\n${holdReason}`);
}
function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function normalizeSig(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeout || 120000,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error,
  };
}
function git(args, opts = {}) {
  return run("git", args, { cwd: opts.cwd || repoRoot, timeout: opts.timeout });
}
function resolveSupabaseCmd() {
  if (supabaseCmd) return supabaseCmd;
  const direct = run("supabase", ["--version"], { cwd: portalRoot, timeout: 15000 });
  supabaseCmd = direct.status === 0 ? ["supabase"] : ["npx", "--yes", "supabase"];
  return supabaseCmd;
}
function supabase(args, opts = {}) {
  const joined = args.join(" ").toLowerCase();
  if (args.includes("--linked") || joined.includes("db push") || joined.includes("backups restore") || joined.includes("pitr")) {
    hold("refused forbidden supabase invocation");
    return { status: 2, stdout: "", stderr: "forbidden supabase invocation" };
  }
  if (args.includes("--project-ref")) {
    const idx = args.indexOf("--project-ref");
    const ref = args[idx + 1] || "";
    if (ref === QA_PROJECT_REF) {
      hold("refused QA project-ref on supabase command");
      return { status: 2, stdout: "", stderr: "qa project refused" };
    }
    if (ref && ref !== PROD_PROJECT_REF) {
      hold(`refused unexpected project-ref ${ref}`);
      return { status: 2, stdout: "", stderr: "unexpected project-ref" };
    }
  }
  const bin = resolveSupabaseCmd();
  const r = spawnSync(bin[0], [...bin.slice(1), ...args], {
    cwd: opts.cwd || portalRoot,
    encoding: "utf8",
    env: process.env,
    timeout: opts.timeout || 180000,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}
function denyDangerousArgv() {
  const joined = process.argv.join(" ").toLowerCase();
  const banned = ["db push", "db-push", "backups restore", "migration up", "pitr"];
  for (const b of banned) {
    if (joined.includes(b)) {
      hold(`forbidden argument pattern: ${b}`);
      return false;
    }
  }
  return true;
}
function parseMode() {
  if (isPullRequestEvent()) {
    return { dryRun: true, refusedExecute: process.argv.includes("--execute-prod") };
  }
  if (process.argv.includes("--execute-prod")) {
    if (!isExecuteUnlocked()) {
      return { dryRun: true, refusedExecute: true };
    }
    return { dryRun: false, refusedExecute: false };
  }
  return { dryRun: true, refusedExecute: false };
}
function prodDbUrl() {
  return String(process.env.PROD_SUPABASE_DB_URL || "").trim();
}
function dbUrlIsProduction(url) {
  return Boolean(url) && url.includes(PROD_PROJECT_REF) && !url.includes(QA_PROJECT_REF);
}

function fetchOrigins() {
  const r = git(["fetch", "origin", CANDIDATE_BRANCH, MAIN_BRANCH]);
  if (r.status !== 0) {
    gate("git.fetch", "HOLD", (r.stderr || r.stdout).trim().slice(0, 300) || "git fetch failed");
    return false;
  }
  return gate("git.fetch", "PASS", `origin/${CANDIDATE_BRANCH} and origin/${MAIN_BRANCH}`);
}
function revParse(ref) {
  const r = git(["rev-parse", ref]);
  return r.status === 0 ? r.stdout.trim() : "";
}
function classifyCurrentMain() {
  return classifyGitRange((args) => git(args), {
    baselineSha: PRE_RELEASE_PRODUCT_BASELINE_SHA,
    mainRef: `origin/${MAIN_BRANCH}`,
  });
}
function verifyImmutableShas() {
  const candidate = revParse(`origin/${CANDIDATE_BRANCH}`);
  const main = revParse(`origin/${MAIN_BRANCH}`);
  let ok = true;
  if (candidate !== PN_EMAIL_CANDIDATE_SHA) {
    gate(
      "sha.candidate",
      "HOLD",
      `origin/${CANDIDATE_BRANCH}=${candidate || "missing"} expected ${PN_EMAIL_CANDIDATE_SHA}`
    );
    ok = false;
  } else {
    gate("sha.candidate", "PASS", candidate);
  }
  const ancestor = git(["merge-base", "--is-ancestor", PRE_RELEASE_PRODUCT_BASELINE_SHA, `origin/${CANDIDATE_BRANCH}`]);
  if (ancestor.status !== 0) {
    gate(
      "sha.candidate_ancestry",
      "HOLD",
      `candidate is not based on product baseline ${PRE_RELEASE_PRODUCT_BASELINE_SHA}`
    );
    ok = false;
  } else {
    gate("sha.candidate_ancestry", "PASS", `baseline ${PRE_RELEASE_PRODUCT_BASELINE_SHA} is ancestor of candidate`);
  }
  const classified = classifyCurrentMain();
  report.mainClass = classified.class;
  report.mainUnchanged = main === PRE_RELEASE_PRODUCT_BASELINE_SHA;
  if (classified.files.length) {
    log("main changed files vs product baseline:");
    for (const file of classified.files) log(`  ${file}`);
  }
  if (classified.class === PRODUCT_DRIFT) {
    gate(
      "sha.main",
      "HOLD",
      `PRODUCT_DRIFT vs ${PRE_RELEASE_PRODUCT_BASELINE_SHA}: ${classified.disallowed.join(", ") || "unknown"}`
    );
    ok = false;
  } else {
    gate(
      "sha.main",
      "PASS",
      classified.files.length
        ? `AUTOMATION_ONLY on ${main}`
        : `origin/main=${main} equals product baseline`
    );
  }
  return ok;
}
function verifyProductionIdentity() {
  if (PROD_PROJECT_REF === QA_PROJECT_REF) {
    gate("identity.refs", "HOLD", "Production and QA refs must differ");
    return false;
  }
  const url = prodDbUrl();
  if (url && url.includes(QA_PROJECT_REF)) {
    gate("identity.db_url", "HOLD", "PROD_SUPABASE_DB_URL contains QA project ref");
    return false;
  }
  if (url && !dbUrlIsProduction(url)) {
    gate("identity.db_url", "HOLD", "PROD_SUPABASE_DB_URL does not name Production project");
    return false;
  }
  if (url) gate("identity.db_url", "PASS", "Production ref present in DB URL (value not printed)");
  else gate("identity.db_url", "HOLD", "PROD_SUPABASE_DB_URL unset — live SQL probe skipped");
  gate("identity.supabase", "PASS", `Production ${PROD_PROJECT_REF}`);
  gate("identity.host", "PASS", CANONICAL_HOST);
  gate("identity.qa_rejected", "PASS", `QA ${QA_PROJECT_REF} must not be a mutation target`);
  return true;
}
function parseJsonBlob(raw) {
  const start = String(raw).search(/[\[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(String(raw).slice(start));
  } catch {
    return null;
  }
}
function inspectBackup() {
  const r = supabase(["backups", "list", "--project-ref", PROD_PROJECT_REF, "-o", "json"]);
  if (r.status !== 0) {
    gate("backup.list", "HOLD", (r.stderr || r.stdout).trim().slice(0, 240) || "backups list failed");
    return { ok: false };
  }
  const payload = parseJsonBlob(`${r.stdout}\n${r.stderr}`);
  if (!payload?.backups) {
    gate("backup.list", "HOLD", "could not parse backups JSON");
    return { ok: false };
  }
  const latest = [...payload.backups].sort((a, b) => Date.parse(b.inserted_at) - Date.parse(a.inserted_at))[0];
  if (!latest) {
    gate("backup.latest", "HOLD", "no backups returned");
    return { ok: false };
  }
  const inserted = Date.parse(latest.inserted_at);
  const now = Date.now();
  const ageMs = now - inserted;
  const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const physical = latest.is_physical_backup === true;
  const completed = String(latest.status || "").toUpperCase() === "COMPLETED";
  const sameDay = utcDay(inserted) === utcDay(now);
  const fresh = ageMs <= BACKUP_MAX_AGE_MS && ageMs >= 0;
  report.backup = {
    id: latest.id,
    inserted_at: latest.inserted_at,
    status: latest.status,
    is_physical_backup: latest.is_physical_backup,
    age_minutes: Math.round(ageMs / 60000),
    same_utc_day: sameDay,
    pitr_enabled: payload.pitr_enabled === true,
  };
  if (payload.pitr_enabled === true) {
    gate("backup.pitr", "HOLD", "PITR is enabled; Stage 1 policy does not use PITR restore");
  } else {
    gate("backup.pitr", "PASS", "PITR disabled (inspect only; no restore)");
  }
  const ok = physical && completed && sameDay && fresh;
  const detail = `id=${latest.id} status=${latest.status} physical=${physical} day=${utcDay(inserted)} age_min=${Math.round(ageMs / 60000)}`;
  gate("backup.freshness", ok ? "PASS" : "HOLD", detail);
  return { ok, latest };
}
function gitShow(rel) {
  return git(["show", `${EXPECTED_CANDIDATE_SHA}:${rel}`]);
}
function verifyMigrationHashes() {
  let ok = true;
  for (const file of MIGRATION_ALLOWLIST) {
    const rel = `${MIGRATION_REL_PREFIX}${file}`;
    const shown = gitShow(rel);
    if (shown.status !== 0) {
      gate(`hash.${file}`, "HOLD", `missing at candidate SHA ${rel}`);
      ok = false;
      continue;
    }
    const candidateHash = sha256Text(shown.stdout);
    const diskPath = resolve(repoRoot, rel);
    if (!existsSync(diskPath)) {
      gate(`hash.${file}`, "HOLD", "file missing on disk");
      ok = false;
      continue;
    }
    const diskHash = sha256Text(readFileSync(diskPath, "utf8"));
    if (diskHash !== candidateHash) {
      gate(`hash.${file}`, "HOLD", "working tree differs from candidate SHA");
      ok = false;
      continue;
    }
    report.migrations.push({ file, sha256: candidateHash, version: file.slice(0, 14) });
    gate(`hash.${file}`, "PASS", candidateHash.slice(0, 12));
  }
  return ok;
}
function functionSourceHash() {
  const parts = [];
  for (const rel of FUNCTION_FILES) {
    const shown = gitShow(rel);
    if (shown.status !== 0) return null;
    parts.push(`${rel}:${sha256Text(shown.stdout)}`);
  }
  return sha256Text(parts.join("\n"));
}
function grantRoles(grants) {
  if (Array.isArray(grants)) return grants.map((g) => String(g.grantee || ""));
  return Object.keys(grants || {});
}
function classifyLiveProbe(probe) {
  const ledger = Array.isArray(probe.ledger) ? probe.ledger.map((r) => r.version) : [];
  const results = [];
  function need(id, ok, detail) {
    results.push({ id, ok: Boolean(ok), detail: detail || "" });
  }
  const a = probe.pn1a || {};
  need("pn1a.emit", a.emit_fn, "emit_prospect_in_app_notification");
  need("pn1a.index", a.unique_index, "notification_events_prospect_lifecycle_uidx");
  need("pn1a.server_only", a.server_only_fn && a.server_only_trg, "server-only fn+trigger");
  need(
    "pn1a.create_sig",
    normalizeSig(a.create_prospect_sig) === normalizeSig(CREATE_PROSPECT_SIG),
    a.create_prospect_sig || "missing"
  );
  need(
    "pn1a.activate_sig",
    normalizeSig(a.activate_prospect_sig) === normalizeSig(ACTIVATE_PROSPECT_SIG),
    a.activate_prospect_sig || "missing"
  );
  need("pn1a.create_hook", a.create_hook, "create_prospect_lab emit hook");
  need("pn1a.activate_hook", a.activate_hook, "activate_prospect_lab emit hook");
  const b1 = probe.pn1b1 || {};
  const cols = Array.isArray(b1.queue_columns) ? [...b1.queue_columns].sort() : [];
  need("pn1b1.columns", PN1B1_QUEUE_COLS.every((c) => cols.includes(c)), cols.join(","));
  const idx = Array.isArray(b1.email_indexes) ? b1.email_indexes : [];
  need("pn1b1.indexes", PN1B1_INDEXES.every((i) => idx.includes(i)), idx.join(","));
  need("pn1b1.enqueue", b1.enqueue_fn, "enqueue_prospect_email_deliveries");
  need("pn1b1.trigger", b1.after_insert_trg, "notification_events_enqueue_prospect_email_trg");
  need("pn1b1.write_guard", b1.email_write_guard_fn, "notification_delivery_log_email_server_only");
  need("pn1b1.channel_email", b1.channel_allows_email, "channel check allows email");
  need("pn1b1.status_queue", b1.status_allows_queued, "status check allows queued/processing/sent/failed/skipped");
  const b2 = probe.pn1b2 || {};
  need("pn1b2.provider_recipient", b2.provider_recipient, "provider_recipient column");
  need("pn1b2.claim", b2.claim_fn, "claim_notification_email_deliveries");
  need("pn1b2.finalize", b2.finalize_fn, "finalize_notification_email_delivery");
  const claimRoles = grantRoles(b2.claim_grants);
  const finRoles = grantRoles(b2.finalize_grants);
  const serviceOk =
    claimRoles.some((g) => /service_role/i.test(g)) && finRoles.some((g) => /service_role/i.test(g));
  const authDenied =
    !claimRoles.some((g) => /^(authenticated|anon)$/i.test(g)) &&
    !finRoles.some((g) => /^(authenticated|anon)$/i.test(g));
  need("pn1b2.grants", serviceOk && authDenied, `claim=${JSON.stringify(b2.claim_grants)}`);

  const bySlice = {
    pn1a: results.filter((r) => r.id.startsWith("pn1a")),
    pn1b1: results.filter((r) => r.id.startsWith("pn1b1")),
    pn1b2: results.filter((r) => r.id.startsWith("pn1b2")),
  };
  function sliceState(slice, version) {
    const rows = bySlice[slice];
    const all = rows.every((r) => r.ok);
    const none = rows.every((r) => !r.ok);
    const inLedger = ledger.includes(version);
    if (all && inLedger) return "already_correct";
    if (all && !inLedger) return "objects_present_ledger_missing";
    if (none && !inLedger) return "not_applied";
    return "partial_or_mismatch";
  }
  return {
    ledger,
    results,
    emailRowStats: b1.email_row_stats || null,
    states: {
      "20260912200000_pn1a_prospect_in_app_notifications.sql": sliceState("pn1a", "20260912200000"),
      "20260913010000_pn1b1_prospect_email_delivery_queue.sql": sliceState("pn1b1", "20260913010000"),
      "20260913020000_pn1b2_email_dispatch_claim.sql": sliceState("pn1b2", "20260913020000"),
    },
  };
}
function runLiveProbe() {
  const dbUrl = prodDbUrl();
  if (!dbUrl) return { ok: false, reason: "PROD_SUPABASE_DB_URL unset" };
  if (!dbUrlIsProduction(dbUrl)) return { ok: false, reason: "refused non-Production database URL" };
  const r = supabase(["db", "query", "--db-url", dbUrl, "-o", "json", "--file", LIVE_PROBE]);
  if (r.status !== 0) {
    return { ok: false, reason: (r.stderr || r.stdout).trim().slice(0, 300) || "db query failed" };
  }
  const payload = parseJsonBlob(`${r.stdout}\n${r.stderr}`);
  const probe = payload?.probe || payload?.[0]?.probe || payload;
  if (!probe?.pn1a) return { ok: false, reason: "unexpected probe payload" };
  return { ok: true, classified: classifyLiveProbe(probe), probe };
}
function liveStateRead() {
  const dbUrl = prodDbUrl();
  if (!dbUrl) {
    gate("live.probe", "HOLD", "PROD_SUPABASE_DB_URL unset; cannot classify applied vs missing");
    for (const file of MIGRATION_ALLOWLIST) {
      const row = report.migrations.find((m) => m.file === file);
      if (row) row.plan = "unknown_until_sql_credential";
    }
    return { ok: false, states: {} };
  }
  if (!dbUrlIsProduction(dbUrl)) {
    gate("live.probe", "HOLD", "refused QA or non-Production database URL");
    return { ok: false, states: {} };
  }
  const probed = runLiveProbe();
  if (!probed.ok) {
    gate("live.probe", "HOLD", probed.reason);
    return { ok: false, states: {} };
  }
  const classified = probed.classified;
  let mismatch = false;
  for (const [file, state] of Object.entries(classified.states)) {
    const row = report.migrations.find((m) => m.file === file);
    if (row) row.plan = state;
    const bad = state === "partial_or_mismatch" || state === "objects_present_ledger_missing";
    if (bad) mismatch = true;
    gate(`live.${file}`, bad ? "HOLD" : "PASS", state);
  }
  for (const row of classified.results) {
    gate(`live.obj.${row.id}`, row.ok ? "PASS" : "HOLD", row.detail || (row.ok ? "present" : "missing"));
  }
  return { ok: !mismatch, states: classified.states, classified };
}
function inspectEdgeReadOnly() {
  const listed = supabase(["functions", "list", "--project-ref", PROD_PROJECT_REF, "-o", "json"]);
  const payload = parseJsonBlob(`${listed.stdout}\n${listed.stderr}`) || {};
  const fns = payload.functions || [];
  const dispatch = fns.find((f) => f.slug === DISPATCH_FUNCTION);
  report.edge = {
    present: Boolean(dispatch),
    version: dispatch?.version ?? null,
    status: dispatch?.status ?? null,
    verify_jwt: dispatch?.verify_jwt,
    expected_source_hash: functionSourceHash(),
  };
  if (!dispatch) {
    gate("edge.present", "PASS", `${DISPATCH_FUNCTION} not deployed yet (expected pre-Stage-1)`);
  } else {
    gate(
      "edge.present",
      "HOLD",
      `already ACTIVE v${dispatch.version} verify_jwt=${dispatch.verify_jwt} — execute must reconcile hash`
    );
  }
  const secrets = supabase(["secrets", "list", "--project-ref", PROD_PROJECT_REF, "-o", "json"]);
  const secPayload = parseJsonBlob(`${secrets.stdout}\n${secrets.stderr}`) || {};
  const names = (secPayload.secrets || []).map((s) => s.name).filter(Boolean);
  report.secretsPresent = names.filter((n) => n.startsWith("EMAIL_") || n === "APP_ENV" || n === "APP_PUBLIC_URL");
  const emailEnabledNamed = names.includes("EMAIL_ENABLED");
  gate(
    "edge.email_enabled_secret",
    "PASS",
    emailEnabledNamed
      ? "EMAIL_ENABLED secret name exists (value not printed; execute must keep false)"
      : "EMAIL_ENABLED not set yet; execute would set false only"
  );
  const providerNamed = names.includes("EMAIL_PROVIDER_API_KEY");
  gate(
    "edge.provider_secret",
    "PASS",
    providerNamed
      ? "EMAIL_PROVIDER_API_KEY name present — Stage 1 must not copy QA value or enable sending"
      : "EMAIL_PROVIDER_API_KEY absent (Stage 1 does not require it)"
  );
  return true;
}
function curlHttp(url, opts = {}) {
  const args = ["-sS", "-o", opts.bodyFile || "/dev/null", "-w", "%{http_code}", "--max-time", "30"];
  if (opts.method) args.push("-X", opts.method);
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) args.push("-H", `${k}: ${v}`);
  }
  if (opts.body != null) args.push("-d", opts.body);
  if (opts.dumpBody) {
    args[1] = "-";
    args.splice(args.indexOf("-w"), 2);
  }
  return run("curl", [...args, url], { timeout: 45000 });
}
function runStaticVerifiers() {
  let ok = true;
  const driftTests = run("node", [resolve(__dirname, "pnEmailMainDrift.test.mjs")], {
    cwd: portalRoot,
    timeout: 30000,
  });
  if (driftTests.status !== 0) {
    gate("static.main_drift_tests", "HOLD", (driftTests.stderr || driftTests.stdout).trim().slice(-300));
    ok = false;
  } else {
    gate("static.main_drift_tests", "PASS", "pnEmailMainDrift.test.mjs");
    report.completed.push("static.main_drift_tests");
  }
  const build = run("npm", ["run", "build"], { cwd: portalRoot, timeout: 300000 });
  if (build.status !== 0) {
    gate("static.build", "HOLD", (build.stderr || build.stdout).trim().slice(-400));
    ok = false;
  } else {
    gate("static.build", "PASS", "npm run build");
    report.completed.push("static.build");
  }
  for (const [id, rel] of STATIC_VERIFIERS) {
    const r = run("node", [resolve(portalRoot, rel)], { cwd: portalRoot, timeout: 180000 });
    if (r.status !== 0) {
      gate(`static.${id}`, "HOLD", (r.stderr || r.stdout).trim().slice(-300));
      ok = false;
    } else {
      gate(`static.${id}`, "PASS", rel);
      report.completed.push(`static.${id}`);
    }
  }
  return ok;
}
function runTechnicalSmoke() {
  const homepage = curlHttp(CANONICAL_HOST);
  const code = homepage.stdout.trim();
  gate("smoke.homepage", code === "200" || code === "304" ? "PASS" : "HOLD", `${CANONICAL_HOST} HTTP ${code || "none"}`);
  const stamp = run("curl", ["-sS", "--max-time", "30", CANONICAL_HOST], { timeout: 45000 });
  const html = stamp.stdout || "";
  gate("smoke.html", /primecare|PrimeCare/i.test(html) ? "PASS" : "HOLD", "canonical HTML fetched");
  const auth = curlHttp(AUTH_HEALTH_URL);
  const authCode = auth.stdout.trim();
  // 401 without anon key still proves the Production Auth gateway is reachable.
  const authOk = authCode === "200" || authCode === "204" || authCode === "401";
  gate(
    "smoke.auth_health",
    authOk ? "PASS" : "HOLD",
    `Production auth health HTTP ${authCode || "none"}`
  );
  return true;
}
function printPlan(states) {
  log("\n--- migration plan (no apply in DRY_RUN) ---");
  for (const file of MIGRATION_ALLOWLIST) {
    const state = states[file] || "unknown";
    const action =
      state === "already_correct"
        ? "SKIP apply (already correctly applied)"
        : state === "not_applied"
          ? "APPLY exact file on execute"
          : state === "unknown_until_sql_credential" || state === "unknown"
            ? "HOLD apply until live probe"
            : "HOLD — do not apply";
    log(`  ${file}: ${state} → ${action}`);
  }
}
function refuseMutations() {
  log("\nDRY_RUN mutation lock: no migrations, no Edge deploy, no Vercel deploy, no secret writes, no main promotion.");
}
function confirmMainUnchanged() {
  const fetchMain = git(["fetch", "origin", MAIN_BRANCH]);
  if (fetchMain.status !== 0) {
    gate("main.unchanged", "HOLD", "could not re-fetch origin/main");
    return false;
  }
  const main = revParse(`origin/${MAIN_BRANCH}`);
  const classified = classifyCurrentMain();
  report.mainClass = classified.class;
  report.mainUnchanged = main === PRE_RELEASE_PRODUCT_BASELINE_SHA;
  if (classified.class === PRODUCT_DRIFT) {
    gate(
      "main.unchanged",
      "HOLD",
      `PRODUCT_DRIFT: ${classified.disallowed.join(", ")}`
    );
    return false;
  }
  return gate("main.unchanged", "PASS", `${classified.class} ${main}`);
}
function printFounderBanner() {
  log("\n========================================");
  if (holdReason) {
    log(holdReason);
  } else if (report.mode === "DRY_RUN") {
    log("PN-EMAIL STAGE 1 DRY_RUN COMPLETE — NO PRODUCTION MUTATION");
  } else {
    log(READY_BANNER);
  }
  log(`mode: ${report.mode}`);
  log(`candidate: ${PN_EMAIL_CANDIDATE_SHA}`);
  log(`product baseline: ${PRE_RELEASE_PRODUCT_BASELINE_SHA}`);
  log(`origin/main: ${revParse(`origin/${MAIN_BRANCH}`)} class=${report.mainClass || "n/a"}`);
  log(`main equals baseline: ${report.mainUnchanged === true ? "yes" : "no"}`);
  if (report.backup) {
    log(
      `backup: id=${report.backup.id} at=${report.backup.inserted_at} status=${report.backup.status} physical=${report.backup.is_physical_backup} age_min=${report.backup.age_minutes}`
    );
  }
  log(`migrations: ${report.migrations.map((m) => `${m.file}=${m.plan || m.result || "n/a"}`).join("; ") || "n/a"}`);
  if (report.edge) {
    log(
      `edge: present=${report.edge.present} version=${report.edge.version || "none"} verify_jwt=${report.edge.verify_jwt ?? "n/a"} source_hash=${report.edge.expected_source_hash || "n/a"}`
    );
  }
  if (report.dispatcher) {
    log(
      `dispatcher: disabled=${report.dispatcher.disabled} claimed=${report.dispatcher.claimed} EMAIL_ENABLED=${STAGE1_EMAIL_SECRETS.EMAIL_ENABLED}`
    );
  } else {
    log(`EMAIL_ENABLED required: ${STAGE1_EMAIL_SECRETS.EMAIL_ENABLED}`);
  }
  if (report.vercel) {
    log(
      `vercel: id=${report.vercel.id || "n/a"} ready=${report.vercel.ready} served_sha=${report.vercel.servedSha || "n/a"}`
    );
  }
  log(`canonical: ${CANONICAL_HOST}`);
  log(`db migrated: ${report.dbMigrated}  app promoted: ${report.appPromoted}`);
  if (report.recovery) log(`recovery: ${report.recovery}`);
  log(`completed gates: ${report.completed.join(", ") || "none"}`);
  log(`DRY_RUN secret names: ${DRY_RUN_SECRET_NAMES.join(", ")}`);
  log(`EXECUTE secret names: ${EXECUTE_SECRET_NAMES.join(", ")}`);
  log("========================================\n");
}

function extractExactSql(file) {
  const rel = `${MIGRATION_REL_PREFIX}${file}`;
  const shown = gitShow(rel);
  if (shown.status !== 0) return null;
  const expected = report.migrations.find((m) => m.file === file)?.sha256;
  const actual = sha256Text(shown.stdout);
  if (expected && expected !== actual) return null;
  const dir = mkdtempSync(join(tmpdir(), "pn-email-sql-"));
  const path = join(dir, file);
  writeFileSync(path, shown.stdout);
  return { path, dir, hash: actual };
}
function ledgerInsertSql(version) {
  if (!/^\d{14}$/.test(version)) throw new Error("refused non-allowlist ledger version");
  return `INSERT INTO supabase_migrations.schema_migrations (version)
SELECT '${version}'
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}'
);`;
}
function applyExactMigrations(states) {
  const dbUrl = prodDbUrl();
  if (!dbUrlIsProduction(dbUrl)) {
    hold("execute refused — Production DB URL missing or not Production");
    return false;
  }
  for (const file of MIGRATION_ALLOWLIST) {
    const state = states[file];
    const row = report.migrations.find((m) => m.file === file);
    if (state === "already_correct") {
      if (row) row.result = "already_correct_skipped";
      gate(`apply.${file}`, "PASS", "already correctly applied — skip");
      continue;
    }
    if (state !== "not_applied") {
      hold(`${file} is ${state} — refusing unsafe apply`);
      return false;
    }
    const extracted = extractExactSql(file);
    if (!extracted) {
      hold(`${file} hash extraction failed vs candidate SHA`);
      return false;
    }
    const applied = supabase(["db", "query", "--db-url", dbUrl, "--file", extracted.path], { timeout: 180000 });
    rmSync(extracted.dir, { recursive: true, force: true });
    if (applied.status !== 0) {
      hold(`${file} apply failed (no destructive rollback)`);
      report.recovery = "DB apply failed mid-allowlist. Do not rollback destructively. Re-probe live objects and HOLD.";
      return false;
    }
    const version = file.slice(0, 14);
    const ledgerFileDir = mkdtempSync(join(tmpdir(), "pn-email-ledger-"));
    const ledgerFile = join(ledgerFileDir, "ledger.sql");
    writeFileSync(ledgerFile, ledgerInsertSql(version));
    const ledger = supabase(["db", "query", "--db-url", dbUrl, "--file", ledgerFile]);
    rmSync(ledgerFileDir, { recursive: true, force: true });
    if (ledger.status !== 0) {
      hold(`${file} applied but ledger insert failed — HOLD as objects_present_ledger_missing`);
      return false;
    }
    const reprobe = runLiveProbe();
    if (!reprobe.ok) {
      hold(`${file} post-apply probe failed`);
      return false;
    }
    const newState = reprobe.classified.states[file];
    if (row) row.plan = newState;
    if (newState !== "already_correct") {
      hold(`${file} post-apply state=${newState} — not already_correct`);
      return false;
    }
    if (row) row.result = "applied";
    report.dbMigrated = true;
    gate(`apply.${file}`, "PASS", "applied exact candidate file + ledger + live objects");
    states[file] = newState;
  }
  const finalProbe = runLiveProbe();
  if (!finalProbe.ok) {
    hold("post-migration live verification failed");
    return false;
  }
  const badObj = finalProbe.classified.results.filter((r) => !r.ok);
  if (badObj.length) {
    hold(`post-migration object verification failed: ${badObj.map((r) => r.id).join(",")}`);
    return false;
  }
  report.completed.push("migrations");
  return true;
}
function setStage1Secrets() {
  const pairs = Object.entries(STAGE1_EMAIL_SECRETS).map(([k, v]) => `${k}=${v}`);
  const cron = String(process.env.PROD_EMAIL_DISPATCH_CRON_SECRET || "").trim();
  if (cron) pairs.push(`EMAIL_DISPATCH_CRON_SECRET=${cron}`);
  const r = supabase(["secrets", "set", ...pairs, "--project-ref", PROD_PROJECT_REF], { timeout: 120000 });
  if (r.status !== 0) {
    hold("failed to set Stage 1 email-disabled secrets (values not printed)");
    return false;
  }
  if (String(STAGE1_EMAIL_SECRETS.EMAIL_ENABLED) !== "false") {
    hold("EMAIL_ENABLED must be false for Stage 1");
    return false;
  }
  return gate("secrets.stage1", "PASS", "APP_ENV=prod EMAIL_QA_MODE=false EMAIL_ENABLED=false APP_PUBLIC_URL=canonical EMAIL_FROM_NAME=PrimeCare");
}
function addCandidateWorktree() {
  const dir = mkdtempSync(join(tmpdir(), "pn-email-sha-"));
  const r = git(["worktree", "add", "--detach", dir, EXPECTED_CANDIDATE_SHA]);
  if (r.status !== 0) {
    hold("failed to create detached worktree at candidate SHA");
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  const head = run("git", ["rev-parse", "HEAD"], { cwd: dir });
  if (head.stdout.trim() !== EXPECTED_CANDIDATE_SHA) {
    hold("worktree HEAD is not the pinned candidate SHA");
    git(["worktree", "remove", "--force", dir]);
    return null;
  }
  return dir;
}
function removeWorktree(dir) {
  if (!dir) return;
  git(["worktree", "remove", "--force", dir]);
  rmSync(dir, { recursive: true, force: true });
}
function deployDispatchFunction(worktree) {
  const portal = join(worktree, "primecare-portal");
  const r = supabase(
    ["functions", "deploy", DISPATCH_FUNCTION, "--project-ref", PROD_PROJECT_REF],
    { cwd: portal, timeout: 180000 }
  );
  if (r.status !== 0) {
    hold("Edge Function deploy failed");
    report.recovery =
      "DB migrated (if apply ran). App not promoted. Email remains disabled. Do not rollback DB. Retry function deploy from candidate SHA only.";
    return false;
  }
  const listed = supabase(["functions", "list", "--project-ref", PROD_PROJECT_REF, "-o", "json"]);
  const payload = parseJsonBlob(`${listed.stdout}\n${listed.stderr}`) || {};
  const dispatch = (payload.functions || []).find((f) => f.slug === DISPATCH_FUNCTION);
  const active = String(dispatch?.status || "").toUpperCase() === "ACTIVE";
  const jwtOff = dispatch?.verify_jwt === false;
  report.edge = {
    ...(report.edge || {}),
    present: Boolean(dispatch),
    version: dispatch?.version ?? null,
    status: dispatch?.status ?? null,
    verify_jwt: dispatch?.verify_jwt,
    expected_source_hash: functionSourceHash(),
  };
  if (!active || !jwtOff) {
    hold(`function not ACTIVE with verify_jwt=false (status=${dispatch?.status} jwt=${dispatch?.verify_jwt})`);
    return false;
  }
  report.completed.push("edge.deploy");
  return gate("edge.deploy", "PASS", `ACTIVE v${dispatch.version} verify_jwt=false hash=${report.edge.expected_source_hash}`);
}
function invokeDispatcher(secret, body) {
  const args = [
    "-sS",
    "-w",
    "\n%{http_code}",
    "--max-time",
    "30",
    "-X",
    "POST",
    DISPATCH_URL,
    "-H",
    "Content-Type: application/json",
    "-H",
    `Authorization: Bearer ${secret}`,
    "-d",
    JSON.stringify(body || { to: "attacker@example.com", subject: "x", body: "y", html: "<b>x</b>" }),
  ];
  const r = run("curl", args, { timeout: 45000 });
  const raw = r.stdout || "";
  const nl = raw.lastIndexOf("\n");
  const bodyText = nl >= 0 ? raw.slice(0, nl) : raw;
  const code = nl >= 0 ? raw.slice(nl + 1).trim() : "";
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = null;
  }
  return { status: Number(code) || r.status, json, raw: bodyText.slice(0, 400) };
}
function verifyDispatcherDisabled(beforeStats) {
  const cron = String(process.env.PROD_EMAIL_DISPATCH_CRON_SECRET || "").trim();
  if (!cron) {
    hold("PROD_EMAIL_DISPATCH_CRON_SECRET unset — cannot prove dispatcher disabled");
    return false;
  }
  const bad = invokeDispatcher("not-the-cron-secret", { to: "attacker@example.com" });
  if (bad.status !== 401) {
    hold(`bad secret expected 401, got ${bad.status}`);
    return false;
  }
  gate("edge.bad_secret", "PASS", "401");
  const good = invokeDispatcher(cron, { to: "attacker@example.com", subject: "x", body: "y", html: "<b>x</b>" });
  const disabled = good.status === 200 && good.json?.disabled === true && Number(good.json?.claimed) === 0;
  const sent =
    Array.isArray(good.json?.processed) &&
    good.json.processed.some((p) => p?.status === "sent" || p?.provider_message_id);
  if (sent || Number(good.json?.claimed) > 0) {
    hold("HARD FAIL — provider send or claim occurred while EMAIL_ENABLED must be false");
    return false;
  }
  if (!disabled) {
    hold(`dispatcher not disabled (status=${good.status} body=${JSON.stringify(good.json)})`);
    return false;
  }
  report.dispatcher = { disabled: true, claimed: 0, http: 200 };
  const after = runLiveProbe();
  if (after.ok && beforeStats && after.classified.emailRowStats) {
    const a = after.classified.emailRowStats;
    if (Number(a.processing) !== Number(beforeStats.processing) || Number(a.sent) !== Number(beforeStats.sent)) {
      hold("HARD FAIL — email processing/sent counts changed during disabled invoke");
      return false;
    }
  }
  report.completed.push("edge.disabled_proof");
  return gate("edge.disabled_proof", "PASS", "valid cron secret + EMAIL_ENABLED=false => disabled=true claimed=0; no provider send");
}
function deployVercel(worktree) {
  const token = String(process.env.VERCEL_TOKEN || "").trim();
  const org = String(process.env.VERCEL_ORG_ID || "").trim();
  const project = String(process.env.VERCEL_PROJECT_ID || "").trim();
  if (!token || !org || !project) {
    hold("VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID missing");
    report.recovery =
      "DB migrated. Edge may be deployed with EMAIL_ENABLED=false. App not promoted. Do not rollback DB. Retry Vercel deploy of exact candidate SHA.";
    return false;
  }
  const portal = join(worktree, "primecare-portal");
  mkdirSync(join(portal, ".vercel"), { recursive: true });
  writeFileSync(join(portal, ".vercel/project.json"), JSON.stringify({ orgId: org, projectId: project }));
  const r = run(
    "npx",
    [
      "--yes",
      "vercel",
      "deploy",
      "--prod",
      "--yes",
      "--token",
      token,
      "--build-env",
      `VERCEL_GIT_COMMIT_SHA=${EXPECTED_CANDIDATE_SHA}`,
      "--build-env",
      "VITE_APP_ENV=prod",
    ],
    { cwd: portal, timeout: 600000, env: { VERCEL_ORG_ID: org, VERCEL_PROJECT_ID: project } }
  );
  if (r.status !== 0) {
    hold("Vercel deploy failed");
    report.recovery =
      "DB migrated. Edge may be deployed with EMAIL_ENABLED=false. App not promoted. Do not rollback DB. Canonical host may still serve previous SHA. Retry exact-SHA Vercel deploy.";
    return false;
  }
  const urlMatch = `${r.stdout}\n${r.stderr}`.match(/https:\/\/[^\s]+vercel\.app/);
  const inspectTarget = urlMatch ? urlMatch[0] : CANONICAL_HOST;
  const inspected = run(
    "npx",
    ["--yes", "vercel", "inspect", inspectTarget, "--token", token],
    { cwd: portal, timeout: 120000 }
  );
  const blob = `${inspected.stdout}\n${inspected.stderr}`;
  const ready = /status\s*[:=]\s*ready/i.test(blob) || /Ready/i.test(blob);
  const idMatch = blob.match(/id\s*[:=]\s*(\S+)/i);
  report.vercel = {
    id: idMatch ? idMatch[1] : inspectTarget,
    ready,
    inspectTarget,
  };
  if (!ready) {
    hold("Vercel deployment not READY");
    report.recovery = "DB migrated. Edge deployed email-disabled. App deploy not READY. Canonical may still serve previous SHA. Do not rollback DB.";
    return false;
  }
  report.appPromoted = true;
  report.completed.push("vercel.deploy");
  return gate("vercel.deploy", "PASS", `READY ${report.vercel.id}`);
}
function verifyCanonicalServesCandidate() {
  const htmlRun = run("curl", ["-sS", "--max-time", "30", CANONICAL_HOST], { timeout: 45000 });
  const html = htmlRun.stdout || "";
  const asset = html.match(/\/assets\/[^"']+\.js/);
  let served = "";
  if (asset) {
    const abs = new URL(asset[0], CANONICAL_HOST).toString();
    const js = run("curl", ["-sS", "--max-time", "30", abs], { timeout: 45000 });
    served = js.stdout || "";
  } else {
    served = html;
  }
  const hasPrefix = served.includes(COMMIT_PREFIX);
  const envProd = /["']prod["']/.test(served) || /env:"prod"/.test(served) || served.includes('env:"prod"');
  report.vercel = { ...(report.vercel || {}), servedSha: hasPrefix ? COMMIT_PREFIX : "mismatch", envProd };
  if (!hasPrefix) {
    hold("canonical host does not serve candidate commit prefix");
    report.recovery = `App deployed but canonical alias does not serve ${COMMIT_PREFIX}. EMAIL_ENABLED remains false. Rollback target: previous READY deployment on ${CANONICAL_HOST}. Do not rollback DB.`;
    return false;
  }
  gate("vercel.canonical_sha", "PASS", `${CANONICAL_HOST} serves ${COMMIT_PREFIX}`);
  gate("vercel.env_prod", envProd ? "PASS" : "HOLD", envProd ? "prod marker present in served assets" : "could not confirm env=prod in assets");
  return hasPrefix;
}

function executeStage1(states, live) {
  if (isPullRequestEvent()) {
    hold("pull_request event cannot execute Production mutation");
    return false;
  }
  if (ciForceDryRun()) {
    hold("CI force dry-run is set; refusing execute");
    return false;
  }
  if (!isExecuteUnlocked()) {
    hold("execute locks are not all set");
    return false;
  }
  if (!prodDbUrl() || !dbUrlIsProduction(prodDbUrl())) {
    hold("execute refused — Production SQL credential missing");
    return false;
  }
  const backup = inspectBackup();
  if (!backup.ok) {
    hold("fresh physical backup unavailable");
    return false;
  }
  if (!applyExactMigrations({ ...states })) return false;
  const beforeStats = live?.classified?.emailRowStats || runLiveProbe().classified?.emailRowStats || null;
  if (!setStage1Secrets()) return false;
  const worktree = addCandidateWorktree();
  if (!worktree) return false;
  try {
    if (!deployDispatchFunction(worktree)) return false;
    if (!verifyDispatcherDisabled(beforeStats)) return false;
    if (!deployVercel(worktree)) return false;
    if (!verifyCanonicalServesCandidate()) return false;
  } finally {
    removeWorktree(worktree);
  }
  if (!confirmMainUnchanged()) {
    hold("origin/main changed during release — STOP (no main promotion is allowed)");
    return false;
  }
  report.completed.push("execute.ready_for_founder_uat");
  return true;
}

async function main() {
  if (!denyDangerousArgv()) {
    printFounderBanner();
    process.exit(2);
  }
  const mode = parseMode();
  report.mode = mode.dryRun ? "DRY_RUN" : "EXECUTE";
  if (isPullRequestEvent()) {
    gate("execute.lock", "PASS", "pull_request hard-block: execute-prod refused");
  } else if (mode.refusedExecute) {
    gate(
      "execute.lock",
      "HOLD",
      "execute refused — missing locks and/or PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN=true"
    );
  } else {
    gate("execute.lock", "PASS", mode.dryRun ? "dry-run (execute locked)" : "execute unlocked");
  }
  log(`PN-EMAIL Stage 1 runner  mode=${report.mode}  prod=${PROD_PROJECT_REF}  qa_rejected=${QA_PROJECT_REF}`);

  if (!fetchOrigins()) {
    hold("git fetch failed");
    printFounderBanner();
    process.exit(2);
  }
  const shaOk = verifyImmutableShas();
  verifyProductionIdentity();
  if (!shaOk) {
    hold("immutable SHA gate failed");
    printFounderBanner();
    process.exit(2);
  }
  report.completed.push("identity", "sha");

  const backup = inspectBackup();
  if (!backup.ok) hold("fresh physical backup unavailable");
  else report.completed.push("backup");

  const hashOk = verifyMigrationHashes();
  if (!hashOk) hold("migration allowlist hash mismatch vs candidate SHA");
  else report.completed.push("hashes");

  const live = liveStateRead();
  printPlan(Object.fromEntries(report.migrations.map((m) => [m.file, m.plan || "unknown"])));
  inspectEdgeReadOnly();
  const staticOk = runStaticVerifiers();
  runTechnicalSmoke();
  confirmMainUnchanged();

  if (mode.dryRun) {
    refuseMutations();
    if (!backup.ok) hold("fresh physical backup unavailable");
    else if (!hashOk) hold("migration allowlist hash mismatch vs candidate SHA");
    else if (live.ok === false && prodDbUrl()) hold("live object probe mismatch/partial");
    printFounderBanner();
    const runnerBroken = !shaOk || !hashOk || !staticOk;
    if (runnerBroken) process.exit(2);
    if (!backup.ok) {
      log("DRY_RUN certified the runner; Production deploy remains HOLD on backup freshness.");
      log(HOLD_BACKUP);
    } else {
      log("PN-EMAIL STAGE 1 DRY_RUN COMPLETE — NO PRODUCTION MUTATION");
    }
    process.exit(0);
  }

  const executed = executeStage1(live.states || {}, live);
  if (!executed) {
    printFounderBanner();
    process.exit(2);
  }
  printFounderBanner();
  process.exit(0);
}

main().catch((err) => {
  hold(err?.message || String(err));
  printFounderBanner();
  process.exit(2);
});
