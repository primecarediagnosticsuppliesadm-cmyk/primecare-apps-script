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

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor Provisioning",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
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

    const rolesCheck = model.checks.find((c) => c.id === "roles_configured");
    const rolesNotActivationBlocker =
      !ACTIVATION_GATE_IDS.has("roles_configured") &&
      (rolesCheck?.status === "PASS" || rolesCheck?.status === "WARN");
    entries.push(
      createPredatorEntry({
        status: rolesNotActivationBlocker ? "PASS" : "FAIL",
        module: "Distributor Provisioning",
        step: "roles.not_activation_gate",
        actual: rolesCheck?.status || "missing",
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

    const blockedActivate = activateDistributorProvisioning(model.distributorId, {
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
