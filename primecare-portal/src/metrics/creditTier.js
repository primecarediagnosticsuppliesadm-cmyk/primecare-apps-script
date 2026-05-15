import { num, str } from "./primitives.js";

/**
 * Derives credit tier for a lab row (v_labs_credit / agent workspace shape).
 * Duplicated previously in LabsPage and AgentDashboard — behavior preserved.
 * @returns {"HOLD"|"NEAR_LIMIT"|"OK"}
 */
export function deriveCreditTierFromLabRecord(item) {
  const explicit = str(item?.creditStatus).toUpperCase();
  if (explicit) return explicit;

  const reason = str(item?.creditReason).toUpperCase();
  const hold = str(item?.creditHold).toUpperCase();
  const outstanding = num(item?.outstanding ?? item?.outstandingAmount);
  const creditLimit = num(item?.creditLimit);

  if (reason || hold === "YES" || hold === "HOLD") return "HOLD";
  if (creditLimit > 0 && outstanding / creditLimit >= 0.8) return "NEAR_LIMIT";
  return "OK";
}
