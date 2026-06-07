import { labIdKey } from "@/utils/labId.js";
import {
  getPipelineStageLabel,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";

export const CONTRACT_ACTIVATION_QUALIFICATION_MESSAGE =
  "Lab must complete Qualification Review before contract activation.";

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
 * Gate contract activation on qualification integrity.
 * Requires: row exists, founder approved, pipeline stage qualified or won.
 */
export function evaluateContractActivationQualification(
  contract = {},
  qualifications = [],
  options = {}
) {
  const distributorId = str(options.distributorId || contract.distributorId || contract.tenantId);
  const qual = resolveQualificationForContractLab(contract, qualifications, distributorId);
  const qualificationExists = Boolean(qual);
  const founderApproved =
    str(qual?.founderReviewStatus || qual?.founder_review_status).toLowerCase() === "approved";
  const stage = normalizeQualificationPipelineStage(
    qual?.pipelineStage || qual?.pipeline_stage
  );
  const qualificationStatus = stage ? getPipelineStageLabel(stage) : null;
  const qualificationStatusQualified = stage === "qualified" || stage === "won";

  const activationAllowed =
    qualificationExists && founderApproved && qualificationStatusQualified;

  let blockReason = null;
  if (!qualificationExists) {
    blockReason = "missing_qualification_row";
  } else if (!founderApproved) {
    blockReason = "founder_review_not_approved";
  } else if (!qualificationStatusQualified) {
    blockReason = "pipeline_not_qualified";
  }

  return {
    distributor: str(contract.distributorName) || distributorId || null,
    lab: str(contract.labName) || labIdKey(contract.labId) || null,
    labId: labIdKey(contract.labId),
    qualificationExists,
    qualificationStatus: qualificationStatus || (qualificationExists ? "—" : "missing"),
    founderApproved,
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
