#!/usr/bin/env node
/**
 * Phase 7.1 QA migration + enterprise compensation certification.
 * Applies migration when needed, seeds admin plan/assignment, validates UAT API paths.
 */
import { createServer } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_EXECUTIVE, QA_HR, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";
import { roleScopePlanDefaults } from "../src/compensation/enterpriseCompensationRoles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const MIGRATION = resolve(root, "supabase/migrations/20260707140000_enterprise_compensation_phase_7_1.sql");
const MIGRATION_PAYROLL_LINES = resolve(
  root,
  "supabase/migrations/20260707140100_payroll_run_lines_employee_identity.sql"
);
const MIGRATION_FILES = [MIGRATION, MIGRATION_PAYROLL_LINES];
const APPLY_MIGRATION = process.argv.includes("--apply-migration");
const FINANCE_TABLES = ["payments", "orders", "invoices", "ar_credit_control"];

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

function str(value) {
  return String(value ?? "").trim();
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function countTable(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID);
  if (error) return { table, error: error.message };
  return { table, count: count ?? 0 };
}

async function snapshotFinance(supabase) {
  const rows = await Promise.all(FINANCE_TABLES.map((table) => countTable(supabase, table)));
  return Object.fromEntries(rows.map((row) => [row.table, row.error ? row.error : row.count]));
}

function applyMigrationViaPsql(env, sqlFile = MIGRATION) {
  const url = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!url) return { ok: false, reason: "no DATABASE_URL" };
  const run = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "psql failed" };
  }
  return { ok: true, method: "psql" };
}

function applyMigrationViaSupabaseCli() {
  const run = spawnSync("supabase", ["db", "push", "--include-all"], {
    cwd: root,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "supabase db push failed" };
  }
  return { ok: true, method: "supabase db push" };
}

function serviceRoleClient(env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureQaHrProfile(env) {
  const admin = serviceRoleClient(env);
  if (!admin) return { ok: false, reason: "no service role client" };

  const existing = await admin
    .from("profiles")
    .select("user_id,role,display_name,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "hr")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (existing.data?.user_id) {
    return { ok: true, profile: existing.data, created: false };
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: QA_HR.email,
    password: QA_HR.password,
    email_confirm: true,
    user_metadata: { name: "QA HR", provisioned_by: "phase_7_1_certification" },
  });
  if (authErr || !authUser?.user?.id) {
    return { ok: false, reason: authErr?.message || "auth create failed" };
  }

  const userId = authUser.user.id;
  const profileRow = {
    user_id: userId,
    tenant_id: QA_HQ_TENANT_ID,
    role: "hr",
    username: "qa_hr",
    display_name: "QA HR",
    email: QA_HR.email,
    active: true,
  };
  const profileInsert = await admin.from("profiles").insert([profileRow]).select().single();
  if (profileInsert.error) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, reason: profileInsert.error.message };
  }

  await admin.from("users").insert([
    {
      tenant_id: QA_HQ_TENANT_ID,
      user_code: userId,
      user_name: "QA HR",
      email: QA_HR.email,
      role: "HR",
      active: true,
    },
  ]);

  return { ok: true, profile: profileInsert.data, created: true };
}

async function ensureDraftPayrollRun({ supabase, payrollApi, currentUser, periodId }) {
  const { data: draftRun } = await supabase
    .from("payroll_runs")
    .select("id,status,run_number")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_id", periodId)
    .eq("status", "draft")
    .order("run_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftRun?.id) return { ok: true, draftRun, reopened: false };

  const { data: sourceRuns } = await supabase
    .from("payroll_runs")
    .select("id,status,run_number")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_id", periodId)
    .order("run_number", { ascending: false })
    .limit(1);
  const sourceRun = (sourceRuns || [])[0];
  if (!sourceRun?.id) return { ok: false, reason: "no payroll run to reopen from" };

  const reopen = await payrollApi.reopenPayrollRunWrite({
    currentUser,
    tenantId: QA_HQ_TENANT_ID,
    payrollRunId: sourceRun.id,
    actorRole: currentUser.role,
    actorUserId: currentUser.id,
    reason: "qa_phase_7_1_preview_certification",
    client: supabase,
  });
  if (!reopen.success) return { ok: false, reason: reopen.error };
  return {
    ok: true,
    reopened: true,
    draftRun: {
      id: reopen.data.newPayrollRunId,
      run_number: reopen.data.newRunNumber,
      status: "draft",
    },
  };
}

async function probePayrollLineEmployeeColumns(supabase) {
  const { error } = await supabase
    .from("payroll_run_lines")
    .select("id,employee_name,employee_role")
    .limit(1);
  if (error) {
    if (/employee_name|column/.test(error.message)) return false;
    throw new Error(`payroll_run_lines probe failed: ${error.message}`);
  }
  return true;
}

async function probeMigration(supabase) {
  const { error } = await supabase
    .from("compensation_plan_assignments")
    .select("id,profile_user_id,employee_role,employee_name")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .limit(1);
  if (error) {
    if (/employee_role|column/.test(error.message)) return false;
    throw new Error(`assignment probe failed: ${error.message}`);
  }
  return true;
}

async function main() {
  section("Phase 7.1 QA certification");

  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const planAdminApi = await server.ssrLoadModule("/src/api/compensationPlanAdminSupabaseApi.js");
  const compensationApi = await server.ssrLoadModule("/src/api/compensationSupabaseApi.js");
  const employeeApi = await server.ssrLoadModule("/src/api/employeeCompensation360SupabaseApi.js");
  const payrollApi = await server.ssrLoadModule("/src/api/payrollDomainSupabaseApi.js");
  const env = loadEnv();

  const auth = await signInWithQaCredentials(supabase, QA_EXECUTIVE);
  if (!auth.ok) {
    console.error("Executive auth failed:", auth.error);
    process.exit(1);
  }

  const currentUser = {
    id: auth.userId,
    role: "executive",
    tenantId: QA_HQ_TENANT_ID,
    tenant_id: QA_HQ_TENANT_ID,
  };

  section("1. Migration");
  let migrated = await probeMigration(supabase);
  let payrollLineMigrated = await probePayrollLineEmployeeColumns(supabase);
  if (migrated) {
    pass("migration.probe", "Phase 7.1 columns readable on compensation_plan_assignments");
  } else if (APPLY_MIGRATION) {
    let result = applyMigrationViaPsql(env, MIGRATION);
    if (!result.ok) {
      console.log(`WARN  psql skipped: ${result.reason}`);
      result = applyMigrationViaSupabaseCli();
    }
    if (!result.ok) {
      fail("migration.apply", result.reason);
    } else {
      pass("migration.apply", `Applied via ${result.method}`);
      migrated = await probeMigration(supabase);
    }
  } else {
    fail("migration.probe", "Phase 7.1 not applied — re-run with --apply-migration");
  }

  if (payrollLineMigrated) {
    pass("migration.payroll_lines_probe", "payroll_run_lines employee_name/employee_role readable");
  } else if (APPLY_MIGRATION) {
    let result = applyMigrationViaPsql(env, MIGRATION_PAYROLL_LINES);
    if (!result.ok) {
      console.log(`WARN  payroll lines psql skipped: ${result.reason}`);
      result = applyMigrationViaSupabaseCli();
    }
    if (!result.ok) {
      fail("migration.payroll_lines_apply", result.reason);
    } else {
      pass("migration.payroll_lines_apply", `Applied via ${result.method}`);
      payrollLineMigrated = await probePayrollLineEmployeeColumns(supabase);
    }
  } else {
    fail("migration.payroll_lines_probe", "payroll_run_lines employee columns missing — re-run with --apply-migration");
  }

  section("2. Schema verification");
  const assignmentsRes = await supabase
    .from("compensation_plan_assignments")
    .select("id,profile_user_id,agent_id,employee_role,employee_name,assignment_status")
    .eq("tenant_id", QA_HQ_TENANT_ID);
  if (assignmentsRes.error) {
    fail("schema.assignments_read", assignmentsRes.error.message);
  } else {
    const rows = assignmentsRes.data || [];
    const missingProfile = rows.filter((row) => !row.profile_user_id);
    if (missingProfile.length) {
      fail("schema.profile_backfill", `${missingProfile.length} assignment(s) missing profile_user_id`);
    } else if (rows.length) {
      pass("schema.profile_backfill", "all assignments have profile_user_id");
    } else {
      pass("schema.profile_backfill", "no assignments yet (seed step will create)");
    }

    const agentRows = rows.filter((row) => str(row.employee_role || "agent") === "agent");
    const agentMissingId = agentRows.filter((row) => !str(row.agent_id));
    if (agentMissingId.length) {
      fail("schema.agent_id_required", "agent assignment missing agent_id");
    } else if (agentRows.length) {
      pass("schema.agent_id_required", "agent assignments retain agent_id");
    }

    const nonAgentNoFakeAgent = rows.filter(
      (row) => str(row.employee_role) !== "agent" && str(row.agent_id)
    );
    if (nonAgentNoFakeAgent.length) {
      fail("schema.non_agent_agent_id", "non-agent assignment has agent_id set");
    } else {
      pass("schema.non_agent_agent_id", "non-agent assignments do not require agent_id");
    }
  }

  const plansRes = await supabase
    .from("compensation_plans")
    .select("id,role_scope,status,plan_code")
    .eq("tenant_id", QA_HQ_TENANT_ID);
  if (plansRes.error) fail("schema.plans_read", plansRes.error.message);
  else pass("schema.plans_read", `${(plansRes.data || []).length} plan(s) readable`);

  section("3. Seed admin plan + assignment");
  const financeBefore = await snapshotFinance(supabase);
  console.log("Finance BEFORE:", financeBefore);

  const adminProfileRes = await supabase
    .from("profiles")
    .select("user_id,role,agent_name,display_name,username,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "admin")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (adminProfileRes.error || !adminProfileRes.data) {
    fail("seed.admin_profile", adminProfileRes.error?.message || "no active admin profile in QA");
  } else {
    pass("seed.admin_profile", `admin profile ${adminProfileRes.data.user_id}`);
  }

  let adminPlan =
    (plansRes.data || []).find(
      (plan) => str(plan.role_scope) === "admin" && str(plan.status) === "active"
    ) || null;

  if (!adminPlan && adminProfileRes.data) {
    const defaults = roleScopePlanDefaults("admin");
    const create = await planAdminApi.createCompensationPlan({
      currentUser,
      planInput: {
        plan_code: `ADMIN_QA_${Date.now().toString().slice(-6)}`,
        displayName: defaults.displayName,
        role_scope: "admin",
        base_salary: defaults.baseSalary,
        fuel_allowance: defaults.fuelAllowance,
        mobile_allowance: defaults.mobileAllowance,
        commission_rate_bps: 0,
        promotion_salary: 0,
        promotion_commission_rate_bps: 0,
        promotionEnabled: false,
        status: "draft",
      },
      client: supabase,
    });
    if (!create.success) fail("seed.admin_plan_create", create.error);
    else {
      pass("seed.admin_plan_create", `draft plan ${create.data.plan_code}`);
      const activate = await planAdminApi.activateCompensationPlan({
        currentUser,
        planId: create.data.id,
        client: supabase,
      });
      if (!activate.success) fail("seed.admin_plan_activate", activate.error);
      else {
        pass("seed.admin_plan_activate", "admin plan activated with 0% commission");
        adminPlan = activate.data;
      }
    }
  } else if (adminPlan) {
    pass("seed.admin_plan_exists", adminPlan.plan_code);
  }

  if (adminProfileRes.data && adminPlan) {
    const existingAdminAssign = (assignmentsRes.data || []).find(
      (row) =>
        str(row.profile_user_id) === str(adminProfileRes.data.user_id) &&
        row.assignment_status === "active"
    );
    if (existingAdminAssign) {
      pass("seed.admin_assignment", "admin already has active assignment");
    } else {
      const assign = await planAdminApi.assignEmployeeToPlan({
        currentUser,
        profileUserId: adminProfileRes.data.user_id,
        planId: adminPlan.id,
        effectiveDate: "2026-01-01",
        client: supabase,
      });
      if (!assign.success) fail("seed.admin_assignment", assign.error);
      else pass("seed.admin_assignment", `assigned admin to plan ${adminPlan.plan_code}`);
    }
  }

  const agentAssignCount = (assignmentsRes.data || []).filter(
    (row) => str(row.employee_role || "agent") === "agent" && row.assignment_status === "active"
  ).length;
  if (agentAssignCount > 0) pass("seed.agent_assignments", `${agentAssignCount} active agent assignment(s)`);
  else pass("seed.agent_assignments", "none yet — run seed-qa-compensation-data.mjs --apply if needed");

  section("4. UAT API checks");
  const hrEnsure = await ensureQaHrProfile(env);
  if (!hrEnsure.ok) fail("seed.hr_profile", hrEnsure.reason);
  else pass("seed.hr_profile", hrEnsure.created ? "created QA HR profile" : "QA HR profile present");

  if (adminProfileRes.data && adminPlan) {
    const agentPlan = (plansRes.data || []).find((plan) => str(plan.role_scope) === "agent");
    if (agentPlan) {
      const cross = await planAdminApi.assignEmployeeToPlan({
        currentUser,
        profileUserId: adminProfileRes.data.user_id,
        planId: agentPlan.id,
        client: supabase,
      });
      if (cross.success) fail("uat.cross_role_blocked", "admin assigned to agent plan unexpectedly");
      else pass("uat.cross_role_blocked", cross.error || "role mismatch blocked");
    }
  }

  const directory = await planAdminApi.loadCompensationEmployeeDirectoryRead({
    currentUser,
    client: supabase,
  });
  if (!directory.success) fail("uat.employee_directory", directory.error);
  else {
    const roles = new Set((directory.data?.employees || []).map((row) => row.role));
    for (const role of ["agent", "admin", "executive", "hr"]) {
      if (roles.has(role)) pass(`uat.directory.${role}`, "present");
      else fail(`uat.directory.${role}`, "missing from employee directory");
    }
  }

  if (adminProfileRes.data) {
    const admin360 = await employeeApi.loadEmployeeCompensation360Read({
      currentUser,
      profileUserId: adminProfileRes.data.user_id,
      client: supabase,
    });
    if (!admin360.success) fail("uat.admin_360", admin360.error);
    else {
      pass("uat.admin_360", admin360.data.overview?.name || "loaded");
      if (admin360.data.commissionEligible === false) {
        pass("uat.admin_no_commission_sections", "admin is not commission-eligible");
      } else {
        fail("uat.admin_no_commission_sections", "admin incorrectly commission-eligible");
      }
    }
  }

  const agentProfile = (directory.data?.employees || []).find((row) => row.role === "agent");
  if (agentProfile?.profileUserId || agentProfile?.agentId) {
    const agent360 = await employeeApi.loadEmployeeCompensation360Read({
      currentUser,
      profileUserId: agentProfile.profileUserId,
      agentId: agentProfile.agentId,
      client: supabase,
    });
    if (!agent360.success) fail("uat.agent_360", agent360.error);
    else pass("uat.agent_360", agent360.data.overview?.name || "loaded");
  }

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id,period_ym,status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_ym", "2026-07")
    .maybeSingle();

  if (period?.id) {
    const draftSetup = await ensureDraftPayrollRun({
      supabase,
      payrollApi,
      currentUser,
      periodId: period.id,
    });
    if (!draftSetup.ok) fail("uat.preview_draft_run", draftSetup.reason);
    else {
      pass(
        "uat.preview_draft_run",
        draftSetup.reopened
          ? `reopened → draft v${draftSetup.draftRun.run_number}`
          : `draft v${draftSetup.draftRun.run_number} already present`
      );
    }

    const preview = await compensationApi.generatePayrollPreview({
      currentUser,
      tenantId: QA_HQ_TENANT_ID,
      periodId: period.id,
      client: supabase,
    });
    if (!preview.success) {
      fail("uat.preview_generate", preview.error);
    } else {
      pass("uat.preview_generate", `${preview.data?.payrollRunLineCount || 0} lines`);
      const linesRes = await supabase
        .from("payroll_run_lines")
        .select("agent_id,profile_user_id,agent_name,salary_amount,fuel_allowance,mobile_allowance,commission_amount")
        .eq("tenant_id", QA_HQ_TENANT_ID)
        .eq("period_id", period.id)
        .eq("payroll_run_id", preview.data?.payrollRunId);
      const lines = linesRes.data || [];
      const adminLine = adminProfileRes.data
        ? lines.find((line) => str(line.profile_user_id) === str(adminProfileRes.data.user_id))
        : null;
      if (adminLine) {
        if (Number(adminLine.commission_amount) === 0) {
          pass("uat.admin_preview_commission_zero", "admin line commission ₹0");
        } else {
          fail("uat.admin_preview_commission_zero", `admin commission ${adminLine.commission_amount}`);
        }
        if (Number(adminLine.salary_amount) > 0) {
          pass("uat.admin_preview_salary", `admin salary ${adminLine.salary_amount}`);
        } else {
          fail("uat.admin_preview_salary", "admin salary missing");
        }
      } else if (adminProfileRes.data) {
        fail("uat.admin_preview_line", "admin not in payroll preview lines");
      }

      const agentLine = lines.find((line) => str(line.agent_id));
      if (agentLine) {
        pass("uat.agent_preview_line", `agent ${agentLine.agent_name || agentLine.agent_id} in preview`);
      }
    }
  } else {
    fail("uat.preview_period", "July 2026 payroll period missing");
  }

  const financeAfter = await snapshotFinance(supabase);
  console.log("Finance AFTER:", financeAfter);
  for (const table of FINANCE_TABLES) {
    if (financeBefore[table] === financeAfter[table]) {
      pass(`finance.${table}`, "unchanged");
    } else {
      fail(`finance.${table}`, `before=${financeBefore[table]} after=${financeAfter[table]}`);
    }
  }

  await server.close();

  section("Result");
  if (failures) {
    console.error(`Overall: NO-GO (${failures} failure(s))\n`);
    process.exit(1);
  }
  console.log("Overall: GO\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
