import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { checkTenantConsistency, resolveExecutiveRegisteredTenantIds, executiveCrossTenantOpts } from "@/predator/predatorChecks.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildOperationsCommandCenterModel } from "@/operations/operationsCommandCenterModel.js";
import { listOperationalEvidence } from "@/api/operationalEvidenceApi.js";
import { ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateOperationsCommandCenterModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Operations Center", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operations Center",
          step: "lab_role.access",
          rootCauseGuess: "Operations center is admin/executive scoped",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Operations Center",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    let payload;
    let model;
    try {
      payload = await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      model = buildOperationsCommandCenterModel(payload);
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Operations Center",
          step: "loader.build_model",
          actual: err?.message || String(err),
          rootCauseGuess: "Operations center payload failed to load",
          suggestedFix: "Check dashboard/collections/orders read APIs",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Operations Center",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    if (payload.ordersReadOk === false) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Operations Center",
          step: "orders.read_failed",
          expected: "Orders read succeeds for operations payload",
          actual: { ordersReadError: payload.ordersReadError || "unknown" },
          rootCauseGuess: "Supabase orders query failed (RLS or connection)",
          suggestedFix:
            "Apply executive_distributor_ops_rls_migration.sql and verify orders SELECT policy for this role",
          severity: "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operations Center",
          step: "orders.read_ok",
          actual: { orderCount: payload.orders?.length ?? 0 },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const apiAttention = model.attention?.length ?? 0;
    const apiFeed = model.feed?.length ?? 0;
    const uiAttention = rendered?.attentionCount ?? null;
    const uiFeed = rendered?.feedCount ?? null;

    if (uiAttention != null && Math.abs(apiAttention - uiAttention) > 2) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Operations Center",
          step: "queue.counts",
          expected: "UI attention count near API model count",
          actual: { api: apiAttention, ui: uiAttention },
          rootCauseGuess: "Attention queue may be collapsed or filtered in UI",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operations Center",
          step: "queue.counts",
          actual: { apiAttention, uiAttention },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (uiFeed != null && apiFeed === 0 && uiFeed > 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Operations Center",
          step: "feed.stale_ui",
          expected: "Feed empty in API when UI shows events",
          actual: { apiFeed, uiFeed },
          rootCauseGuess: "Stale UI snapshot after refresh",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operations Center",
          step: "feed.scoped",
          actual: { apiFeed, uiFeed },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const evidenceRows = payload.evidence || [];
    const crossTenantEvidence = evidenceRows.filter(
      (r) => r.tenantId && str(r.tenantId) !== str(ctx.tenantId)
    );
    entries.push(
      createPredatorEntry({
        status: crossTenantEvidence.length === 0 ? "PASS" : "FAIL",
        module: "Operations Center",
        step: "tenant.evidence_scope",
        expected: "Evidence in operations payload scoped to tenant",
        actual: { crossTenant: crossTenantEvidence.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const registeredTenantIds = await resolveExecutiveRegisteredTenantIds(ctx);
    const collectionTenantIds = (payload.collections || [])
      .map((c) => c.tenantId || c.tenant_id)
      .filter(Boolean);
    if (collectionTenantIds.length) {
      entries.push(
        ...checkTenantConsistency({
          module: "Operations Center",
          step: "collections.tenant",
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: collectionTenantIds,
          ...executiveCrossTenantOpts(ctx, registeredTenantIds),
        })
      );
    }

    const staleTiles = (model.healthTiles || []).filter((t) => t.status === "risk");
    entries.push(
      createPredatorEntry({
        status: staleTiles.length <= 3 ? "PASS" : "WARN",
        module: "Operations Center",
        step: "health.stale_metrics",
        expected: "Health tiles reflect current payload (not all at risk)",
        actual: {
          riskTiles: staleTiles.map((t) => t.key),
          healthScore: model.health?.score,
        },
        rootCauseGuess:
          staleTiles.length > 3
            ? "Multiple operational areas at risk — verify data freshness"
            : "Health tiles within expected bounds",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const recentVisits = (payload.visits || []).slice(0, 10);
    const withProof = recentVisits.filter((v) => {
      const vid = str(v.visitId || v.id);
      return evidenceRows.some(
        (e) => str(e.kind) === "visit_photo" && str(e.visitId) === vid
      );
    });
    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Operations Center",
        step: "evidence.compliance_sample",
        actual: {
          sampleVisits: recentVisits.length,
          withProof: withProof.length,
          localOnlyUploads: evidenceRows.filter((e) => e.storageBackend === "local_embedded")
            .length,
        },
        rootCauseGuess: "Evidence compliance sampled for operations center",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (currentUser && ctx.tenantId) {
      const listed = await listOperationalEvidence(ctx.tenantId, currentUser, { limit: 30 });
      const foreign = listed.filter((r) => r.tenantId && str(r.tenantId) !== str(ctx.tenantId));
      entries.push(
        createPredatorEntry({
          status: foreign.length === 0 ? "PASS" : "FAIL",
          module: "Operations Center",
          step: "feed.cross_tenant_activity",
          expected: "Operational evidence list has no cross-tenant rows",
          actual: { foreign: foreign.length },
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return {
      module: "Operations Center",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
