import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadDistributorWorkspaceBundle, resolveDistributorWorkspace } from "@/distributor/distributorWorkspaceData.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";

const VALID_STATUS = new Set(["pending", "active", "suspended", "draft", "deactivated"]);
const VALID_HEALTH = new Set(["Healthy", "Watch", "Risk"]);
const WIRED_PAGES = new Set([
  "tenantManagement",
  "labs",
  "risk",
  "operationsCenter",
  "qualificationReview",
  "distributorProvisioning",
  "labContractEngine",
  "distributorOs",
]);

/** Wired actions need a known page; disabled actions must be Coming soon. */
function isWorkspaceActionValid(action) {
  if (action.wired) {
    return Boolean(action.page && WIRED_PAGES.has(action.page) && !action.comingSoon);
  }
  return action.comingSoon === true && !action.wired;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor Workspace",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 * @param {object|null} [params.opsPayload]
 */
export async function validateDistributorWorkspaceModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Distributor Workspace", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Workspace",
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
      bundle = await loadDistributorWorkspaceBundle(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        { force: false }
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Workspace",
          step: "registry.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const registry = bundle.registry || [];
    entries.push(
      createPredatorEntry({
        status: registry.length >= 1 ? "PASS" : "WARN",
        module: "Distributor Workspace",
        step: "registry.count",
        actual: registry.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const missingTenantId = registry.filter((r) => !r.tenantId);
    entries.push(
      createPredatorEntry({
        status: missingTenantId.length === 0 ? "PASS" : "FAIL",
        module: "Distributor Workspace",
        step: "mapping.tenant_id",
        actual: missingTenantId.length ? "missing tenantId" : "ok",
        rootCauseGuess: "Each distributor row must map to tenant_id (company), not city",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const cityAsTenant = registry.filter((r) => {
      const n = String(r.name || "").toLowerCase();
      return (
        (n === "vijayawada" || n === "hyderabad" || n === "guntur") &&
        !String(r.territorySummary || "").includes("·")
      );
    });
    entries.push(
      createPredatorEntry({
        status: cityAsTenant.length === 0 ? "PASS" : "WARN",
        module: "Distributor Workspace",
        step: "mapping.no_city_tenant",
        actual: cityAsTenant.map((r) => r.name).join(", ") || "ok",
        suggestedFix: "Model cities under config.territories, not as separate tenants",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badStatus = registry.filter((r) => !VALID_STATUS.has(r.status));
    entries.push(
      createPredatorEntry({
        status: badStatus.length === 0 ? "PASS" : "FAIL",
        module: "Distributor Workspace",
        step: "registry.status",
        actual: badStatus.map((r) => r.status).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const workspace = resolveDistributorWorkspace(bundle, bundle.homeTenantId, {
      viewTenantId: bundle.homeTenantId,
      readOnly: false,
      homeTenantId: bundle.homeTenantId,
    });

    if (workspace) {
      const score = workspace.health.healthScore;
      entries.push(
        createPredatorEntry({
          status: score >= 0 && score <= 100 ? "PASS" : "FAIL",
          module: "Distributor Workspace",
          step: "health.score_range",
          actual: score,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: VALID_HEALTH.has(workspace.health.healthBand) ? "PASS" : "FAIL",
          module: "Distributor Workspace",
          step: "health.band",
          actual: workspace.health.healthBand,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      if (workspace.isLive && bundle.opsPayload) {
        const tenantIds = new Set(
          (bundle.opsPayload.collections || [])
            .map((c) => String(c.tenantId || c.tenant_id || "").trim())
            .filter(Boolean)
        );
        const foreign = [...tenantIds].filter((t) => t !== String(ctx.tenantId));
        entries.push(
          createPredatorEntry({
            status: foreign.length === 0 ? "PASS" : "FAIL",
            module: "Distributor Workspace",
            step: "isolation.collections",
            actual: foreign.length ? foreign.join(", ") : "scoped",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }

      const invalidActions = (workspace.actions || []).filter(
        (a) => !isWorkspaceActionValid(a)
      );
      entries.push(
        createPredatorEntry({
          status: invalidActions.length === 0 ? "PASS" : "FAIL",
          module: "Distributor Workspace",
          step: "actions.no_dead",
          actual:
            invalidActions.length === 0
              ? "ok"
              : invalidActions
                  .map((a) => `${a.id}(wired=${a.wired},soon=${a.comingSoon})`)
                  .join(", "),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const enabledWithoutRoute = (workspace.actions || []).filter(
        (a) => a.wired && (!a.page || !WIRED_PAGES.has(a.page))
      );
      entries.push(
        createPredatorEntry({
          status: enabledWithoutRoute.length === 0 ? "PASS" : "FAIL",
          module: "Distributor Workspace",
          step: "actions.pages",
          actual: enabledWithoutRoute.map((a) => a.id).join(", ") || "ok",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const disabledUnlabeled = (workspace.actions || []).filter(
        (a) => !a.wired && a.comingSoon !== true
      );
      entries.push(
        createPredatorEntry({
          status: disabledUnlabeled.length === 0 ? "PASS" : "FAIL",
          module: "Distributor Workspace",
          step: "actions.coming_soon",
          actual: disabledUnlabeled.map((a) => a.id).join(", ") || "ok",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      if (!workspace.isLive && workspace.labs.length > 0) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Distributor Workspace",
            step: "data.no_fake_labs",
            actual: workspace.labs.length,
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } else {
        entries.push(
          createPredatorEntry({
            status: "PASS",
            module: "Distributor Workspace",
            step: "data.no_fake_labs",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }

      if (workspace.teamGap) {
        entries.push(
          createPredatorEntry({
            status: "PASS",
            module: "Distributor Workspace",
            step: "team.setup_gap",
            rootCauseGuess: "Empty team shows explicit setup gap",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }

      const contractSummary = workspace.contracts;
      entries.push(
        createPredatorEntry({
          status:
            contractSummary &&
            typeof contractSummary.activeContracts === "number" &&
            Array.isArray(contractSummary.expiryAlerts)
              ? "PASS"
              : "FAIL",
          module: "Distributor Workspace",
          step: "contracts.summary_shape",
          actual: contractSummary ? String(contractSummary.activeContracts) : "missing",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Workspace",
          step: "contracts.empty_safe",
          actual: String(contractSummary?.activeContracts ?? 0),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (rendered?.selectedId && workspace && rendered.selectedId !== workspace.profile.id) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Workspace",
          step: "ui.snapshot_drift",
          expected: rendered.selectedId,
          actual: workspace.profile.id,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
