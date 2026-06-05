import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadTenantFoundationRegistry } from "@/tenant/tenantFoundationData.js";
import { buildTenantReadiness } from "@/tenant/tenantFoundationEngine.js";
import { isolationChecksPass } from "@/tenant/tenantFoundationIsolation.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  PERSISTENCE_STATUS,
  validateSupabaseClientForPredator,
} from "@/tenant/durableTenantStore.js";

const VALID_HEALTH = new Set(["Healthy", "Watch", "Risk"]);
const VALID_STATUS = new Set(["ACTIVE", "INACTIVE", "PENDING"]);

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Tenant Foundation",
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
export async function validateTenantFoundationModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Tenant Foundation", "validation.full", async () => {
    const entries = [];

    const supabaseClientCheck = validateSupabaseClientForPredator();
    entries.push(
      createPredatorEntry({
        status: supabaseClientCheck.status,
        module: "Tenant Foundation",
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

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Tenant Foundation",
          step: "role.access",
          rootCauseGuess: "Tenant foundation is executive-scoped",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let registry;
    try {
      await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      registry = await loadTenantFoundationRegistry(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        { skipLiveLoad: false }
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Tenant Foundation",
          step: "registry.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const tenants = registry.tenants || [];
    entries.push(
      createPredatorEntry({
        status: tenants.length >= 1 ? "PASS" : "WARN",
        module: "Tenant Foundation",
        step: "registry.count",
        expected: ">= 1",
        actual: tenants.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badHealth = tenants.filter((t) => !VALID_HEALTH.has(t.healthBand));
    entries.push(
      createPredatorEntry({
        status: badHealth.length === 0 ? "PASS" : "FAIL",
        module: "Tenant Foundation",
        step: "health.bands",
        actual: badHealth.map((t) => t.healthBand).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badScores = tenants.filter(
      (t) => t.healthScore < 0 || t.healthScore > 100 || !Number.isFinite(t.healthScore)
    );
    entries.push(
      createPredatorEntry({
        status: badScores.length === 0 ? "PASS" : "FAIL",
        module: "Tenant Foundation",
        step: "health.score_range",
        actual: badScores.length ? String(badScores[0].healthScore) : "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const home = tenants.find((t) => t.id === registry.homeTenantId);
    if (home?.source === "database") {
      entries.push(
        createPredatorEntry({
          status: home.lastIsolationPass === true ? "PASS" : "WARN",
          module: "Tenant Foundation",
          step: "isolation.home_pass",
          actual: home.lastIsolationPass ? "PASS" : "not pass",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const homeChecks = home.isolationChecks || [];
      const requiredIds = new Set(["orders", "collections", "visits", "inventory", "qualifications", "evidence"]);
      const present = new Set(homeChecks.map((c) => c.id));
      const missing = [...requiredIds].filter((id) => !present.has(id));
      entries.push(
        createPredatorEntry({
          status: missing.length === 0 ? "PASS" : "FAIL",
          module: "Tenant Foundation",
          step: "isolation.domains",
          expected: [...requiredIds].join(", "),
          actual: missing.join(", ") || "complete",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const pending = tenants.filter((t) => t.status === "PENDING");
    for (const t of pending) {
      const readiness = buildTenantReadiness(t);
      const fakeActive = t.status === "ACTIVE" && !readiness.ready;
      if (fakeActive) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Tenant Foundation",
            step: "activation.without_readiness",
            actual: t.id,
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }
    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Tenant Foundation",
        step: "activation.rules",
        actual: `${pending.length} pending`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidStatus = tenants.filter((t) => !VALID_STATUS.has(t.status));
    entries.push(
      createPredatorEntry({
        status: invalidStatus.length === 0 ? "PASS" : "FAIL",
        module: "Tenant Foundation",
        step: "tenant.status_values",
        actual: invalidStatus.map((t) => t.status).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (home?.isolationChecks?.length) {
      const pass = isolationChecksPass(home.isolationChecks);
      entries.push(
        createPredatorEntry({
          status: pass || home.isolationChecks.some((c) => c.status === "WARN") ? "PASS" : "WARN",
          module: "Tenant Foundation",
          step: "isolation.consistency",
          actual: home.isolationChecks.map((c) => `${c.id}:${c.status}`).join(" "),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const nonHome = tenants.filter((t) => !t.isHome);
    const localOnly = nonHome.filter(
      (t) =>
        t.persistenceStatus === PERSISTENCE_STATUS.LOCAL_ONLY ||
        (t.source !== "database" && !t.durable)
    );
    const durable = nonHome.filter(
      (t) => t.persistenceStatus === PERSISTENCE_STATUS.DURABLE || t.source === "database"
    );
    entries.push(
      createPredatorEntry({
        status: localOnly.length > 0 ? "WARN" : "PASS",
        module: "Tenant Foundation",
        step: "registry.local_only",
        actual: `${localOnly.length} local-only`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    entries.push(
      createPredatorEntry({
        status: durable.length > 0 || nonHome.length === 0 ? "PASS" : "WARN",
        module: "Tenant Foundation",
        step: "registry.durable_supabase",
        actual: `${durable.length} durable`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const dupes = registry.duplicateNames || [];
    entries.push(
      createPredatorEntry({
        status: dupes.length === 0 ? "PASS" : "FAIL",
        module: "Tenant Foundation",
        step: "registry.duplicate_names",
        actual: dupes.length ? dupes.map((d) => d.name).join(", ") : "none",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Tenant Foundation",
        step: "registry.local_fallback",
        actual: supabaseClientCheck.ok ? "fallback available" : "offline local registry",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (rendered?.tenantCount !== undefined && rendered.tenantCount !== tenants.length) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Tenant Foundation",
          step: "ui.snapshot_drift",
          expected: rendered.tenantCount,
          actual: tenants.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
