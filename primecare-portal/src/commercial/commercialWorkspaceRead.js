/**
 * Phase 9.0 — Parallel read-only commercial bundle.
 * Reuses existing qualification, visits, and contract reads — no new tables.
 */
import { getQualificationReviewRead } from "@/api/primecareSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import { fetchAgentVisitsBoundedRows } from "@/api/hqBoundedReads.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";

function str(value) {
  return String(value ?? "").trim();
}

function mapVisitRow(row = {}) {
  return {
    visitId: str(row.visit_id ?? row.id),
    visitDate: str(row.visit_date ?? row.created_at).slice(0, 10),
    labName: str(row.lab_name),
    visitType: str(row.visit_type),
    notes: str(row.notes),
    agentId: str(row.agent_id),
    agentName: str(row.agent_name),
    labId: str(row.lab_id),
    nextAction: str(row.next_action),
  };
}

export async function loadCommercialWorkspaceRead({ currentUser, force = false } = {}) {
  const tenantId = str(currentUser?.tenantId ?? currentUser?.tenant_id);

  const [qualRes, contracts, visitsRes] = await Promise.all([
    getQualificationReviewRead({ force }),
    loadVisibleLabContracts().catch(() => []),
    supabase
      ? fetchAgentVisitsBoundedRows(supabase, { tenantId: tenantId || undefined }).catch((err) => ({
          data: [],
          error: err,
        }))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const visits = (visitsRes?.data || []).map(mapVisitRow);

  return {
    success: Boolean(qualRes?.success),
    error: qualRes?.error || visitsRes?.error?.message || "",
    qualifications: qualRes?.data || [],
    contracts: Array.isArray(contracts) ? contracts : [],
    visits,
    readHealth: {
      qualifications: (qualRes?.data || []).length,
      contracts: Array.isArray(contracts) ? contracts.length : 0,
      visits: visits.length,
    },
  };
}
