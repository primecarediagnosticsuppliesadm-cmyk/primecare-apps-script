import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  buildRevenueFunnelModel,
  evaluateCommercialPathComplete,
} from "@/founder/revenueFunnelEngine.js";
import {
  loadRevenueFunnelData,
  normalizeRevenueFunnelBundle,
} from "@/founder/revenueFunnelData.js";

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Revenue Funnel",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

function pathStep(status, blockers, stage) {
  const hit = blockers.find((b) => b.stage === stage);
  if (!hit) return { status: "PASS", actual: "Stage satisfied" };
  return { status: "FAIL", actual: hit.reason, action: hit.action };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateRevenueFunnelModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace("Revenue Funnel", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Revenue Funnel",
          step: "role.access",
          expected: "Executive-only revenue funnel",
          actual: { role: ctx.role },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let model = rendered?.funnel || null;
    if (!model && currentUser) {
      try {
        const data = await loadRevenueFunnelData(currentUser);
        model = buildRevenueFunnelModel(normalizeRevenueFunnelBundle(data));
      } catch (err) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Revenue Funnel",
            step: "revenue_funnel.model_load",
            actual: err?.message || String(err),
            suggestedFix: "Open Revenue Funnel and ensure portfolio data loads",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
        return finish(entries);
      }
    }

    if (!model) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Revenue Funnel",
          step: "revenue_funnel.model_present",
          expected: "Revenue funnel model from page snapshot or loader",
          actual: "No model",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const focusId = str(rendered?.selectedDistributorId || rendered?.gunturDistributorId);
    const focus =
      model.distributors.find((r) => r.distributorId === focusId) ||
      model.guntur ||
      model.distributors[0] ||
      null;

    const evalResult = evaluateCommercialPathComplete(focus);
    const blockers = evalResult.blockers || [];
    const summary = focus?.summary || {};

    const inventoryReady = focus?.inventory?.ready === true;
    entries.push(
      createPredatorEntry({
        status: inventoryReady ? "PASS" : "WARN",
        module: "Revenue Funnel",
        step: "commercial_path_complete.inventory",
        expected: "Distributor tenant inventory has stock available for ordering",
        actual: focus?.inventory || null,
        rootCauseGuess: inventoryReady
          ? "Inventory ready for lab ordering"
          : focus?.inventory?.detail || "Inventory not order-ready",
        severity: inventoryReady ? "low" : "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const steps = [
      {
        stage: "qualification",
        step: "commercial_path_complete.qualification",
        pass: summary.qualified > 0,
        actual: { qualifiedLabs: summary.qualified },
      },
      {
        stage: "contract",
        step: "commercial_path_complete.contract",
        pass: summary.contracted > 0,
        actual: { contractedLabs: summary.contracted },
      },
      {
        stage: "order",
        step: "commercial_path_complete.order",
        pass: summary.ordersCreated > 0,
        actual: { ordersCreated: summary.ordersCreated },
      },
      {
        stage: "fulfillment",
        step: "commercial_path_complete.fulfillment",
        pass: summary.ordersFulfilled > 0,
        actual: { ordersFulfilled: summary.ordersFulfilled },
      },
      {
        stage: "ar",
        step: "commercial_path_complete.ar",
        pass: summary.arOutstanding > 0 || summary.paymentsReceived > 0,
        actual: {
          arOutstanding: summary.arOutstanding,
          paymentsReceived: summary.paymentsReceived,
        },
      },
      {
        stage: "payment",
        step: "commercial_path_complete.payment",
        pass: summary.paymentsReceived > 0,
        actual: { paymentsReceived: summary.paymentsReceived },
      },
    ];

    for (const row of steps) {
      const detail = pathStep(row.pass ? "PASS" : "FAIL", blockers, row.stage);
      entries.push(
        createPredatorEntry({
          status: row.pass ? "PASS" : "FAIL",
          module: "Revenue Funnel",
          step: row.step,
          expected: `Commercial path stage '${row.stage}' satisfied for scoped distributor`,
          actual: row.pass ? row.actual : { reason: detail.actual, action: detail.action },
          rootCauseGuess: row.pass
            ? `${row.stage} stage active`
            : blockers.find((b) => b.stage === row.stage)?.reason,
          severity: row.pass ? "low" : row.stage === "payment" || row.stage === "fulfillment" ? "high" : "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: evalResult.complete ? "PASS" : "FAIL",
        module: "Revenue Funnel",
        step: "commercial_path_complete",
        expected: "Qualification → Contract → Order → Fulfillment → AR → Payment complete",
        actual: {
          distributorId: focus?.distributorId || null,
          distributorName: focus?.name || null,
          pathComplete: evalResult.complete,
          blockers,
          summary: focus?.summary || null,
        },
        rootCauseGuess: evalResult.complete
          ? "First revenue path complete for focus distributor"
          : blockers.map((b) => b.reason).filter(Boolean).join("; ") || "Commercial path incomplete",
        severity: evalResult.complete ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return finish(entries);
  });
}

function str(v) {
  return String(v ?? "").trim();
}
