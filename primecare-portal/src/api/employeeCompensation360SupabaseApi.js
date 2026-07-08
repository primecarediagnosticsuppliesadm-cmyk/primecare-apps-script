import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_COMPENSATION_ADJUSTMENT_READ_COLUMNS,
  HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS,
  HQ_COMPENSATION_AUDIT_LIMIT,
  HQ_COMPENSATION_AUDIT_READ_COLUMNS,
  HQ_COMPENSATION_COMMISSION_READ_COLUMNS,
  HQ_COMPENSATION_PLAN_READ_COLUMNS,
  HQ_PAYMENT_COLUMNS,
  HQ_PAYROLL_LINE_READ_COLUMNS,
  HQ_PAYROLL_PERIOD_READ_COLUMNS,
  HQ_PAYROLL_RUN_READ_COLUMNS,
  HQ_V_LABS_CREDIT_LIST_COLUMNS,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { buildEmployeeCompensation360Model } from "@/compensation/employeeCompensation360Model.js";
import {
  assertEmployeeCompensation360Access,
  auditEventMatchesEmployee,
} from "@/compensation/employeeCompensation360Workflow.js";
import { loadPromotionEligibilityAdminRead } from "@/api/compensationPlanAdminSupabaseApi.js";
import { filterPlansForEmployeeRole } from "@/compensation/enterpriseCompensationRoles.js";

const PLAN_ADMIN_COLUMNS = `${HQ_COMPENSATION_PLAN_READ_COLUMNS},rules_json,created_by,updated_by,created_at,updated_at`;
const ASSIGNMENT_ADMIN_COLUMNS = `${HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS},assigned_by,assigned_at,metadata,created_at,updated_at`;
const PROFILE_COLUMNS = "user_id,tenant_id,role,agent_id,agent_name,display_name,username,email,active,created_at";

function str(value) {
  return String(value ?? "").trim();
}

function tenantIdFromUser(currentUser) {
  return str(currentUser?.tenantId || currentUser?.tenant_id);
}

function roleFromUser(currentUser) {
  return str(currentUser?.role || "executive").toLowerCase();
}

function actorIdFromUser(currentUser) {
  return currentUser?.id || currentUser?.userId || null;
}

function ensureClient(client = supabase) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

function failResult(error) {
  return { success: false, error: error?.message || String(error || "employee compensation 360 failed"), data: null };
}

export async function loadEmployeeCompensation360Read({
  currentUser,
  profileUserId,
  agentId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    const targetProfileUserId = str(profileUserId);
    const targetAgentId = str(agentId);
    if (!tenantId || (!targetProfileUserId && !targetAgentId)) {
      return { success: false, error: "tenant_id_and_employee_identity_required", data: null };
    }

    let profileQuery = db.from("profiles").select(PROFILE_COLUMNS).eq("tenant_id", tenantId);
    if (targetProfileUserId) profileQuery = profileQuery.eq("user_id", targetProfileUserId);
    else profileQuery = profileQuery.eq("agent_id", targetAgentId);

    const profileRes = await profileQuery.maybeSingle();
    if (profileRes.error) throw new Error(`profiles read failed: ${profileRes.error.message}`);
    if (!profileRes.data) throw new Error("employee_profile_not_found");

    const profile = profileRes.data;
    const resolvedProfileUserId = str(profile.user_id);
    const resolvedAgentId = str(profile.agent_id);

    assertEmployeeCompensation360Access(roleFromUser(currentUser), {
      actorAgentId: currentUser?.agentId || currentUser?.agent_id,
      targetAgentId: resolvedAgentId,
      actorProfileUserId: actorIdFromUser(currentUser),
      targetProfileUserId: resolvedProfileUserId,
    });

    const auditLimit = clampLimit(HQ_COMPENSATION_AUDIT_LIMIT, 1, HQ_COMPENSATION_AUDIT_LIMIT);

    const assignmentFilter = (query) => {
      let q = query.eq("tenant_id", tenantId);
      if (resolvedProfileUserId) q = q.eq("profile_user_id", resolvedProfileUserId);
      else if (resolvedAgentId) q = q.eq("agent_id", resolvedAgentId);
      return q.order("start_date", { ascending: false });
    };

    const lineFilter = (query) => {
      let q = query.eq("tenant_id", tenantId);
      if (resolvedProfileUserId) q = q.eq("profile_user_id", resolvedProfileUserId);
      else if (resolvedAgentId) q = q.eq("agent_id", resolvedAgentId);
      return q.order("updated_at", { ascending: false }).limit(500);
    };

    const [
      assignmentsRes,
      plansRes,
      linesRes,
      runsRes,
      periodsRes,
      commissionRes,
      adjustmentsRes,
      auditRes,
      labsRes,
      paymentsRes,
      promotionRes,
    ] = await Promise.all([
      assignmentFilter(db.from("compensation_plan_assignments").select(ASSIGNMENT_ADMIN_COLUMNS)),
      db.from("compensation_plans").select(PLAN_ADMIN_COLUMNS).eq("tenant_id", tenantId),
      lineFilter(db.from("payroll_run_lines").select(HQ_PAYROLL_LINE_READ_COLUMNS)),
      db
        .from("payroll_runs")
        .select(HQ_PAYROLL_RUN_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("payroll_periods")
        .select(HQ_PAYROLL_PERIOD_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("period_ym", { ascending: false })
        .limit(120),
      resolvedAgentId
        ? db
            .from("compensation_commission_entries")
            .select(HQ_COMPENSATION_COMMISSION_READ_COLUMNS)
            .eq("tenant_id", tenantId)
            .eq("agent_id", resolvedAgentId)
            .order("created_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      resolvedAgentId
        ? db
            .from("compensation_adjustments")
            .select(HQ_COMPENSATION_ADJUSTMENT_READ_COLUMNS)
            .eq("tenant_id", tenantId)
            .eq("agent_id", resolvedAgentId)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      db
        .from("compensation_audit_events")
        .select(HQ_COMPENSATION_AUDIT_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(auditLimit),
      resolvedAgentId
        ? db
            .from("v_labs_credit")
            .select(HQ_V_LABS_CREDIT_LIST_COLUMNS)
            .eq("tenant_id", tenantId)
            .eq("assigned_agent_id", resolvedAgentId)
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      resolvedAgentId
        ? db
            .from("payments")
            .select(HQ_PAYMENT_COLUMNS)
            .eq("tenant_id", tenantId)
            .eq("agent_id", resolvedAgentId)
            .order("payment_date", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
      loadPromotionEligibilityAdminRead({ currentUser, client: db }),
    ]);

    for (const [label, res] of [
      ["assignments", assignmentsRes],
      ["plans", plansRes],
      ["payroll_run_lines", linesRes],
      ["payroll_runs", runsRes],
      ["payroll_periods", periodsRes],
      ["commission_entries", commissionRes],
      ["adjustments", adjustmentsRes],
      ["audit_events", auditRes],
      ["labs", labsRes],
      ["payments", paymentsRes],
    ]) {
      if (res.error) throw new Error(`${label} read failed: ${res.error.message}`);
    }

    const promotionRow =
      resolvedAgentId
        ? (promotionRes.data?.rows || []).find((row) => str(row.agentId) === resolvedAgentId) || null
        : null;
    const employeeAudit = (auditRes.data || []).filter((event) =>
      auditEventMatchesEmployee(event, {
        profileUserId: resolvedProfileUserId,
        agentId: resolvedAgentId,
      })
    );

    const model = buildEmployeeCompensation360Model({
      profileUserId: resolvedProfileUserId,
      agentId: resolvedAgentId,
      profile,
      labs: labsRes.data || [],
      assignments: assignmentsRes.data || [],
      plans: plansRes.data || [],
      payrollLines: linesRes.data || [],
      payrollRuns: runsRes.data || [],
      payrollPeriods: periodsRes.data || [],
      commissionEntries: commissionRes.data || [],
      adjustments: adjustmentsRes.data || [],
      auditEvents: employeeAudit,
      promotionRow,
      payments: paymentsRes.data || [],
    });
    model.selectablePlans = filterPlansForEmployeeRole(model.selectablePlans, profile.role);

    return { success: true, error: null, data: model };
  } catch (error) {
    return failResult(error);
  }
}

export async function loadEmployeeCompensationDirectoryRead({ currentUser, client = supabase } = {}) {
  const { loadCompensationEmployeeDirectoryRead } = await import("@/api/compensationPlanAdminSupabaseApi.js");
  const result = await loadCompensationEmployeeDirectoryRead({ currentUser, client });
  if (!result.success) return result;
  return {
    success: true,
    error: null,
    data: {
      employees: result.data?.employees || [],
      agents: (result.data?.employees || []).filter((row) => row.role === "agent"),
    },
  };
}

/** @deprecated Use loadEmployeeCompensation360Read */
export async function loadAgentCompensation360Read(options = {}) {
  return loadEmployeeCompensation360Read(options);
}

/** @deprecated Use loadEmployeeCompensationDirectoryRead */
export async function loadAgentCompensationDirectoryRead(options = {}) {
  return loadEmployeeCompensationDirectoryRead(options);
}
