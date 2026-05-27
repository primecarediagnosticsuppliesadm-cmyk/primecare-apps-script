import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { recordPredatorRenderStep } from "@/predator/renderTrace.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";

const MODULE = "Agent Visits";

/** @param {Record<string, unknown>} [detail] */
export function recordAgentVisitUxStep(detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorRenderStep(MODULE, "ui.wizard.step_view", detail);
}

/** @param {Record<string, unknown>} [detail] */
export function recordAgentVisitDraftRestore(detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorRenderStep(MODULE, "ui.draft_restore_detected", detail);
}

/** @param {Record<string, unknown>} [detail] */
export function recordAgentVisitStepTiming(detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorRenderStep(MODULE, "ui.average_time_per_step", detail);
}

/** @param {Record<string, unknown>} [detail] */
export function recordAgentVisitWizardCompletion(detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorRenderStep(MODULE, "ui.wizard_completion_time", detail);
}

/** @param {string[]} missingFields */
export function recordAgentVisitMissingFields(missingFields) {
  if (!isPredatorEnabled() || !missingFields?.length) return;
  predatorStore.recordError(
    createPredatorEntry({
      status: "WARN",
      module: MODULE,
      step: "ui.missing_required_fields",
      expected: "all required visit fields before submit",
      actual: { missing: missingFields },
      rootCauseGuess: "User reached review with incomplete required fields",
      suggestedFix: "Use Edit shortcuts on review cards or step validation hints",
      severity: "low",
      issueClass: "functional",
    })
  );
}

/** @param {Record<string, unknown>} [detail] */
export function recordAgentVisitStepAbandonment(detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorRenderStep(MODULE, "ui.step_abandonment", detail);
}
