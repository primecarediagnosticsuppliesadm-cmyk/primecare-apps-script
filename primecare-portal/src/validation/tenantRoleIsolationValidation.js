import { supabase } from "@/api/supabaseClient.js";
import { IS_PROD, IS_QA } from "@/config/environment.js";
import { hasSupabaseForValidation } from "@/config/qaValidation.js";
import { ROLES } from "@/config/roles.js";
import { PREDATOR_KNOWN_TABLE_COLUMNS } from "@/predator/schemaAwareness.js";
import {
  classifyNotificationTableError,
  resolveNotificationFoundationState,
  shouldSkipNotificationIsolationProbes,
} from "@/notifications/notificationFoundationProbe.js";
import {
  canSeeAllData,
  filterCollectionsForUser,
  filterLabsForUser,
  filterVisitsForUser,
} from "@/utils/accessFilters.js";
import { labIdKey } from "@/utils/labId";
import { buildValidationReport, printQaValidationReport } from "@/validation/qaValidationCore.js";
import {
  TENANT_ISOLATION_TABLE_SPECS,
  TENANT_TABLE_REQUIRED_COLUMNS,
  TENANT_TABLE_OPTIONAL_COLUMNS,
} from "@/validation/tenantIsolationManifest.js";

const PROBE_LIMITS = { quick: 40, deep: 250 };
const PROBE_TIMEOUT_MS = { quick: 1500, deep: 4500 };

function envFlagOrDefault(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

/** Phase 2 isolation validation — QA/dev by default; never on production unless explicitly enabled. */
export function isTenantRoleIsolationValidationEnabled() {
  if (!hasSupabaseForValidation()) return false;
  if (IS_PROD) {
    return envFlagOrDefault("VITE_QA_ISOLATION_VALIDATION", false);
  }
  return envFlagOrDefault("VITE_QA_ISOLATION_VALIDATION", IS_QA || import.meta.env.DEV);
}

/** @returns {'quick'|'deep'} */
function resolveValidationMode() {
  const raw = String(import.meta.env.VITE_QA_ISOLATION_MODE || "").trim().toLowerCase();
  if (raw === "deep") return "deep";
  return "quick";
}

/**
 * @param {string} id
 * @param {string} label
 * @param {'pass'|'warn'|'fail'} status
 * @param {string} message
 * @param {unknown} [expected]
 * @param {Record<string, unknown>} [actual]
 */
function makeCheck(id, label, status, message, expected, actual) {
  return { id, label, status, message, expected, actual };
}

/**
 * @param {import('@/validation/tenantIsolationManifest.js').TenantIsolationTableSpec} spec
 * @param {'quick'|'deep'} mode
 */
async function probeTable(spec, mode) {
  const started = Date.now();
  if (!supabase) {
    return {
      rows: [],
      error: "Supabase not configured",
      durationMs: Date.now() - started,
      queryError: true,
      timedOut: false,
    };
  }

  const cols = spec.selectColumns.join(",");
  const limit = PROBE_LIMITS[mode] ?? PROBE_LIMITS.quick;

  const queryPromise = supabase.from(spec.table).select(cols).limit(limit);
  const timeoutMs = PROBE_TIMEOUT_MS[mode] ?? PROBE_TIMEOUT_MS.quick;
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ data: null, error: { message: "probe_timeout" } }), timeoutMs);
  });

  /** @type {{ data: any, error: any }} */
  // @ts-ignore - Promise.race union types
  const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

  return {
    rows: Array.isArray(data) ? data : [],
    error: error?.message || null,
    durationMs: Date.now() - started,
    queryError: Boolean(error),
    timedOut: String(error?.message || "") === "probe_timeout",
  };
}

/**
 * @param {string} tableName
 */
function schemaTenantColumnWarning(tableName) {
  const known = PREDATOR_KNOWN_TABLE_COLUMNS[tableName] || [];
  const missing = TENANT_TABLE_REQUIRED_COLUMNS.filter((c) => !known.includes(c));
  if (!known.length) {
    return makeCheck(
      `schema.${tableName}.manifest`,
      `Schema manifest: ${tableName}`,
      "warn",
      "No column manifest — cannot confirm tenant_id / timestamps in browser",
      TENANT_TABLE_REQUIRED_COLUMNS,
      { knownColumns: [] }
    );
  }
  if (missing.length === 0) {
    return makeCheck(
      `schema.${tableName}.columns`,
      `Schema awareness: ${tableName}`,
      "pass",
      `Manifest includes ${TENANT_TABLE_REQUIRED_COLUMNS.join(", ")}`,
      TENANT_TABLE_REQUIRED_COLUMNS,
      { knownColumns: known.slice(0, 12) }
    );
  }
  return makeCheck(
    `schema.${tableName}.columns`,
    `Schema awareness: ${tableName}`,
    "warn",
    `Manifest missing columns: ${missing.join(", ")} — cannot validate tenant isolation reliably`,
    TENANT_TABLE_REQUIRED_COLUMNS,
    { missing, knownColumns: known.slice(0, 16) }
  );
}

/**
 * Optional timestamps are INFO-like. We keep them as PASS unless tenant_id is missing.
 * @param {string} tableName
 */
function schemaOptionalColumnsInfo(tableName) {
  const known = PREDATOR_KNOWN_TABLE_COLUMNS[tableName] || [];
  if (!known.length) return null;
  const missing = TENANT_TABLE_OPTIONAL_COLUMNS.filter((c) => !known.includes(c));
  if (missing.length === 0) return null;
  return makeCheck(
    `schema.${tableName}.timestamps`,
    `Schema hints: ${tableName}`,
    "pass",
    `Optional columns not in manifest: ${missing.join(", ")} (not a failure)`,
    TENANT_TABLE_OPTIONAL_COLUMNS,
    { missing }
  );
}

/**
 * @param {object[]} rows
 * @param {string} tenantColumn
 * @param {string|null} profileTenantId
 */
function findForeignTenants(rows, tenantColumn, profileTenantId) {
  if (!profileTenantId) return [];
  const foreign = new Set();
  for (const row of rows) {
    const tid = String(row?.[tenantColumn] ?? "").trim();
    if (tid && tid !== profileTenantId) foreign.add(tid);
  }
  return [...foreign];
}

/**
 * @param {object|null} currentUser
 * @param {object[]} rows
 * @param {import('@/validation/tenantIsolationManifest.js').TenantIsolationTableSpec} spec
 */
function auditRoleScope(currentUser, rows, spec) {
  const role = String(currentUser?.role ?? "").toLowerCase();
  if (!rows.length) {
    return makeCheck(
      `role.${spec.id}.scope`,
      `Role scope: ${spec.label}`,
      "pass",
      "No rows visible under current RLS (empty scope is valid)",
      { role, scope: spec.scope },
      { rowCount: 0 }
    );
  }

  if (canSeeAllData(currentUser)) {
    return makeCheck(
      `role.${spec.id}.scope`,
      `Role scope: ${spec.label}`,
      "pass",
      "Admin/executive tenant-wide visibility expected",
      { role },
      { rowCount: rows.length }
    );
  }

  if (!spec.allowedRoles.includes(role)) {
    return makeCheck(
      `role.${spec.id}.access`,
      `Role access: ${spec.label}`,
      "fail",
      `Role "${role}" received ${rows.length} row(s) but module allows [${spec.allowedRoles.join(", ")}] only`,
      { allowedRoles: spec.allowedRoles },
      { role, rowCount: rows.length, firstDivergenceLayer: "rls" }
    );
  }

  if (role === ROLES.AGENT && spec.scope === "agent_scoped") {
    if (spec.id === "visits") {
      const mapped = rows.map((r) => ({
        agentId: r.agent_id,
        agent: r.agent_name,
        agentName: r.agent_name,
      }));
      const scoped = filterVisitsForUser(mapped, currentUser);
      if (scoped.length !== rows.length) {
        return makeCheck(
          `role.${spec.id}.agent_visits`,
          `Agent visit scope: ${spec.label}`,
          "fail",
          `${rows.length - scoped.length} visit row(s) visible outside agent assignment`,
          { assignedOnly: true },
          {
            rowCount: rows.length,
            authorizedCount: scoped.length,
            firstDivergenceLayer: "rls",
          }
        );
      }
    }
    if (spec.id === "labs") {
      // v_labs_credit may not expose assignment columns; avoid false FAIL.
      const sample = rows[0] || {};
      const hasAssignment =
        "assigned_agent_id" in sample ||
        "assignedAgentId" in sample ||
        "agent_id" in sample ||
        "agentId" in sample ||
        "agent_name" in sample ||
        "agentName" in sample;
      if (!hasAssignment) {
        return makeCheck(
          `role.${spec.id}.agent_labs_unsupported`,
          `Agent lab scope: ${spec.label}`,
          "warn",
          "Agent isolation cannot be validated for v_labs_credit because no assigned agent fields are exposed by this view.",
          { requiredAny: ["assigned_agent_id", "agent_id", "agent_name"] },
          { visibleRowCount: rows.length, firstDivergenceLayer: "rls" }
        );
      }
      const mapped = rows.map((r) => ({
        labId: r.lab_id,
        assignedAgentId: r.assigned_agent_id || r.agent_id,
        assignedAgent: r.agent_name,
        area: r.area,
      }));
      const scoped = filterLabsForUser(mapped, currentUser);
      if (scoped.length !== rows.length) {
        return makeCheck(
          `role.${spec.id}.agent_labs`,
          `Agent lab scope: ${spec.label}`,
          "fail",
          `${rows.length - scoped.length} lab row(s) visible outside agent assignment`,
          { assignedOnly: true },
          {
            rowCount: rows.length,
            authorizedCount: scoped.length,
            firstDivergenceLayer: "rls",
          }
        );
      }
    }
    if (spec.id === "collections") {
      // ar_credit_control often lacks agent assignment columns; avoid false FAIL.
      const sample = rows[0] || {};
      const hasAssignment =
        "agent_id" in sample ||
        "agentId" in sample ||
        "assigned_agent_id" in sample ||
        "assignedAgentId" in sample ||
        "assigned_agent" in sample ||
        "assignedAgent" in sample;
      if (!hasAssignment) {
        return makeCheck(
          `role.${spec.id}.agent_collections_unsupported`,
          `Agent collection scope: ${spec.label}`,
          "warn",
          "Agent isolation cannot be validated for ar_credit_control because no assigned agent fields are exposed by this view.",
          { requiredAny: ["agent_id", "assigned_agent_id", "assigned_agent"] },
          { visibleRowCount: rows.length, firstDivergenceLayer: "rls" }
        );
      }
      const mapped = rows.map((r) => ({
        labId: r.lab_id,
        labName: r.lab_name,
        agentId: r.agent_id,
      }));
      const scoped = filterCollectionsForUser(mapped, currentUser);
      if (scoped.length !== rows.length) {
        return makeCheck(
          `role.${spec.id}.agent_collections`,
          `Agent collection scope: ${spec.label}`,
          "fail",
          `${rows.length - scoped.length} collection row(s) outside agent scope`,
          { assignedOnly: true },
          {
            rowCount: rows.length,
            authorizedCount: scoped.length,
            firstDivergenceLayer: "rls",
          }
        );
      }
    }
  }

  if (role === ROLES.LAB && spec.scope === "lab_scoped") {
    const profileLabId = labIdKey(currentUser?.labId || currentUser?.lab_id || "");
    const profileName = String(currentUser?.name || currentUser?.labName || "").trim().toLowerCase();
    const unauthorized = rows.filter((r) => {
      const rowLabId = labIdKey(r.lab_id);
      if (profileLabId && rowLabId) return rowLabId !== profileLabId;
      const rowName = String(r.lab_name || r.labName || "").trim().toLowerCase();
      if (profileName && rowName) return rowName !== profileName;
      return false;
    });
    if (unauthorized.length > 0) {
      return makeCheck(
        `role.${spec.id}.lab_scope`,
        `Lab scope: ${spec.label}`,
        "fail",
        `${unauthorized.length} row(s) belong to another lab under current JWT`,
        { ownLabOnly: true },
        {
          rowCount: rows.length,
          unauthorizedCount: unauthorized.length,
          firstDivergenceLayer: "rls",
        }
      );
    }
  }

  if (role === ROLES.LAB && spec.scope === "admin_only" && rows.length > 0) {
    return makeCheck(
      `role.${spec.id}.lab_denied`,
      `Lab denied table: ${spec.label}`,
      "fail",
      `Lab role must not see ${spec.table} rows (got ${rows.length})`,
      { expectedRows: 0 },
      { rowCount: rows.length, firstDivergenceLayer: "rls" }
    );
  }

  if (role === ROLES.AGENT && spec.scope === "admin_only" && rows.length > 0) {
    return makeCheck(
      `role.${spec.id}.agent_denied`,
      `Agent denied table: ${spec.label}`,
      "warn",
      `Agent received ${rows.length} row(s) from admin-only table — confirm RLS intent`,
      { expectedRows: 0 },
      { rowCount: rows.length, firstDivergenceLayer: "rls" }
    );
  }

  return makeCheck(
    `role.${spec.id}.scope`,
    `Role scope: ${spec.label}`,
    "pass",
    `Role "${role}" scope matches ${rows.length} visible row(s)`,
    { role, scope: spec.scope },
    { rowCount: rows.length }
  );
}

/**
 * @param {Object} params
 * @param {object|null} [params.currentUser]
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [params.ctx]
 * @param {Record<string, { db?: number, api?: number, ui?: number }>} [params.layerSnapshots]
 * @param {boolean} [params.printReport]
 */
export async function runTenantRoleIsolationValidation({
  currentUser,
  ctx = null,
  layerSnapshots = {},
  printReport = false,
}) {
  const checks = [];
  const profileTenantId = String(
    ctx?.tenantId ?? currentUser?.tenantId ?? currentUser?.tenant_id ?? ""
  ).trim() || null;
  const role = String(ctx?.role ?? currentUser?.role ?? "").toLowerCase();

  if (!isTenantRoleIsolationValidationEnabled()) {
    const report = buildValidationReport("Tenant + Role Isolation (Phase 2)", [
      makeCheck(
        "environment.disabled",
        "Environment guard",
        "warn",
        "Tenant/role isolation validation is disabled in this environment",
        { enabled: true },
        { IS_PROD, IS_QA }
      ),
    ]);
    if (printReport) printQaValidationReport(report);
    return report;
  }

  if (IS_PROD) {
    checks.push(
      makeCheck(
        "environment.production",
        "Production guard",
        "warn",
        "Isolation validation running in production — read-only probes only; confirm VITE_QA_ISOLATION_VALIDATION intent",
        { production: false },
        { IS_PROD: true }
      )
    );
  }

  checks.push(
    makeCheck(
      "environment.read_only",
      "Mutation guard",
      "pass",
      "Validation uses anon JWT read probes only (no service role, no writes)",
      "read_only",
      { serviceRole: false }
    )
  );

  if (!profileTenantId) {
    checks.push(
      makeCheck(
        "tenant.profile_missing",
        "Profile tenant_id",
        "warn",
        "No tenant_id on profile — tenant isolation checks are limited",
        "tenant_id present",
        { role, userId: ctx?.userId ?? currentUser?.id }
      )
    );
  } else {
    checks.push(
      makeCheck(
        "tenant.profile",
        "Profile tenant context",
        "pass",
        `Active tenant ${profileTenantId}`,
        profileTenantId,
        { role, userId: ctx?.userId ?? currentUser?.id }
      )
    );
  }

  const validationStarted = Date.now();
  let totalProbeMs = 0;
  let probes = 0;
  let tablesWithData = 0;
  let slowest = { table: "", durationMs: 0 };
  const mode = resolveValidationMode();
  const notificationFoundationState = await resolveNotificationFoundationState();

  if (shouldSkipNotificationIsolationProbes(notificationFoundationState)) {
    checks.push(
      makeCheck(
        "notifications.foundation",
        "Notification Foundation",
        "info",
        notificationFoundationState.message,
        "tables installed and VITE_NOTIFICATIONS_FOUNDATION_ENABLED=true",
        {
          mode: notificationFoundationState.mode,
          enabled: notificationFoundationState.enabled,
          suggestedFix: notificationFoundationState.suggestedFix,
          error: notificationFoundationState.error,
        }
      )
    );
  }

  for (const spec of TENANT_ISOLATION_TABLE_SPECS) {
    if (spec.notificationsFoundation && shouldSkipNotificationIsolationProbes(notificationFoundationState)) {
      checks.push(
        makeCheck(
          `tenant.${spec.id}.setup_pending`,
          `RLS probe: ${spec.label}`,
          "info",
          notificationFoundationState.message,
          "successful read when foundation is active",
          {
            table: spec.table,
            mode: notificationFoundationState.mode,
            optional: spec.optional,
          }
        )
      );
      continue;
    }

    checks.push(schemaTenantColumnWarning(spec.table));
    const opt = schemaOptionalColumnsInfo(spec.table);
    if (opt) checks.push(opt);

    probes += 1;
    const probe = await probeTable(spec, mode);
    totalProbeMs += probe.durationMs;
    if (probe.durationMs > slowest.durationMs) {
      slowest = { table: spec.table, durationMs: probe.durationMs };
    }

    if (probe.queryError) {
      let probeStatus = "warn";
      let probeMessage =
        probe.timedOut
          ? `Probe timed out after ${PROBE_TIMEOUT_MS[mode]}ms — degraded to WARN (table not skipped)`
          : probe.error || "Query failed — table may be missing or RLS blocked";

      if (spec.notificationsFoundation) {
        const kind = classifyNotificationTableError(probe.error);
        if (kind === "missing_table" || kind === "schema_cache") {
          probeStatus = "info";
          probeMessage =
            kind === "schema_cache"
              ? "Notification tables may need schema cache refresh"
              : "Notification Foundation tables not installed yet";
        } else if (notificationFoundationState.mode === "ready") {
          probeStatus = spec.optional ? "warn" : "warn";
          probeMessage = probe.error || "RLS probe failed for notification table";
        }
      }

      checks.push(
        makeCheck(
          `tenant.${spec.id}.probe`,
          `RLS probe: ${spec.label}`,
          probeStatus,
          probeMessage,
          "successful read or empty",
          {
            table: spec.table,
            error: probe.error,
            durationMs: probe.durationMs,
            optional: spec.optional,
            timedOut: probe.timedOut,
            mode,
          }
        )
      );
      continue;
    }

    if (probe.rows.length > 0) tablesWithData += 1;

    const foreignTenants = findForeignTenants(
      probe.rows,
      spec.tenantColumn,
      profileTenantId
    );
    if (foreignTenants.length > 0) {
      checks.push(
        makeCheck(
          `tenant.${spec.id}.isolation`,
          `Tenant isolation: ${spec.label}`,
          "fail",
          `Cross-tenant leakage on ${spec.table}: foreign tenant_id [${foreignTenants.join(", ")}]`,
          profileTenantId,
          {
            table: spec.table,
            foreignTenants,
            rowSample: probe.rows.length,
            firstDivergenceLayer: "rls",
          }
        )
      );
    } else if (profileTenantId && probe.rows.length > 0) {
      checks.push(
        makeCheck(
          `tenant.${spec.id}.isolation`,
          `Tenant isolation: ${spec.label}`,
          "pass",
          `All ${probe.rows.length} sampled row(s) match tenant ${profileTenantId}`,
          profileTenantId,
          { table: spec.table, rowCount: probe.rows.length }
        )
      );
    } else {
      checks.push(
        makeCheck(
          `tenant.${spec.id}.isolation`,
          `Tenant isolation: ${spec.label}`,
          "pass",
          probe.rows.length
            ? "Rows returned (tenant column not on sample)"
            : "No rows (empty scope)",
          profileTenantId,
          { table: spec.table, rowCount: probe.rows.length }
        )
      );
    }

    checks.push(auditRoleScope(currentUser, probe.rows, spec));

    const layers = layerSnapshots[spec.id] || layerSnapshots[spec.table];
    if (layers) {
      const comparable = ["db", "api", "ui"]
        .map((key) => ({ key, value: layers[key] }))
        .filter((e) => e.value !== null && e.value !== undefined);

      if (comparable.length >= 2) {
        const first = Number(comparable[0].value);
        const drift = comparable.some((e) => Number(e.value) !== first);
        let firstLayer = null;
        if (drift) {
          for (const entry of comparable) {
            if (Number(entry.value) !== first) {
              firstLayer = entry.key;
              break;
            }
          }
        }
        checks.push(
          makeCheck(
            `layers.${spec.id}.agreement`,
            `Cross-layer: ${spec.label}`,
            drift ? "fail" : "pass",
            drift
              ? `Drift across layers (${comparable.map((c) => `${c.key}=${c.value}`).join(", ")})`
              : `Layers agree at ${first}`,
            { agree: true },
            {
              layers,
              firstDivergenceLayer: firstLayer || "none",
              dbRowCount: probe.rows.length,
            }
          )
        );
      }
    }

    const slowThreshold = mode === "quick" ? 500 : 2000;
    if (probe.durationMs > slowThreshold) {
      checks.push(
        makeCheck(
          `timing.${spec.id}.probe`,
          `Probe timing: ${spec.label}`,
          "warn",
          `RLS probe took ${probe.durationMs}ms (threshold ${slowThreshold}ms; mode ${mode})`,
          `<= ${slowThreshold}ms`,
          { durationMs: probe.durationMs, table: spec.table, mode }
        )
      );
    }
  }

  if (tablesWithData === 0 && profileTenantId) {
    checks.push(
      makeCheck(
        "data.insufficient",
        "QA data coverage",
        "warn",
        "No operational rows visible for current role — isolation probes are inconclusive",
        "at least one scoped table with rows",
        { tablesProbed: TENANT_ISOLATION_TABLE_SPECS.length, role }
      )
    );
  }

  const totalMs = Date.now() - validationStarted;
  const avgProbeMs = probes > 0 ? Math.round(totalProbeMs / probes) : 0;
  checks.push(
    makeCheck(
      "timing.total",
      "Validation duration",
      mode === "quick" ? (totalMs > 5000 ? "warn" : "pass") : totalMs > 15000 ? "warn" : "pass",
      `Full isolation validation ${totalMs}ms (mode ${mode}) — probes ${probes}, avg ${avgProbeMs}ms, slowest ${slowest.table} ${slowest.durationMs}ms`,
      mode === "quick" ? "<= 5000ms" : "<= 15000ms",
      { totalMs, probeMs: totalProbeMs, probes, avgProbeMs, slowest, tablesWithData, mode }
    )
  );

  const report = buildValidationReport("Tenant + Role Isolation (Phase 2)", checks);

  if (printReport) printQaValidationReport(report);

  return report;
}

/**
 * @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check
 */
export function qaCheckToIssueClass(check) {
  if (check.status === "info") return "setup_pending";
  if (check.id.startsWith("notifications.foundation")) return "setup_pending";
  if (check.id.includes("setup_pending")) return "setup_pending";
  if (check.id.startsWith("tenant.")) return "tenant_isolation";
  if (check.id.startsWith("role.")) return "security";
  if (check.id.startsWith("layers.")) return "data_integrity";
  if (check.id.startsWith("schema.")) return "data_integrity";
  if (check.id.startsWith("timing.")) return "performance";
  return "functional";
}
