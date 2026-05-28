import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { resolvePredatorTenantContext } from "@/predator/predatorContext.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { summarizePredatorEntries, createPredatorEntry } from "@/predator/predatorSchema.js";
import { validateAdminDashboardModule } from "@/predator/validators/adminDashboardValidator.js";
import { validateCollectionsModule } from "@/predator/validators/collectionsValidator.js";
import { validateQualificationModule } from "@/predator/validators/qualificationValidator.js";
import { validateAgentVisitsModule } from "@/predator/validators/agentVisitsValidator.js";
import { validateTenantRoleIsolationModule } from "@/predator/validators/tenantRoleIsolationValidator.js";
import { validateNotificationsFoundationModule } from "@/predator/validators/notificationsFoundationValidator.js";
import { validateLabPortalModule } from "@/predator/validators/labPortalValidator.js";
import { validateOperationalEvidenceModule } from "@/predator/validators/operationalEvidenceValidator.js";
import { validateOperationsCommandCenterModule } from "@/predator/validators/operationsCommandCenterValidator.js";
import { validateExecutiveInterventionModule } from "@/predator/validators/executiveInterventionValidator.js";
import { validateOperationalTasksModule } from "@/predator/validators/operationalTaskValidator.js";
import { ROLES } from "@/config/roles.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { ADMIN_DASHBOARD_MODULE } from "@/predator/adminDashboardUiSnapshot.js";
import {
  COLLECTIONS_MODULE,
  QUALIFICATION_REVIEW_MODULE,
} from "@/predator/moduleUiSnapshot.js";

/**
 * @typedef {Object} PredatorRenderedSnapshots
 * @property {{ executive?: object, summary?: object }|null} [adminDashboard]
 * @property {{ summary?: object, collections?: unknown[] }|null} [collections]
 * @property {{ rowCount?: number }|null} [qualificationReview]
 * @property {{ recentVisitsCount?: number, todayVisits?: number }|null} [agentVisits]
 * @property {Record<string, { db?: number, api?: number, ui?: number }>|null} [tenantRoleIsolation]
 * @property {object|null} [labPortal]
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
    const isLabRole = ctx.role === ROLES.LAB;

    if (isLabRole) {
      modules.push(skippedModuleForLabRole("Admin Dashboard", ctx));
    } else {
      const storedAdminRendered = predatorStore.getModuleRenderedSnapshot(
        ADMIN_DASHBOARD_MODULE,
        ctx
      );
      const admin = await validateAdminDashboardModule({
        ctx,
        rendered: snapshots.adminDashboard ?? storedAdminRendered?.snapshot ?? null,
      });
      predatorStore.setModuleReport("Admin Dashboard", admin.entries, ctx);
      modules.push(admin);
    }

    const storedCollectionsRendered = predatorStore.getModuleRenderedSnapshot(
      COLLECTIONS_MODULE,
      ctx
    );
    const collections = await validateCollectionsModule({
      ctx,
      rendered: snapshots.collections ?? storedCollectionsRendered?.snapshot ?? null,
    });
    predatorStore.setModuleReport("Collections", collections.entries, ctx);
    modules.push(collections);

    const labPortal = await validateLabPortalModule({
      ctx,
      rendered: snapshots.labPortal ?? null,
    });
    predatorStore.setModuleReport("Lab Portal", labPortal.entries, ctx);
    modules.push(labPortal);

    if (isLabRole) {
      modules.push(skippedModuleForLabRole("Qualification Review", ctx));
      modules.push(skippedModuleForLabRole("Agent Visits", ctx));
    } else {
      const storedQualificationRendered = predatorStore.getModuleRenderedSnapshot(
        QUALIFICATION_REVIEW_MODULE,
        ctx
      );
      const qualification = await validateQualificationModule({
        ctx,
        rendered: snapshots.qualificationReview ?? storedQualificationRendered?.snapshot ?? null,
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
    }

    const isolation = await validateTenantRoleIsolationModule({
      ctx,
      currentUser,
      rendered: snapshots.tenantRoleIsolation ?? { layerSnapshots: buildIsolationLayerSnapshots(snapshots) },
    });
    predatorStore.setModuleReport("Tenant + Role Isolation", isolation.entries, ctx);
    modules.push(isolation);

    const notifications = await validateNotificationsFoundationModule({ ctx });
    predatorStore.setModuleReport("Notifications", notifications.entries, ctx);
    modules.push(notifications);

    if (isLabRole) {
      modules.push(skippedModuleForLabRole("Operational Evidence", ctx));
      modules.push(skippedModuleForLabRole("Operations Center", ctx));
      modules.push(skippedModuleForLabRole("Executive Intervention", ctx));
      modules.push(skippedModuleForLabRole("Operational Tasks", ctx));
    } else {
      const evidence = await validateOperationalEvidenceModule({ ctx, currentUser });
      predatorStore.setModuleReport("Operational Evidence", evidence.entries, ctx);
      modules.push(evidence);

      const operationsCenter = await validateOperationsCommandCenterModule({
        ctx,
        currentUser,
        rendered: snapshots.operationsCenter ?? null,
      });
      predatorStore.setModuleReport("Operations Center", operationsCenter.entries, ctx);
      modules.push(operationsCenter);

      const executiveIntervention = await validateExecutiveInterventionModule({
        ctx,
        currentUser,
        rendered: snapshots.executiveIntervention ?? null,
      });
      predatorStore.setModuleReport("Executive Intervention", executiveIntervention.entries, ctx);
      modules.push(executiveIntervention);

      const operationalTasks = await validateOperationalTasksModule({
        ctx,
        currentUser,
        rendered: snapshots.operationalTasks ?? null,
      });
      predatorStore.setModuleReport("Operational Tasks", operationalTasks.entries, ctx);
      modules.push(operationalTasks);
    }

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
    case "Notifications":
      result = await validateNotificationsFoundationModule({ ctx });
      break;
    case "Lab Portal":
      result = await validateLabPortalModule({ ctx, rendered: snapshot });
      break;
    case "Operational Evidence":
      result = await validateOperationalEvidenceModule({ ctx, currentUser });
      break;
    case "Operations Center":
      result = await validateOperationsCommandCenterModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Executive Intervention":
      result = await validateExecutiveInterventionModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Operational Tasks":
      result = await validateOperationalTasksModule({
        ctx,
        currentUser,
        rendered: snapshot,
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
/**
 * @param {string} moduleName
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} ctx
 */
function skippedModuleForLabRole(moduleName, ctx) {
  const entry = createPredatorEntry({
    status: "PASS",
    module: moduleName,
    step: "lab_role.skip",
    rootCauseGuess: "Not applicable to Lab Portal V1",
    suggestedFix: "Use Lab Portal, Payments & Account, and Lab Ordering validators for lab QA",
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: ctx.userId,
  });
  const entries = [entry];
  predatorStore.setModuleReport(moduleName, entries, ctx);
  return {
    module: moduleName,
    summary: summarizePredatorEntries(entries),
    entries,
  };
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
