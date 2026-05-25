/**
 * Deterministic qualification pipeline stages (no AI).
 */

export const PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "sample_sent",
  "negotiation",
  "reagent_rental_discussion",
  "won",
  "lost",
  "hold",
];

export const TERMINAL_PIPELINE_STAGES = new Set(["won", "lost"]);

const STAGE_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  sample_sent: "Sample sent",
  negotiation: "Negotiation",
  reagent_rental_discussion: "Reagent rental discussion",
  won: "Won",
  lost: "Lost",
  hold: "Hold",
};

const STAGE_ORDER = {
  new: 10,
  contacted: 20,
  qualified: 30,
  sample_sent: 40,
  negotiation: 50,
  reagent_rental_discussion: 60,
  won: 90,
  lost: 91,
  hold: 5,
};

export function normalizeQualificationPipelineStage(stage) {
  const raw = String(stage ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!raw) return null;
  return PIPELINE_STAGES.includes(raw) ? raw : null;
}

export function getPipelineStageLabel(stage) {
  const key = normalizeQualificationPipelineStage(stage);
  if (!key) return "—";
  return STAGE_LABELS[key] || key;
}

export function getPipelineStageOrder(stage) {
  const key = normalizeQualificationPipelineStage(stage);
  if (!key) return 999;
  return STAGE_ORDER[key] ?? 999;
}

export function isAgentAllowedPipelineStage(stage) {
  const key = normalizeQualificationPipelineStage(stage);
  if (!key) return false;
  return !TERMINAL_PIPELINE_STAGES.has(key);
}

/**
 * Default stage when no pipeline_stage is stored yet.
 */
export function deriveDefaultPipelineStage(qualification = {}) {
  const founder = String(
    qualification.founder_review_status ?? qualification.founderReviewStatus ?? ""
  )
    .trim()
    .toLowerCase();

  if (founder === "rejected") return "hold";

  const band = String(
    qualification.qualification_band ?? qualification.qualificationBand ?? ""
  )
    .trim()
    .toLowerCase();
  const score = Number(
    qualification.qualification_score ?? qualification.qualificationScore
  );

  if (founder === "approved" || band === "hot" || (Number.isFinite(score) && score >= 70)) {
    return "qualified";
  }

  const monthly = Number(
    qualification.monthly_consumables_estimate ??
      qualification.monthlyConsumablesEstimate
  );
  const decisionMaker = String(
    qualification.decision_maker ?? qualification.decisionMaker ?? ""
  ).trim();

  if (
    (Number.isFinite(monthly) && monthly > 0) ||
    decisionMaker ||
    band === "warm"
  ) {
    return "contacted";
  }

  return "new";
}

export function pipelineStageBadgeClass(stage) {
  const key = normalizeQualificationPipelineStage(stage);
  if (key === "won") return "bg-green-100 text-green-800";
  if (key === "lost") return "bg-red-100 text-red-800";
  if (key === "hold") return "bg-slate-200 text-slate-700";
  if (key === "qualified" || key === "reagent_rental_discussion") {
    return "bg-blue-100 text-blue-900";
  }
  if (key === "negotiation" || key === "sample_sent") {
    return "bg-indigo-100 text-indigo-900";
  }
  return "bg-amber-50 text-amber-900";
}

export function mapPipelineFieldsFromRow(row) {
  const stage =
    normalizeQualificationPipelineStage(
      row?.pipeline_stage ?? row?.pipelineStage
    ) || deriveDefaultPipelineStage(row);

  const probabilityRaw = row?.pipeline_probability ?? row?.pipelineProbability;
  const expectedRaw =
    row?.pipeline_expected_value ?? row?.pipelineExpectedValue;

  return {
    pipelineStage: stage,
    pipelineStageLabel: getPipelineStageLabel(stage),
    pipelineStageOrder: getPipelineStageOrder(stage),
    pipelineStageUpdatedAt:
      row?.pipeline_stage_updated_at ?? row?.pipelineStageUpdatedAt ?? "",
    pipelineStageUpdatedBy:
      row?.pipeline_stage_updated_by ?? row?.pipelineStageUpdatedBy ?? "",
    pipelineLostReason: String(
      row?.pipeline_lost_reason ?? row?.pipelineLostReason ?? ""
    ).trim(),
    pipelineNextAction: String(
      row?.pipeline_next_action ?? row?.pipelineNextAction ?? ""
    ).trim(),
    pipelineExpectedValue:
      expectedRaw == null || expectedRaw === "" ? null : Number(expectedRaw),
    pipelineProbability:
      probabilityRaw == null || probabilityRaw === ""
        ? null
        : Number(probabilityRaw),
    pipelineNotes: String(row?.pipeline_notes ?? row?.pipelineNotes ?? "").trim(),
  };
}

export const PIPELINE_STAGE_SELECT_OPTIONS = PIPELINE_STAGES.map((value) => ({
  value,
  label: getPipelineStageLabel(value),
}));
