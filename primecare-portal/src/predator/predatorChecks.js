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
        actual: { profileTenantId, foreignTenants: foreign, table: step },
        rootCauseGuess: "Multi-tenant data leak or mixed seed across tenants",
        suggestedFix: "Never merge tenants in client; fix RLS tenant predicate",
        severity: "critical",
        issueClass: "tenant_isolation",
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
      issueClass: "tenant_isolation",
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
export function checkRoleAccess({ module, step, ctx, role, allowedRoles, failWhenDenied = false }) {
  const ok = allowedRoles.includes(String(role || "").toLowerCase());
  const status = ok ? "PASS" : failWhenDenied ? "FAIL" : "WARN";
  return [
    createPredatorEntry({
      status,
      module,
      step,
      expected: `role in [${allowedRoles.join(", ")}]`,
      actual: { role },
      rootCauseGuess: ok ? "" : "User role may not match module intent",
      suggestedFix: ok ? "" : "Verify PERMISSIONS map and profile.role",
      severity: ok ? "low" : status === "FAIL" ? "high" : "medium",
      issueClass: ok ? undefined : "security",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    }),
  ];
}

/**
 * Security drift across pipeline layers with first divergence detection.
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {Record<string, number|null|undefined>} p.layers — keys: rls, api, ui, state, cache
 * @param {string} [p.label]
 */
export function checkSecurityLayersAgreement({ module, step, ctx, layers, label = "" }) {
  const layerOrder = ["rls", "api", "normalize", "state", "cache", "ui"];
  const comparable = layerOrder
    .map((id) => ({ id, value: layers?.[id] }))
    .filter((e) => e.value !== null && e.value !== undefined && Number.isFinite(Number(e.value)));

  if (comparable.length === 0) {
    return [
      createPredatorEntry({
        status: "WARN",
        module,
        step: `${step}.layers_missing`,
        expected: label || "comparable security layers",
        actual: layers,
        rootCauseGuess: "Partial observability — not all layers reported",
        suggestedFix: "Pass UI snapshot into isolation validation",
        severity: "low",
        issueClass: "data_integrity",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      }),
    ];
  }

  const first = Number(comparable[0].value);
  let firstDivergence = null;
  for (let i = 1; i < comparable.length; i += 1) {
    if (Number(comparable[i].value) !== first) {
      firstDivergence = comparable[i].id;
      break;
    }
  }

  if (firstDivergence) {
    return [
      createPredatorEntry({
        status: "FAIL",
        module,
        step: `${step}.security_drift`,
        expected: "authorized layer agreement",
        actual: { layers, firstDivergenceLayer: firstDivergence, comparable },
        rootCauseGuess: `Cross-layer drift — first divergence at ${firstDivergence}`,
        suggestedFix: "Trace RLS → API mapping → React state → rendered UI for this metric",
        severity: "high",
        issueClass: "tenant_isolation",
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
      step: `${step}.security_agreement`,
      expected: label || "layers agree",
      actual: { layers, agreedValue: first },
      issueClass: "tenant_isolation",
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
/**
 * Mutable metric: PASS when all provided layers agree; FAIL only on cross-layer drift.
 * @param {Object} p
 * @param {string} p.module
 * @param {string} p.step
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} p.ctx
 * @param {Record<string, number|null|undefined>} p.layers
 * @param {string} [p.label]
 */
export function checkMutableLayersAgreement({ module, step, ctx, layers, label = "" }) {
  const comparable = Object.entries(layers || {}).filter(
    ([, value]) => value !== null && value !== undefined && Number.isFinite(Number(value))
  );

  if (comparable.length === 0) {
    return [
      createPredatorEntry({
        status: "WARN",
        module,
        step,
        expected: label || "at least one comparable layer",
        actual: layers,
        rootCauseGuess: "No layer values available for mutable metric check",
        suggestedFix: "Ensure UI snapshot is passed into Predator validation",
        severity: "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      }),
    ];
  }

  const values = comparable.map(([, value]) => Number(value));
  const first = values[0];
  const drift = values.some((v) => v !== first);

  if (drift) {
    return [
      createPredatorEntry({
        status: "FAIL",
        module,
        step,
        expected: "DB, API, and UI agree on mutable visit metric",
        actual: { ...layers, comparable: Object.fromEntries(comparable) },
        rootCauseGuess:
          "Cross-layer drift on a mutable operational metric (mapping, filter, or stale UI state)",
        suggestedFix:
          "Trace filterVisitsForUser, recent visit slice(10), and today date field (visit_date)",
        severity: "high",
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
      step,
      expected: label || "layers agree",
      actual: { ...layers, agreedValue: first },
      rootCauseGuess: "",
      suggestedFix: "",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    }),
  ];
}

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
