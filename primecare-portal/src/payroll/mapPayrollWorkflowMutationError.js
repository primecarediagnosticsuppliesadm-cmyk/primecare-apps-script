function str(value) {
  return String(value ?? "").trim();
}

function actionLabel(actionId = "") {
  switch (str(actionId)) {
    case "generate_preview":
      return "generate payroll preview";
    case "submit":
      return "submit payroll preview";
    case "approve":
      return "approve payroll";
    case "reject":
      return "reject payroll";
    case "lock":
      return "lock payroll";
    case "export":
      return "export payroll";
    case "mark_paid":
      return "record paid evidence";
    default:
      return "complete this payroll action";
  }
}

/**
 * Map payroll workflow mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 */
export function mapPayrollWorkflowMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const actionId = str(context.actionId);
  const verb = actionLabel(actionId);

  if (/payroll_preview_required/i.test(message)) {
    return {
      code: "PREVIEW_REQUIRED",
      title: "Payroll preview required",
      message: "Generate a payroll preview for this period before running workflow actions.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/payroll_.*_forbidden_for_/i.test(message)) {
    return {
      code: "FORBIDDEN",
      title: "Action not permitted",
      message: `Your role cannot ${verb} for this payroll period.`,
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/payroll_invalid_transition_/i.test(message)) {
    return {
      code: "INVALID_TRANSITION",
      title: "Payroll status has changed",
      message:
        "This payroll action is no longer valid for the current run status. Refresh the page and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/payroll_.*_reason_required/i.test(message)) {
    return {
      code: "REASON_REQUIRED",
      title: "Reason required",
      message: "Enter a reason before continuing with this payroll action.",
      fieldErrors: { reason: "A reason is required." },
      suggestedActions: [],
      focusField: "reason",
      rawErrorForLogging: message,
    };
  }

  if (/Payroll run not found/i.test(message)) {
    return {
      code: "RUN_NOT_FOUND",
      title: "Payroll run not found",
      message: "The selected payroll run could not be found. Refresh and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/preview generation failed|assertPayrollPeriodDraftForPreview/i.test(message)) {
    return {
      code: "PREVIEW_GENERATION_FAILED",
      title: "Could not generate payroll preview",
      message:
        "Payroll preview generation failed for this period. Confirm the period is in draft and assigned employees have active plans.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  return {
    code: "PAYROLL_WORKFLOW_FAILED",
    title: actionId === "generate_preview" ? "Could not generate payroll preview" : "Payroll action failed",
    message: `Something went wrong while trying to ${verb}. Review the period status and try again.`,
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message,
  };
}
