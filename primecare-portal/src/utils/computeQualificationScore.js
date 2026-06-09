/**
 * Deterministic Year-1 qualification scoring (no AI).
 * Bands stored lowercase (hot/warm/cold) for DB constraint compatibility.
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function tierLevel(value) {
  const v = str(value).toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "";
}

function isCleanPaymentTerms(terms) {
  const t = str(terms).toLowerCase();
  if (!t) return false;
  const bad = ["unknown", "unclear", "bad", "overdue", "default"];
  return !bad.some((w) => t.includes(w));
}

function hasFutureOrTodayFollowUp(dateStr) {
  const d = str(dateStr).slice(0, 10);
  if (!d) return false;
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed >= today;
}

/**
 * @param {object} qualification - snake_case or camelCase fields
 * @returns {{
 *   qualification_score: number,
 *   qualification_band: 'hot'|'warm'|'cold',
 *   qualification_reasons: string[]
 * }}
 */
export function computeQualificationScore(qualification = {}) {
  const reasons = [];
  let score = 0;

  const monthly = num(
    qualification.monthly_consumables_estimate ??
      qualification.monthlyConsumablesEstimate
  );
  if (monthly >= 100000) {
    score += 25;
    reasons.push("High monthly consumables estimate (≥ ₹1L)");
  } else if (monthly >= 50000) {
    score += 20;
    reasons.push("Strong monthly consumables estimate (≥ ₹50k)");
  } else if (monthly >= 20000) {
    score += 15;
    reasons.push("Moderate monthly consumables estimate (≥ ₹20k)");
  } else if (monthly >= 5000) {
    score += 8;
    reasons.push("Some monthly consumables estimate captured");
  } else if (monthly > 0) {
    score += 3;
    reasons.push("Low monthly consumables estimate");
  }

  const rental = tierLevel(
    qualification.reagent_rental_potential ?? qualification.reagentRentalPotential
  );
  if (rental === "high") {
    score += 20;
    reasons.push("High reagent rental potential");
  } else if (rental === "medium") {
    score += 12;
    reasons.push("Medium reagent rental potential");
  } else if (rental === "low") {
    score += 4;
    reasons.push("Low reagent rental potential");
  }

  const labOs = tierLevel(qualification.lab_os_fit ?? qualification.labOsFit);
  if (labOs === "high") {
    score += 20;
    reasons.push("High Lab OS fit");
  } else if (labOs === "medium") {
    score += 12;
    reasons.push("Medium Lab OS fit");
  } else if (labOs === "low") {
    score += 4;
    reasons.push("Low Lab OS fit");
  }

  const paymentTerms = str(
    qualification.payment_terms ?? qualification.paymentTerms
  );
  if (isCleanPaymentTerms(paymentTerms)) {
    score += 10;
    reasons.push("Payment terms documented");
  }

  const decisionMaker = str(
    qualification.decision_maker ?? qualification.decisionMaker
  );
  if (decisionMaker) {
    score += 8;
    reasons.push("Decision maker identified");
  }

  const supplier = str(
    qualification.current_supplier ?? qualification.currentSupplier
  );
  if (supplier) {
    score += 5;
    reasons.push("Current supplier known");
  }

  const followUp = str(
    qualification.next_follow_up_date ?? qualification.nextFollowUpDate
  );
  if (hasFutureOrTodayFollowUp(followUp)) {
    score += 7;
    reasons.push("Next follow-up date scheduled");
  }

  const pipelineStage = str(
    qualification.pipeline_stage ?? qualification.pipelineStage
  ).toLowerCase();

  if (pipelineStage === "qualified" || pipelineStage === "won") {
    score += 5;
    reasons.push("Qualification pipeline: qualified or won");
  } else if (pipelineStage === "lost") {
    score = Math.min(score, 20);
    reasons.push("Qualification pipeline: lost (capped score)");
  } else if (pipelineStage === "hold") {
    score = Math.min(score, 30);
    reasons.push("Qualification pipeline: on hold");
  }

  score = Math.max(0, Math.min(100, score));

  let qualification_band = "cold";
  if (pipelineStage === "lost" || pipelineStage === "hold") {
    qualification_band = "cold";
  } else if (score >= 70) {
    qualification_band = "hot";
  } else if (score >= 40) {
    qualification_band = "warm";
  }

  if (qualification_band === "hot" && !reasons.some((r) => r.includes("High"))) {
    reasons.push("Overall score ≥ 70 → HOT band");
  } else if (qualification_band === "warm") {
    reasons.push("Overall score 40–69 → WARM band");
  } else if (qualification_band === "cold" && pipelineStage !== "lost") {
    reasons.push("Overall score below 40 → COLD band");
  }

  return {
    qualification_score: Math.round(score * 100) / 100,
    qualification_band,
    qualification_reasons: reasons,
  };
}

export function formatQualificationBandLabel(band) {
  const b = str(band).toLowerCase();
  if (b === "hot") return "HOT";
  if (b === "warm") return "WARM";
  if (b === "cold") return "COLD";
  return b ? b.toUpperCase() : "—";
}

export function qualificationBandBadgeClass(band) {
  const b = str(band).toLowerCase();
  if (b === "hot") return "bg-orange-100 text-orange-900";
  if (b === "warm") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}
