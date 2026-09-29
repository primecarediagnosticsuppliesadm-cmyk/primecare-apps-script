/**
 * AE-1C visit handoff reads and RPCs. Mutations go through SECURITY DEFINER RPCs.
 */
import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_AGENT_VISIT_COLUMNS,
  HQ_VISIT_HANDOFF_COLUMNS,
  HQ_VISIT_HANDOFF_LIST_LIMIT,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { parseHandoffRpcPayload, withHumanStatus, mapVisitHandoffRow } from "./visitHandoffsContract.js";

function str(v) {
  return String(v ?? "").trim();
}

function mapRpc(data, error) {
  if (error) {
    return { success: false, error: error.message || "Handoff request failed", code: "rpc_error", handoff: null };
  }
  const parsed = parseHandoffRpcPayload(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.code || "Handoff request failed",
      code: parsed.code,
      handoff: parsed.handoff,
    };
  }
  return { success: true, error: null, code: parsed.code, handoff: parsed.handoff };
}

export async function createVisitHandoffWrite({ visitUuid, requirementSummary, neededBy } = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured", code: "offline", handoff: null };
  const { data, error } = await supabase.rpc("create_visit_handoff", {
    p_visit_uuid: visitUuid,
    p_requirement_summary: requirementSummary,
    p_needed_by: neededBy || null,
  });
  return mapRpc(data, error);
}

export async function respondVisitHandoffWrite({ handoffId, hqResponse } = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured", code: "offline", handoff: null };
  const { data, error } = await supabase.rpc("respond_visit_handoff", {
    p_handoff_id: handoffId,
    p_hq_response: hqResponse,
  });
  return mapRpc(data, error);
}

export async function resolveVisitHandoffWrite({
  handoffId,
  action,
  lossReason,
  orderId,
  nextFollowUpDate,
  nextAction,
  closeNote,
} = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured", code: "offline", handoff: null };
  const { data, error } = await supabase.rpc("resolve_visit_handoff", {
    p_handoff_id: handoffId,
    p_action: action,
    p_loss_reason: lossReason || null,
    p_order_id: orderId || null,
    p_next_follow_up_date: nextFollowUpDate || null,
    p_next_action: nextAction || null,
    p_close_note: closeNote || null,
  });
  return mapRpc(data, error);
}

export async function getVisitHandoffForVisitRead(visitUuid) {
  if (!supabase) return { success: false, error: "Supabase is not configured", data: null };
  const id = str(visitUuid);
  if (!id) return { success: false, error: "visit uuid is required", data: null };
  const { data, error } = await supabase
    .from("visit_handoffs")
    .select(HQ_VISIT_HANDOFF_COLUMNS)
    .eq("visit_uuid", id)
    .maybeSingle();
  if (error) {
    if (/schema cache|does not exist|visit_handoffs/i.test(error.message || "")) {
      return { success: true, data: null, error: null, missing: true };
    }
    return { success: false, error: error.message, data: null };
  }
  return { success: true, data: data ? withHumanStatus(mapVisitHandoffRow(data)) : null, error: null };
}

export async function listOpenVisitHandoffsRead({ tenantId, limit } = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured", data: [] };
  let q = supabase
    .from("visit_handoffs")
    .select(HQ_VISIT_HANDOFF_COLUMNS)
    .eq("status", "OPEN_HQ")
    .order("needed_by", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(clampLimit(limit, HQ_VISIT_HANDOFF_LIST_LIMIT, HQ_VISIT_HANDOFF_LIST_LIMIT));
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) {
    if (/schema cache|does not exist|visit_handoffs/i.test(error.message || "")) {
      return { success: true, data: [], error: null, missing: true };
    }
    return { success: false, error: error.message, data: [] };
  }
  return {
    success: true,
    data: (data || []).map((row) => withHumanStatus(mapVisitHandoffRow(row))),
    error: null,
  };
}

export async function listAgentOpenVisitHandoffsRead({ agentId, tenantId, limit } = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured", data: [] };
  let q = supabase
    .from("visit_handoffs")
    .select(HQ_VISIT_HANDOFF_COLUMNS)
    .in("status", ["OPEN_HQ", "HQ_RESPONDED"])
    .order("updated_at", { ascending: false })
    .limit(clampLimit(limit, HQ_VISIT_HANDOFF_LIST_LIMIT, HQ_VISIT_HANDOFF_LIST_LIMIT));
  if (agentId) q = q.eq("agent_id", agentId);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) {
    if (/schema cache|does not exist|visit_handoffs/i.test(error.message || "")) {
      return { success: true, data: [], error: null, missing: true };
    }
    return { success: false, error: error.message, data: [] };
  }
  return {
    success: true,
    data: (data || []).map((row) => withHumanStatus(mapVisitHandoffRow(row))),
    error: null,
  };
}

export async function getVisitHeadersForHandoffsRead(visitUuids = []) {
  if (!supabase) return { success: false, error: "Supabase is not configured", data: [] };
  const ids = [...new Set((visitUuids || []).map((id) => str(id)).filter(Boolean))];
  if (!ids.length) return { success: true, data: [], error: null };
  const { data, error } = await supabase
    .from("agent_visits")
    .select(HQ_AGENT_VISIT_COLUMNS)
    .in("id", ids)
    .limit(clampLimit(ids.length, HQ_VISIT_HANDOFF_LIST_LIMIT, HQ_VISIT_HANDOFF_LIST_LIMIT));
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [], error: null };
}
