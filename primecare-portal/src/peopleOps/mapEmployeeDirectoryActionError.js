function str(value) {
  return String(value ?? "").trim();
}

/**
 * Map employee directory action failures to business-facing feedback.
 */
export function mapEmployeeDirectoryActionError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const action = str(context.action || "action");

  if (/Could not load employee directory/i.test(message)) {
    return {
      code: "DIRECTORY_LOAD_FAILED",
      title: "Could not refresh employee directory",
      message: "The employee list could not be loaded. Try again in a moment.",
      fieldErrors: {},
      suggestedActions: [],
      rawErrorForLogging: message,
    };
  }

  if (/export/i.test(action) || /export/i.test(message)) {
    return {
      code: "EXPORT_FAILED",
      title: "Could not export employees",
      message: "The CSV export could not be completed. Try again.",
      fieldErrors: {},
      suggestedActions: [],
      rawErrorForLogging: message,
    };
  }

  return {
    code: "DIRECTORY_ACTION_FAILED",
    title: "Directory action failed",
    message: "Something went wrong. Try again.",
    fieldErrors: {},
    suggestedActions: [],
    rawErrorForLogging: message,
  };
}
