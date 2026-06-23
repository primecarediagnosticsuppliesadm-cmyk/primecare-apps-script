import { computeQualificationScore } from "@/utils/computeQualificationScore.js";
import {
  getPipelineStageLabel,
  normalizeQualificationPipelineStage,
  TERMINAL_PIPELINE_STAGES,
} from "@/utils/qualificationPipeline.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  const n = num(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")}/mo`;
}

function recommendNextAction(row = {}) {
  const stage = normalizeQualificationPipelineStage(
    row.pipelineStage ?? row.pipeline_stage
  );
  const status = str(row.status ?? row.qualificationStatus).toLowerCase();

  if (status === "needs_info") return "Request missing qualification fields from the agent";
  if (status === "rejected") return "Review rejection reason and decide on re-engagement";
  if (!stage || stage === "new") return "Schedule discovery and capture consumables estimate";
  if (stage === "contacted") return "Complete qualification profile and advance pipeline";
  if (stage === "qualified") return "Review contract readiness and plan sample send";
  if (stage === "hold") return "Clear hold reason and set a follow-up date";
  if (stage === "sample_sent") return "Follow up on sample feedback";
  if (stage === "negotiation" || stage === "reagent_rental_discussion") {
    return "Close negotiation — confirm rental terms";
  }
  if (status === "pending") return "Review submitted qualification";
  return "Review lab qualification profile";
}

/**
 * Priority qualification recommendations from existing fields only.
 * @param {object[]} rows
 * @param {number} [limit]
 */
export function buildQualificationRecommendations(rows = [], limit = 5) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const stage = normalizeQualificationPipelineStage(
        row.pipelineStage ?? row.pipeline_stage
      );
      return !stage || !TERMINAL_PIPELINE_STAGES.has(stage);
    })
    .map((row) => {
      const scoring = computeQualificationScore(row);
      const reasons =
        row.qualificationReasons ||
        row.qualification_reasons ||
        scoring.qualification_reasons ||
        [];
      const band = row.qualificationBand ?? row.qualification_band ?? scoring.qualification_band;
      const score = num(row.qualificationScore ?? row.qualification_score ?? scoring.qualification_score);
      const monthly = row.monthlyConsumablesEstimate ?? row.monthly_consumables_estimate;
      const rental = row.reagentRentalPotential ?? row.reagent_rental_potential;
      const fit = row.labOsFit ?? row.lab_os_fit;
      const stageLabel = getPipelineStageLabel(row.pipelineStage ?? row.pipeline_stage);

      const whyParts = [];
      if (reasons.length) whyParts.push(reasons.slice(0, 2).join(" · "));
      if (stageLabel && stageLabel !== "—") whyParts.push(`Pipeline: ${stageLabel}`);
      if (band) whyParts.push(`${String(band).toUpperCase()} band`);

      const expectedValue = formatMoney(monthly);
      const fitLabel = fit ? `Lab OS fit: ${fit}` : null;
      const rentalLabel = rental ? `Rental potential: ${rental}` : null;

      return {
        labId: str(row.labId ?? row.lab_id),
        labName: str(row.labName ?? row.lab_name) || str(row.labId),
        distributorName: str(row.distributorName ?? row.distributor_name),
        score,
        band,
        stageLabel,
        whyMatters: whyParts.filter(Boolean).join(" · ") || "Qualification data on file",
        recommendedAction: recommendNextAction(row),
        expectedValue,
        fitLabel,
        rentalLabel,
        row,
      };
    })
    .sort((a, b) => {
      const bandOrder = { hot: 3, warm: 2, cold: 1 };
      const ba = bandOrder[str(a.band).toLowerCase()] || 0;
      const bb = bandOrder[str(b.band).toLowerCase()] || 0;
      if (bb !== ba) return bb - ba;
      return b.score - a.score;
    });

  return candidates.slice(0, Math.max(1, limit));
}
