import { useEffect, useRef } from "react";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { runPredatorExecutiveBatchValidation } from "@/predator/runPredatorValidation.js";

function stableBatchKey(snapshots) {
  const { capturedAt, intelligenceCapturedAt, ...rest } = snapshots || {};
  return JSON.stringify(rest);
}

/**
 * One validation pass for Executive Control Tower modules (shared ops payload).
 */
export function usePredatorBatchValidation(currentUser, snapshots, ready) {
  const lastKey = useRef("");

  useEffect(() => {
    if (!isPredatorEnabled() || !ready || !currentUser) return;
    const key = stableBatchKey(snapshots);
    if (key === lastKey.current) return;
    lastKey.current = key;

    runPredatorExecutiveBatchValidation(currentUser, snapshots ?? {}).catch((err) => {
      console.error("[Predator] Executive batch validation failed", err);
    });
  }, [currentUser, snapshots, ready]);
}
