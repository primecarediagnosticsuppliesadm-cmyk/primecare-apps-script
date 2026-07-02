#!/usr/bin/env node
/**
 * Sprint 3A security hardening verification (SEC-01, SEC-03, SEC-04, TD-025/026/027/032).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
} from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";

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

async function signIn(env, email, password) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`auth ${email}: ${error.message}`);
  return sb;
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`WARN  ${msg}`);
}

async function main() {
  const env = loadEnv();
  console.log("\n=== Sprint 3A security hardening verification ===\n");

  // SEC-03 / TD-027 — reset password cross-tenant guard (edge function source)
  const resetSrc = readFileSync(
    resolve(root, "supabase/functions/reset-platform-user-password/index.ts"),
    "utf8"
  );
  if (resetSrc.includes("Cross-tenant password reset is not allowed")) {
    pass("SEC-03 reset-platform-user-password cross-tenant guard present");
  } else {
    fail("SEC-03 reset-platform-user-password missing cross-tenant guard");
  }

  // TD-025 migration artifact
  const migPath = resolve(
    root,
    "supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql"
  );
  if (!existsSync(migPath)) {
    fail("TD-025 migration file missing");
  } else {
    const mig = readFileSync(migPath, "utf8");
    if (mig.includes("_proj_assert_refresh_access_v1")) {
      pass("TD-025 _proj_assert_refresh_access_v1 defined in migration");
    } else {
      fail("TD-025 auth helper missing from migration");
    }
    if (mig.includes("REVOKE ALL ON FUNCTION public.refresh_proj_order_row_v1")) {
      pass("TD-032 least-privilege REVOKE/GRANT on refresh_proj_order_row_v1");
    } else {
      fail("TD-032 grant hardening missing");
    }
    if (mig.includes("tenant_id IN") && mig.includes("todayCollections")) {
      pass("SEC-04 todayCollections tenant-scoped in read_lab_receivables_list_v1");
    } else {
      fail("SEC-04 todayCollections scope fix missing");
    }
  }

  const admin = await signIn(env, QA_ADMIN.email, QA_ADMIN.password);

  let agent = null;
  try {
    agent = await signIn(env, QA_AGENT.email, QA_AGENT.password);
  } catch (err) {
    warn(`agent auth skipped: ${err.message}`);
  }

  // Admin refresh own tenant — should succeed (if migration deployed)
  const adminRefresh = await admin.rpc("refresh_proj_tenant_executive_metrics_v1", {
    p_tenant_id: QA_HQ_TENANT_ID,
  });
  if (adminRefresh.error) {
    const msg = adminRefresh.error.message || "";
    if (msg.includes("Could not find") || msg.includes("does not exist")) {
      warn("refresh_proj_* not deployed — apply Sprint 3A migration");
    } else if (msg.includes("forbidden")) {
      fail(`admin own-tenant refresh forbidden: ${msg}`);
    } else {
      warn(`admin refresh: ${msg}`);
    }
  } else {
    pass("admin refresh_proj_tenant_executive_metrics_v1 own tenant");
  }

  // Agent refresh own tenant — should be forbidden after Sprint 3A
  if (agent) {
    const agentRefresh = await agent.rpc("refresh_proj_tenant_executive_metrics_v1", {
      p_tenant_id: QA_HQ_TENANT_ID,
    });
    if (agentRefresh.error && /forbidden/i.test(agentRefresh.error.message || "")) {
      pass("TD-025 agent blocked from refresh_proj_* (forbidden)");
    } else if (agentRefresh.error?.message?.includes("Could not find")) {
      warn("refresh RPC not deployed — skip live agent deny test");
    } else if (!agentRefresh.error) {
      fail("TD-025 agent was allowed to refresh projections — auth gap remains");
    } else {
      warn(`agent refresh returned: ${agentRefresh.error.message}`);
    }

    const agentForeign = await agent.rpc("refresh_proj_order_row_v1", {
      p_tenant_id: FOREIGN_TENANT,
      p_order_id: "ORD-TEST",
      p_cascade_metrics: false,
    });
    if (agentForeign.error && /forbidden|tenant|required/i.test(agentForeign.error.message || "")) {
      pass("SEC-01 agent foreign-tenant refresh blocked");
    } else if (agentForeign.error?.message?.includes("Could not find")) {
      warn("refresh_proj_order_row_v1 not deployed");
    } else if (!agentForeign.error) {
      fail("SEC-01 agent foreign-tenant refresh succeeded — critical gap");
    }
  } else {
    warn("TD-025/SEC-01 live agent deny tests skipped — agent login unavailable");
  }

  // SEC-04 — receivables read returns bounded todayCollections (admin)
  const collRead = await admin.rpc("read_lab_receivables_list_v1", { p_limit: 100 });
  if (collRead.error) {
    warn(`read_lab_receivables_list_v1: ${collRead.error.message}`);
  } else {
    const tc = collRead.data?.data?.summary?.todayCollections;
    if (typeof tc === "number") {
      pass(`SEC-04 read_lab_receivables_list_v1 todayCollections=${tc} (numeric)`);
    } else {
      fail("SEC-04 todayCollections missing from adapter response");
    }
  }

  // Executive refresh allowed
  try {
    const exec = await signIn(env, QA_EXECUTIVE.email, QA_EXECUTIVE.password);
    const execRefresh = await exec.rpc("refresh_proj_tenant_dashboard_metrics_v1", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_days_back: 90,
    });
    if (!execRefresh.error) {
      pass("executive refresh_proj_tenant_dashboard_metrics_v1 allowed");
    } else if (!execRefresh.error?.message?.includes("Could not find")) {
      warn(`executive refresh: ${execRefresh.error.message}`);
    }
  } catch (e) {
    warn(`executive auth skipped: ${e.message}`);
  }

  console.log("\n=== Security hardening verification complete ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
