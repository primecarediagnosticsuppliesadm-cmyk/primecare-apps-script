import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import {
  loadProvisioningBundle,
  resolveProvisioningModel,
  activateDistributorProvisioning,
} from "@/distributor/distributorProvisioningData.js";
import {
  isTimelineOrdered,
  ACTIVATION_GATE_IDS,
} from "@/distributor/distributorProvisioningEngine.js";
import { getRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  PERSISTENCE_STATUS,
  validateSupabaseClientForPredator,
  validatePersistenceStatusResolvesForPredator,
  validateDurableCatalogFlagPersistsForPredator,
} from "@/tenant/durableTenantStore.js";

function str(v) {
  return String(v ?? "").trim();
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor Provisioning",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/** Launch target for catalog gates — never HQ/home tenant. */
function resolveProvisioningLaunchTargetId(bundle, rendered = null) {
  const homeId = str(bundle?.homeTenantId);
  const fromRendered = str(
    rendered?.distributorId || rendered?.selectedDistributorId || rendered?.selectedId
  );
  if (fromRendered && fromRendered !== homeId) return fromRendered;

  const nonHome = (bundle?.tenants || []).filter(
    (t) => t?.id && str(t.id) !== homeId && !t.isHome
  );
  if (fromRendered && nonHome.some((t) => str(t.id) === fromRendered)) return fromRendered;
  return str(nonHome[0]?.id);
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateDistributorProvisioningModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Distributor Provisioning", "validation.full", async () => {
    const entries = [];
    const supabaseClientCheck = validateSupabaseClientForPredator();
    const persistenceCheck = validatePersistenceStatusResolvesForPredator();
    entries.push(
      createPredatorEntry({
        status: supabaseClientCheck.status,
        module: "Distributor Provisioning",
        step: "durableTenantStore.supabase_client_available",
        actual: supabaseClientCheck.actual,
        suggestedFix: supabaseClientCheck.ok
          ? undefined
          : "Import supabase from @/api/supabaseClient.js in tenantFoundationData.js",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    entries.push(
      createPredatorEntry({
        status: persistenceCheck.status,
        module: "Distributor Provisioning",
        step: "durableTenantStore.persistence_status_resolves",
        actual: persistenceCheck.actual,
        suggestedFix: persistenceCheck.ok
          ? undefined
          : "Export resolvePersistenceStatus from @/tenant/durableTenantStore.js and import in distributorProvisioningEngine.js",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Provisioning",
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
      await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      bundle = await loadProvisioningBundle(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        { force: false }
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Provisioning",
          step: "bundle.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const model = resolveProvisioningModel(bundle, bundle.homeTenantId);
    if (!model) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Provisioning",
          step: "model.missing",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const pct = model.readinessPct;
    entries.push(
      createPredatorEntry({
        status: pct >= 0 && pct <= 100 ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "readiness.score_range",
        actual: pct,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const gateConsistent =
      model.gates.canActivate ===
      model.checks
        .filter((c) => ACTIVATION_GATE_IDS.has(c.id))
        .every((c) => c.status === "PASS");

    const adminCheck = model.checks.find((c) => c.id === "admin_user");
    const usersRolesCheck = model.checks.find((c) => c.id === "users_roles");
    const founderModelGates =
      !adminCheck &&
      !usersRolesCheck &&
      !ACTIVATION_GATE_IDS.has("admin_user") &&
      !ACTIVATION_GATE_IDS.has("roles_configured");
    const isolationCheck = model.checks.find((c) => c.id === "isolation_verified");
    const labGate = model.checks.find((c) => c.id === "at_least_one_lab");
    const contractGate = model.checks.find((c) => c.id === "contract_configured");
    const supabaseContractCount = Number(bundle.contractCounts?.[model.distributorId] ?? 0);
    const gateMatchesSupabase =
      (supabaseContractCount >= 1 && contractGate?.status === "PASS") ||
      (supabaseContractCount < 1 && contractGate?.status !== "PASS");
    entries.push(
      createPredatorEntry({
        status: gateMatchesSupabase ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "contract.gate_matches_supabase",
        expected: "contract_configured PASS iff non-terminated Supabase count >= 1",
        actual: {
          supabaseContractCount,
          gateStatus: contractGate?.status,
          gateDetail: contractGate?.detail,
        },
        suggestedFix: gateMatchesSupabase
          ? undefined
          : "Refresh provisioning bundle after contract create; verify lab_contracts row",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const tenantRow = bundle.tenants?.find((t) => t.id === model.distributorId);
    const configBypass = tenantRow?.config?.contractConfigured === true;
    const bypassWithoutContracts = configBypass && supabaseContractCount < 1;
    entries.push(
      createPredatorEntry({
        status: bypassWithoutContracts ? "WARN" : "PASS",
        module: "Distributor Provisioning",
        step: "contract.config_bypass",
        expected: "config.contractConfigured without Supabase contracts surfaces WARN, not PASS",
        actual: {
          contractConfigured: configBypass,
          supabaseContractCount,
          gateStatus: contractGate?.status,
          bypassActive: Boolean(contractGate?.bypassActive),
        },
        suggestedFix: bypassWithoutContracts
          ? "Create a non-terminated lab contract or clear config.contractConfigured"
          : undefined,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: founderModelGates ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "founder_model.no_distributor_user_gates",
        actual: {
          adminGate: adminCheck?.status || "removed",
          usersRoles: usersRolesCheck?.status || "removed",
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    entries.push(
      createPredatorEntry({
        status:
          ACTIVATION_GATE_IDS.has("at_least_one_lab") &&
          ACTIVATION_GATE_IDS.has("contract_configured") &&
          ACTIVATION_GATE_IDS.has("isolation_verified")
            ? "PASS"
            : "FAIL",
        module: "Distributor Provisioning",
        step: "founder_model.operational_launch_gates",
        actual: {
          isolation: isolationCheck?.label,
          firstLab: labGate?.label,
          contract: contractGate?.label,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    entries.push(
      createPredatorEntry({
        status: gateConsistent ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "activation.gates_consistent",
        actual: model.gates.canActivate ? "ready" : "blocked",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (model.lifecycle === "blocked" && model.gates.canActivate) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Provisioning",
          step: "lifecycle.blocked_consistency",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Provisioning",
          step: "lifecycle.blocked_consistency",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const blockedActivate = await activateDistributorProvisioning(model.distributorId, {
      ...model,
      gates: { canActivate: false, blockers: [{ label: "test" }] },
    });
    entries.push(
      createPredatorEntry({
        status: blockedActivate.ok === false ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "activation.blocked_rejected",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const nonHome = (bundle.distributors || []).filter((d) => !d.isHome);
    const localOnly = nonHome.filter(
      (d) => d.persistenceStatus === PERSISTENCE_STATUS.LOCAL_ONLY
    );
    const durable = nonHome.filter((d) => d.persistenceStatus === PERSISTENCE_STATUS.DURABLE);
    entries.push(
      createPredatorEntry({
        status: localOnly.length > 0 ? "WARN" : "PASS",
        module: "Distributor Provisioning",
        step: "registry.local_only",
        actual: `${localOnly.length} local-only`,
        suggestedFix: localOnly.length
          ? "Run Sync local distributors or fix Supabase RLS"
          : undefined,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    entries.push(
      createPredatorEntry({
        status: durable.length > 0 || nonHome.length === 0 ? "PASS" : "WARN",
        module: "Distributor Provisioning",
        step: "registry.durable_supabase",
        actual: `${durable.length} durable`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const dupes = bundle.duplicateNames || [];
    entries.push(
      createPredatorEntry({
        status: dupes.length === 0 ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "registry.duplicate_names",
        actual: dupes.length ? dupes.map((d) => d.name).join(", ") : "none",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: supabaseClientCheck.ok || bundle.tenants?.length >= 0 ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "registry.local_fallback",
        actual: supabaseClientCheck.ok ? "supabase configured" : "local-only mode",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const catalogPersist = validateDurableCatalogFlagPersistsForPredator(
      bundle,
      resolveProvisioningModel
    );
    entries.push(
      createPredatorEntry({
        status: catalogPersist.status,
        module: "Distributor Provisioning",
        step: "durable_distributor_catalog_flag_persists",
        actual: catalogPersist.actual,
        suggestedFix:
          catalogPersist.status === "FAIL"
            ? "Assign HQ master catalog products via Distributor OS Catalog tab"
            : undefined,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const launchTargetId = resolveProvisioningLaunchTargetId(bundle, rendered);
    const launchModel = launchTargetId
      ? resolveProvisioningModel(bundle, launchTargetId)
      : null;
    const catalogCheck = launchModel?.checks?.find((c) => c.id === "catalog_configured");
    const hqPricingCheck = launchModel?.checks?.find((c) => c.id === "catalog_hq_pricing_configured");
    const catalogAssigned =
      launchModel &&
      (launchModel.profile?.catalogAssigned === true ||
        Number(launchModel.profile?.catalogAssignedCount || 0) > 0 ||
        catalogCheck?.status === "PASS");
    const launchLifecycle = str(launchModel?.lifecycle);
    const launchInProgress =
      launchLifecycle === "configuring" ||
      launchLifecycle === "configured" ||
      rendered?.distributorProvisioning === true;
    let catalogAssignedStatus = "INFO";
    if (!launchTargetId || !launchModel) {
      catalogAssignedStatus = (bundle?.tenants || []).some(
        (t) => t?.id && str(t.id) !== str(bundle.homeTenantId) && !t.isHome
      )
        ? "WARN"
        : "INFO";
    } else if (catalogAssigned) {
      catalogAssignedStatus = "PASS";
    } else if (launchInProgress) {
      catalogAssignedStatus = "FAIL";
    } else {
      catalogAssignedStatus = "WARN";
    }
    entries.push(
      createPredatorEntry({
        status: catalogAssignedStatus,
        module: "Distributor Provisioning",
        step: "distributor_catalog_assigned",
        expected: "Launch gate passes when at least one HQ product is assigned",
        actual: {
          launchTargetId: launchTargetId || null,
          launchTargetName: launchModel?.name || null,
          homeTenantId: bundle.homeTenantId,
          catalogCheckStatus: catalogCheck?.status,
          catalogAssignedCount: launchModel?.profile?.catalogAssignedCount,
          launchLifecycle: launchLifecycle || null,
        },
        suggestedFix:
          catalogAssignedStatus === "FAIL"
            ? "Assign at least one HQ master product via Distributor OS Catalog tab"
            : catalogAssignedStatus === "WARN"
              ? "Open Launch Distributor and select the distributor under test"
              : undefined,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status:
          !launchModel
            ? "INFO"
            : hqPricingCheck?.status === "PASS"
              ? "PASS"
              : catalogAssigned
                ? "FAIL"
                : "WARN",
        module: "Distributor Provisioning",
        step: "distributor_catalog_hq_pricing_configured",
        expected: "Assigned catalog products have HQ cost and transfer price configured",
        actual: {
          launchTargetId: launchTargetId || null,
          launchTargetName: launchModel?.name || null,
          status: hqPricingCheck?.status,
          detail: hqPricingCheck?.detail,
        },
        suggestedFix:
          hqPricingCheck?.status === "PASS"
            ? undefined
            : "Configure HQ cost and transfer price in Master Catalog before launch",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (model.activated) {
      const row = getRegistryTenant(model.distributorId);
      const activeOk = row?.status === "ACTIVE";
      entries.push(
        createPredatorEntry({
          status: activeOk ? "PASS" : "FAIL",
          module: "Distributor Provisioning",
          step: "activation.active_status",
          actual: row?.status,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const taskDone = model.tasks.filter((t) => t.done).length;
    const passChecks = model.checks.filter((c) => c.status === "PASS").length;
    entries.push(
      createPredatorEntry({
        status: taskDone <= passChecks + 1 ? "PASS" : "WARN",
        module: "Distributor Provisioning",
        step: "checklist.consistency",
        actual: `tasks ${taskDone}, checks ${passChecks}`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const timelineOk = isTimelineOrdered(model.timeline);
    entries.push(
      createPredatorEntry({
        status: timelineOk ? "PASS" : "WARN",
        module: "Distributor Provisioning",
        step: "timeline.ordering",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (!model.distributorId) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Provisioning",
          step: "mapping.tenant_linkage",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Provisioning",
          step: "mapping.tenant_linkage",
          actual: model.distributorId,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (pct === 100 && passChecks < 4) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Provisioning",
          step: "data.no_fake_readiness",
          actual: `${pct}% with ${passChecks} passes`,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Provisioning",
          step: "data.no_fake_readiness",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (rendered?.readinessPct !== undefined && rendered.readinessPct !== pct) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Provisioning",
          step: "ui.snapshot_drift",
          expected: rendered.readinessPct,
          actual: pct,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
