import { createPredatorEntry } from "@/predator/predatorSchema.js";

/**
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {number} p.dbRowCount
 * @param {number} p.apiCount
 * @param {number|null} [p.uiCount]
 */
export function checkEmptyApiWhenDbHasRows({ module, step, ctx, dbRowCount, apiCount, uiCount }) {
  const entries = [];
  if (dbRowCount > 0 && apiCount === 0) {
    entries.push(
      createPredatorEntry({
        status: "FAIL",
        module,
        step: `${step}.api_vs_db`,
        expected: "API count > 0 when DB has rows",
        actual: { dbRowCount, apiCount },
        rootCauseGuess:
          "PostgREST returned empty while browser RLS read had rows — assignment bug, wrong client, or query error swallowed",
        suggestedFix:
          "Verify timedSupabaseQuery invokes factory, check ordersRes.error, compare select(*) vs probe",
        severity: "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }
  if (uiCount != null && dbRowCount > 0 && uiCount === 0 && apiCount > 0) {
    entries.push(
      createPredatorEntry({
        status: "FAIL",
        module,
        step: `${step}.ui_vs_api`,
        expected: "UI reflects API payload",
        actual: { dbRowCount, apiCount, uiCount },
        rootCauseGuess: "React state mapping or merge layer zeroed KPIs",
        suggestedFix: "Trace setState path and QA direct read bypass for dashboard",
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }
  if (uiCount != null && dbRowCount > 0 && apiCount > 0 && uiCount > 0 && apiCount !== uiCount) {
    entries.push(
      createPredatorEntry({
        status: "WARN",
        module,
        step: `${step}.ui_api_drift`,
        expected: "UI metric aligns with API (where comparable)",
        actual: { dbRowCount, apiCount, uiCount },
        rootCauseGuess: "Different metric definition between API aggregate and UI display",
        suggestedFix: "Confirm KPI formula vs list length",
        severity: "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }
  if (entries.length === 0) {
    entries.push(
      createPredatorEntry({
        status: "PASS",
        module,
        step: `${step}.row_visibility`,
        expected: "No empty-layer drift",
        actual: { dbRowCount, apiCount, uiCount: uiCount ?? null },
        rootCauseGuess: "",
        suggestedFix: "",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }
  return entries;
}

/**
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {string|null} p.profileTenantId
 * @param {string[]} p.rowTenantIds
 */
export function checkTenantConsistency({ module, step, ctx, profileTenantId, rowTenantIds }) {
  const unique = [...new Set((rowTenantIds || []).filter(Boolean))];
  if (!profileTenantId) {
    return [
      createPredatorEntry({
        status: "WARN",
        module,
        step: `${step}.tenant_profile`,
        expected: "profile.tenant_id present",
        actual: { profileTenantId, uniqueTenantsInRows: unique },
        rootCauseGuess: "Profile missing tenant_id — RLS may still scope via JWT",
        suggestedFix: "Verify profiles row for auth user",
        severity: "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      }),
    ];
  }
  const foreign = unique.filter((t) => t !== profileTenantId);
  if (foreign.length > 0) {
    return [
      createPredatorEntry({
        status: "FAIL",
        module,
        step: `${step}.tenant_mixing`,
        expected: `all rows tenant_id = ${profileTenantId}`,
        actual: { profileTenantId, foreignTenants: foreign },
        rootCauseGuess: "Multi-tenant data leak or mixed seed across tenants",
        suggestedFix: "Never merge tenants in client; fix RLS tenant predicate",
        severity: "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      }),
    ];
  }
  return [
    createPredatorEntry({
      status: "PASS",
      module,
      step: `${step}.tenant_consistency`,
      expected: profileTenantId,
      actual: { rowTenantSample: unique.slice(0, 5) },
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    }),
  ];
}

/**
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {string} p.role
 * @param {string[]} p.allowedRoles
 */
export function checkRoleAccess({ module, step, ctx, role, allowedRoles }) {
  const ok = allowedRoles.includes(String(role || "").toLowerCase());
  return [
    createPredatorEntry({
      status: ok ? "PASS" : "WARN",
      module,
      step,
      expected: `role in [${allowedRoles.join(", ")}]`,
      actual: { role },
      rootCauseGuess: ok ? "" : "User role may not match module intent",
      suggestedFix: ok ? "" : "Verify PERMISSIONS map and profile.role",
      severity: ok ? "low" : "medium",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    }),
  ];
}

/**
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {number} p.durationMs
 * @param {number} p.thresholdMs
 */
export function checkSlowStep({ module, step, ctx, durationMs, thresholdMs }) {
  const slow = durationMs > thresholdMs;
  return createPredatorEntry({
    status: slow ? "WARN" : "PASS",
    module,
    step,
    durationMs,
    expected: `<= ${thresholdMs}ms`,
    actual: durationMs,
    rootCauseGuess: slow ? "Slow Supabase read or heavy client compute" : "",
    suggestedFix: slow ? "Check select projection, indexes, parallel query count" : "",
    severity: slow ? "medium" : "low",
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: ctx.userId,
  });
}
