import { supabase } from "@/api/supabaseClient.js";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * Known public columns for pilot tables (diagnosis-only manifest).
 * Update when schema changes; used when information_schema is not exposed to anon JWT.
 */
export const PREDATOR_KNOWN_TABLE_COLUMNS = {
  orders: [
    "order_id",
    "tenant_id",
    "lab_id",
    "status",
    "order_status",
    "total_amount",
    "order_date",
    "created_at",
  ],
  ar_credit_control: [
    "lab_id",
    "tenant_id",
    "outstanding",
    "outstanding_amount",
    "total_paid",
    "lab_name",
  ],
  agent_visits: ["visit_id", "tenant_id", "lab_id", "agent_id", "visit_date", "created_at"],
  inventory: ["product_id", "tenant_id", "current_stock", "min_stock"],
  lab_qualifications: ["tenant_id", "lab_id", "qualification_score", "updated_at"],
  order_lines: ["order_id", "tenant_id", "net_line_total", "quantity"],
  payments: ["payment_id", "lab_id", "tenant_id", "amount_received", "payment_date"],
};

const schemaColumnCache = new Map();

/**
 * Try information_schema via PostgREST; fall back to manifest.
 * @param {string} tableName
 * @param {string} schema
 */
export async function resolveTableColumnsForPredator(tableName, schema = "public") {
  const cacheKey = `${schema}.${tableName}`;
  if (schemaColumnCache.has(cacheKey)) {
    return schemaColumnCache.get(cacheKey);
  }

  let columns = [];
  let source = "manifest";
  let error = null;

  if (supabase && isPredatorEnabled()) {
    try {
      const { data, error: qErr } = await supabase
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_schema", schema)
        .eq("table_name", tableName);

      if (!qErr && Array.isArray(data) && data.length > 0) {
        columns = data.map((r) => r.column_name).filter(Boolean);
        source = "information_schema";
      } else if (qErr) {
        error = qErr.message;
      }
    } catch (err) {
      error = err?.message || String(err);
    }
  }

  if (!columns.length) {
    columns = PREDATOR_KNOWN_TABLE_COLUMNS[tableName] || [];
    source = error ? "manifest_fallback" : "manifest";
  }

  const result = { tableName, columns, source, error };
  schemaColumnCache.set(cacheKey, result);
  return result;
}

/**
 * Diagnosis-only: validate projection columns; recommend select("*") on mismatch.
 * Does NOT change live queries unless caller explicitly uses returned safeProjection.
 * @param {string} tableName
 * @param {string[]} requestedColumns
 */
export async function diagnoseProjectionColumns(tableName, requestedColumns) {
  if (!isPredatorEnabled() || !requestedColumns?.length) {
    return {
      ok: true,
      safeProjection: "*",
      missing: [],
      source: "skipped",
    };
  }

  const { columns, source, error } = await resolveTableColumnsForPredator(tableName);
  const known = new Set(columns);
  const missing = requestedColumns.filter((c) => c !== "*" && !known.has(c));

  if (missing.length > 0) {
    const entry = createPredatorEntry({
      status: "WARN",
      module: "Schema",
      step: `${tableName}.projection_drift`,
      expected: requestedColumns,
      actual: { missing, knownColumns: columns.slice(0, 20), source, error },
      rootCauseGuess: "Optimized select() references columns not in schema manifest / information_schema",
      suggestedFix: 'Fail safe to select("*") until projection is verified against schema',
      severity: "medium",
      issueClass: "data_integrity",
    });
    predatorStore.recordError(entry);
    console.warn("[Predator Schema] projection drift", tableName, missing);

    return { ok: false, safeProjection: "*", missing, source };
  }

  return { ok: true, safeProjection: requestedColumns.join(","), missing: [], source };
}
