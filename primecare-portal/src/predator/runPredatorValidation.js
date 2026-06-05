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
import { validateOperationalEventLedgerModule } from "@/predator/validators/operationalEventLedgerValidator.js";
import { validateExecutiveIntelligenceModule } from "@/predator/validators/executiveIntelligenceValidator.js";
import { validatePilotReadinessModule } from "@/predator/validators/pilotReadinessValidator.js";
import { validateFounderNavigationModule } from "@/predator/validators/founderNavigationValidator.js";
import { validateFounderStrategyModule } from "@/predator/validators/founderStrategyValidator.js";
import { validateTenantFoundationModule } from "@/predator/validators/tenantFoundationValidator.js";
import { validateDistributorWorkspaceModule } from "@/predator/validators/distributorWorkspaceValidator.js";
import { validateDistributorProvisioningModule } from "@/predator/validators/distributorProvisioningValidator.js";
import { validateDistributorOsModule } from "@/predator/validators/distributorOsValidator.js";
import { validateCommissionEngineModule } from "@/predator/validators/commissionEngineValidator.js";
import { validateLabContractEngineModule } from "@/predator/validators/labContractEngineValidator.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import {
  primePredatorOpsPayload,
  clearPredatorOpsPayload,
} from "@/predator/predatorOpsPayload.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
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
      modules.push(skippedModuleForLabRole("Operational Event Ledger", ctx));
      modules.push(skippedModuleForLabRole("Executive Intelligence", ctx));
      modules.push(skippedModuleForLabRole("Founder Navigation", ctx));
      modules.push(skippedModuleForLabRole("Founder Strategy", ctx));
      modules.push(skippedModuleForLabRole("Tenant Foundation", ctx));
      modules.push(skippedModuleForLabRole("Distributor Workspace", ctx));
      modules.push(skippedModuleForLabRole("Distributor Provisioning", ctx));
      modules.push(skippedModuleForLabRole("Commission Engine", ctx));
      modules.push(skippedModuleForLabRole("Lab Contract Engine", ctx));
    } else {
      let opsPayload = null;
      try {
        opsPayload = await loadOperationsCommandCenterData(currentUser);
        primePredatorOpsPayload(opsPayload);
      } catch (err) {
        console.warn("[Predator] Shared ops payload load failed", err);
      }

      const evidence = await validateOperationalEvidenceModule({ ctx, currentUser });
      modules.push(storePolishedModule("Operational Evidence", evidence, ctx));

      const [
        operationsCenter,
        executiveIntervention,
        operationalTasks,
        eventLedger,
        executiveIntelligence,
        pilotReadiness,
        founderNavigation,
        founderStrategy,
        tenantFoundation,
        distributorWorkspace,
        distributorProvisioning,
        commissionEngine,
        labContractEngine,
      ] = await Promise.all([
        validateOperationsCommandCenterModule({
          ctx,
          currentUser,
          rendered: snapshots.operationsCenter ?? null,
          opsPayload,
        }),
        validateExecutiveInterventionModule({
          ctx,
          currentUser,
          rendered: snapshots.executiveIntervention ?? null,
          opsPayload,
        }),
        validateOperationalTasksModule({
          ctx,
          currentUser,
          rendered: snapshots.operationalTasks ?? null,
          opsPayload,
        }),
        validateOperationalEventLedgerModule({
          ctx,
          currentUser,
          rendered: snapshots.operationalEventLedger ?? null,
          opsPayload,
        }),
        validateExecutiveIntelligenceModule({
          ctx,
          currentUser,
          rendered: snapshots.executiveIntelligence ?? null,
          opsPayload,
        }),
        validatePilotReadinessModule({ ctx, currentUser, opsPayload }),
        validateFounderNavigationModule({
          ctx,
          currentUser,
          rendered: snapshots.founderNavigation ?? null,
          opsPayload,
        }),
        validateFounderStrategyModule({
          ctx,
          currentUser,
          rendered: snapshots.founderStrategy ?? null,
          opsPayload,
        }),
        validateTenantFoundationModule({
          ctx,
          currentUser,
          rendered: snapshots.tenantFoundation ?? null,
          opsPayload,
        }),
        validateDistributorWorkspaceModule({
          ctx,
          currentUser,
          rendered: snapshots.distributorWorkspace ?? null,
          opsPayload,
        }),
        validateDistributorProvisioningModule({
          ctx,
          currentUser,
          rendered: snapshots.distributorProvisioning ?? null,
          opsPayload,
        }),
        validateCommissionEngineModule({
          ctx,
          currentUser,
          rendered: snapshots.commissionEngine ?? null,
          opsPayload,
        }),
        validateLabContractEngineModule({
          ctx,
          currentUser,
          rendered: snapshots.labContractEngine ?? null,
          opsPayload,
        }),
      ]);

      modules.push(
        storePolishedModule("Operations Center", operationsCenter, ctx),
        storePolishedModule("Executive Intervention", executiveIntervention, ctx),
        storePolishedModule("Operational Tasks", operationalTasks, ctx),
        storePolishedModule("Operational Event Ledger", eventLedger, ctx),
        storePolishedModule("Executive Intelligence", executiveIntelligence, ctx),
        storePolishedModule("Pilot Readiness", pilotReadiness, ctx),
        storePolishedModule("Founder Navigation", founderNavigation, ctx),
        storePolishedModule("Founder Strategy", founderStrategy, ctx),
        storePolishedModule("Tenant Foundation", tenantFoundation, ctx),
        storePolishedModule("Distributor Workspace", distributorWorkspace, ctx),
        storePolishedModule("Distributor Provisioning", distributorProvisioning, ctx),
        storePolishedModule("Commission Engine", commissionEngine, ctx),
        storePolishedModule("Lab Contract Engine", labContractEngine, ctx)
      );

      clearPredatorOpsPayload();
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
    case "Operational Event Ledger":
      result = await validateOperationalEventLedgerModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Executive Intelligence":
      result = await validateExecutiveIntelligenceModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Pilot Readiness":
      result = await validatePilotReadinessModule({ ctx, currentUser });
      break;
    case "Founder Navigation":
      result = await validateFounderNavigationModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Founder Strategy":
      result = await validateFounderStrategyModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Tenant Foundation":
      result = await validateTenantFoundationModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Distributor Workspace":
      result = await validateDistributorWorkspaceModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Distributor Provisioning":
      result = await validateDistributorProvisioningModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Distributor OS":
      result = await validateDistributorOsModule({
        ctx,
        rendered: snapshot,
      });
      break;
    case "Commission Engine":
      result = await validateCommissionEngineModule({
        ctx,
        currentUser,
        rendered: snapshot,
      });
      break;
    case "Lab Contract Engine":
      result = await validateLabContractEngineModule({
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
    const polished = polishPredatorEntries(result.entries);
    result = { ...result, entries: polished, summary: summarizePredatorEntries(polished) };
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
function storePolishedModule(moduleName, result, ctx) {
  const entries = polishPredatorEntries(result.entries || []);
  const summary = summarizePredatorEntries(entries);
  const module = { ...result, module: moduleName, entries, summary };
  predatorStore.setModuleReport(moduleName, entries, ctx);
  if (module.diagnosis) {
    predatorStore.setModuleDiagnosis(moduleName, module.diagnosis, ctx);
  }
  return module;
}

/**
 * Single batched validation for Executive Control Tower (one shared ops payload).
 */
export async function runPredatorExecutiveBatchValidation(currentUser, snapshots = {}) {
  if (!isPredatorEnabled() || !currentUser) return null;
  const ctx = await resolvePredatorTenantContext(currentUser);
  predatorStore.setActiveTenantContext(ctx);

  let opsPayload = null;
  try {
    opsPayload = await loadOperationsCommandCenterData(currentUser);
    primePredatorOpsPayload(opsPayload);
  } catch (err) {
    console.warn("[Predator] Executive batch ops payload failed", err);
  }

  const results = await Promise.all([
    validateExecutiveInterventionModule({
      ctx,
      currentUser,
      rendered: snapshots.executiveIntervention ?? null,
      opsPayload,
    }),
    validateOperationalTasksModule({
      ctx,
      currentUser,
      rendered: snapshots.operationalTasks ?? null,
      opsPayload,
    }),
    validateOperationalEventLedgerModule({
      ctx,
      currentUser,
      rendered: snapshots.operationalEventLedger ?? null,
      opsPayload,
    }),
    validateExecutiveIntelligenceModule({
      ctx,
      currentUser,
      rendered: snapshots.executiveIntelligence ?? null,
      opsPayload,
    }),
  ]);

  for (const r of results) {
    storePolishedModule(r.module, r, ctx);
  }
  clearPredatorOpsPayload();
  return results;
}

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
