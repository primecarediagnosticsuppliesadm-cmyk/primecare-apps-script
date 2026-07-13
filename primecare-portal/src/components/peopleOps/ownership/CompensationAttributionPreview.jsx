import React from "react";
import { StatusBadge } from "@/components/ux";

export default function CompensationAttributionPreview({ preview, compact = false }) {
  if (!preview) return null;

  const steps = [
    { label: "Collection", value: preview.collectionLabel, variant: "info" },
    { label: "Agent Direct Commission", value: preview.agentDirectCommissionLabel, variant: "success" },
    { label: preview.adminOverrideLabel, value: preview.adminOverrideAmountLabel, variant: "neutral", future: true },
    { label: preview.executiveOverrideLabel, value: preview.executiveOverrideAmountLabel, variant: "neutral", future: true },
  ];

  if (compact) {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{preview.title || "Future Hierarchical Compensation"}</p>
        <p>
          Collection {preview.collectionLabel} → Agent {preview.agentDirectCommissionLabel}
        </p>
        <p className="italic">{preview.futureOverrideNote}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {preview.title || "Future Hierarchical Compensation"}
        </p>
        <StatusBadge variant="neutral" label="Preview only" />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <div key={step.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{step.label}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm font-semibold tabular-nums text-foreground">{step.value}</p>
              {step.future ? <StatusBadge variant="neutral" label="Future" /> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{preview.futureOverrideNote}</p>
    </div>
  );
}
