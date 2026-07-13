/**
 * Domain projection read adapters — Sprint 2 Phase 1.
 * RPC contracts: read_orders_list_v1, read_lab_receivables_list_v1
 */
import { supabase } from "@/api/supabaseClient.js";
import { fetchPaymentsBoundedRows } from "@/api/hqBoundedReads.js";
import {
  HQ_DASHBOARD_RECENT_DAYS,
  HQ_ORDERS_LIST_DEFAULT_LIMIT,
  HQ_ORDERS_LIST_MAX_LIMIT,
  HQ_PAYMENTS_RECENT_DAYS,
  HQ_COLLECTIONS_AR_LIMIT,
  clampLimit,
} from "@/api/hqReadBounds.js";
import {
  mapOrderRow,
  mapCollectionsRowFromArCredit,
  mapLabsCreditRow,
  getLabsCredit,
} from "@/api/primecareSupabaseApi.js";
import { PROJECTION_STALENESS_SLA_MS } from "@/config/readProjectionFlags.js";
import { perfLog } from "@/utils/perfLog.js";
import { normalizeAdminDashboardPayload } from "@/api/primecareSupabaseApi.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function localDateYmd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function sumTodayPayments(rows = []) {
  const today = localDateYmd();
  return rows.reduce((sum, p) => {
    const d = String(p.payment_date ?? p.paymentDate ?? "").slice(0, 10);
    if (d !== today) return sum;
    const n = Number(p.amount_received ?? p.amountReceived);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function mapProjectionOrderRow(row, idx = 0) {
  const mapped = mapOrderRow(
    {
      order_id: row.order_id,
      id: row.id,
      tenant_id: row.tenant_id,
      lab_id: row.lab_id,
      lab_name: row.lab_name,
      status: row.status,
      order_date: row.order_date,
      created_at: row.created_at,
      total_amount: row.total_amount,
      invoice_id: row.invoice_id,
      invoice_status: row.invoice_status,
      agent_id: row.agent_id,
      inventory_updated: row.inventory_updated,
      fulfilled_at: row.fulfilled_at,
      notes: row.notes,
      created_by: row.created_by,
    },
    str(row.lab_name),
    idx
  );
  return {
    ...mapped,
    itemCount: num(row.item_count),
    projectionRefreshedAt: row.refreshed_at ?? null,
  };
}

function mapProjectionCollectionRow(row) {
  return mapCollectionsRowFromArCredit(
    {
      tenant_id: row.tenant_id,
      lab_id: row.lab_id,
      lab_name: row.lab_name,
      outstanding: row.outstanding,
      total_paid: row.total_paid,
      total_delivered: row.total_delivered,
      credit_limit: row.credit_limit,
      credit_hold: row.credit_hold,
      days_overdue: row.overdue_days,
      risk_status: row.risk_status,
      assigned_agent: row.assigned_agent,
      agent_id: row.agent_id,
      area: row.area,
    },
    null,
    []
  );
}

function projectionDegraded(stalenessMs, slaMs) {
  return Number(stalenessMs) > Number(slaMs);
}

async function readLabsLegacyFallback(params = {}, reason = "projection_unavailable", detail = null) {
  try {
    const legacy = await getLabsCredit({
      ...params,
      force: params.force === true,
    });
    return {
      ...legacy,
      success: legacy?.success !== false,
      readFailed: false,
      degraded: true,
      source: "fallback",
      projection: false,
      fallbackReason: reason,
      projectionError: detail || null,
      data: Array.isArray(legacy?.data) ? legacy.data : [],
    };
  } catch (fallbackError) {
    return {
      success: false,
      readFailed: true,
      degraded: true,
      source: "fallback",
      projection: false,
      fallbackReason: reason,
      projectionError: detail || null,
      error: fallbackError?.message || String(fallbackError),
      data: [],
    };
  }
}

/**
 * @param {object} params — same shape as getOrdersRead
 */
export async function readOrdersListV1(params = {}) {
  if (!supabase) {
    return {
      success: false,
      readFailed: true,
      error: "Supabase is not configured",
      data: { orders: [] },
    };
  }

  const limit = clampLimit(params.limit, HQ_ORDERS_LIST_DEFAULT_LIMIT, HQ_ORDERS_LIST_MAX_LIMIT);
  const offset = Math.max(0, Number(params.offset) || 0);
  const daysBack =
    Number(params.daysBack) > 0 ? Number(params.daysBack) : HQ_DASHBOARD_RECENT_DAYS;

  perfLog("readOrdersListV1.rpc", { limit, offset, daysBack });

  const { data, error } = await supabase.rpc("read_orders_list_v1", {
    p_limit: limit,
    p_offset: offset,
    p_days_back: daysBack,
  });

  if (error) {
    return {
      success: false,
      readFailed: true,
      error: error.message || String(error),
      data: { orders: [] },
      projection: true,
    };
  }

  const payload = data && typeof data === "object" ? data : {};
  const rawOrders = payload?.data?.orders ?? payload?.orders ?? [];
  const list = Array.isArray(rawOrders) ? rawOrders : [];
  const orders = list.map((row, idx) => mapProjectionOrderRow(row, idx));
  const meta = payload.meta || {
    rawRowCount: orders.length,
    mappedRowCount: orders.length,
    limit,
    offset,
    hasMore: orders.length >= limit,
  };
  const stalenessMs = num(payload.staleness_ms);

  return {
    success: payload.success !== false,
    readFailed: false,
    error: null,
    data: { orders },
    meta,
    projection: true,
    registryId: payload.registry_id || "PRJ-ORD-ORDER-v1",
    asOf: payload.as_of ?? null,
    stalenessMs,
    degraded: projectionDegraded(stalenessMs, PROJECTION_STALENESS_SLA_MS.orders),
  };
}

/**
 * @param {object} params — same shape as getCollectionsRead
 */
export async function readLabReceivablesListV1(params = {}) {
  if (!supabase) {
    return {
      success: false,
      readFailed: true,
      error: "Supabase is not configured",
      data: {
        summary: {
          totalOutstanding: 0,
          overdueCount: 0,
          highRiskCount: 0,
          todayCollections: 0,
        },
        collections: [],
      },
    };
  }

  const daysBack =
    Number(params.daysBack) > 0 ? Number(params.daysBack) : HQ_PAYMENTS_RECENT_DAYS;
  const limit = clampLimit(params.limit, HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT);

  perfLog("readLabReceivablesListV1.rpc", { limit, daysBack });

  const { data, error } = await supabase.rpc("read_lab_receivables_list_v1", {
    p_limit: limit,
    p_days_back: daysBack,
  });

  if (error) {
    return {
      success: false,
      readFailed: true,
      error: error.message || String(error),
      data: {
        summary: {
          totalOutstanding: 0,
          overdueCount: 0,
          highRiskCount: 0,
          todayCollections: 0,
        },
        collections: [],
      },
      projection: true,
    };
  }

  const payload = data && typeof data === "object" ? data : {};
  const inner = payload.data || payload;
  const rawCollections = inner.collections ?? [];
  const list = Array.isArray(rawCollections) ? rawCollections : [];
  const collections = list.map((row) => mapProjectionCollectionRow(row));
  const summaryRaw = inner.summary || {};
  let todayCollections = num(summaryRaw.todayCollections ?? summaryRaw.today_collections);
  if (todayCollections === 0 && supabase) {
    const payRes = await fetchPaymentsBoundedRows(supabase, {
      daysBack: HQ_PAYMENTS_RECENT_DAYS,
    });
    if (!payRes.error) {
      todayCollections = sumTodayPayments(payRes.data || []);
    }
  }
  const summary = {
    totalOutstanding: num(summaryRaw.totalOutstanding ?? summaryRaw.total_outstanding),
    overdueCount: num(summaryRaw.overdueCount ?? summaryRaw.overdue_count),
    highRiskCount: num(summaryRaw.highRiskCount ?? summaryRaw.high_risk_count),
    todayCollections,
  };
  const lastPaymentByLabId = inner.lastPaymentByLabId || inner.last_payment_by_lab_id || {};
  const stalenessMs = num(payload.staleness_ms);

  return {
    success: payload.success !== false,
    readFailed: false,
    data: {
      summary,
      collections,
      lastPaymentByLabId,
    },
    projection: true,
    registryId: payload.registry_id || "PRJ-COL-LAB-v1",
    asOf: payload.as_of ?? null,
    stalenessMs,
    degraded: projectionDegraded(stalenessMs, PROJECTION_STALENESS_SLA_MS.receivables),
  };
}

/**
 * Shadow-only Labs list adapter. UI stays on getLabsCredit until
 * VITE_READ_ADAPTER_LABS_V1 is explicitly approved for QA.
 */
export async function readLabsListV1(params = {}) {
  if (!supabase) {
    return readLabsLegacyFallback(params, "supabase_not_configured", "Supabase is not configured");
  }

  const limit = clampLimit(params.limit, HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT);

  try {
    perfLog("readLabsListV1.rpc", { limit });

    const { data, error } = await supabase.rpc("read_labs_list_v1", {
      p_limit: limit,
    });

    if (error) {
      return readLabsLegacyFallback(params, "projection_rpc_failed", error.message || String(error));
    }

    const payload = data && typeof data === "object" ? data : {};
    if (payload.success === false) {
      return readLabsLegacyFallback(
        params,
        "projection_unsuccessful",
        payload.error || "read_labs_list_v1 returned success=false"
      );
    }

    const rawRows = Array.isArray(payload.data) ? payload.data : [];
    if (rawRows.length === 0) {
      return readLabsLegacyFallback(params, "projection_empty", "read_labs_list_v1 returned no rows");
    }

    const labs = rawRows.map((row) => ({
      ...mapLabsCreditRow(row),
      orderingMode: str(row.ordering_mode ?? row.orderingMode),
      assignedAgentName: str(row.assigned_agent_name ?? row.assignedAgentName),
      primaryAgentId: str(row.primary_agent_id ?? row.primaryAgentId),
      primaryAgentName: str(row.primary_agent_name ?? row.primaryAgentName),
      secondaryAgentId: str(row.secondary_agent_id ?? row.secondaryAgentId),
      secondaryAgentName: str(row.secondary_agent_name ?? row.secondaryAgentName),
      qualificationStatus: str(row.qualification_status ?? row.qualificationStatus),
      qualificationStage: str(row.qualification_stage ?? row.qualificationStage),
      orderingEligible: Boolean(row.ordering_eligible ?? row.orderingEligible),
      projectionProfileRefreshedAt: row.profile_refreshed_at ?? null,
      projectionReceivableRefreshedAt: row.receivable_refreshed_at ?? null,
    }));
    const stalenessMs = num(payload.staleness_ms);
    if (projectionDegraded(stalenessMs, PROJECTION_STALENESS_SLA_MS.labs)) {
      return readLabsLegacyFallback(
        params,
        "projection_stale",
        `${Math.round(stalenessMs / 1000)}s > ${Math.round(PROJECTION_STALENESS_SLA_MS.labs / 1000)}s`
      );
    }

    return {
      success: payload.success !== false,
      readFailed: false,
      data: labs,
      meta: payload.meta || {
        rawRowCount: rawRows.length,
        mappedRowCount: labs.length,
        limit,
        hasMore: rawRows.length >= limit,
      },
      projection: true,
      registryId: payload.registry_id || "PRJ-LAB-PROFILE-v1",
      composedRegistryIds: payload.composed_registry_ids || [
        "PRJ-LAB-PROFILE-v1",
        "PRJ-COL-LAB-v1",
      ],
      asOf: payload.as_of ?? null,
      stalenessMs,
      degraded: false,
      source: "projection",
    };
  } catch (adapterError) {
    return readLabsLegacyFallback(
      params,
      "adapter_read_failed",
      adapterError?.message || String(adapterError)
    );
  }
}

function resolveTenantIdParam(params = {}) {
  return str(params.tenantId ?? params.tenant_id);
}

/**
 * @param {object} params — { tenantId?, tenant_id? }
 */
export async function readTenantDashboardV1(params = {}) {
  if (!supabase) {
    return {
      success: false,
      readFailed: true,
      error: "Supabase is not configured",
      data: null,
    };
  }

  const tenantId = resolveTenantIdParam(params);
  if (!tenantId) {
    return { success: false, readFailed: true, error: "tenant_id is required", data: null };
  }

  perfLog("readTenantDashboardV1.rpc", { tenantId });

  const { data, error } = await supabase.rpc("read_tenant_dashboard_v1", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return {
      success: false,
      readFailed: true,
      error: error.message || String(error),
      data: null,
      projection: true,
    };
  }

  const payload = data && typeof data === "object" ? data : {};
  if (payload.success === false || payload.readFailed) {
    return {
      success: false,
      readFailed: true,
      error: payload.error || "dashboard_projection_read_failed",
      data: null,
      projection: true,
    };
  }

  const inner = payload.data || payload;
  const normalized = normalizeAdminDashboardPayload(inner);
  const stalenessMs = num(payload.staleness_ms);

  return {
    success: true,
    readFailed: false,
    error: null,
    data: normalized,
    projection: true,
    registryId: payload.registry_id || "PRJ-DSH-METRICS-v1",
    asOf: payload.as_of ?? null,
    stalenessMs,
    degraded: projectionDegraded(stalenessMs, PROJECTION_STALENESS_SLA_MS.dashboard),
  };
}

/**
 * @param {object} params — { tenantId?, tenant_id? }
 */
export async function readTenantExecutiveV1(params = {}) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured",
      data: null,
    };
  }

  const tenantId = resolveTenantIdParam(params);
  if (!tenantId) {
    return { success: false, error: "tenant_id is required", data: null };
  }

  perfLog("readTenantExecutiveV1.rpc", { tenantId });

  const { data, error } = await supabase.rpc("read_tenant_executive_v1", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return {
      success: false,
      error: error.message || String(error),
      data: null,
      projection: true,
    };
  }

  const payload = data && typeof data === "object" ? data : {};
  if (payload.success === false || payload.readFailed) {
    return {
      success: false,
      error: payload.error || "executive_projection_read_failed",
      data: null,
      projection: true,
    };
  }

  const inner = payload.data || payload;
  const snapshot =
    inner && typeof inner === "object" && inner.data && typeof inner.data === "object"
      ? inner.data
      : inner;
  const stalenessMs = num(payload.staleness_ms);

  return {
    success: true,
    data: snapshot && typeof snapshot === "object" ? snapshot : {},
    error: null,
    projection: true,
    registryId: payload.registry_id || "PRJ-EXE-METRICS-v1",
    asOf: payload.as_of ?? null,
    stalenessMs,
    degraded: projectionDegraded(stalenessMs, PROJECTION_STALENESS_SLA_MS.executive),
  };
}
