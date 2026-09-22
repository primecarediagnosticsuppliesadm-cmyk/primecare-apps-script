import { supabase } from "@/api/supabaseClient.js";
import { labIdKey, normalizeAgentIdKey } from "@/utils/labId.js";
import {
  HQ_AGENT_VISIT_COLUMNS,
  HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT,
  HQ_DASHBOARD_VISITS_LIMIT,
  HQ_LABS_CREDIT_LIMIT,
  HQ_ORDERS_LIST_MAX_LIMIT,
  HQ_PAYMENTS_RECENT_LIMIT,
  HQ_V_LABS_CREDIT_LIST_COLUMNS,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { getAgentActiveLabOwnershipRowsRead } from "@/api/labOwnershipApi.js";
import { mapLabsCreditRow } from "@/api/primecareSupabaseApi.js";
import { ownedLabKeysFromOwnershipRows } from "@/utils/accessFilters.js";
import { ROLES } from "@/config/roles.js";
import { resolveMyBusinessRange } from "@/myBusiness/myBusinessCalendar.js";
import { resolveMyBusinessSubjectAgent } from "@/myBusiness/myBusinessAuth.js";
import { buildMyBusinessModel, MY_BUSINESS_LEDGER_CAP } from "@/myBusiness/myBusinessModel.js";

const VISIT_EVIDENCE_SELECT =
  `${HQ_AGENT_VISIT_COLUMNS},commercial_outcome,lab_size_band`;

const DISCOVERY_SAFE_SELECT =
  "id,visit_uuid,lab_id,line_kind,brand,model,description,notes";

function str(v) {
  return String(v ?? "").trim();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function isMissingColumnError(message = "") {
  return /column|schema cache|does not exist/i.test(String(message));
}

async function fetchAgentDirectory(tenantId) {
  if (!supabase || !tenantId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, tenant_id, role, agent_id, agent_name, display_name, active")
    .eq("tenant_id", tenantId)
    .eq("role", ROLES.AGENT);
  if (error) return [];
  return (data || [])
    .filter((row) => row.active !== false)
    .map((row) => ({
      userId: str(row.user_id),
      tenantId: str(row.tenant_id),
      role: str(row.role).toLowerCase(),
      agentId: normalizeAgentIdKey(row.agent_id),
      agentIdRaw: str(row.agent_id),
      agentName: str(row.display_name || row.agent_name || row.agent_id),
    }))
    .filter((row) => row.agentId);
}

async function fetchLabsByColumn({ column, values, tenantId }) {
  if (!supabase || !values.length) return [];
  let q = supabase
    .from("v_labs_credit")
    .select(HQ_V_LABS_CREDIT_LIST_COLUMNS)
    .in(column, values);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(clampLimit(undefined, HQ_LABS_CREDIT_LIMIT, HQ_LABS_CREDIT_LIMIT));
  if (error) return [];
  return data || [];
}

/**
 * Subject-scoped labs only. Never load the tenant-wide HQ credit list then filter.
 */
async function fetchLabsForSubject({ tenantId, agentId, agentIdRaw = "", ownershipLabIds = [] }) {
  const ids = agentIdLookupValues(agentId, agentIdRaw);
  const owned = [...new Set((ownershipLabIds || []).map((id) => labIdKey(id)).filter(Boolean))];
  const byId = new Map();
  const ingest = (rows) => {
    for (const row of rows || []) {
      const mapped = mapLabsCreditRow(row);
      const lid = labIdKey(mapped.labId);
      if (lid) byId.set(lid, mapped);
    }
  };

  const assigned = await fetchLabsByColumn({
    column: "assigned_agent_id",
    values: ids,
    tenantId,
  });
  ingest(assigned);
  const sourced = await fetchLabsByColumn({
    column: "sourced_by_agent_id",
    values: ids,
    tenantId,
  });
  ingest(sourced);
  for (const chunkIds of chunk(owned, 80)) {
    ingest(
      await fetchLabsByColumn({
        column: "lab_id",
        values: chunkIds,
        tenantId,
      })
    );
  }
  return [...byId.values()];
}

function agentIdLookupValues(agentId, agentIdRaw = "") {
  const values = [str(agentId), str(agentIdRaw), normalizeAgentIdKey(agentId), String(agentIdRaw || agentId).toLowerCase()]
    .map((v) => str(v))
    .filter(Boolean);
  return [...new Set(values)];
}

async function fetchVisitsForAgent({ tenantId, agentId, agentIdRaw = "", from, to }) {
  if (!supabase || !agentId) return [];
  const ids = agentIdLookupValues(agentId, agentIdRaw);
  const run = async (columns) => {
    let q = supabase
      .from("agent_visits")
      .select(columns)
      .in("agent_id", ids)
      .order("visit_date", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    return q.limit(clampLimit(undefined, HQ_DASHBOARD_VISITS_LIMIT, HQ_DASHBOARD_VISITS_LIMIT));
  };

  let { data, error } = await run(VISIT_EVIDENCE_SELECT);
  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await run(HQ_AGENT_VISIT_COLUMNS));
  }
  if (error) return [];

  const mapped = (data || []).map((row) => ({
    id: str(row.id),
    visitId: str(row.visit_id || row.id),
    labId: labIdKey(row.lab_id),
    agentId: str(row.agent_id),
    agentName: str(row.agent_name),
    visitDate: str(row.visit_date).slice(0, 10),
    visitType: str(row.visit_type),
    notes: str(row.notes),
    nextFollowUpDate: str(row.next_follow_up_date).slice(0, 10),
    nextFollowUpType: str(row.next_follow_up_type),
    nextAction: str(row.next_action),
    commercialOutcome: str(row.commercial_outcome),
    followUpRequired: row.follow_up_required,
  }));

  const attentionVisits = mapped;
  const periodVisits = mapped.filter((v) => {
    const d = v.visitDate;
    return d && d >= from && d <= to;
  });
  const byId = new Map();
  for (const visit of [...periodVisits, ...attentionVisits]) {
    const key = visit.id || `${visit.labId}:${visit.visitDate}`;
    if (!byId.has(key)) byId.set(key, visit);
  }
  return [...byId.values()];
}

async function fetchDiscoveryForVisits(visitUuids) {
  if (!supabase || !visitUuids.length) return [];
  const rows = [];
  for (const ids of chunk(visitUuids, 80)) {
    const { data, error } = await supabase
      .from("agent_visit_discovery_lines")
      .select(DISCOVERY_SAFE_SELECT)
      .in("visit_uuid", ids)
      .limit(clampLimit(undefined, HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT, HQ_AGENT_VISIT_DISCOVERY_LINE_LIMIT));
    if (error) {
      if (isMissingColumnError(error.message)) return [];
      continue;
    }
    rows.push(...(data || []));
  }
  return rows.map((row) => ({
    visitUuid: str(row.visit_uuid),
    labId: labIdKey(row.lab_id),
    lineKind: str(row.line_kind),
    brand: str(row.brand),
    model: str(row.model),
    description: str(row.description),
    notes: str(row.notes),
  }));
}

async function fetchQualificationsForLabs(labIds, tenantId) {
  if (!supabase || !labIds.length) return [];
  const rows = [];
  for (const ids of chunk(labIds, 80)) {
    let q = supabase
      .from("lab_qualifications")
      .select("lab_id,qualification_band,pipeline_stage,updated_at")
      .in("lab_id", ids)
      .order("updated_at", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.limit(500);
    if (error) continue;
    rows.push(...(data || []));
  }
  return rows.map((row) => ({
    labId: labIdKey(row.lab_id),
    qualificationBand: str(row.qualification_band),
    pipelineStage: str(row.pipeline_stage),
  }));
}

async function fetchOrdersForLabs({ labIds, tenantId, from, to }) {
  if (!supabase || !labIds.length) return [];
  const rows = [];
  for (const ids of chunk(labIds, 80)) {
    let q = supabase
      .from("orders")
      .select("order_id,lab_id,order_date,created_at,total_amount,status,tenant_id")
      .in("lab_id", ids)
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.limit(
      clampLimit(undefined, HQ_ORDERS_LIST_MAX_LIMIT, HQ_ORDERS_LIST_MAX_LIMIT)
    );
    if (error) continue;
    rows.push(...(data || []));
  }
  return rows.map((row) => ({
    orderId: str(row.order_id),
    labId: labIdKey(row.lab_id),
    orderDate: str(row.order_date || row.created_at).slice(0, 10),
    totalAmount: Number(row.total_amount) || 0,
    status: str(row.status),
  }));
}

async function fetchPaymentsForLabs({ labIds, tenantId, from, to }) {
  if (!supabase || !labIds.length) return [];
  const rows = [];
  for (const ids of chunk(labIds, 80)) {
    let q = supabase
      .from("payments")
      .select("payment_id,lab_id,payment_date,amount_received,agent_id,tenant_id")
      .in("lab_id", ids)
      .gte("payment_date", from)
      .lte("payment_date", to)
      .order("payment_date", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.limit(
      clampLimit(undefined, HQ_PAYMENTS_RECENT_LIMIT, HQ_PAYMENTS_RECENT_LIMIT)
    );
    if (error) continue;
    rows.push(...(data || []));
  }
  return rows.map((row) => ({
    paymentId: str(row.payment_id),
    labId: labIdKey(row.lab_id),
    paymentDate: str(row.payment_date).slice(0, 10),
    amountReceived: Number(row.amount_received) || 0,
    agentId: str(row.agent_id),
  }));
}

function ownershipIdsForAgent(rows, agentId, tenantId) {
  const keys = ownedLabKeysFromOwnershipRows(rows, agentId);
  const ids = [];
  const prefix = `${String(tenantId || "").trim().toLowerCase()}|`;
  for (const key of keys) {
    if (prefix && String(key).startsWith(prefix)) {
      ids.push(key.slice(prefix.length));
    } else {
      const lid = String(key).split("|")[1] || "";
      if (lid) ids.push(lid);
    }
  }
  return ids;
}

async function fetchOwnershipRowsForSubject({ tenantId, agentId, agentIdRaw, role }) {
  if (role === ROLES.AGENT) {
    const res = await getAgentActiveLabOwnershipRowsRead();
    return Array.isArray(res?.data?.rows) ? res.data.rows : [];
  }
  if (!supabase) return [];
  const ids = agentIdLookupValues(agentId, agentIdRaw);
  if (!ids.length) return [];
  const rows = [];
  for (const column of ["primary_agent_id", "secondary_agent_id"]) {
    let q = supabase
      .from("lab_ownership")
      .select("tenant_id, lab_tenant_id, lab_id, primary_agent_id, secondary_agent_id, status")
      .eq("status", "ACTIVE")
      .in(column, ids);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.limit(500);
    if (!error && data) rows.push(...data);
  }
  return rows;
}

/**
 * Dedicated My Business loader. Does not call the agent workspace reader.
 */
export async function getMyBusinessRead({
  actor,
  requestedSubjectAgentId = "",
  rangeInput = {},
  now,
} = {}) {
  const range = resolveMyBusinessRange({ ...rangeInput, now });
  const role = str(actor?.role).toLowerCase();
  const tenantId = str(actor?.tenantId || actor?.tenant_id);

  let directory = [];
  if (role === ROLES.ADMIN || role === ROLES.EXECUTIVE) {
    directory = await fetchAgentDirectory(tenantId);
  }

  const resolved = resolveMyBusinessSubjectAgent({
    actor,
    requestedSubjectAgentId,
    agentDirectory: directory,
  });
  if (!resolved.ok) {
    return {
      success: false,
      error: resolved.error,
      data: {
        model: buildMyBusinessModel({
          range,
          subjectAgentId: "",
          actor,
        }),
        agentDirectory: directory,
        resolved,
      },
    };
  }

  const subjectAgentId = resolved.subjectAgentId;
  const directoryMatch = directory.find(
    (row) => normalizeAgentIdKey(row.agentId) === subjectAgentId
  );
  const agentIdRaw =
    directoryMatch?.agentIdRaw ||
    str(actor?.agentId || actor?.agent_id) ||
    subjectAgentId;
  const ownershipRows = await fetchOwnershipRowsForSubject({
    tenantId,
    agentId: subjectAgentId,
    agentIdRaw,
    role,
  });
  const ownershipLabIds = ownershipIdsForAgent(ownershipRows, subjectAgentId, tenantId);

  const [labs, visits] = await Promise.all([
    fetchLabsForSubject({
      tenantId,
      agentId: subjectAgentId,
      agentIdRaw,
      ownershipLabIds,
    }),
    fetchVisitsForAgent({
      tenantId,
      agentId: subjectAgentId,
      agentIdRaw,
      from: range.from,
      to: range.to,
    }),
  ]);
  const scopedLabIds = labs.map((lab) => lab.labId).filter(Boolean);

  const visitUuids = visits.map((v) => v.id).filter(Boolean);
  const [discoveryLines, qualifications, orders, payments] = await Promise.all([
    fetchDiscoveryForVisits(visitUuids),
    fetchQualificationsForLabs(scopedLabIds, tenantId),
    fetchOrdersForLabs({ labIds: scopedLabIds, tenantId, from: range.from, to: range.to }),
    fetchPaymentsForLabs({ labIds: scopedLabIds, tenantId, from: range.from, to: range.to }),
  ]);

  const model = buildMyBusinessModel({
    range,
    subjectAgentId,
    actor,
    labs,
    visits,
    orders,
    payments,
    qualifications,
    discoveryLines,
    ownershipLabIds,
    ledgerCap: MY_BUSINESS_LEDGER_CAP,
  });

  return {
    success: true,
    error: null,
    data: {
      model,
      agentDirectory: directory,
      resolved,
    },
  };
}

