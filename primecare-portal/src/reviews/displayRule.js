/**
 * Presentation-only copy of the certified display-rule semantics.
 * Server submission remains authoritative.
 */

const OPERATORS = new Set(["IN", "NOT_IN", "CONTAINS_ANY", "CONTAINS_NONE"]);
const RULE_KEYS = ["question_key", "op", "values"];

function parentResponse(responsesByKey, questionKey) {
  if (!responsesByKey) return null;
  if (typeof responsesByKey.get === "function") return responsesByKey.get(questionKey) || null;
  return responsesByKey[questionKey] || null;
}

/**
 * @param {object | null | undefined} rule
 * @param {Map<string, object> | Record<string, object>} responsesByKey
 */
export function isDisplayRuleActive(rule, responsesByKey) {
  if (rule == null) return false;
  if (typeof rule !== "object" || Array.isArray(rule)) return false;
  const keys = Object.keys(rule);
  if (keys.length === 0) return true;
  if (keys.length !== RULE_KEYS.length || keys.some((key) => !RULE_KEYS.includes(key))) return false;

  const questionKey = typeof rule.question_key === "string" ? rule.question_key.trim() : "";
  const op = typeof rule.op === "string" ? rule.op : "";
  const values = Array.isArray(rule.values) ? rule.values : null;
  if (!questionKey || !OPERATORS.has(op) || !values || values.length === 0) return false;
  if (values.some((value) => typeof value !== "string" || value.length === 0)) return false;

  const parent = parentResponse(responsesByKey, questionKey);
  if (!parent || typeof parent !== "object") return false;

  if (op === "IN" || op === "NOT_IN") {
    if (typeof parent.value !== "string") return false;
    const hit = values.includes(parent.value);
    return op === "IN" ? hit : !hit;
  }

  if (!Array.isArray(parent.values)) return false;
  const selected = parent.values.filter((value) => typeof value === "string");
  const hit = values.some((value) => selected.includes(value));
  return op === "CONTAINS_ANY" ? hit : !hit;
}

/**
 * @param {string} responseType
 * @param {object | null | undefined} response
 */
export function isResponseAnswered(responseType, response) {
  if (!response || typeof response !== "object") return false;
  switch (responseType) {
    case "TEXT":
    case "LONG_TEXT":
      return String(response.text || "").trim().length > 0;
    case "YES_NO":
      return typeof response.value === "boolean";
    case "SINGLE_SELECT":
      return typeof response.value === "string" && response.value.trim().length > 0;
    case "DATE":
      return typeof response.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(response.value);
    case "NUMBER":
    case "RATING":
      return typeof response.value === "number" && Number.isFinite(response.value);
    case "MULTI_SELECT":
      return Array.isArray(response.values) && response.values.some((value) => typeof value === "string" && value);
    case "LAB_SELECT":
      return typeof response.lab_id === "string" && response.lab_id.trim().length > 0;
    case "MULTI_LAB_SELECT":
      return Array.isArray(response.lab_ids) && response.lab_ids.some((value) => typeof value === "string" && value);
    default:
      return false;
  }
}
