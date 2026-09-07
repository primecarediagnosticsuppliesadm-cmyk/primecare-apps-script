/**
 * VE-2 Agent Visit Evidence persistence — client-injected so verify harnesses
 * can reuse the same contract as the portal API without importing primecareSupabaseApi.
 *
 * Identity (agent_id / tenant_id) is never client-authoritative: VE-1 triggers stamp it.
 * Dashboard visit lists stay on HQ_AGENT_VISIT_COLUMNS (Production-safe).
 */
import {
  HQ_AGENT_VISIT_COLUMNS,
  HQ_AGENT_VISIT_DISCOVERY_LINE_COLUMNS,
  HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT,
  HQ_AGENT_VISIT_EVIDENCE_COLUMNS,
  clampLimit,
} from "../api/hqReadBounds.js";
import {
  buildAgentVisitDiscoveryLineInsertRows,
  mapVisitDiscoveryLineRow,
  mapVisitEvidenceHeaderRow,
  normalizeDiscoveryLinesInput,
  pickVisitEvidenceHeaderFields,
} from "./agentVisitEvidenceContract.js";

const DISCOVERY_LINE_WRITE_COLUMNS = new Set([
  "id",
  "visit_uuid",
  "line_kind",
  "confidence",
  "manufacturer",
  "model",
  "notes",
  "description",
  "brand",
  "monthly_spend_inr",
  "monthly_quantity",
  "supplier",
  "product_category",
  "approx_volume",
  "approx_price_pack",
]);

const HEADER_UPDATE_COLUMNS = new Set([
  "notes",
  "visit_type",
  "visit_date",
  "follow_up_required",
  "next_follow_up_date",
  "next_follow_up_type",
  "next_action",
  "visited_at",
  "decision_maker_met",
  "decision_maker_name",
  "decision_maker_role",
  "commercial_outcome",
  "lab_size_band",
  "estimated_monthly_wallet_inr",
  "wallet_range_band",
  "wallet_confidence",
  "evidence_confidence",
  "reorder_interval",
  "payment_method_or_terms",
  "approx_credit_days",
  "top_complaint",
  "top_complaint_notes",
]);

function str(v) {
  return String(v ?? "").trim();
}

function isMissingColumnOrTable(error) {
  const m = `${error?.message || ""} ${error?.code || ""} ${error?.details || ""}`.toLowerCase();
  return /pgrst204|could not find the table|relation .* does not exist|column .* does not exist|schema cache/.test(
    m
  );
}

function compactDefined(row, allowed) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!allowed.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

export function validateDiscoveryLinesForVisit(lines, visitUuid = "00000000-0000-4000-8000-000000000001") {
  const normalized = Array.isArray(lines) ? lines : normalizeDiscoveryLinesInput({ discoveryLines: lines });
  if (normalized && normalized.error) {
    return { rows: [], error: normalized.error };
  }
  if (!normalized || normalized.length === 0) {
    return { rows: [], error: null };
  }
  return buildAgentVisitDiscoveryLineInsertRows(visitUuid, normalized, {});
}

export async function persistAgentVisitHeader(client, insertRow) {
  if (!client) {
    return { row: null, error: "Supabase client not configured" };
  }
  const { data, error } = await client
    .from("agent_visits")
    .insert([insertRow])
    .select(HQ_AGENT_VISIT_COLUMNS);
  if (error) {
    return { row: null, error: error.message || "Visit insert failed" };
  }
  const saved = Array.isArray(data) ? data[0] : data;
  return { row: saved ?? null, error: null };
}

export async function fetchAgentVisitEvidenceHeader(client, visitUuid, options = {}) {
  if (!client) {
    return { data: null, error: { message: "Supabase client not configured" } };
  }
  const id = str(visitUuid);
  if (!id) {
    return { data: null, error: { message: "visit uuid is required" } };
  }
  let query = client.from("agent_visits").select(HQ_AGENT_VISIT_EVIDENCE_COLUMNS).eq("id", id);
  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query.maybeSingle();
  if (error && isMissingColumnOrTable(error)) {
    let fallback = client.from("agent_visits").select(HQ_AGENT_VISIT_COLUMNS).eq("id", id);
    if (tenantId) fallback = fallback.eq("tenant_id", tenantId);
    return fallback.maybeSingle();
  }
  return { data, error };
}

export async function fetchAgentVisitDiscoveryLines(client, visitUuid, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const id = str(visitUuid);
  if (!id) {
    return { data: [], error: { message: "visit uuid is required" } };
  }
  const limit = clampLimit(
    options.limit,
    HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT,
    HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT
  );
  let query = client
    .from("agent_visit_discovery_lines")
    .select(HQ_AGENT_VISIT_DISCOVERY_LINE_COLUMNS)
    .eq("visit_uuid", id)
    .order("created_at", { ascending: true })
    .limit(limit);
  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error && isMissingColumnOrTable(error)) {
    return { data: [], error };
  }
  return { data: data || [], error };
}

export async function fetchAgentVisitEvidenceBundle(client, visitUuid, options = {}) {
  const id = str(visitUuid);
  if (!id) {
    return { header: null, lines: [], error: "visit uuid is required" };
  }
  const [headerRes, linesRes] = await Promise.all([
    fetchAgentVisitEvidenceHeader(client, id, options),
    fetchAgentVisitDiscoveryLines(client, id, options),
  ]);
  if (headerRes.error) {
    return { header: null, lines: [], error: headerRes.error.message || "Visit evidence read failed" };
  }
  if (linesRes.error && !isMissingColumnOrTable(linesRes.error)) {
    return {
      header: headerRes.data ?? null,
      lines: [],
      error: linesRes.error.message || "Discovery lines read failed",
    };
  }
  return {
    header: headerRes.data ?? null,
    lines: linesRes.data || [],
    error: null,
  };
}

export async function persistAgentVisitDiscoveryLines(client, visitUuid, lines, extras = {}) {
  const built = buildAgentVisitDiscoveryLineInsertRows(visitUuid, lines, extras);
  if (built.error) {
    return { rows: [], error: built.error };
  }
  if (!built.rows.length) {
    return { rows: [], error: null };
  }
  const insertRows = built.rows.map((row) => {
    const compact = compactDefined(row, DISCOVERY_LINE_WRITE_COLUMNS);
    compact.id = row.id;
    compact.visit_uuid = row.visit_uuid;
    compact.line_kind = row.line_kind;
    return compact;
  });
  const { data, error } = await client
    .from("agent_visit_discovery_lines")
    .insert(insertRows)
    .select(HQ_AGENT_VISIT_DISCOVERY_LINE_COLUMNS);
  if (error) {
    return {
      rows: [],
      error: error.message || "Discovery line insert failed",
      pendingLineIds: insertRows.map((row) => row.id),
    };
  }
  return { rows: data || [], error: null };
}

/**
 * Canonical VE-2 visit persistence:
 * 1. Insert header (existing agent_visits path)
 * 2. Optionally insert discovery lines against agent_visits.id
 *
 * Not a database transaction. If lines fail after header insert, returns
 * success=false with persistence=header_only so callers retry lines by uuid
 * instead of inserting a second visit.
 */
export async function persistAgentVisitWithOptionalDiscovery(client, { insertRow, discoveryLines } = {}) {
  const lineInput = Array.isArray(discoveryLines) ? discoveryLines : [];
  const headerEvidence = pickVisitEvidenceHeaderFields(insertRow || {});
  if (headerEvidence.error) {
    return {
      success: false,
      persistence: "failed",
      data: null,
      discoveryLines: [],
      error: headerEvidence.error,
      discoveryLineError: null,
    };
  }
  if (lineInput.length) {
    const preview = validateDiscoveryLinesForVisit(lineInput);
    if (preview.error) {
      return {
        success: false,
        persistence: "failed",
        data: null,
        discoveryLines: [],
        error: preview.error,
        discoveryLineError: preview.error,
      };
    }
  }

  const header = await persistAgentVisitHeader(client, insertRow);
  if (header.error || !header.row) {
    return {
      success: false,
      persistence: "failed",
      data: null,
      discoveryLines: [],
      error: header.error || "Visit insert returned no row",
      discoveryLineError: null,
    };
  }

  const visitUuid = str(header.row.id);
  let evidenceHeader = header.row;
  const evidenceRead = await fetchAgentVisitEvidenceHeader(client, visitUuid);
  if (!evidenceRead.error && evidenceRead.data) {
    evidenceHeader = evidenceRead.data;
  }

  if (!lineInput.length) {
    return {
      success: true,
      persistence: "complete",
      data: evidenceHeader,
      discoveryLines: [],
      error: null,
      discoveryLineError: null,
    };
  }

  const linesRes = await persistAgentVisitDiscoveryLines(client, visitUuid, lineInput, {
    lab_id: evidenceHeader.lab_id,
    tenant_id: evidenceHeader.tenant_id,
  });
  if (linesRes.error) {
    return {
      success: false,
      persistence: "header_only",
      data: evidenceHeader,
      discoveryLines: [],
      error: `Visit saved but discovery lines failed: ${linesRes.error}`,
      discoveryLineError: linesRes.error,
      pendingLineIds: linesRes.pendingLineIds || [],
    };
  }

  return {
    success: true,
    persistence: "complete",
    data: evidenceHeader,
    discoveryLines: linesRes.rows,
    error: null,
    discoveryLineError: null,
  };
}

export function buildAgentVisitEvidenceUpdateRow(payload = {}) {
  const evidence = pickVisitEvidenceHeaderFields(payload);
  if (evidence.error) {
    return { row: {}, error: evidence.error };
  }
  const candidate = {
    ...evidence.fields,
    notes: payload.notes,
    visit_type: payload.visitType ?? payload.visit_type,
    visit_date: payload.visitDate ?? payload.visit_date,
    follow_up_required: payload.followUpRequired ?? payload.follow_up_required,
    next_follow_up_date: payload.nextFollowUpDate ?? payload.next_follow_up_date,
    next_follow_up_type: payload.nextFollowUpType ?? payload.next_follow_up_type,
    next_action: payload.nextAction ?? payload.next_action,
  };
  const row = compactDefined(candidate, HEADER_UPDATE_COLUMNS);
  if (evidence.fields.decision_maker_met === true || evidence.fields.decision_maker_met === false) {
    row.decision_maker_met = evidence.fields.decision_maker_met;
  }
  if (Object.keys(row).length === 0) {
    return { row: {}, error: "no updatable Visit Evidence fields supplied" };
  }
  if ("tenant_id" in row || "agent_id" in row || "lab_id" in row || "sourced_by_agent_id" in row) {
    return { row: {}, error: "identity fields cannot be updated from the client" };
  }
  return { row, error: null };
}

export async function persistAgentVisitEvidenceUpdate(client, visitUuid, payload = {}) {
  const id = str(visitUuid ?? payload.id);
  if (!id) {
    return { success: false, data: null, error: "visit uuid is required" };
  }
  const built = buildAgentVisitEvidenceUpdateRow(payload);
  if (built.error) {
    return { success: false, data: null, error: built.error };
  }
  const { data, error } = await client
    .from("agent_visits")
    .update(built.row)
    .eq("id", id)
    .select(HQ_AGENT_VISIT_EVIDENCE_COLUMNS)
    .maybeSingle();
  if (error) {
    return { success: false, data: null, error: error.message || "Visit evidence update failed" };
  }
  return { success: true, data: data ?? null, error: null };
}

export function mapAgentVisitEvidenceBundle({ header, lines } = {}) {
  return {
    visit: header ? mapVisitEvidenceHeaderRow(header) : null,
    discoveryLines: (lines || []).map(mapVisitDiscoveryLineRow),
  };
}
