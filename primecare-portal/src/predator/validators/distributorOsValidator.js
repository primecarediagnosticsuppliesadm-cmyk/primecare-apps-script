import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  detectHqLeakage,
  isValidDistributorOsScope,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor OS",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.rendered]
 */
export async function validateDistributorOsModule({ ctx, rendered = null }) {
  return predatorTrace("Distributor OS", "validation.full", async () => {
    const entries = [];
    const scopeTenantId = str(rendered?.scopeTenantId);
    const homeTenantId = str(rendered?.homeTenantId || ctx.tenantId);
    const labs = Array.isArray(rendered?.labs) ? rendered.labs : [];
    const orders = Array.isArray(rendered?.orders) ? rendered.orders : [];
    const collections = Array.isArray(rendered?.collections) ? rendered.collections : [];
    const contracts = Array.isArray(rendered?.contracts) ? rendered.contracts : [];

    if (ctx.role !== ROLES.EXECUTIVE && ctx.role !== ROLES.ADMIN) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor OS",
          step: "role.access",
          expected: "Executive/admin only",
          actual: { role: ctx.role },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const scopeValid = isValidDistributorOsScope(
      { tenantId: scopeTenantId, homeTenantId },
      homeTenantId
    );

    entries.push(
      createPredatorEntry({
        status: scopeValid ? "PASS" : rendered?.distributorOs ? "FAIL" : "WARN",
        module: "Distributor OS",
        step: "distributor_os.selected_tenant_required",
        expected: "Distributor OS requires non-HQ distributor tenant_id",
        actual: { scopeTenantId, homeTenantId, scopeValid },
        rootCauseGuess: scopeValid
          ? "Distributor tenant selected"
          : "Select a distributor before operating in Distributor OS",
        severity: scopeValid ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (!scopeValid) return finish(entries);

    const labLeak = detectHqLeakage(labs, scopeTenantId, homeTenantId);
    const orderLeak = detectHqLeakage(orders, scopeTenantId, homeTenantId);
    const collLeak = detectHqLeakage(collections, scopeTenantId, homeTenantId);
    const anyLeak = labLeak.leaked || orderLeak.leaked || collLeak.leaked;

    entries.push(
      createPredatorEntry({
        status: anyLeak ? "FAIL" : "PASS",
        module: "Distributor OS",
        step: "distributor_os.no_hq_leakage",
        expected: "No HQ tenant rows inside Distributor OS views",
        actual: {
          scopeTenantId,
          homeTenantId,
          labHomeRows: labLeak.homeCount,
          orderHomeRows: orderLeak.homeCount,
          collectionHomeRows: collLeak.homeCount,
        },
        rootCauseGuess: anyLeak
          ? "HQ data leaked into distributor OS scope"
          : "Distributor OS isolated from HQ tenant rows",
        severity: anyLeak ? "critical" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const labsScoped =
      labs.length === 0 ||
      labs.every((row) => rowTenantId(row) === scopeTenantId);
    entries.push(
      createPredatorEntry({
        status: labsScoped ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.labs_scoped",
        expected: "All labs.tenant_id equal selected distributor",
        actual: {
          scopeTenantId,
          labCount: labs.length,
          mismatches: labs.filter((r) => rowTenantId(r) !== scopeTenantId).length,
        },
        severity: labsScoped ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ordersScoped =
      orders.length === 0 ||
      orders.every((row) => rowTenantId(row) === scopeTenantId);
    entries.push(
      createPredatorEntry({
        status: ordersScoped ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.orders_scoped",
        expected: "All orders.tenant_id equal selected distributor",
        actual: {
          scopeTenantId,
          orderCount: orders.length,
          mismatches: orders.filter((r) => rowTenantId(r) !== scopeTenantId).length,
        },
        severity: ordersScoped ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const collectionsScoped =
      collections.length === 0 ||
      collections.every((row) => rowTenantId(row) === scopeTenantId);
    entries.push(
      createPredatorEntry({
        status: collectionsScoped ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.collections_scoped",
        expected: "All collections tenant_id equal selected distributor",
        actual: {
          scopeTenantId,
          collectionCount: collections.length,
          mismatches: collections.filter((r) => rowTenantId(r) !== scopeTenantId).length,
        },
        severity: collectionsScoped ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const contractsScoped =
      contracts.length === 0 ||
      contracts.every(
        (c) =>
          str(c.distributorId) === scopeTenantId || rowTenantId(c) === scopeTenantId
      );
    entries.push(
      createPredatorEntry({
        status: contractsScoped ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.contracts_scoped",
        expected: "All contracts belong to selected distributor",
        actual: {
          scopeTenantId,
          contractCount: contracts.length,
          mismatches: contracts.filter(
            (c) =>
              str(c.distributorId) !== scopeTenantId && rowTenantId(c) !== scopeTenantId
          ).length,
        },
        severity: contractsScoped ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return finish(entries);
  });
}
