import { supabase } from "@/api/supabaseClient.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import {
  computeRevenueMetrics,
} from "@/metrics/computeRevenueMetrics.js";
import { normalizeLabIdKey } from "@/utils/labId.js";

const WARN_MESSAGE =
  "Lab has fulfilled revenue but no qualification profile. This may be intentional QA data or indicate commercial activity outside the qualification workflow.";

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapOrderLineToItemShape(row) {
  return {
    order_id: row.order_id ?? row.orderId,
    total_price: row.net_line_total ?? row.netLineTotal ?? row.total_price,
    quantity: row.quantity,
    unit_price: row.unit_selling_price ?? row.unitSellingPrice ?? row.unit_price,
  };
}

/**
 * Observability-only: labs with fulfilled revenue but no lab_qualifications row.
 * WARN per orphan lab; never FAIL for this condition.
 *
 * @param {{ ctx: import('@/predator/predatorSchema.js').PredatorTenantContext }} params
 * @returns {Promise<import('@/predator/predatorSchema.js').PredatorDebugEntry[]>}
 */
export async function validateQualificationRevenueConsistency({ ctx }) {
  const base = {
    module: "Qualification Analytics",
    step: "qualification_revenue_consistency",
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: ctx.userId,
    issueClass: "data_integrity",
  };

  if (!supabase) {
    return [
      createPredatorEntry({
        ...base,
        status: "WARN",
        rootCauseGuess: "Supabase not configured — cannot compare fulfilled revenue vs qualifications",
        suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
        severity: "low",
      }),
    ];
  }

  const [ordersRes, orderLinesRes, labsRes, qualRes] = await Promise.all([
    supabase.from("orders").select("*"),
    supabase.from("order_lines").select("*"),
    supabase.from("labs").select("lab_id, lab_name"),
    supabase.from("lab_qualifications").select("lab_id"),
  ]);

  if (ordersRes.error) {
    return [
      createPredatorEntry({
        ...base,
        status: "WARN",
        actual: { error: ordersRes.error.message },
        rootCauseGuess: "Cannot read orders for qualification revenue consistency check",
        suggestedFix: "Verify orders RLS for current role",
        severity: "low",
      }),
    ];
  }

  const ordersRaw = ordersRes.data || [];
  const orderItemsRaw = (orderLinesRes.error ? [] : orderLinesRes.data || []).map(
    mapOrderLineToItemShape
  );
  const labsRaw = labsRes.error ? [] : labsRes.data || [];
  const qualRaw = qualRes.error ? [] : qualRes.data || [];

  const labNameById = new Map();
  for (const lab of labsRaw) {
    const id = normalizeLabIdKey(lab.lab_id ?? lab.labId);
    const name = String(lab.lab_name ?? lab.labName ?? "").trim();
    if (id && name) labNameById.set(id, name);
  }

  const revenue = computeRevenueMetrics({
    ordersRaw,
    orderItemsRaw,
    todayYmd: localDateYmd(),
    labNameById,
  });

  const qualLabIds = new Set(
    qualRaw
      .map((row) => normalizeLabIdKey(row.lab_id ?? row.labId))
      .filter(Boolean)
  );

  const orphans = [];
  for (const [labId, bucket] of revenue.revenueByLab.entries()) {
    const amount = Number(bucket.revenue ?? 0);
    if (amount <= 0) continue;
    const qualificationExists = qualLabIds.has(labId);
    if (!qualificationExists) {
      orphans.push({
        lab_id: labId,
        lab_name: bucket.labName || labNameById.get(labId) || labId,
        revenue_amount: amount,
        qualification_exists: false,
      });
    }
  }

  orphans.sort((a, b) => b.revenue_amount - a.revenue_amount);

  if (orphans.length === 0) {
    return [
      createPredatorEntry({
        ...base,
        status: "PASS",
        expected: "every lab with fulfilled revenue has a lab_qualifications profile",
        actual: {
          fulfilledRevenueLabCount: revenue.revenueByLab.size,
          qualificationLabCount: qualLabIds.size,
        },
        rootCauseGuess: "",
        suggestedFix: "",
        severity: "low",
      }),
    ];
  }

  return orphans.map((row) =>
    createPredatorEntry({
      ...base,
      status: "WARN",
      expected: "lab_qualifications row when lab has fulfilled revenue",
      actual: row,
      rootCauseGuess: WARN_MESSAGE,
      suggestedFix:
        "Create qualification in Distributor OS → Labs → Qualification, or confirm intentional QA orphan commercial data",
      severity: "medium",
    })
  );
}
