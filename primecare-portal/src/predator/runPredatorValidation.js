import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { resolvePredatorTenantContext } from "@/predator/predatorContext.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { summarizePredatorEntries, createPredatorEntry } from "@/predator/predatorSchema.js";
import { validateAdminDashboardModule } from "@/predator/validators/adminDashboardValidator.js";
import { validateCollectionsModule } from "@/predator/validators/collectionsValidator.js";
import { validateQualificationModule } from "@/predator/validators/qualificationValidator.js";
import { validateAgentVisitsModule } from "@/predator/validators/agentVisitsValidator.js";
import { validateTenantRoleIsolationModule } from "@/predator/validators/tenantRoleIsolationValidator.js";
import { predatorTrace } from "@/predator/predatorTiming.js";

/**
 * @typedef {Object} PredatorRenderedSnapshots
 * @property {{ executive?: object, summary?: object }|null} [adminDashboard]
 * @property {{ summary?: object, collections?: unknown[] }|null} [collections]
 * @property {{ rowCount?: number }|null} [qualificationReview]
 * @property {{ recentVisitsCount?: number, todayVisits?: number }|null} [agentVisits]
 * @property {Record<string, { db?: number, api?: number, ui?: number }>|null} [tenantRoleIsolation]
 */

/**
 * @param {object|null} currentUser
 * @param {PredatorRenderedSnapshots} [snapshots]
 */
export async function runAllPredatorValidations(currentUser, snapshots = {}) {
  if (!isPredatorEnabled()) {
    return { status: "PASS", modules: [], entries: [] };
  }

  return predatorTrace("Predator", "validation.runAll", async () => {
    const ctx = await resolvePredatorTenantContext(currentUser);
    predatorStore.setActiveTenantContext(ctx);

    const modules = [];

    const admin = await validateAdminDashboardModule({
      ctx,
      rendered: snapshots.adminDashboard ?? null,
    });
    predatorStore.setModuleReport("Admin Dashboard", admin.entries, ctx);
    modules.push(admin);

    const collections = await validateCollectionsModule({
      ctx,
      rendered: snapshots.collections ?? null,
    });
    predatorStore.setModuleReport("Collections", collections.entries, ctx);
    modules.push(collections);

    const qualification = await validateQualificationModule({
      ctx,
      rendered: snapshots.qualificationReview ?? null,
    });
    predatorStore.setModuleReport("Qualification Review", qualification.entries, ctx);
    modules.push(qualification);

    const agentVisits = await validateAgentVisitsModule({
      ctx,
      currentUser,
      rendered: snapshots.agentVisits ?? null,
    });
    predatorStore.setModuleReport("Agent Visits", agentVisits.entries, ctx);
    modules.push(agentVisits);

    const isolation = await validateTenantRoleIsolationModule({
      ctx,
      currentUser,
      rendered: snapshots.tenantRoleIsolation ?? { layerSnapshots: buildIsolationLayerSnapshots(snapshots) },
    });
    predatorStore.setModuleReport("Tenant + Role Isolation", isolation.entries, ctx);
    modules.push(isolation);

    const allEntries = modules.flatMap((m) => m.entries);
    const summary = summarizePredatorEntries(allEntries);

    const diagnoses = predatorStore.getAllModuleDiagnosesForActiveTenant();

    const report = {
      status: summary.status,
      tenant: ctx,
      ranAt: new Date().toISOString(),
      modules,
      summary,
      entries: allEntries,
      diagnoses,
    };

    if (summary.status !== "PASS") {
      console.warn("[Predator] validation completed with issues", report.summary);
    } else {
      console.info("[Predator] validation PASS", ctx);
    }

    return report;
  });
}

/**
 * @param {string} moduleName
 * @param {object|null} currentUser
 * @param {object} snapshot
 */
export async function runPredatorModuleValidation(moduleName, currentUser, snapshot = {}) {
  if (!isPredatorEnabled()) return null;
  const ctx = await resolvePredatorTenantContext(currentUser);
  predatorStore.setActiveTenantContext(ctx);

  let result = null;
  switch (moduleName) {
    case "Admin Dashboard":
      result = await validateAdminDashboardModule({ ctx, rendered: snapshot });
      break;
    case "Collections":
      result = await validateCollectionsModule({ ctx, rendered: snapshot });
      break;
    case "Qualification Review":
      result = await validateQualificationModule({ ctx, rendered: snapshot });
      break;
    case "Agent Visits":
      result = await validateAgentVisitsModule({ ctx, currentUser, rendered: snapshot });
      break;
    case "Tenant + Role Isolation":
      result = await validateTenantRoleIsolationModule({
        ctx,
        currentUser,
        rendered: snapshot.layerSnapshots
          ? snapshot
          : { layerSnapshots: buildIsolationLayerSnapshots(snapshot) },
      });
      break;
    default:
      result = {
        module: moduleName,
        entries: [
          createPredatorEntry({
            status: "WARN",
            module: moduleName,
            step: "unknown_module",
            rootCauseGuess: "No validator registered",
            suggestedFix: "Add module to runPredatorValidation.js",
          }),
        ],
        summary: { status: "WARN", pass: 0, warn: 1, fail: 0 },
      };
  }

  if (result) {
    predatorStore.setModuleReport(moduleName, result.entries, ctx);
    if (result.diagnosis) {
      predatorStore.setModuleDiagnosis(moduleName, result.diagnosis, ctx);
    }
  }
  return result;
}

/**
 * Map module snapshots to cross-layer isolation probes (mutable counts).
 * @param {PredatorRenderedSnapshots} snapshots
 */
function buildIsolationLayerSnapshots(snapshots) {
  const admin = snapshots.adminDashboard || {};
  const collections = snapshots.collections || {};
  const visits = snapshots.agentVisits || {};

  return {
    visits: {
      db: visits.recentVisitsCount ?? null,
      api: visits.recentVisitsCount ?? null,
      ui: visits.recentVisitsCount ?? null,
    },
    collections: {
      db: collections.collections?.length ?? null,
      api: collections.collections?.length ?? null,
      ui: collections.collections?.length ?? null,
    },
    orders: {
      rls: admin.ordersRowCount ?? null,
      api: admin.apiTraceOrders ?? null,
      ui: admin.uiOrdersCount ?? null,
    },
  };
}
