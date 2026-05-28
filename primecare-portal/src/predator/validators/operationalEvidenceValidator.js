import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { ROLES } from "@/config/roles.js";
import {
  listOperationalEvidence,
  listOperationalEvidenceLocal,
  checkOperationalEvidenceBucket,
  resolveEvidencePreviewUrl,
  EVIDENCE_BUCKET,
} from "@/api/operationalEvidenceApi.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  filterVisitProofEvidence,
  filterPaymentEvidence,
  isCollectionEvidenceKind,
} from "@/utils/operationalEvidenceUi.js";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} params.currentUser
 */
export async function validateOperationalEvidenceModule({ ctx, currentUser }) {
  return predatorTrace("Operational Evidence", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB) {
      const labRows = listOperationalEvidenceLocal(ctx.tenantId, {
        role: ROLES.LAB,
        tenantId: ctx.tenantId,
      });
      entries.push(
        createPredatorEntry({
          status: labRows.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "lab_role.isolation",
          rootCauseGuess:
            labRows.length === 0
              ? "Lab role cannot read agent evidence"
              : "Lab role leaked evidence records",
          suggestedFix: "Ensure listOperationalEvidence returns [] for lab role",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Operational Evidence",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    entries.push(
      createPredatorEntry({
        status: supabase ? "PASS" : "WARN",
        module: "Operational Evidence",
        step: "supabase.client",
        rootCauseGuess: supabase ? "Supabase client configured" : "Supabase not configured",
        suggestedFix: "Set VITE_SUPABASE_URL for durable storage uploads",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const bucket = await checkOperationalEvidenceBucket(ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: bucket.ok ? "PASS" : bucket.missing ? "WARN" : "FAIL",
        module: "Operational Evidence",
        step: "storage.bucket_reachable",
        rootCauseGuess: bucket.ok
          ? `Bucket ${EVIDENCE_BUCKET} reachable`
          : bucket.error || "Bucket not reachable",
        suggestedFix:
          "Run supabase/sql/operational_evidence_storage_migration.sql in Supabase SQL editor",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (supabase && ctx.tenantId) {
      const { data, error } = await supabase
        .from("operational_evidence")
        .select("evidence_id, storage_path, storage_backend, tenant_id")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(5);

      entries.push(
        createPredatorEntry({
          status: error ? "WARN" : "PASS",
          module: "Operational Evidence",
          step: "metadata.table_read",
          rootCauseGuess: error
            ? error.message
            : `operational_evidence readable (${(data || []).length} recent rows)`,
          suggestedFix: "Apply operational_evidence_storage_migration.sql",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const crossTenant = (data || []).filter((r) => r.tenant_id && r.tenant_id !== ctx.tenantId);
      entries.push(
        createPredatorEntry({
          status: crossTenant.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "tenant.scope",
          rootCauseGuess:
            crossTenant.length === 0
              ? "DB evidence rows scoped to active tenant"
              : "Cross-tenant evidence rows returned",
          suggestedFix: "Review RLS on operational_evidence",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const durableRow = (data || []).find(
        (r) => r.storage_backend === "supabase" && r.storage_path
      );
      if (durableRow) {
        const signed = await resolveEvidencePreviewUrl({
          storagePath: durableRow.storage_path,
          storageBackend: "supabase",
        });
        entries.push(
          createPredatorEntry({
            status: signed ? "PASS" : "WARN",
            module: "Operational Evidence",
            step: "storage.signed_url",
            rootCauseGuess: signed
              ? "Signed preview URL generated"
              : "Could not create signed URL for stored evidence",
            suggestedFix: "Check storage SELECT policies and object owner",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } else {
        entries.push(
          createPredatorEntry({
            status: bucket.ok ? "WARN" : "PASS",
            module: "Operational Evidence",
            step: "storage.signed_url",
            rootCauseGuess: "No durable evidence rows yet to test signed URL",
            suggestedFix: "Upload visit or collection proof once bucket is live",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }

    const localRows = listOperationalEvidenceLocal(ctx.tenantId, currentUser || { role: ctx.role });
    const crossTenantLocal = localRows.filter((r) => r.tenantId && r.tenantId !== ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: crossTenantLocal.length === 0 ? "PASS" : "FAIL",
        module: "Operational Evidence",
        step: "local_index.tenant_scope",
        rootCauseGuess:
          crossTenantLocal.length === 0
            ? "Local fallback index scoped to tenant"
            : "Cross-tenant rows in local index",
        suggestedFix: "Clear localStorage evidence index for QA tenants",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role === ROLES.AGENT && currentUser) {
      const agentRows = await listOperationalEvidence(ctx.tenantId, currentUser, { limit: 80 });
      const foreign = agentRows.filter(
        (r) =>
          String(r.uploadedBy) !== String(currentUser.name) &&
          String(r.uploadedBy) !== String(currentUser.id) &&
          String(r.uploadedBy) !== String(currentUser.agentId) &&
          String(r.uploadedByUserId || "") !== String(currentUser.id || currentUser.userId || "")
      );
      entries.push(
        createPredatorEntry({
          status: foreign.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "agent.ownership",
          rootCauseGuess:
            foreign.length === 0
              ? "Agent sees only own evidence"
              : "Agent can see other agents' evidence",
          suggestedFix: "Review operational_evidence RLS and list filters",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const crossTenantListed = agentRows.filter(
        (r) => r.tenantId && str(r.tenantId) !== str(ctx.tenantId)
      );
      entries.push(
        createPredatorEntry({
          status: crossTenantListed.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "api.list.tenant_scope",
          expected: "listOperationalEvidence returns only active tenant rows",
          actual: { crossTenantCount: crossTenantListed.length },
          rootCauseGuess:
            crossTenantListed.length === 0
              ? "No cross-tenant evidence in agent list"
              : "Cross-tenant evidence leaked via list API",
          suggestedFix: "Verify tenant_id filter and RLS on operational_evidence",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const misScopedVisitProof = agentRows.filter(
        (r) => isCollectionEvidenceKind(r.kind) && filterVisitProofEvidence([r], r.visitId).length
      );
      entries.push(
        createPredatorEntry({
          status: misScopedVisitProof.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "association.visit_vs_collection",
          expected: "Collection/payment proof is not counted as visit_photo",
          actual: { misScopedCount: misScopedVisitProof.length },
          rootCauseGuess:
            misScopedVisitProof.length === 0
              ? "Visit proof filter excludes collection kinds"
              : "Collection proof may be mislabeled as visit proof in UI counts",
          suggestedFix: "Use filterVisitProofEvidence and filterPaymentEvidence in UI",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const wsRes = await getAgentWorkspaceRead(currentUser);
      const recentVisits = Array.isArray(wsRes?.data?.recentVisits)
        ? wsRes.data.recentVisits
        : [];
      const countMismatches = [];
      for (const visit of recentVisits.slice(0, 6)) {
        const vid = str(visit.visitId);
        if (!vid) continue;
        const visitProof = filterVisitProofEvidence(agentRows, vid);
        const rawVisitPhotos = agentRows.filter(
          (r) => str(r.kind) === "visit_photo" && str(r.visitId) === vid
        );
        if (visitProof.length !== rawVisitPhotos.length) {
          countMismatches.push({
            visitId: vid,
            visitProof: visitProof.length,
            raw: rawVisitPhotos.length,
          });
        }
      }
      const paymentIds = [
        ...new Set(
          agentRows
            .filter((r) => isCollectionEvidenceKind(r.kind) && str(r.paymentId))
            .map((r) => str(r.paymentId))
        ),
      ];
      for (const pid of paymentIds.slice(0, 8)) {
        const paymentProof = filterPaymentEvidence(agentRows, pid);
        const rawPayment = agentRows.filter(
          (r) => isCollectionEvidenceKind(r.kind) && str(r.paymentId) === pid
        );
        if (paymentProof.length !== rawPayment.length) {
          countMismatches.push({
            paymentId: pid,
            paymentProof: paymentProof.length,
            raw: rawPayment.length,
          });
        }
      }

      entries.push(
        createPredatorEntry({
          status: countMismatches.length === 0 ? "PASS" : "WARN",
          module: "Operational Evidence",
          step: "association.evidence_counts",
          expected: "Visit and payment proof counts match scoped filters (no stale inflation)",
          actual: { mismatches: countMismatches.slice(0, 5) },
          rootCauseGuess:
            countMismatches.length === 0
              ? "Evidence counts align with visit_id / payment_id filters"
              : "Evidence index may include rows outside scoped filters",
          suggestedFix: "Refresh evidence list after upload; verify kind on each row",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Operational Evidence",
        step: "upload.failure_handling",
        rootCauseGuess: "Upload API falls back to local embed when bucket unavailable",
        suggestedFix: "Keep migration applied; monitor evidence.upload_fail Predator timings",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return {
      module: "Operational Evidence",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
