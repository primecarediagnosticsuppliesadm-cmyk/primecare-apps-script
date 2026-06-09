import { supabase } from "@/api/supabaseClient.js";
import { IS_DEV, IS_QA } from "@/config/environment.js";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/** Insert-safe columns for public.agent_visits (pilot schema + auth migration). */
export const AGENT_VISITS_INSERT_COLUMNS = [
  "tenant_id",
  "visit_id",
  "lab_id",
  "agent_id",
  "agent_name",
  "visit_date",
  "visit_type",
  "notes",
  "follow_up_required",
  "next_follow_up_date",
];

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
    "total_amount",
    "order_date",
    "created_at",
    "updated_at",
    "notes",
    "inventory_updated",
    "ar_posted",
  ],
  ar_credit_control: [
    "lab_id",
    "tenant_id",
    "outstanding",
    "outstanding_amount",
    "total_paid",
    "lab_name",
  ],
  agent_visits: [...AGENT_VISITS_INSERT_COLUMNS, "id", "created_at"],
  inventory: [
    "product_id",
    "tenant_id",
    "current_stock",
    "min_stock",
    "created_at",
    "updated_at",
  ],
  lab_contracts: [
    "id",
    "contract_number",
    "distributor_id",
    "registry_tenant_id",
    "lab_id",
    "lab_name",
    "status",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
  ],
  lab_qualifications: [
    "tenant_id",
    "lab_id",
    "qualification_score",
    "qualification_band",
    "founder_review_status",
    "updated_at",
    "created_at",
    "pipeline_stage",
    "pipeline_stage_updated_at",
    "next_follow_up_date",
  ],
  order_lines: ["order_id", "tenant_id", "net_line_total", "quantity"],
  payments: ["payment_id", "lab_id", "tenant_id", "amount_received", "payment_date"],
  inventory_ledger: ["tenant_id", "product_id", "created_at", "updated_at"],
  purchase_orders: ["tenant_id", "purchase_order_id", "created_at", "updated_at"],
  purchase_order_items: ["tenant_id", "purchase_order_id", "created_at", "updated_at"],
  profiles: ["tenant_id", "user_id", "role", "created_at", "updated_at"],
  v_labs_credit: ["tenant_id", "lab_id", "created_at", "updated_at"],
  notification_events: [
    "event_id",
    "tenant_id",
    "event_type",
    "source_module",
    "source_id",
    "severity",
    "status",
    "created_at",
  ],
  notification_templates: [
    "template_id",
    "tenant_id",
    "event_type",
    "channel",
    "active",
    "created_at",
  ],
  notification_preferences: [
    "preference_id",
    "tenant_id",
    "user_id",
    "event_type",
    "channel",
    "enabled",
    "created_at",
  ],
  notification_delivery_log: [
    "delivery_id",
    "tenant_id",
    "event_id",
    "channel",
    "status",
    "attempted_at",
  ],
  distributor_billing_payments: [
    "id",
    "distributor_id",
    "registry_tenant_id",
    "amount",
    "payment_type",
    "payment_date",
    "paid_at",
    "created_at",
    "updated_at",
  ],
  commission_entries: [
    "id",
    "distributor_id",
    "registry_tenant_id",
    "period_ymd",
    "agent_key",
    "agent_name",
    "commission_amount",
    "status",
    "approved_at",
    "paid_at",
    "created_at",
    "updated_at",
  ],
  commission_payouts: [
    "id",
    "distributor_id",
    "registry_tenant_id",
    "period_ymd",
    "total_commission",
    "agent_count",
    "status",
    "paid_at",
    "created_at",
    "updated_at",
  ],
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
 * @param {string[]|{ required?: string[], optional?: string[] }} columnsOrOptions
 * @returns {{ required: string[], optional: string[] }}
 */
function normalizeProjectionColumnOptions(columnsOrOptions) {
  if (Array.isArray(columnsOrOptions)) {
    return { required: columnsOrOptions, optional: [] };
  }
  return {
    required: columnsOrOptions?.required || [],
    optional: columnsOrOptions?.optional || [],
  };
}

/**
 * Diagnosis-only: validate projection columns; recommend select("*") on mismatch.
 * Does NOT change live queries unless caller explicitly uses returned safeProjection.
 * @param {string} tableName
 * @param {string[]|{ required?: string[], optional?: string[] }} columnsOrOptions
 */
export async function diagnoseProjectionColumns(tableName, columnsOrOptions) {
  const { required, optional } = normalizeProjectionColumnOptions(columnsOrOptions);
  const requested = [...required, ...optional];

  if (!isPredatorEnabled() || requested.length === 0) {
    return {
      ok: true,
      safeProjection: "*",
      missing: [],
      missingOptional: [],
      source: "skipped",
    };
  }

  const { columns, source, error } = await resolveTableColumnsForPredator(tableName);

  if (source === "manifest_fallback" && error) {
    console.info(
      `[Predator Schema] information_schema unavailable for ${tableName}; using manifest (${columns.length} columns)`,
      error
    );
  }

  const known = new Set(columns);
  const missingRequired = required.filter((c) => c !== "*" && !known.has(c));
  const missingOptional = optional.filter((c) => c !== "*" && !known.has(c));

  if (missingOptional.length > 0) {
    console.info(
      "[Predator Schema] optional projection column absent",
      tableName,
      missingOptional,
      { source }
    );
  }

  if (missingRequired.length > 0) {
    const entry = createPredatorEntry({
      status: "WARN",
      module: "Schema",
      step: `${tableName}.projection_drift`,
      expected: required,
      actual: {
        missing: missingRequired,
        missingOptional,
        knownColumns: columns.slice(0, 20),
        source,
        ...(source === "manifest_fallback" ? {} : { schemaLookupError: error }),
      },
      rootCauseGuess: "Optimized select() references columns not in schema manifest / information_schema",
      suggestedFix: 'Fail safe to select("*") until projection is verified against schema',
      severity: "medium",
      issueClass: "data_integrity",
    });
    predatorStore.recordError(entry);
    console.warn("[Predator Schema] projection drift", tableName, missingRequired);

    return {
      ok: false,
      safeProjection: "*",
      missing: missingRequired,
      missingOptional,
      source,
    };
  }

  return {
    ok: true,
    safeProjection: required.length ? required.join(",") : "*",
    missing: [],
    missingOptional,
    source,
  };
}

/**
 * Report and log when a write payload includes columns outside the known schema.
 * @param {string} tableName
 * @param {string[]} droppedKeys
 * @param {Record<string, unknown>} [originalRow]
 * @param {string[]} [knownColumns]
 */
export function reportSchemaPayloadDrift(
  tableName,
  droppedKeys,
  originalRow = {},
  knownColumns = []
) {
  if (!droppedKeys?.length) return;

  const expected =
    knownColumns.length > 0
      ? knownColumns
      : PREDATOR_KNOWN_TABLE_COLUMNS[tableName] || [];

  if (isPredatorEnabled()) {
    predatorStore.recordError(
      createPredatorEntry({
        status: "WARN",
        module: "Schema",
        step: `${tableName}.schema_payload_drift`,
        expected,
        actual: { dropped: droppedKeys, sample: originalRow },
        rootCauseGuess:
          "Insert/update payload included columns not present on Supabase table — fields were dropped before write",
        suggestedFix: "Update schema manifest or remap dropped fields into allowed columns (e.g. notes)",
        severity: "medium",
        issueClass: "data_integrity",
      })
    );
  }

  if (IS_DEV || IS_QA) {
    console.warn(
      `[Schema] Dropping unknown ${tableName} payload fields before write:`,
      droppedKeys
    );
  }
}

/**
 * Keep only known columns for a Supabase insert/update row.
 * @param {string} tableName
 * @param {Record<string, unknown>} row
 * @param {string[]} knownColumns
 */
export function sanitizeRowToKnownColumns(tableName, row, knownColumns) {
  const allowed = new Set(knownColumns);
  const safe = /** @type {Record<string, unknown>} */ ({});
  const dropped = [];

  for (const [key, value] of Object.entries(row || {})) {
    if (allowed.has(key)) {
      safe[key] = value;
    } else {
      dropped.push(key);
    }
  }

  if (dropped.length) {
    reportSchemaPayloadDrift(tableName, dropped, row, knownColumns);
  }

  return { row: safe, dropped };
}
