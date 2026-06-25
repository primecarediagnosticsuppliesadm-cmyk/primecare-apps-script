import { useEffect, useRef } from "react";
import { isPredatorAutoValidationEnabled } from "@/predator/predatorGuards.js";
import { runPredatorModuleValidation } from "@/predator/runPredatorValidation.js";

/**
 * Run read-only module validation after data is ready (no business data mutation).
 * @param {string} moduleName
 * @param {object|null} currentUser
 * @param {object|null|undefined} snapshot
 * @param {boolean} ready
 */
export function usePredatorModuleValidation(moduleName, currentUser, snapshot, ready) {
  const lastKey = useRef("");

  useEffect(() => {
    if (!isPredatorAutoValidationEnabled() || !ready || !currentUser) return;
    const key = JSON.stringify({ moduleName, snapshot, userId: currentUser.id });
    if (key === lastKey.current) return;
    lastKey.current = key;

    runPredatorModuleValidation(moduleName, currentUser, snapshot ?? {}).catch((err) => {
      console.error(`[Predator] ${moduleName} validation failed`, err);
    });
  }, [moduleName, currentUser, snapshot, ready]);
}
