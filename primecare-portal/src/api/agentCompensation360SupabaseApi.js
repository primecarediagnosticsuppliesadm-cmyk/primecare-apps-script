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
import { buildAgentCompensation360Model } from "@/compensation/agentCompensation360Model.js";
import {
  assertAgentCompensation360Access,
  auditEventMatchesAgent,
} from "@/compensation/agentCompensation360Workflow.js";
import { loadPromotionEligibilityAdminRead } from "@/api/compensationPlanAdminSupabaseApi.js";

const PLAN_ADMIN_COLUMNS = `${HQ_COMPENSATION_PLAN_READ_COLUMNS},rules_json,created_by,updated_by,created_at,updated_at`;
const ASSIGNMENT_ADMIN_COLUMNS = `${HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS},assigned_by,assigned_at,metadata,created_at,updated_at`;
const PROFILE_COLUMNS = "user_id,tenant_id,role,agent_id,agent_name,active,created_at";

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
  return { success: false, error: error?.message || String(error || "agent compensation 360 failed"), data: null };
}

export async function loadAgentCompensation360Read({
  currentUser,
  agentId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    const targetAgentId = str(agentId);
    if (!tenantId || !targetAgentId) {
      return { success: false, error: "tenant_id_and_agent_id_required", data: null };
    }

    assertAgentCompensation360Access(roleFromUser(currentUser), {
      actorAgentId: currentUser?.agentId || currentUser?.agent_id,
      targetAgentId,
      actorProfileUserId: actorIdFromUser(currentUser),
      targetProfileUserId: null,
    });

    const auditLimit = clampLimit(HQ_COMPENSATION_AUDIT_LIMIT, 1, HQ_COMPENSATION_AUDIT_LIMIT);

    const [
      profileRes,
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
      db
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .maybeSingle(),
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .order("start_date", { ascending: false }),
      db.from("compensation_plans").select(PLAN_ADMIN_COLUMNS).eq("tenant_id", tenantId),
      db
        .from("payroll_run_lines")
        .select(HQ_PAYROLL_LINE_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .order("updated_at", { ascending: false })
        .limit(500),
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
      db
        .from("compensation_commission_entries")
        .select(HQ_COMPENSATION_COMMISSION_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("compensation_adjustments")
        .select(HQ_COMPENSATION_ADJUSTMENT_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("compensation_audit_events")
        .select(HQ_COMPENSATION_AUDIT_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(auditLimit),
      db
        .from("v_labs_credit")
        .select(HQ_V_LABS_CREDIT_LIST_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("assigned_agent_id", targetAgentId)
        .limit(200),
      db
        .from("payments")
        .select(HQ_PAYMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("agent_id", targetAgentId)
        .order("payment_date", { ascending: false })
        .limit(5000),
      loadPromotionEligibilityAdminRead({ currentUser, client: db }),
    ]);

    for (const [label, res] of [
      ["profiles", profileRes],
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
      (promotionRes.data?.rows || []).find((row) => str(row.agentId) === targetAgentId) || null;
    const agentAudit = (auditRes.data || []).filter((event) =>
      auditEventMatchesAgent(event, targetAgentId)
    );

    const model = buildAgentCompensation360Model({
      agentId: targetAgentId,
      profile: profileRes.data || {},
      labs: labsRes.data || [],
      assignments: assignmentsRes.data || [],
      plans: plansRes.data || [],
      payrollLines: linesRes.data || [],
      payrollRuns: runsRes.data || [],
      payrollPeriods: periodsRes.data || [],
      commissionEntries: commissionRes.data || [],
      adjustments: adjustmentsRes.data || [],
      auditEvents: agentAudit,
      promotionRow,
      payments: paymentsRes.data || [],
    });

    return { success: true, error: null, data: model };
  } catch (error) {
    return failResult(error);
  }
}

export async function loadAgentCompensationDirectoryRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    if (!tenantId) throw new Error("tenant_id_required");

    const [profilesRes, assignmentsRes] = await Promise.all([
      db
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("role", "agent")
        .eq("active", true),
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("assignment_status", "active"),
    ]);

    if (profilesRes.error) throw new Error(`profiles read failed: ${profilesRes.error.message}`);
    if (assignmentsRes.error) {
      throw new Error(`compensation_plan_assignments read failed: ${assignmentsRes.error.message}`);
    }

    const assignmentByAgent = new Map(
      (assignmentsRes.data || []).map((row) => [str(row.agent_id), row])
    );
    const agents = (profilesRes.data || [])
      .filter((profile) => str(profile.agent_id))
      .map((profile) => {
        const assignment = assignmentByAgent.get(str(profile.agent_id));
        return {
          agentId: profile.agent_id,
          agentName: profile.agent_name || profile.agent_id,
          role: profile.role,
          status: profile.active === false ? "inactive" : "active",
          assignmentStatus: assignment?.assignment_status || "unassigned",
          planId: assignment?.plan_id || null,
        };
      })
      .sort((a, b) => str(a.agentName).localeCompare(str(b.agentName)));

    return { success: true, error: null, data: { agents } };
  } catch (error) {
    return failResult(error);
  }
}
