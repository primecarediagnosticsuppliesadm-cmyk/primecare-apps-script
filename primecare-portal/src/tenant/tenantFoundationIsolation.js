import { supabase } from "@/api/supabaseClient.js";
import { TENANT_ISOLATION_TABLE_SPECS } from "@/validation/tenantIsolationManifest.js";
import { readOperationalEvidenceIndex } from "@/api/operationalEvidenceApi.js";

const FOUNDATION_SPEC_IDS = new Set([
  "orders",
  "collections",
  "visits",
  "inventory",
  "qualifications",
]);

function findForeignTenants(rows, tenantColumn, expectedTenantId) {
  const foreign = new Set();
  for (const row of rows || []) {
    const tid = String(row?.[tenantColumn] ?? "").trim();
    if (tid && expectedTenantId && tid !== expectedTenantId) foreign.add(tid);
  }
  return [...foreign];
}

async function probeTable(spec, limit = 40) {
  if (!supabase) {
    return { rows: [], error: "Supabase not configured", queryError: true };
  }
  const cols = spec.selectColumns.join(",");
  const { data, error } = await supabase.from(spec.table).select(cols).limit(limit);
  return {
    rows: Array.isArray(data) ? data : [],
    error: error?.message || null,
    queryError: Boolean(error),
  };
}

/**
 * Evidence isolation: local index must not reference other tenant ids.
 */
function checkEvidenceIsolation(homeTenantId) {
  if (!homeTenantId || typeof window === "undefined") {
    return { id: "evidence", label: "Evidence", status: "WARN", detail: "No tenant context" };
  }
  try {
    const rows = readOperationalEvidenceIndex(homeTenantId) || [];
    const foreign = rows.filter((r) => r.tenantId && r.tenantId !== homeTenantId);
    if (foreign.length > 0) {
      return {
        id: "evidence",
        label: "Evidence",
        status: "FAIL",
        detail: `${foreign.length} index row(s) reference another tenant`,
      };
    }
    return {
      id: "evidence",
      label: "Evidence",
      status: "PASS",
      detail: rows.length ? `${rows.length} indexed item(s) scoped` : "Empty index (OK)",
    };
  } catch (err) {
    return {
      id: "evidence",
      label: "Evidence",
      status: "WARN",
      detail: err?.message || "Evidence index unreadable",
    };
  }
}

/**
 * @param {string} tenantId
 * @returns {Promise<Array<{ id: string, label: string, status: 'PASS'|'FAIL'|'WARN', detail: string }>>}
 */
export async function runTenantFoundationIsolationChecks(tenantId) {
  const specs = TENANT_ISOLATION_TABLE_SPECS.filter((s) => FOUNDATION_SPEC_IDS.has(s.id));
  const results = [];

  for (const spec of specs) {
    const probe = await probeTable(spec);
    if (probe.queryError) {
      results.push({
        id: spec.id,
        label: spec.label,
        status: spec.optional ? "WARN" : "FAIL",
        detail: probe.error || "Probe failed",
      });
      continue;
    }
    const foreign = findForeignTenants(probe.rows, spec.tenantColumn, tenantId);
    if (foreign.length > 0) {
      results.push({
        id: spec.id,
        label: spec.label,
        status: "FAIL",
        detail: `Cross-tenant leakage: ${foreign.slice(0, 3).join(", ")}`,
      });
    } else {
      results.push({
        id: spec.id,
        label: spec.label,
        status: "PASS",
        detail:
          probe.rows.length > 0
            ? `${probe.rows.length} row(s) match tenant`
            : "No rows (empty scope)",
      });
    }
  }

  results.push(checkEvidenceIsolation(tenantId));
  return results;
}

export function isolationChecksPass(checks) {
  return (checks || []).every((c) => c.status === "PASS");
}
