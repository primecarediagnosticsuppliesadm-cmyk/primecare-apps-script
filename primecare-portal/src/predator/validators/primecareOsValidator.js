import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { readTenantViewContext } from "@/tenant/tenantFoundationStore.js";
import { ROLES } from "@/config/roles.js";
import { rowTenantId } from "@/distributor/distributorOsEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "PrimeCare OS",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

function rowsOnlyHq(rows, homeTenantId) {
  const home = str(homeTenantId);
  if (!home || !Array.isArray(rows)) return { ok: true, mismatches: 0 };
  const mismatches = rows.filter((r) => {
    const tid = rowTenantId(r);
    return tid && tid !== home;
  }).length;
  return { ok: mismatches === 0, mismatches };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.rendered]
 */
export async function validatePrimecareOsModule({ ctx, rendered = null }) {
  return predatorTrace("PrimeCare OS", "validation.full", async () => {
    const entries = [];
    const homeTenantId = str(rendered?.homeTenantId || ctx.tenantId);
    const page = str(rendered?.page);
    const viewCtx = readTenantViewContext(homeTenantId);
    const globalLeak =
      viewCtx.readOnly ||
      (str(viewCtx.viewTenantId) && str(viewCtx.viewTenantId) !== homeTenantId);

    entries.push(
      createPredatorEntry({
        status: globalLeak ? "FAIL" : "PASS",
        module: "PrimeCare OS",
        step: "no_global_tenant_switch_leakage",
        expected: "HQ shell stays on home tenant (no global read-only distributor view)",
        actual: {
          homeTenantId,
          viewTenantId: viewCtx.viewTenantId,
          readOnly: viewCtx.readOnly,
          page: page || rendered?.primecareOs ? "hq" : null,
        },
        severity: globalLeak ? "critical" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role !== ROLES.EXECUTIVE && ctx.role !== ROLES.ADMIN) {
      return finish(entries);
    }

    if (page === "labs" || rendered?.visibleLabs) {
      const labs = Array.isArray(rendered?.visibleLabs) ? rendered.visibleLabs : [];
      const check = rowsOnlyHq(labs, homeTenantId);
      entries.push(
        createPredatorEntry({
          status: check.ok ? "PASS" : "FAIL",
          module: "PrimeCare OS",
          step: "primecare_os.hq_only_labs",
          expected: "HQ Labs page shows only PrimeCare HQ tenant labs",
          actual: { homeTenantId, labCount: labs.length, mismatches: check.mismatches },
          severity: check.ok ? "low" : "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (page === "orders" || rendered?.visibleOrders) {
      const orders = Array.isArray(rendered?.visibleOrders) ? rendered.visibleOrders : [];
      const check = rowsOnlyHq(orders, homeTenantId);
      entries.push(
        createPredatorEntry({
          status: check.ok ? "PASS" : "FAIL",
          module: "PrimeCare OS",
          step: "primecare_os.hq_only_orders",
          expected: "HQ Orders page shows only PrimeCare HQ tenant orders",
          actual: { homeTenantId, orderCount: orders.length, mismatches: check.mismatches },
          severity: check.ok ? "low" : "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (page === "collections" || rendered?.visibleCollections) {
      const collections = Array.isArray(rendered?.visibleCollections)
        ? rendered.visibleCollections
        : [];
      const check = rowsOnlyHq(collections, homeTenantId);
      entries.push(
        createPredatorEntry({
          status: check.ok ? "PASS" : "FAIL",
          module: "PrimeCare OS",
          step: "primecare_os.hq_only_collections",
          expected: "HQ Collections shows only PrimeCare HQ receivables",
          actual: {
            homeTenantId,
            collectionCount: collections.length,
            mismatches: check.mismatches,
          },
          severity: check.ok ? "low" : "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
