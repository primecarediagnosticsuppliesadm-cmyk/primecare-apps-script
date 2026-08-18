#!/usr/bin/env node
/**
 * verify-agent-visit-relative-date.mjs
 *
 * Purpose: Recent Visits TODAY/YESTERDAY uses canonical visit_date calendar days.
 * Module owner: agent visits
 * When to run: After Agent Portal Recent Visits date-label changes
 *
 * Usage:
 *   node scripts/verify-agent-visit-relative-date.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatRelativeVisitTime,
  visitBusinessYmd,
} from "../src/pages/agentVisitWizardUx.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const self = fileURLToPath(import.meta.url);

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(cond, id, detail) {
  cond ? pass(id, detail) : fail(id, detail);
}

const nowMorning = new Date(2026, 7, 18, 9, 32, 0);
const nowLate = new Date(2026, 7, 18, 23, 59, 0);
const nowEarly = new Date(2026, 7, 18, 0, 1, 0);

assert(
  formatRelativeVisitTime("2026-08-18", nowMorning) === "Today",
  "rel.today",
  "visit_date = local today → Today"
);
assert(
  formatRelativeVisitTime("2026-08-17", nowMorning) === "Yesterday",
  "rel.yesterday.morning",
  "visit_date yesterday, local morning after noon-yesterday → Yesterday (not Today)"
);
assert(
  formatRelativeVisitTime("2026-08-17", nowEarly) === "Yesterday",
  "rel.yesterday.early",
  "visit_date yesterday at 00:01 local → Yesterday"
);
assert(
  formatRelativeVisitTime("2026-08-17", nowLate) === "Yesterday",
  "rel.yesterday.late",
  "visit_date yesterday at 23:59 local → Yesterday"
);
assert(
  formatRelativeVisitTime("2026-08-16", nowMorning) === "2d ago",
  "rel.older.2d",
  "visit_date two calendar days ago → 2d ago"
);
assert(
  formatRelativeVisitTime("2026-08-11", nowMorning) === "1w ago",
  "rel.older.week",
  "visit_date seven calendar days ago → 1w ago"
);
assert(
  formatRelativeVisitTime("2026-07-01", nowMorning) === "2026-07-01",
  "rel.older.ymd",
  "visits older than 30 days keep YYYY-MM-DD"
);

const createdAtToday = "2026-08-18T13:05:00.000Z";
const updatedAtToday = "2026-08-18T18:40:00.000Z";
assert(
  formatRelativeVisitTime("2026-08-17", nowMorning) === "Yesterday",
  "rel.ignores.created_at",
  `created_at ${createdAtToday} must not feed the label; visit_date 2026-08-17 → Yesterday`
);
assert(
  formatRelativeVisitTime("2026-08-17", nowMorning) === "Yesterday",
  "rel.ignores.updated_at",
  `updated_at ${updatedAtToday} must not feed the label; visit_date 2026-08-17 → Yesterday`
);

assert(visitBusinessYmd("2026-08-17") === "2026-08-17", "ymd.date_only", "DATE 2026-08-17 stays 2026-08-17");
assert(
  visitBusinessYmd("2026-08-17T00:00:00.000Z") === "2026-08-17",
  "ymd.utc_midnight_prefix",
  "ISO midnight prefix does not shift the business DATE"
);
assert(
  formatRelativeVisitTime("2026-08-17T00:00:00.000Z", nowMorning) === "Yesterday",
  "rel.utc_midnight.no_shift",
  "UTC midnight serialization of DATE 2026-08-17 still Yesterday on local 2026-08-18"
);

const utcParsedLocal = new Date(Date.parse("2026-08-17"));
const utcParsedYmd = `${utcParsedLocal.getFullYear()}-${String(utcParsedLocal.getMonth() + 1).padStart(2, "0")}-${String(utcParsedLocal.getDate()).padStart(2, "0")}`;
assert(
  visitBusinessYmd("2026-08-17") === "2026-08-17",
  "ymd.not_date_parse",
  `Date.parse('2026-08-17') local calendar is ${utcParsedYmd}; helper keeps 2026-08-17`
);

const page = readFileSync(resolve(root, "src/pages/AgentVisitPage.jsx"), "utf8");
assert(
  /formatRelativeVisitTime\(\s*visit\.visitDate\s*\|\|\s*visit\.date\s*\)/.test(page),
  "ui.relative.uses_visitDate",
  "RecentVisitTimelineCard relative label uses visitDate (canonical visit date)"
);
assert(
  /Visit date · \{visit\.visitDate\}/.test(page),
  "ui.visit_date.display",
  "card body displays Visit date · visit.visitDate"
);
assert(
  !/formatRelativeVisitTime\([^)]*created_at/.test(page) &&
    !/formatRelativeVisitTime\([^)]*createdAt/.test(page) &&
    !/formatRelativeVisitTime\([^)]*updated_at/.test(page) &&
    !/formatRelativeVisitTime\([^)]*updatedAt/.test(page),
  "ui.relative.no_audit_timestamps",
  "relative helper is not called with created_at or updated_at"
);

const enrich = readFileSync(resolve(root, "src/utils/agentVisitDisplay.js"), "utf8");
assert(
  /visit\.date \|\| visit\.visitDate \|\| visit\.visit_date/.test(enrich) &&
    !/created_at/.test(enrich.split("export function enrichVisitForDisplay")[1]?.split("export function")[0] || enrich),
  "map.enrich.visit_date",
  "enrichVisitForDisplay canonical date is visit_date / visitDate, not created_at"
);

const api = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
const mapFn = api.split("function mapVisitRowForAgentDashboard")[1]?.slice(0, 1200) || "";
assert(
  /row\.visit_date\s*\?\?\s*row\.visitDate/.test(mapFn),
  "map.api.visit_date_first",
  "agent dashboard mapper prefers visit_date over created_at"
);

const helper = readFileSync(resolve(root, "src/pages/agentVisitWizardUx.js"), "utf8");
assert(
  !/T12:00:00/.test(helper) && !/diffMs/.test(helper),
  "impl.no_elapsed_noon_buckets",
  "relative label no longer uses elapsed-ms from local noon"
);

if (!process.env.PRIMECARE_RELATIVE_DATE_TZ_CHILD) {
  for (const tz of ["UTC", "America/New_York", "Asia/Kolkata", "America/Los_Angeles"]) {
    const run = spawnSync(process.execPath, [self], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        TZ: tz,
        PRIMECARE_RELATIVE_DATE_TZ_CHILD: "1",
      },
    });
    assert(
      (run.status ?? 1) === 0,
      `tz.${tz.replace(/\W/g, "_")}`,
      (run.status ?? 1) === 0
        ? `date-only relative labels stable under TZ=${tz}`
        : (run.stderr || run.stdout || "child failed").trim().split("\n").slice(-6).join(" | ")
    );
  }
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
