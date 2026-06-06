import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { readTenantViewContext } from "@/tenant/tenantFoundationStore.js";
import {
  detectHqLeakage,
  isValidDistributorOsScope,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import {
  blocksNewOrdersCollections,
  LIFECYCLE_STATUS,
} from "@/distributor/distributorLifecycleEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
    const portfolioTab = ["dashboard", "billing"].includes(str(rendered?.tab));
    const portfolioMode = Boolean(rendered?.distributorOsV2 && portfolioTab && !scopeValid);

    entries.push(
      createPredatorEntry({
        status: scopeValid || portfolioMode ? "PASS" : rendered?.distributorOs ? "WARN" : "WARN",
        module: "Distributor OS",
        step: "distributor_os.selected_tenant_required",
        expected: "Scoped tabs require non-HQ distributor; portfolio tabs may show all distributors",
        actual: { scopeTenantId, homeTenantId, scopeValid, portfolioMode, tab: rendered?.tab },
        rootCauseGuess: scopeValid
          ? "Distributor tenant selected"
          : portfolioMode
            ? "Portfolio dashboard without single distributor scope"
            : "Select a distributor before operating in Distributor OS",
        severity: scopeValid || portfolioMode ? "low" : "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const billingRows = Array.isArray(rendered?.billingRows) ? rendered.billingRows : [];
    const performanceRows = Array.isArray(rendered?.performanceRows) ? rendered.performanceRows : [];
    const portfolio = rendered?.portfolio || {};

    const lifecycleValid = performanceRows.every((r) =>
      ["draft", "pending_launch", "active", "suspended", "deactivated"].includes(
        str(r.lifecycleStatus)
      )
    );
    entries.push(
      createPredatorEntry({
        status: lifecycleValid || !performanceRows.length ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.lifecycle_status_valid",
        expected: "All distributors use valid V2 lifecycle statuses",
        actual: {
          count: performanceRows.length,
          invalid: performanceRows.filter(
            (r) =>
              !["draft", "pending_launch", "active", "suspended", "deactivated"].includes(
                str(r.lifecycleStatus)
              )
          ).length,
        },
        severity: lifecycleValid ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const billingValid =
      !billingRows.length ||
      billingRows.every(
        (r) =>
          num(r.amountDue) >= 0 &&
          num(r.collected) >= 0 &&
          num(r.outstanding) >= 0 &&
          num(r.outstanding) <= num(r.amountDue) + 0.01
      );
    entries.push(
      createPredatorEntry({
        status: billingValid ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.billing_calculation_valid",
        expected: "Billing due/collected/outstanding are non-negative and consistent",
        actual: { rowCount: billingRows.length, billingValid },
        severity: billingValid ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ledgerSourceOk = billingRows.every((r) => {
      const ledgerCount = num(r.billingLedgerCount);
      if (ledgerCount <= 0) return true;
      return str(r.collectedSource) === "ledger";
    });
    entries.push(
      createPredatorEntry({
        status: ledgerSourceOk ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.billing_collected_from_ledger",
        expected: "When ledger rows exist, collected uses ledger sum not config.billingCollected",
        actual: {
          ledgerSourceOk,
          rowsWithLedger: billingRows.filter((r) => num(r.billingLedgerCount) > 0).map((r) => ({
            distributorId: r.distributorId,
            billingLedgerCount: r.billingLedgerCount,
            collected: r.collected,
            collectedSource: r.collectedSource,
          })),
          billingLedgerLoadOk: rendered?.billingLedgerLoadOk,
        },
        suggestedFix: ledgerSourceOk
          ? undefined
          : "Ensure loadDistributorOsPortfolio passes billingLedgerTotals into buildDistributorBillingRow",
        severity: ledgerSourceOk ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const revenueRollup = num(rendered?.totalRevenue);
    const perfRevenueActive = performanceRows
      .filter((r) => r.rankingEligible === true)
      .reduce((s, r) => s + num(r.revenue), 0);
    const rollupOk =
      performanceRows.length === 0 || Math.abs(revenueRollup - perfRevenueActive) < 1;
    entries.push(
      createPredatorEntry({
        status: rollupOk ? "PASS" : "WARN",
        module: "Distributor OS",
        step: "distributor_os.distributor_revenue_rollup",
        expected: "Portfolio revenue equals sum of active, contract-valid distributor rows",
        actual: {
          revenueRollup,
          perfRevenueActive,
          delta: Math.abs(revenueRollup - perfRevenueActive),
        },
        severity: rollupOk ? "low" : "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const topDistributor = portfolio.topDistributorByRevenue || null;
    const topPerf = topDistributor?.distributorId
      ? performanceRows.find((r) => r.distributorId === topDistributor.distributorId)
      : null;
    const topActiveOnlyOk =
      topDistributor?.isPlaceholder === true ||
      (topPerf?.lifecycleStatus === LIFECYCLE_STATUS.ACTIVE &&
        topPerf?.contractExpired !== true &&
        topPerf?.rankingEligible === true);
    entries.push(
      createPredatorEntry({
        status: topActiveOnlyOk ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.top_distributor_active_only",
        expected: "Top distributor is ACTIVE with valid contract, or placeholder when none qualify",
        actual: {
          topName: topDistributor?.name,
          topDistributorId: topDistributor?.distributorId,
          isPlaceholder: topDistributor?.isPlaceholder === true,
          lifecycleStatus: topPerf?.lifecycleStatus || topDistributor?.lifecycleStatus,
          rankingEligible: topPerf?.rankingEligible ?? topDistributor?.rankingEligible,
        },
        rootCauseGuess: topActiveOnlyOk
          ? "Top distributor ranking uses active distributors only"
          : "Draft or non-active distributor selected as top distributor",
        severity: topActiveOnlyOk ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const expiryWarnings =
      num(portfolio.contractsExpiring30) +
      num(portfolio.contractsExpiring60) +
      num(portfolio.contractsExpiring90);
    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Distributor OS",
        step: "distributor_os.contract_expiry_warning",
        expected: "Contract expiry windows computed for portfolio",
        actual: {
          expiring30: portfolio.contractsExpiring30 ?? 0,
          expiring60: portfolio.contractsExpiring60 ?? 0,
          expiring90: portfolio.contractsExpiring90 ?? 0,
          totalWindows: expiryWarnings,
        },
        severity: expiryWarnings > 0 ? "medium" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const hqLeakPortfolio = num(rendered?.hqLeakCount) === 0;
    entries.push(
      createPredatorEntry({
        status: hqLeakPortfolio ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.no_hq_leakage",
        expected: "Portfolio aggregates exclude HQ tenant operational rows",
        actual: { hqLeakCount: rendered?.hqLeakCount ?? 0 },
        severity: hqLeakPortfolio ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (str(rendered?.tab) === "commissions") {
      entries.push(
        createPredatorEntry({
          status: rendered?.commissionsReadOnly === true ? "PASS" : "FAIL",
          module: "Distributor OS",
          step: "commission_engine.distributor_os_read_only",
          expected: "Commissions tab is read-only reporting",
          actual: { commissionsReadOnly: rendered?.commissionsReadOnly === true },
          severity: rendered?.commissionsReadOnly === true ? "low" : "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (!scopeValid) return finish(entries);

    const lifecycleStatus = str(rendered?.lifecycleStatus);
    const canOperate = rendered?.canOperate === true;
    const activeOnlyOk =
      lifecycleStatus !== LIFECYCLE_STATUS.ACTIVE || canOperate || blocksNewOrdersCollections(lifecycleStatus);
    entries.push(
      createPredatorEntry({
        status: activeOnlyOk ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.active_only_can_operate",
        expected: "Only active, non-expired distributors can operate",
        actual: { lifecycleStatus, canOperate },
        severity: activeOnlyOk ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const deactivatedBlocks =
      lifecycleStatus !== LIFECYCLE_STATUS.DEACTIVATED ||
      blocksNewOrdersCollections(lifecycleStatus);
    entries.push(
      createPredatorEntry({
        status: deactivatedBlocks ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.deactivated_blocks_actions",
        expected: "Deactivated distributors block operational actions",
        actual: { lifecycleStatus, blocksOps: blocksNewOrdersCollections(lifecycleStatus) },
        severity: deactivatedBlocks ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const catalogItems = Array.isArray(rendered?.catalogItems) ? rendered.catalogItems : [];
    const catalogAssigned = Boolean(rendered?.catalogAssigned) && catalogItems.length > 0;
    const catalogPricingValid = rendered?.catalogPricingValid !== false;
    const catalogHqPricingValid = rendered?.catalogHqPricingValid !== false;
    const catalogIsolated =
      rendered?.catalogInventoryIsolated !== false && num(rendered?.catalogHqLeakCount) === 0;

    const osTab = str(rendered?.tab);
    const catalogGateTab = osTab === "catalog" || osTab === "launch";
    let catalogAssignedStatus = "INFO";
    if (catalogAssigned) {
      catalogAssignedStatus = "PASS";
    } else if (osTab === "catalog") {
      catalogAssignedStatus = "FAIL";
    } else if (osTab === "launch") {
      catalogAssignedStatus = "WARN";
    }
    entries.push(
      createPredatorEntry({
        status: catalogAssignedStatus,
        module: "Distributor OS",
        step: "distributor_catalog_assigned",
        expected: "At least one HQ master product assigned to distributor catalog",
        actual: {
          scopeTenantId,
          tab: osTab || null,
          catalogGateTab,
          catalogAssigned: rendered?.catalogAssigned,
          assignedCount: rendered?.catalogAssignedCount ?? catalogItems.length,
        },
        severity: catalogAssigned ? "low" : catalogGateTab ? "high" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: catalogPricingValid || !catalogItems.length ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_catalog_pricing_valid",
        expected: "All assigned catalog SKUs have valid distributor pricing",
        actual: { pricingValid: catalogPricingValid, itemCount: catalogItems.length },
        severity: catalogPricingValid ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const hqPricingMissing = catalogItems.filter(
      (item) => !item.hqPricingConfigured || num(item.hqCostPrice) <= 0 || num(item.hqTransferPrice) <= 0
    );
    entries.push(
      createPredatorEntry({
        status: catalogHqPricingValid || !catalogItems.length ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_catalog_hq_pricing_configured",
        expected: "Assigned products have HQ cost and transfer price > 0",
        actual: {
          hqPricingValid: catalogHqPricingValid,
          itemCount: catalogItems.length,
          missingCount: hqPricingMissing.length,
          missingProducts: hqPricingMissing.slice(0, 5).map((i) => i.productName || i.productId),
        },
        rootCauseGuess:
          catalogHqPricingValid || !catalogItems.length
            ? "HQ catalog pricing configured for assigned SKUs"
            : "HQ cost or transfer price is zero — margin cannot be calculated",
        severity: catalogHqPricingValid ? "low" : "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: catalogIsolated || !catalogItems.length ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_inventory_isolated",
        expected: "Distributor catalog inventory scoped to distributor tenant_id only",
        actual: {
          isolated: rendered?.catalogInventoryIsolated,
          hqLeakCount: rendered?.catalogHqLeakCount ?? 0,
        },
        severity: catalogIsolated ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const labLeak = detectHqLeakage(labs, scopeTenantId, homeTenantId);
    const orderLeak = detectHqLeakage(orders, scopeTenantId, homeTenantId);
    const collLeak = detectHqLeakage(collections, scopeTenantId, homeTenantId);
    const anyLeak = labLeak.leaked || orderLeak.leaked || collLeak.leaked;

    entries.push(
      createPredatorEntry({
        status: anyLeak ? "FAIL" : "PASS",
        module: "Distributor OS",
        step: "distributor_os.scoped_no_hq_data",
        expected: "No HQ tenant rows inside scoped Distributor OS views",
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

    entries.push(
      createPredatorEntry({
        status: anyLeak ? "FAIL" : "PASS",
        module: "Distributor OS",
        step: "distributor_os.no_hq_data",
        expected: "Distributor OS tabs contain no HQ tenant operational rows",
        actual: {
          scopeTenantId,
          hqRowCount: labLeak.homeCount + orderLeak.homeCount + collLeak.homeCount,
        },
        severity: anyLeak ? "critical" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const viewCtx = readTenantViewContext(homeTenantId);
    const globalSwitched =
      viewCtx.readOnly ||
      (str(viewCtx.viewTenantId) && str(viewCtx.viewTenantId) !== homeTenantId);
    entries.push(
      createPredatorEntry({
        status: globalSwitched ? "FAIL" : "PASS",
        module: "Distributor OS",
        step: "no_global_tenant_switch_leakage",
        expected: "Selecting distributor must not switch global HQ header/view",
        actual: {
          homeTenantId,
          viewTenantId: viewCtx.viewTenantId,
          readOnly: viewCtx.readOnly,
          scopeTenantId,
        },
        severity: globalSwitched ? "critical" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const actionsUseScope =
      str(rendered?.globalViewTenantId || homeTenantId) === homeTenantId &&
      (!labs.length || labs.every((r) => rowTenantId(r) === scopeTenantId)) &&
      (!orders.length || orders.every((r) => rowTenantId(r) === scopeTenantId)) &&
      (!collections.length || collections.every((r) => rowTenantId(r) === scopeTenantId));
    entries.push(
      createPredatorEntry({
        status: actionsUseScope ? "PASS" : "FAIL",
        module: "Distributor OS",
        step: "distributor_os.all_actions_use_selected_distributor",
        expected: "All Distributor OS operational data uses selected distributor tenant_id",
        actual: {
          scopeTenantId,
          globalViewTenantId: rendered?.globalViewTenantId || homeTenantId,
          labCount: labs.length,
          orderCount: orders.length,
          collectionCount: collections.length,
        },
        severity: actionsUseScope ? "low" : "critical",
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
