import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { resolvePredatorTenantContext } from "@/predator/predatorContext.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { summarizePredatorEntries, createPredatorEntry } from "@/predator/predatorSchema.js";
import { validateAdminDashboardModule } from "@/predator/validators/adminDashboardValidator.js";
import { validateCollectionsModule } from "@/predator/validators/collectionsValidator.js";
import { validateQualificationModule } from "@/predator/validators/qualificationValidator.js";
import { validateAgentVisitsModule } from "@/predator/validators/agentVisitsValidator.js";
import { predatorTrace } from "@/predator/predatorTiming.js";

/**
 * @typedef {Object} PredatorRenderedSnapshots
 * @property {{ executive?: object, summary?: object }|null} [adminDashboard]
 * @property {{ summary?: object, collections?: unknown[] }|null} [collections]
 * @property {{ rowCount?: number }|null} [qualificationReview]
 * @property {{ recentVisitsCount?: number, todayVisits?: number }|null} [agentVisits]
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

    const allEntries = modules.flatMap((m) => m.entries);
    const summary = summarizePredatorEntries(allEntries);

    const report = {
      status: summary.status,
      tenant: ctx,
      ranAt: new Date().toISOString(),
      modules,
      summary,
      entries: allEntries,
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
  }
  return result;
}
