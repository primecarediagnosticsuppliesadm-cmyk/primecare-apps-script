import { useEffect, useState } from "react";
import { onFinancialSyncCompleted } from "@/operations/financialSyncEvents.js";

/**
 * Brief highlight pulse when a financial sync completes (payment recorded, etc.).
 * @param {number} [durationMs]
 */
export function useFinancialSyncPulse(durationMs = 800) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let timer;
    return onFinancialSyncCompleted(() => {
      setPulse(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setPulse(false), durationMs);
    });
  }, [durationMs]);

  return pulse;
}
