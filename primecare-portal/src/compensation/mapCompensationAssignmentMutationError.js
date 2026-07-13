function str(value) {
  return String(value ?? "").trim();
}

function parseRoleMismatch(message = "") {
  const match = String(message).match(/compensation_plan_role_mismatch:([^:]+):([^:]+)/i);
  if (!match) return null;
  return { planScope: match[1], employeeRole: match[2] };
}

/**
 * Map compensation assignment mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 */
export function mapCompensationAssignmentMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const errorCode = str(errorInput?.errorCode || errorInput?.code);
  const mode = str(context.mode || "assign");

  if (/employee_already_has_active_assignment/i.test(message)) {
    return {
      code: "ACTIVE_ASSIGNMENT_EXISTS",
      title: "Employee already has an active plan",
      message:
        "This employee already has an active compensation plan assignment. Use Change Plan to move them to a different plan.",
      fieldErrors: { planId: "Choose Change Plan instead of assigning again." },
      suggestedActions: [{ id: "change_plan", label: "Use Change Plan" }],
      focusField: "planId",
      rawErrorForLogging: message,
    };
  }

  const roleMismatch = parseRoleMismatch(message);
  if (roleMismatch) {
    return {
      code: "PLAN_ROLE_MISMATCH",
      title: "Plan does not match employee role",
      message: `This compensation plan is scoped to ${roleMismatch.planScope} roles, but the selected employee is ${roleMismatch.employeeRole}. Choose a plan that matches the employee role.`,
      fieldErrors: { planId: "Select a plan with a matching role scope." },
      suggestedActions: [],
      focusField: "planId",
      rawErrorForLogging: message,
    };
  }

  if (/assignment_not_found/i.test(message)) {
    return {
      code: "ASSIGNMENT_NOT_FOUND",
      title: "Assignment not found",
      message: "This assignment record could not be found. Refresh the page and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/compensation_plan_not_found/i.test(message)) {
    return {
      code: "PLAN_NOT_FOUND",
      title: "Compensation plan not found",
      message: "The selected compensation plan is no longer available. Refresh and choose another plan.",
      fieldErrors: { planId: "Select a different plan." },
      suggestedActions: [],
      focusField: "planId",
      rawErrorForLogging: message,
    };
  }

  if (/employee_profile_not_found/i.test(message)) {
    return {
      code: "EMPLOYEE_NOT_FOUND",
      title: "Employee not found",
      message: "This employee profile could not be found. Refresh the directory and try again.",
      fieldErrors: { profileUserId: "Choose a different employee." },
      suggestedActions: [],
      focusField: "profileUserId",
      rawErrorForLogging: message,
    };
  }

  if (/profile_user_id_and_plan_id_required/i.test(message)) {
    return {
      code: "REQUIRED_FIELDS",
      title: "Missing assignment details",
      message: "Select an employee and compensation plan before saving.",
      fieldErrors: {
        profileUserId: "Employee is required.",
        planId: "Compensation plan is required.",
      },
      suggestedActions: [],
      focusField: "planId",
      rawErrorForLogging: message,
    };
  }

  if (/compensation_admin_forbidden/i.test(message)) {
    return {
      code: "FORBIDDEN",
      title: "Action not permitted",
      message: "Your role cannot perform this compensation assignment action.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  const actionLabel =
    mode === "change" ? "change this assignment" : mode === "end" ? "end this assignment" : "assign this plan";

  return {
    code: "ASSIGNMENT_MUTATION_FAILED",
    title: mode === "end" ? "Could not end assignment" : "Could not save assignment",
    message: `Something went wrong while trying to ${actionLabel}. Review the fields and try again.`,
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message || errorCode,
  };
}
