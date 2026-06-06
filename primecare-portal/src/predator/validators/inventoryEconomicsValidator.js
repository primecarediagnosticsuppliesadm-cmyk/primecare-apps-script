import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { loadInventoryEconomicsBundle } from "@/inventory/inventoryEconomicsData.js";
import { buildInventoryEconomicsModel } from "@/inventory/inventoryEconomicsEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Inventory Economics",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.rendered]
 */
export async function validateInventoryEconomicsModule({ ctx, rendered = null }) {
  return predatorTrace("Inventory Economics", "validation.full", async () => {
    const entries = [];
    const roleOk = ctx.role === ROLES.EXECUTIVE || ctx.role === ROLES.ADMIN;

    if (!roleOk) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Inventory Economics",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let bundle;
    try {
      bundle = await loadInventoryEconomicsBundle();
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Inventory Economics",
          step: "bundle.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const model =
      rendered?.inventoryEconomics ||
      bundle.model ||
      buildInventoryEconomicsModel(bundle.inventoryRows, bundle.ledgerRows);
    const rows = model.rows || [];
    const empty = rows.length === 0;

    const pushStep = (step, valid, expected, actual) => {
      entries.push(
        createPredatorEntry({
          status: empty ? "WARN" : valid ? "PASS" : "FAIL",
          module: "Inventory Economics",
          step,
          expected,
          actual: empty ? "No inventory rows loaded" : actual,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    };

    const rowValueSum = rows.reduce((s, r) => s + num(r.inventoryValue), 0);
    const valueLoadedOk = Math.abs(rowValueSum - num(model.totalInventoryValue)) <= 0.01;
    pushStep(
      "inventory.value_loaded",
      valueLoadedOk,
      "totalInventoryValue equals sum(currentStock * unitCost)",
      { totalInventoryValue: model.totalInventoryValue, rowValueSum, skuCount: rows.length }
    );

    const deadRowSum = rows
      .filter((r) => r.movementClass === "dead")
      .reduce((s, r) => s + num(r.inventoryValue), 0);
    const deadValid =
      Math.abs(deadRowSum - num(model.deadInventoryValue)) <= 0.01 &&
      rows.every((r) => (r.movementClass === "dead") === Boolean(r.isDeadInventory));
    pushStep(
      "inventory.dead_inventory_valid",
      deadValid,
      "deadInventoryValue matches 120+ day no-movement SKUs",
      { deadInventoryValue: model.deadInventoryValue, deadRowSum }
    );

    const slowRowSum = rows
      .filter((r) => r.movementClass === "slow")
      .reduce((s, r) => s + num(r.inventoryValue), 0);
    const slowValid =
      Math.abs(slowRowSum - num(model.slowMovingInventoryValue)) <= 0.01 &&
      rows.every((r) => (r.movementClass === "slow") === Boolean(r.isSlowMoving));
    pushStep(
      "inventory.slow_inventory_valid",
      slowValid,
      "slowMovingInventoryValue matches 60–119 day no-movement SKUs",
      { slowMovingInventoryValue: model.slowMovingInventoryValue, slowRowSum }
    );

    const reorderRowSum = rows.reduce((s, r) => s + num(r.reorderExposureValue), 0);
    const reorderValid = Math.abs(reorderRowSum - num(model.reorderExposure)) <= 0.01;
    pushStep(
      "inventory.reorder_exposure_valid",
      reorderValid,
      "reorderExposure equals sum of low-stock gap * unitCost",
      { reorderExposure: model.reorderExposure, reorderRowSum }
    );

    const healthValid =
      num(model.inventoryHealthScore) >= 0 &&
      num(model.inventoryHealthScore) <= 100 &&
      (model.inventoryValueByDistributor || []).every(
        (r) => r.inventoryHealthScore >= 0 && r.inventoryHealthScore <= 100
      );
    pushStep(
      "inventory.health_score_valid",
      healthValid,
      "Inventory health scores are 0–100",
      {
        portfolioHealth: model.inventoryHealthScore,
        distributorRows: model.inventoryValueByDistributor?.length ?? 0,
      }
    );

    const rollupValue = (model.inventoryValueByDistributor || []).reduce(
      (s, r) => s + num(r.inventoryValue),
      0
    );
    const rollupSlow = (model.inventoryValueByDistributor || []).reduce(
      (s, r) => s + num(r.slowMovingInventoryValue),
      0
    );
    const rollupReorder = (model.inventoryValueByDistributor || []).reduce(
      (s, r) => s + num(r.reorderExposure),
      0
    );
    const distributorRollupValid =
      Math.abs(rollupValue - num(model.totalInventoryValue)) <= 0.01 &&
      Math.abs(rollupSlow - num(model.slowMovingInventoryValue)) <= 0.01 &&
      Math.abs(rollupReorder - num(model.reorderExposure)) <= 0.01;
    pushStep(
      "inventory.distributor_rollup_valid",
      distributorRollupValid,
      "Per-distributor rollups match portfolio inventory economics totals",
      {
        rollupValue,
        totalInventoryValue: model.totalInventoryValue,
        rollupSlow,
        slowMovingInventoryValue: model.slowMovingInventoryValue,
        rollupReorder,
        reorderExposure: model.reorderExposure,
      }
    );

    return finish(entries);
  });
}
