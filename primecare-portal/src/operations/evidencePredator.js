import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { recordPredatorTiming } from "@/predator/predatorTiming.js";

const MODULE = "Operational Evidence";

export function recordEvidenceEvent(step, detail = {}) {
  if (!isPredatorEnabled()) return;
  recordPredatorTiming({
    module: MODULE,
    step,
    durationMs: 0,
    detail,
  });
}
