#!/usr/bin/env node
/**
 * Lab lifecycle status verification.
 *
 * Default mode is read-only/static. Use --apply or CONFIRM_MUTATION=true for
 * the reversible QA transition test.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const REASON = "Sprint 9 Phase 2A reversible lifecycle verification";

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}
function str(v) {
  return String(v ?? "").trim();
}
function key(v) {
  return str(v).toUpperCase();
}
function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );
}
function normalizeStatus(v) {
  return key(v);
}
function normalizeMode(v) {
  const s = str(v).toLowerCase();
  return s || "hq_managed";
}
function stableReceivableSnapshot(row = null) {
  if (!row) return null;
  return {
    outstanding: Number(row.outstanding ?? 0),
    total_paid: Number(row.total_paid ?? 0),
    total_delivered: Number(row.total_delivered ?? 0),
    credit_limit: Number(row.credit_limit ?? 0),
    credit_hold: str(row.credit_hold),
  };
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function signIn(sb, account) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`auth(${account.email}): ${error.message}`);
  return data.session;
}

async function setApiSession(apiSupabase, session) {
  await apiSupabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

async function readLab(sb, tenantId, labId) {
  const { data, error } = await sb
    .from("labs")
    .select("tenant_id, lab_id, lab_name, status, ordering_mode")
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (error) throw new Error(`read lab ${labId}: ${error.message}`);
  return data || null;
}

async function readReceivable(sb, tenantId, labId) {
  const { data, error } = await sb
    .from("ar_credit_control")
    .select("outstanding,total_paid,total_delivered,credit_limit,credit_hold")
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (error) throw new Error(`read AR ${labId}: ${error.message}`);
  return stableReceivableSnapshot(data || null);
}

async function readProjectedProfile(sb, tenantId, labId) {
  const { data, error } = await sb
    .from("proj_lab_profile_v1")
    .select("tenant_id, lab_id, status, ordering_mode")
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (error) throw new Error(`read profile projection ${labId}: ${error.message}`);
  return data || null;
}

async function refreshProfileProjection(sb, tenantId, labId) {
  const { error } = await sb.rpc("refresh_proj_lab_profile_row_v1", {
    p_tenant_id: tenantId,
    p_lab_id: labId,
  });
  if (error) throw new Error(`refresh profile projection ${labId}: ${error.message}`);
}

async function readLifecycleAuditEvents(sb, tenantId, labId) {
  const { data, error } = await sb
    .from("user_provisioning_events")
    .select("event_type,payload,created_at")
    .eq("hq_tenant_id", tenantId)
    .eq("event_type", "updated")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`read lifecycle audit: ${error.message}`);
  return (data || []).filter((event) => {
    const payload = event.payload || {};
    return (
      payload.action === "lab_lifecycle_status_changed" &&
      key(payload.labId || payload.lab_id) === key(labId)
    );
  });
}

function assertStaticContract(api) {
  const drawerSrc = readFileSync(
    resolve(root, "src/components/operations/OperationalLabDrawer.jsx"),
    "utf8"
  );
  const validator = api.validateLabLifecycleTransition;
  if (typeof api.updateLabLifecycleStatusWrite === "function") {
    pass("static.api_export", "updateLabLifecycleStatusWrite exported");
  } else {
    fail("static.api_export", "updateLabLifecycleStatusWrite missing");
  }
  if (typeof validator !== "function") {
    fail("static.validator_export", "validateLabLifecycleTransition missing");
    return;
  }
  pass("static.validator_export", "validateLabLifecycleTransition exported");

  const cases = [
    ["transition.prospect_active.confirm_required", { previousStatus: "PROSPECT", nextStatus: "ACTIVE" }, false],
    [
      "transition.prospect_active.allowed",
      { previousStatus: "PROSPECT", nextStatus: "ACTIVE", confirmed: true },
      true,
    ],
    [
      "transition.active_inactive.reason_required",
      { previousStatus: "ACTIVE", nextStatus: "INACTIVE", confirmed: true },
      false,
    ],
    [
      "transition.active_inactive.allowed",
      { previousStatus: "ACTIVE", nextStatus: "INACTIVE", confirmed: true, reason: REASON },
      true,
    ],
    [
      "transition.inactive_active.allowed",
      { previousStatus: "INACTIVE", nextStatus: "ACTIVE", confirmed: true, reason: REASON },
      true,
    ],
    [
      "transition.active_prospect.blocked",
      { previousStatus: "ACTIVE", nextStatus: "PROSPECT", confirmed: true, reason: REASON },
      false,
    ],
  ];

  for (const [id, input, expected] of cases) {
    const res = validator(input);
    if (Boolean(res?.ok) === expected) pass(id, expected ? "allowed" : res?.code || "blocked");
    else fail(id, `expected ok=${expected}, got ${JSON.stringify(res)}`);
  }

  if (
    drawerSrc.includes("updateLabLifecycleStatusWrite") &&
    drawerSrc.includes("Mandatory reason") &&
    drawerSrc.includes("This blocks new order initiation only") &&
    drawerSrc.includes("Ordering remains suspended")
  ) {
    pass("static.lifecycle_ui", "OperationalLabDrawer lifecycle actions use approved warning/reason UI");
  } else {
    fail("static.lifecycle_ui", "OperationalLabDrawer lifecycle UI contract missing");
  }
}

async function runLiveLifecycleCheck({ sb, apiSupabase, api }) {
  const adminSession = await signIn(sb, QA_ADMIN);
  await setApiSession(apiSupabase, adminSession);
  pass("auth.admin", QA_ADMIN.email);

  const { data: labs, error: labsErr } = await sb
    .from("labs")
    .select("tenant_id, lab_id, lab_name, status, ordering_mode")
    .eq("tenant_id", QA_HQ_TENANT_ID);
  if (labsErr) throw new Error(labsErr.message);

  const target = (labs || []).find(
    (lab) => normalizeStatus(lab.status) === "ACTIVE" && normalizeMode(lab.ordering_mode) !== "suspended"
  );
  if (!target) {
    fail("fixture.active_lab", "No ACTIVE non-suspended lab available for reversible lifecycle verification");
    return;
  }

  const labId = key(target.lab_id);
  const originalStatus = normalizeStatus(target.status);
  const originalOrderingMode = normalizeMode(target.ordering_mode);
  const originalReceivable = await readReceivable(sb, QA_HQ_TENANT_ID, labId);
  pass("fixture.active_lab", `${labId} (${originalOrderingMode})`);

  let cleanupNeeded = false;
  try {
    const inactivate = await api.updateLabLifecycleStatusWrite({
      tenantId: QA_HQ_TENANT_ID,
      labId,
      nextStatus: "INACTIVE",
      confirmed: true,
      reason: REASON,
      notes: "Reversible QA verification; restore follows in finally block.",
      originatingScreen: "verify-lab-lifecycle-status-flow.mjs",
    });
    cleanupNeeded = true;
    if (!inactivate?.success) {
      fail("write.active_inactive", inactivate?.error || "ACTIVE -> INACTIVE failed");
      return;
    }
    pass("write.active_inactive", "ACTIVE -> INACTIVE succeeded");

    const inactiveRow = await readLab(sb, QA_HQ_TENANT_ID, labId);
    if (normalizeStatus(inactiveRow?.status) === "INACTIVE") {
      pass("db.status_inactive", "labs.status = INACTIVE");
    } else {
      fail("db.status_inactive", `status=${inactiveRow?.status}`);
    }
    if (normalizeMode(inactiveRow?.ordering_mode) === "suspended") {
      pass("db.ordering_suspended", "ACTIVE -> INACTIVE forced ordering_mode=suspended");
    } else {
      fail("db.ordering_suspended", `ordering_mode=${inactiveRow?.ordering_mode}`);
    }

    const projectedInactive = await readProjectedProfile(sb, QA_HQ_TENANT_ID, labId);
    if (
      normalizeStatus(projectedInactive?.status) === "INACTIVE" &&
      normalizeMode(projectedInactive?.ordering_mode) === "suspended"
    ) {
      pass("projection.profile_inactive", "proj_lab_profile_v1 reflects INACTIVE + suspended");
    } else {
      fail("projection.profile_inactive", JSON.stringify(projectedInactive));
    }

    const afterInactiveReceivable = await readReceivable(sb, QA_HQ_TENANT_ID, labId);
    if (sameJson(originalReceivable, afterInactiveReceivable)) {
      pass("finance.receivable_unchanged", "AR/receivable fields unchanged by inactivation");
    } else {
      fail(
        "finance.receivable_unchanged",
        `before=${JSON.stringify(originalReceivable)} after=${JSON.stringify(afterInactiveReceivable)}`
      );
    }

    const reactivate = await api.updateLabLifecycleStatusWrite({
      tenantId: QA_HQ_TENANT_ID,
      labId,
      nextStatus: "ACTIVE",
      confirmed: true,
      reason: REASON,
      notes: "Reversible QA verification; ordering mode must remain suspended after reactivation.",
      originatingScreen: "verify-lab-lifecycle-status-flow.mjs",
    });
    if (!reactivate?.success) {
      fail("write.inactive_active", reactivate?.error || "INACTIVE -> ACTIVE failed");
      return;
    }
    pass("write.inactive_active", "INACTIVE -> ACTIVE succeeded");

    const activeRow = await readLab(sb, QA_HQ_TENANT_ID, labId);
    if (normalizeStatus(activeRow?.status) === "ACTIVE") {
      pass("db.status_active", "labs.status = ACTIVE");
    } else {
      fail("db.status_active", `status=${activeRow?.status}`);
    }
    if (normalizeMode(activeRow?.ordering_mode) === "suspended") {
      pass("db.no_ordering_restore", "reactivation did not restore previous ordering mode");
    } else {
      fail("db.no_ordering_restore", `ordering_mode=${activeRow?.ordering_mode}`);
    }

    const auditEvents = await readLifecycleAuditEvents(sb, QA_HQ_TENANT_ID, labId);
    const hasInactiveAudit = auditEvents.some(
      (event) =>
        event.payload?.previous_status === "ACTIVE" ||
        event.payload?.previous?.status === "ACTIVE"
    );
    const hasActiveAudit = auditEvents.some(
      (event) =>
        event.payload?.new_status === "ACTIVE" ||
        event.payload?.next?.status === "ACTIVE"
    );
    if (hasInactiveAudit && hasActiveAudit) {
      pass("audit.lifecycle_events", "Lifecycle audit events recorded for both transitions");
    } else {
      fail("audit.lifecycle_events", `events=${auditEvents.length}`);
    }

    const labSession = await signIn(sb, QA_LAB);
    await setApiSession(apiSupabase, labSession);
    const unauthorized = await api.updateLabLifecycleStatusWrite({
      tenantId: QA_HQ_TENANT_ID,
      labId,
      nextStatus: "INACTIVE",
      confirmed: true,
      reason: REASON,
      originatingScreen: "verify-lab-lifecycle-status-flow.mjs",
    });
    if (!unauthorized?.success && unauthorized?.code === "unauthorized") {
      pass("auth.lab_blocked", "lab role cannot change lifecycle status");
    } else {
      fail("auth.lab_blocked", `unexpected result=${JSON.stringify(unauthorized)}`);
    }
  } finally {
    if (cleanupNeeded) {
      const restoreSession = await signIn(sb, QA_ADMIN);
      await setApiSession(apiSupabase, restoreSession);
      const current = await readLab(sb, QA_HQ_TENANT_ID, labId);
      if (normalizeStatus(current?.status) !== originalStatus) {
        const restoreStatus = await api.updateLabLifecycleStatusWrite({
          tenantId: QA_HQ_TENANT_ID,
          labId,
          nextStatus: originalStatus,
          confirmed: true,
          reason: "Restore lab lifecycle status after verification",
          originatingScreen: "verify-lab-lifecycle-status-flow.mjs",
        });
        if (!restoreStatus?.success) {
          fail("cleanup.status", restoreStatus?.error || "status restore failed");
        }
      }
      const afterStatus = await readLab(sb, QA_HQ_TENANT_ID, labId);
      if (normalizeMode(afterStatus?.ordering_mode) !== originalOrderingMode) {
        const restoreMode = await api.updateLabOrderingModeWrite({
          tenantId: QA_HQ_TENANT_ID,
          labId,
          orderingMode: originalOrderingMode,
          actorId: "verify-lab-lifecycle-status-flow.mjs",
        });
        if (!restoreMode?.success) {
          fail("cleanup.ordering_mode", restoreMode?.error || "ordering mode restore failed");
        } else {
          await refreshProfileProjection(sb, QA_HQ_TENANT_ID, labId);
          pass("cleanup.ordering_mode", `restored ordering_mode=${originalOrderingMode}`);
        }
      }
    }
  }
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const server = await createServer({
  root,
  configFile: resolve(root, "vite.config.js"),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { supabase: apiSupabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  console.log("\n=== Lab lifecycle status verification ===\n");
  assertStaticContract(api);
  if (!APPLY) {
    warn(
      "mode.read_only",
      "Live reversible transition skipped. Re-run with --apply or CONFIRM_MUTATION=true for full QA verification."
    );
  } else {
    pass("mode.apply", "Running reversible QA lifecycle transition verification");
    await runLiveLifecycleCheck({ sb, apiSupabase, api });
  }
} finally {
  await server.close();
}

if (process.exitCode) {
  console.log("\nOverall: NO-GO\n");
} else {
  console.log("\nOverall: GO\n");
}
