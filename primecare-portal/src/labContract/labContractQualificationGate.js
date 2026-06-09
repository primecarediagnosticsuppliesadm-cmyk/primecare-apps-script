import { labIdKey } from "@/utils/labId.js";
import {
  getPipelineStageLabel,
  isQualificationPipelineReady,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";

export const CONTRACT_ACTIVATION_QUALIFICATION_MESSAGE =
  "Lab must complete Qualification before contract activation.";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Resolve qualification row for a contract lab (tenant-scoped when provided).
 */
export function resolveQualificationForContractLab(
  contract = {},
  qualifications = [],
  distributorId = ""
) {
  const contractLabId = labIdKey(contract.labId || contract.lab_id);
  if (!contractLabId) return null;
  const targetTenant = str(distributorId || contract.distributorId || contract.tenantId);

  return (
    qualifications.find((q) => {
      const qLab = labIdKey(q.labId || q.lab_id);
      if (qLab !== contractLabId) return false;
      const qTenant = str(q.tenantId || q.tenant_id);
      if (targetTenant && qTenant && qTenant !== targetTenant) return false;
      return true;
    }) || null
  );
}

/**
 * Gate contract activation on distributor-owned qualification integrity.
 * Requires: row exists, pipeline stage qualified or won.
 */
export function evaluateContractActivationQualification(
  contract = {},
  qualifications = [],
  options = {}
) {
  const distributorId = str(options.distributorId || contract.distributorId || contract.tenantId);
  const qual = resolveQualificationForContractLab(contract, qualifications, distributorId);
  const qualificationExists = Boolean(qual);
  const stage = normalizeQualificationPipelineStage(
    qual?.pipelineStage || qual?.pipeline_stage
  );
  const qualificationStatus = stage ? getPipelineStageLabel(stage) : null;
  const pipelineQualified = qualificationExists && isQualificationPipelineReady(qual);

  const activationAllowed = pipelineQualified;

  let blockReason = null;
  if (!qualificationExists) {
    blockReason = "missing_qualification_row";
  } else if (!pipelineQualified) {
    blockReason = "pipeline_not_qualified";
  }

  const legacyFounderReview = str(
    qual?.founderReviewStatus || qual?.founder_review_status
  ).toLowerCase() || null;

  return {
    distributor: str(contract.distributorName) || distributorId || null,
    lab: str(contract.labName) || labIdKey(contract.labId) || null,
    labId: labIdKey(contract.labId),
    qualificationExists,
    qualificationStatus: qualificationStatus || (qualificationExists ? "—" : "missing"),
    legacyFounderReview,
    contractStatus: str(contract.status) || null,
    activationAllowed,
    blockReason,
  };
}

/**
 * @throws {Error} when activation is not allowed
 */
export function assertContractActivationAllowed(contract, qualifications = [], options = {}) {
  const evaluation = evaluateContractActivationQualification(contract, qualifications, options);
  if (!evaluation.activationAllowed) {
    const err = new Error(CONTRACT_ACTIVATION_QUALIFICATION_MESSAGE);
    err.qualificationGate = evaluation;
    throw err;
  }
  return evaluation;
}
