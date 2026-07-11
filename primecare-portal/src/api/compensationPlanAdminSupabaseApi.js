import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS,
  HQ_COMPENSATION_PLAN_READ_COLUMNS,
  HQ_PAYMENT_COLUMNS,
  HQ_AR_COLUMNS,
  HQ_COLLECTIONS_AR_LIMIT,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { COMPENSATION_RULE_VERSION, calculateCollectionEfficiency, calculatePromotionEligibility } from "@/compensation/compensationCalculationEngine.js";
import {
  assertCompensationAdminAction,
  buildRetiredPlanPatch,
  buildVersionHistoryEntry,
  COMPENSATION_ADMIN_ACTIONS,
  COMPENSATION_ASSIGNMENT_STATUSES,
  COMPENSATION_PLAN_STATUSES,
  mergePlanRulesJson,
  nextPlanVersionLabel,
  normalizePlanRulesJson,
  shouldVersionOnEdit,
} from "@/compensation/compensationPlanAdminWorkflow.js";
import {
  assertPlanScopeMatchesEmployee,
  buildNewPlanInputFromRoleScope,
  COMPENSATION_EMPLOYEE_PROFILE_ROLES,
  normalizeCompensationRoleScope,
} from "@/compensation/enterpriseCompensationRoles.js";
import {
  assignmentIdentityPayload,
  employeeDisplayName,
  profileDisplayName,
} from "@/compensation/employeeCompensationIdentity.js";

const PLAN_ADMIN_COLUMNS = `${HQ_COMPENSATION_PLAN_READ_COLUMNS},rules_json,created_by,updated_by,created_at,updated_at`;
const ASSIGNMENT_ADMIN_COLUMNS = `${HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS},assigned_by,assigned_at,metadata,created_at,updated_at`;
const PROFILE_EMPLOYEE_COLUMNS = "user_id,tenant_id,role,agent_id,agent_name,display_name,username,email,active,created_at";

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
  return {
    success: false,
    error: error?.message || String(error || "compensation admin failed"),
    errorCode: error?.code || null,
    data: null,
  };
}

async function insertAuditEvent(client, event) {
  const { error } = await client.from("compensation_audit_events").insert([event]);
  if (error) throw new Error(`compensation_audit_events insert failed: ${error.message}`);
}

function planPayloadFromInput(input = {}, { tenantId, actorUserId, version, status = COMPENSATION_PLAN_STATUSES.DRAFT }) {
  const rules = mergePlanRulesJson(input.rules_json || input.rulesJson || {}, {
    displayName: str(input.displayName || input.planName || input.plan_code || input.planCode),
    ruleVersion: str(input.ruleVersion || COMPENSATION_RULE_VERSION),
    quarterlyBonusMin: input.quarterlyBonusMin,
    quarterlyBonusMax: input.quarterlyBonusMax,
    annualBonusMin: input.annualBonusMin,
    annualBonusMax: input.annualBonusMax,
    manualAdjustmentAllowed: input.manualAdjustmentAllowed,
    penaltiesAllowed: input.penaltiesAllowed,
    promotionMinimumMonths: input.promotionMinimumMonths,
    promotionEnabled: input.promotionEnabled ?? input.promotion_enabled,
    deliveryIncentiveEnabled: input.deliveryIncentiveEnabled ?? input.delivery_incentive_enabled,
    performanceBonusEnabled: input.performanceBonusEnabled ?? input.performance_bonus_enabled,
  });

  return {
    tenant_id: tenantId,
    plan_code: str(input.plan_code || input.planCode || "AGENT_CUSTOM"),
    version: str(version || input.version || "v1"),
    role_scope: normalizeCompensationRoleScope(input.role_scope || input.roleScope || "agent"),
    effective_from: str(input.effective_from || input.effectiveFrom || new Date().toISOString().slice(0, 10)),
    effective_to: input.effective_to || input.effectiveTo || null,
    base_salary: Number(input.base_salary ?? input.baseSalary ?? 0),
    fuel_allowance: Number(input.fuel_allowance ?? input.fuelAllowance ?? 0),
    mobile_allowance: Number(input.mobile_allowance ?? input.mobileAllowance ?? 0),
    commission_rate_bps: Number(input.commission_rate_bps ?? input.commissionRateBps ?? 0),
    promotion_salary: Number(input.promotion_salary ?? input.promotionSalary ?? 0),
    promotion_commission_rate_bps: Number(
      input.promotion_commission_rate_bps ?? input.promotionCommissionRateBps ?? 0
    ),
    promotion_collection_threshold: Number(
      input.promotion_collection_threshold ?? input.promotionCollectionThreshold ?? 0
    ),
    promotion_min_efficiency_pct: Number(
      input.promotion_min_efficiency_pct ?? input.promotionMinEfficiencyPct ?? 0
    ),
    promotion_max_overdue_days: Number(
      input.promotion_max_overdue_days ?? input.promotionMaxOverdueDays ?? 90
    ),
    rules_json: rules,
    status,
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

export async function loadCompensationPlanAdminRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    if (!tenantId) throw new Error("tenant_id_required");

    const [plansRes, assignmentsRes, profilesRes, promotionRes] = await Promise.all([
      db
        .from("compensation_plans")
        .select(PLAN_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("plan_code", { ascending: true })
        .order("version", { ascending: false }),
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false }),
      db
        .from("profiles")
        .select(PROFILE_EMPLOYEE_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("role", COMPENSATION_EMPLOYEE_PROFILE_ROLES)
        .eq("active", true),
      loadPromotionEligibilityAdminRead({ currentUser, client: db }),
    ]);

    if (plansRes.error) throw new Error(`compensation_plans read failed: ${plansRes.error.message}`);
    if (assignmentsRes.error) {
      throw new Error(`compensation_plan_assignments read failed: ${assignmentsRes.error.message}`);
    }
    if (profilesRes.error) throw new Error(`profiles read failed: ${profilesRes.error.message}`);

    return {
      success: true,
      error: null,
      data: {
        compensationPlans: plansRes.data || [],
        planAssignments: assignmentsRes.data || [],
        agentProfiles: profilesRes.data || [],
        employeeProfiles: profilesRes.data || [],
        promotionRows: promotionRes.data?.rows || [],
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export async function loadPromotionEligibilityAdminRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    const arLimit = clampLimit(HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT);
    const paymentLimit = clampLimit(5000, 5000, 5000);

    const [assignmentsRes, plansRes, paymentsRes, arRes] = await Promise.all([
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("assignment_status", COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE),
      db.from("compensation_plans").select(PLAN_ADMIN_COLUMNS).eq("tenant_id", tenantId),
      db
        .from("payments")
        .select(HQ_PAYMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("payment_date", { ascending: true })
        .limit(paymentLimit),
      db.from("ar_credit_control").select(HQ_AR_COLUMNS).eq("tenant_id", tenantId).limit(arLimit),
    ]);

    for (const [label, res] of [
      ["assignments", assignmentsRes],
      ["plans", plansRes],
      ["payments", paymentsRes],
      ["ar", arRes],
    ]) {
      if (res.error) throw new Error(`${label} read failed: ${res.error.message}`);
    }

    const plans = plansRes.data || [];
    const assignments = assignmentsRes.data || [];
    const payments = paymentsRes.data || [];
    const arRows = arRes.data || [];

    const rows = assignments.map((assignment) => {
      const plan = plans.find((row) => row.id === assignment.plan_id) || {};
      const agentPayments = payments.filter((p) => str(p.agent_id) === str(assignment.agent_id));
      const collections = agentPayments.reduce((sum, p) => sum + Number(p.amount_received || 0), 0);
      const agentAr = arRows.filter((row) => str(row.agent_id) === str(assignment.agent_id));
      const collectibleAmount = agentAr.reduce((sum, row) => sum + Number(row.total_delivered || 0), 0);
      const { collectionEfficiencyPct } = calculateCollectionEfficiency({
        collectedCash: collections,
        collectibleAmount,
      });
      const maxOverdueDays = Math.max(0, ...agentAr.map((row) => Number(row.days_overdue || 0)));
      const start = str(assignment.start_date);
      const months =
        start && start.length >= 7
          ? Math.max(
              1,
              (new Date().getUTCFullYear() - new Date(`${start}T00:00:00Z`).getUTCFullYear()) * 12 +
                (new Date().getUTCMonth() - new Date(`${start}T00:00:00Z`).getUTCMonth()) +
                1
            )
          : 0;
      const promotion = calculatePromotionEligibility({
        cumulativeCollectedCash: collections,
        collectionEfficiencyPct,
        maxOverdueDays,
        monthsInPlan: months,
        plan,
      });
      const recommendedNewPlan = promotion.eligible
        ? `${plan.plan_code || "PLAN"} · promoted terms`
        : `${plan.plan_code || "PLAN"} · baseline`;
      return {
        agentId: assignment.agent_id,
        agentName: assignment.agent_name || assignment.agent_id,
        collections,
        efficiencyPct: collectionEfficiencyPct,
        overdueDays: maxOverdueDays,
        months,
        eligible: promotion.eligible,
        recommendedNewPlan,
        blockedReasons: promotion.blockedReasons,
      };
    });

    return { success: true, error: null, data: { rows } };
  } catch (error) {
    return failResult(error);
  }
}

export async function createCompensationPlan({ currentUser, planInput = {}, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.CREATE);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);
    const payload = planPayloadFromInput(planInput, {
      tenantId,
      actorUserId,
      version: str(planInput.version || "v1"),
      status: str(planInput.status || COMPENSATION_PLAN_STATUSES.DRAFT),
    });
    payload.rules_json = mergePlanRulesJson(payload.rules_json, {
      versionHistory: [buildVersionHistoryEntry({ version: payload.version, actorUserId, note: "plan_created" })],
    });

    const insert = await db.from("compensation_plans").insert([payload]).select(PLAN_ADMIN_COLUMNS).single();
    if (insert.error) {
      const err = new Error(`compensation_plans insert failed: ${insert.error.message}`);
      err.code = insert.error.code;
      throw err;
    }

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_created",
      entity_type: "compensation_plan",
      entity_id: insert.data.id,
      actor_user_id: actorUserId,
      actor_role: role,
      after_json: insert.data,
      reason: "compensation_plan_created",
      metadata: { admin_only: true, no_finance_mutation: true },
    });

    return { success: true, error: null, data: insert.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function updateDraftCompensationPlan({
  currentUser,
  planId,
  updates = {},
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.EDIT);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);

    const existing = await db
      .from("compensation_plans")
      .select(PLAN_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", planId)
      .maybeSingle();
    if (existing.error) throw new Error(`compensation_plans read failed: ${existing.error.message}`);
    if (!existing.data) throw new Error("compensation_plan_not_found");
    if (shouldVersionOnEdit(existing.data)) {
      throw new Error("active_plan_requires_new_version");
    }
    if (str(existing.data.status) === COMPENSATION_PLAN_STATUSES.RETIRED) {
      throw new Error("retired_plan_is_immutable");
    }

    const patch = planPayloadFromInput({ ...existing.data, ...updates }, {
      tenantId,
      actorUserId,
      version: existing.data.version,
      status: updates.status || existing.data.status,
    });
    delete patch.created_by;
    patch.updated_by = actorUserId;
    patch.rules_json = mergePlanRulesJson(existing.data.rules_json, patch.rules_json);

    const update = await db
      .from("compensation_plans")
      .update(patch)
      .eq("id", planId)
      .select(PLAN_ADMIN_COLUMNS)
      .single();
    if (update.error) throw new Error(`compensation_plans update failed: ${update.error.message}`);

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_updated",
      entity_type: "compensation_plan",
      entity_id: planId,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: existing.data,
      after_json: update.data,
      reason: "compensation_plan_updated",
      metadata: { admin_only: true },
    });

    return { success: true, error: null, data: update.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function createCompensationPlanVersion({
  currentUser,
  planId,
  updates = {},
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.CREATE_VERSION);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);

    const existing = await db
      .from("compensation_plans")
      .select(PLAN_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", planId)
      .maybeSingle();
    if (existing.error) throw new Error(`compensation_plans read failed: ${existing.error.message}`);
    if (!existing.data) throw new Error("compensation_plan_not_found");

    const nextVersion = nextPlanVersionLabel(existing.data.version);
    const retirePatch = buildRetiredPlanPatch({ actorUserId, reason: "superseded_by_new_version" });
    const retiredRules = mergePlanRulesJson(existing.data.rules_json, retirePatch.rules_json_patch);
    const retire = await db
      .from("compensation_plans")
      .update({
        status: retirePatch.status,
        updated_by: actorUserId,
        rules_json: retiredRules,
      })
      .eq("id", planId)
      .select("id, version, status")
      .single();
    if (retire.error) throw new Error(`compensation_plans retire failed: ${retire.error.message}`);

    const payload = planPayloadFromInput({ ...existing.data, ...updates }, {
      tenantId,
      actorUserId,
      version: nextVersion,
      status: COMPENSATION_PLAN_STATUSES.ACTIVE,
    });
    payload.rules_json = mergePlanRulesJson(existing.data.rules_json, {
      ...normalizePlanRulesJson(updates.rules_json || updates.rulesJson || {}),
      versionHistory: [
        buildVersionHistoryEntry({
          version: nextVersion,
          actorUserId,
          note: `supersedes_${existing.data.version}`,
        }),
      ],
    });

    const insert = await db.from("compensation_plans").insert([payload]).select(PLAN_ADMIN_COLUMNS).single();
    if (insert.error) throw new Error(`compensation_plans version insert failed: ${insert.error.message}`);

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_version_created",
      entity_type: "compensation_plan",
      entity_id: insert.data.id,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: { retired_plan_id: planId, retired_version: existing.data.version },
      after_json: insert.data,
      reason: "compensation_plan_version_created",
      metadata: { assignments_preserved: true, no_finance_mutation: true },
    });

    return { success: true, error: null, data: { newPlan: insert.data, retiredPlan: retire.data } };
  } catch (error) {
    return failResult(error);
  }
}

export async function duplicateCompensationPlan({ currentUser, planId, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.DUPLICATE);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);

    const existing = await db
      .from("compensation_plans")
      .select(PLAN_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", planId)
      .maybeSingle();
    if (existing.error) throw new Error(`compensation_plans read failed: ${existing.error.message}`);
    if (!existing.data) throw new Error("compensation_plan_not_found");

    const payload = planPayloadFromInput(existing.data, {
      tenantId,
      actorUserId,
      version: "v1",
      status: COMPENSATION_PLAN_STATUSES.DRAFT,
    });
    payload.plan_code = `${existing.data.plan_code}_COPY_${Date.now().toString().slice(-6)}`;
    payload.rules_json = mergePlanRulesJson(existing.data.rules_json, {
      displayName: `${normalizePlanRulesJson(existing.data.rules_json).displayName || existing.data.plan_code} Copy`,
      versionHistory: [buildVersionHistoryEntry({ version: "v1", actorUserId, note: "duplicated" })],
    });

    const insert = await db.from("compensation_plans").insert([payload]).select(PLAN_ADMIN_COLUMNS).single();
    if (insert.error) {
      const err = new Error(`compensation_plans duplicate failed: ${insert.error.message}`);
      err.code = insert.error.code;
      throw err;
    }

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_duplicated",
      entity_type: "compensation_plan",
      entity_id: insert.data.id,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: { source_plan_id: planId },
      after_json: insert.data,
      reason: "compensation_plan_duplicated",
    });

    return { success: true, error: null, data: insert.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function deactivateCompensationPlan({
  currentUser,
  planId,
  reason = "plan_deactivated",
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.DEACTIVATE);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);

    const existing = await db
      .from("compensation_plans")
      .select(PLAN_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", planId)
      .maybeSingle();
    if (existing.error) throw new Error(`compensation_plans read failed: ${existing.error.message}`);
    if (!existing.data) throw new Error("compensation_plan_not_found");

    const update = await db
      .from("compensation_plans")
      .update({
        status: COMPENSATION_PLAN_STATUSES.RETIRED,
        updated_by: actorUserId,
        rules_json: mergePlanRulesJson(existing.data.rules_json, {
          retired_at: new Date().toISOString(),
          retired_reason: reason,
        }),
      })
      .eq("id", planId)
      .select(PLAN_ADMIN_COLUMNS)
      .single();
    if (update.error) throw new Error(`compensation_plans deactivate failed: ${update.error.message}`);

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_deactivated",
      entity_type: "compensation_plan",
      entity_id: planId,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: existing.data,
      after_json: update.data,
      reason,
    });

    return { success: true, error: null, data: update.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function changeEmployeePlanAssignment({
  currentUser,
  assignmentId,
  newPlanId,
  effectiveDate,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.CHANGE_PLAN);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);
    const startDate = str(effectiveDate || new Date().toISOString().slice(0, 10));

    const existing = await db
      .from("compensation_plan_assignments")
      .select(ASSIGNMENT_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", assignmentId)
      .maybeSingle();
    if (existing.error) {
      throw new Error(`compensation_plan_assignments read failed: ${existing.error.message}`);
    }
    if (!existing.data) throw new Error("assignment_not_found");

    const endDate = startDate;
    const ended = await db
      .from("compensation_plan_assignments")
      .update({
        assignment_status: COMPENSATION_ASSIGNMENT_STATUSES.ENDED,
        end_date: endDate,
      })
      .eq("id", assignmentId)
      .select("id, plan_id, agent_id, end_date, assignment_status")
      .single();
    if (ended.error) {
      throw new Error(`compensation_plan_assignments end failed: ${ended.error.message}`);
    }

    const created = await db
      .from("compensation_plan_assignments")
      .insert([
        {
          tenant_id: tenantId,
          plan_id: newPlanId,
          profile_user_id: existing.data.profile_user_id,
          agent_id: existing.data.agent_id,
          agent_name: existing.data.agent_name,
          employee_name: existing.data.employee_name || existing.data.agent_name,
          employee_role: existing.data.employee_role,
          assignment_status: COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE,
          start_date: startDate,
          assigned_by: actorUserId,
          metadata: { changed_from_assignment_id: assignmentId },
        },
      ])
      .select(ASSIGNMENT_ADMIN_COLUMNS)
      .single();
    if (created.error) {
      throw new Error(`compensation_plan_assignments insert failed: ${created.error.message}`);
    }

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_assignment_changed",
      entity_type: "compensation_plan_assignment",
      entity_id: created.data.id,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: ended.data,
      after_json: created.data,
      reason: "employee_plan_changed",
      metadata: { history_preserved: true },
    });

    return { success: true, error: null, data: { ended: ended.data, created: created.data } };
  } catch (error) {
    return failResult(error);
  }
}

export async function endEmployeePlanAssignment({
  currentUser,
  assignmentId,
  endDate,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.END_ASSIGNMENT);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);
    const effectiveEnd = str(endDate || new Date().toISOString().slice(0, 10));

    const update = await db
      .from("compensation_plan_assignments")
      .update({
        assignment_status: COMPENSATION_ASSIGNMENT_STATUSES.ENDED,
        end_date: effectiveEnd,
      })
      .eq("tenant_id", tenantId)
      .eq("id", assignmentId)
      .select(ASSIGNMENT_ADMIN_COLUMNS)
      .single();
    if (update.error) {
      throw new Error(`compensation_plan_assignments end failed: ${update.error.message}`);
    }

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_assignment_ended",
      entity_type: "compensation_plan_assignment",
      entity_id: assignmentId,
      actor_user_id: actorUserId,
      actor_role: role,
      after_json: update.data,
      reason: "assignment_ended",
    });

    return { success: true, error: null, data: update.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function activateCompensationPlan({ currentUser, planId, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.EDIT);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);

    const existing = await db
      .from("compensation_plans")
      .select(PLAN_ADMIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", planId)
      .maybeSingle();
    if (existing.error) throw new Error(`compensation_plans read failed: ${existing.error.message}`);
    if (!existing.data) throw new Error("compensation_plan_not_found");
    if (str(existing.data.status) !== COMPENSATION_PLAN_STATUSES.DRAFT) {
      throw new Error("only_draft_plans_can_be_activated");
    }

    const update = await db
      .from("compensation_plans")
      .update({ status: COMPENSATION_PLAN_STATUSES.ACTIVE, updated_by: actorUserId })
      .eq("id", planId)
      .select(PLAN_ADMIN_COLUMNS)
      .single();
    if (update.error) throw new Error(`compensation_plans activate failed: ${update.error.message}`);

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_activated",
      entity_type: "compensation_plan",
      entity_id: planId,
      actor_user_id: actorUserId,
      actor_role: role,
      before_json: existing.data,
      after_json: update.data,
      reason: "compensation_plan_activated",
    });

    return { success: true, error: null, data: update.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function assignEmployeeToPlan({
  currentUser,
  profileUserId,
  planId,
  effectiveDate,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const role = roleFromUser(currentUser);
    assertCompensationAdminAction(role, COMPENSATION_ADMIN_ACTIONS.ASSIGN);
    const tenantId = tenantIdFromUser(currentUser);
    const actorUserId = actorIdFromUser(currentUser);
    const startDate = str(effectiveDate || new Date().toISOString().slice(0, 10));
    const targetProfileUserId = str(profileUserId);
    if (!targetProfileUserId || !planId) throw new Error("profile_user_id_and_plan_id_required");

    const [profileRes, planRes, activeRes] = await Promise.all([
      db
        .from("profiles")
        .select(PROFILE_EMPLOYEE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("user_id", targetProfileUserId)
        .maybeSingle(),
      db
        .from("compensation_plans")
        .select(PLAN_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("id", planId)
        .maybeSingle(),
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("profile_user_id", targetProfileUserId)
        .eq("assignment_status", COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE),
    ]);

    if (profileRes.error) throw new Error(`profiles read failed: ${profileRes.error.message}`);
    if (planRes.error) throw new Error(`compensation_plans read failed: ${planRes.error.message}`);
    if (activeRes.error) {
      throw new Error(`compensation_plan_assignments read failed: ${activeRes.error.message}`);
    }
    if (!profileRes.data) throw new Error("employee_profile_not_found");
    if (!planRes.data) throw new Error("compensation_plan_not_found");
    if ((activeRes.data || []).length) throw new Error("employee_already_has_active_assignment");

    assertPlanScopeMatchesEmployee(planRes.data.role_scope, profileRes.data.role);

    const identity = assignmentIdentityPayload(profileRes.data);
    const created = await db
      .from("compensation_plan_assignments")
      .insert([
        {
          tenant_id: tenantId,
          plan_id: planId,
          profile_user_id: identity.profile_user_id,
          agent_id: identity.agent_id,
          agent_name: identity.agent_name,
          employee_name: identity.employee_name,
          employee_role: identity.employee_role,
          assignment_status: COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE,
          start_date: startDate,
          assigned_by: actorUserId,
          metadata: { assigned_via: "assign_employee_to_plan" },
        },
      ])
      .select(ASSIGNMENT_ADMIN_COLUMNS)
      .single();
    if (created.error) {
      throw new Error(`compensation_plan_assignments insert failed: ${created.error.message}`);
    }

    await insertAuditEvent(db, {
      tenant_id: tenantId,
      event_type: "plan_assigned",
      entity_type: "compensation_plan_assignment",
      entity_id: created.data.id,
      actor_user_id: actorUserId,
      actor_role: role,
      after_json: created.data,
      reason: "employee_plan_assigned",
      metadata: {
        profile_user_id: identity.profile_user_id,
        employee_role: identity.employee_role,
        plan_id: planId,
      },
    });

    return { success: true, error: null, data: created.data };
  } catch (error) {
    return failResult(error);
  }
}

export async function loadCompensationEmployeeDirectoryRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantIdFromUser(currentUser);
    if (!tenantId) throw new Error("tenant_id_required");

    const [profilesRes, assignmentsRes, plansRes] = await Promise.all([
      db
        .from("profiles")
        .select(PROFILE_EMPLOYEE_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("role", COMPENSATION_EMPLOYEE_PROFILE_ROLES)
        .eq("active", true),
      db
        .from("compensation_plan_assignments")
        .select(ASSIGNMENT_ADMIN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("assignment_status", COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE),
      db.from("compensation_plans").select(PLAN_ADMIN_COLUMNS).eq("tenant_id", tenantId),
    ]);

    if (profilesRes.error) throw new Error(`profiles read failed: ${profilesRes.error.message}`);
    if (assignmentsRes.error) {
      throw new Error(`compensation_plan_assignments read failed: ${assignmentsRes.error.message}`);
    }
    if (plansRes.error) throw new Error(`compensation_plans read failed: ${plansRes.error.message}`);

    const assignmentByProfile = new Map(
      (assignmentsRes.data || []).map((row) => [str(row.profile_user_id), row])
    );
    const planById = new Map((plansRes.data || []).map((row) => [row.id, row]));

    const employees = (profilesRes.data || [])
      .map((profile) => {
        const assignment = assignmentByProfile.get(str(profile.user_id));
        const plan = assignment ? planById.get(assignment.plan_id) : null;
        return {
          profileUserId: profile.user_id,
          agentId: profile.agent_id || null,
          employeeName: profileDisplayName(profile),
          role: str(profile.role).toLowerCase(),
          status: profile.active === false ? "inactive" : "active",
          assignmentStatus: assignment?.assignment_status || "unassigned",
          planId: assignment?.plan_id || null,
          planCode: plan?.plan_code || null,
          planVersion: plan?.version || null,
          planName: plan?.rules_json?.displayName || plan?.plan_code || null,
        };
      })
      .sort((a, b) => str(a.employeeName).localeCompare(str(b.employeeName)));

    return { success: true, error: null, data: { employees } };
  } catch (error) {
    return failResult(error);
  }
}

export async function createCompensationPlanFromRoleScope({
  currentUser,
  roleScope,
  overrides = {},
  client = supabase,
} = {}) {
  return createCompensationPlan({
    currentUser,
    planInput: { ...buildNewPlanInputFromRoleScope(roleScope), ...overrides },
    client,
  });
}

export async function saveCompensationPlanAdmin({
  currentUser,
  planId,
  planInput = {},
  client = supabase,
} = {}) {
  if (!planId) return createCompensationPlan({ currentUser, planInput, client });
  const db = ensureClient(client);
  const tenantId = tenantIdFromUser(currentUser);
  const existing = await db
    .from("compensation_plans")
    .select("id, status, version")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  if (existing.error) return failResult(existing.error);
  if (!existing.data) return failResult(new Error("compensation_plan_not_found"));
  if (shouldVersionOnEdit(existing.data)) {
    return createCompensationPlanVersion({ currentUser, planId, updates: planInput, client });
  }
  return updateDraftCompensationPlan({ currentUser, planId, updates: planInput, client });
}
