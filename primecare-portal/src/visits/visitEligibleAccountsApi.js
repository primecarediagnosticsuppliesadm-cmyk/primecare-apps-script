/**
 * Bounded Visit-eligibility account read. RLS remains the authorization boundary.
 * Does not change v_labs_credit operational lists.
 */
import { supabase } from "../api/supabaseClient.js";
import {
  clampLimit,
  HQ_VISIT_ELIGIBLE_ACCOUNT_COLUMNS,
  HQ_VISIT_ELIGIBLE_ACCOUNT_COLUMNS_FALLBACK,
  HQ_VISIT_ELIGIBLE_ACCOUNT_LIMIT,
} from "../api/hqReadBounds.js";
import { labIdKey } from "../utils/labId.js";
import { partitionVisitEligibleAccounts } from "./visitEligibleAccounts.js";

function str(v) {
  return String(v ?? "").trim();
}

function isMissingColumn(error) {
  const m = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return /pgrst204|column .* does not exist|schema cache/.test(m);
}

export function mapVisitEligibleAccountRow(row = {}) {
  return {
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: labIdKey(row.lab_id ?? row.labId),
    labName: str(row.lab_name ?? row.labName),
    ownerName: str(row.owner_name ?? row.ownerName),
    phone: str(row.phone),
    area: str(row.area),
    status: str(row.status).toUpperCase(),
    assignedAgentId: str(row.assigned_agent_id ?? row.assignedAgentId ?? row.agent_id),
    agentId: str(row.agent_id ?? row.assigned_agent_id),
    sourcedByAgentId: str(row.sourced_by_agent_id ?? row.sourcedByAgentId),
  };
}

export async function fetchVisitEligibleAccountRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(
    options.limit,
    HQ_VISIT_ELIGIBLE_ACCOUNT_LIMIT,
    HQ_VISIT_ELIGIBLE_ACCOUNT_LIMIT
  );
  const primary = await client
    .from("labs")
    .select(HQ_VISIT_ELIGIBLE_ACCOUNT_COLUMNS)
    .limit(limit);
  if (primary.error && isMissingColumn(primary.error)) {
    const fallback = await client
      .from("labs")
      .select(HQ_VISIT_ELIGIBLE_ACCOUNT_COLUMNS_FALLBACK)
      .limit(limit);
    return {
      data: (fallback.data || []).map(mapVisitEligibleAccountRow),
      error: fallback.error,
    };
  }
  return {
    data: (primary.data || []).map(mapVisitEligibleAccountRow),
    error: primary.error,
  };
}

export async function getAgentVisitEligibleAccountsRead(currentUser) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured",
      data: { operational: [], prospects: [], all: [] },
    };
  }
  try {
    const { data, error } = await fetchVisitEligibleAccountRows(supabase, {});
    if (error) {
      return {
        success: false,
        error: error.message || "Failed to load visit accounts",
        data: { operational: [], prospects: [], all: [] },
      };
    }
    const partitioned = partitionVisitEligibleAccounts(data, currentUser);
    return { success: true, error: null, data: partitioned };
  } catch (err) {
    return {
      success: false,
      error: err?.message || String(err),
      data: { operational: [], prospects: [], all: [] },
    };
  }
}
