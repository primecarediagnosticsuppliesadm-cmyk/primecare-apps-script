function str(value) {
  return String(value ?? "").trim();
}

function extractPlanCode(formValues = {}) {
  return str(formValues.plan_code || formValues.planCode);
}

function extractVersion(formValues = {}) {
  return str(formValues.version || "v1") || "v1";
}

function isDuplicateCodeVersionError(message = "", errorCode = "") {
  const text = String(message || "");
  return (
    errorCode === "23505" ||
    /compensation_plans_code_version_key/i.test(text) ||
    /duplicate key value violates unique constraint/i.test(text)
  );
}

/**
 * Map compensation plan mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 */
export function mapCompensationPlanMutationError(errorInput, formValues = {}, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const errorCode = str(errorInput?.errorCode || errorInput?.code);
  const planCode = extractPlanCode(formValues);
  const version = extractVersion(formValues);
  const existingPlanId = context.existingPlanId || null;

  if (isDuplicateCodeVersionError(message, errorCode)) {
    return {
      code: "DUPLICATE_PLAN_CODE_VERSION",
      title: "Plan code and version already exist",
      message: planCode
        ? `A compensation plan with code "${planCode}" and version "${version}" already exists. Choose a different version or open the existing plan.`
        : "A compensation plan with this code and version already exists. Choose a different version or open the existing plan.",
      fieldErrors: {
        planCode: "This plan code is already used with this version.",
        version: "Choose a different version for this plan code.",
      },
      suggestedActions: [
        { id: "open_existing", label: "Open Existing Plan" },
        { id: "change_version", label: "Change Version" },
      ],
      focusField: "version",
      rawErrorForLogging: message,
      existingPlanId,
    };
  }

  if (/compensation_admin_forbidden/i.test(message)) {
    return {
      code: "FORBIDDEN",
      title: "Action not permitted",
      message: "Your role cannot perform this compensation plan action.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
      existingPlanId: null,
    };
  }

  if (/active_plan_requires_new_version/i.test(message)) {
    return {
      code: "ACTIVE_PLAN_VERSION_REQUIRED",
      title: "Active plan needs a new version",
      message: "Active compensation plans cannot be edited in place. Create a new version instead.",
      fieldErrors: {},
      suggestedActions: [{ id: "change_version", label: "Create New Version" }],
      focusField: null,
      rawErrorForLogging: message,
      existingPlanId: null,
    };
  }

  return {
    code: "PLAN_MUTATION_FAILED",
    title: "Could not save compensation plan",
    message: "Something went wrong while saving this plan. Review the fields and try again.",
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message,
    existingPlanId: null,
  };
}

export function findPlanByCodeVersion(planRows = [], planCode = "", version = "v1") {
  const code = str(planCode).toLowerCase();
  const ver = str(version).toLowerCase();
  if (!code || !ver) return null;
  return (
    (planRows || []).find(
      (row) =>
        str(row.planCode || row.plan_code).toLowerCase() === code &&
        str(row.version).toLowerCase() === ver
    ) || null
  );
}

export function assertNoDuplicatePlanCodeVersion(planRows = [], planCode = "", version = "v1") {
  const existing = findPlanByCodeVersion(planRows, planCode, version);
  if (!existing) return null;
  return mapCompensationPlanMutationError(
    "duplicate key value violates unique constraint compensation_plans_code_version_key",
    { plan_code: planCode, version },
    { existingPlanId: existing.id }
  );
}
