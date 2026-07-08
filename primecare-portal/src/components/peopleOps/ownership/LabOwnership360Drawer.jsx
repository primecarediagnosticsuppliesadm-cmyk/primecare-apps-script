import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import CompensationAttributionPreview from "@/components/peopleOps/ownership/CompensationAttributionPreview.jsx";
import OwnershipTimelinePanel from "@/components/peopleOps/ownership/OwnershipTimelinePanel.jsx";
import { cn } from "@/lib/utils";

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

export default function LabOwnership360Drawer({ open, onClose, labModel }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !labModel) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Lab Ownership">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close lab drawer" onClick={onClose} />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lab Ownership</p>
            <h2 className="truncate text-lg font-semibold text-foreground">{labModel.labName}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {labModel.labId} · SoT {labModel.canonicalSource || "lab_ownership"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info" label="Read only" />
            <StatusBadge variant={labModel.ownershipStatus === "ACTIVE" ? "success" : "warning"} label={labModel.ownershipStatus} />
          </div>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
            <Field label="Territory" value={labModel.territory} />
            <Field label="Executive" value={labModel.executiveName} />
            <Field label="Admin" value={labModel.adminName} />
            <Field label="Primary Agent" value={labModel.agentName} />
            <Field label="Collections (period)" value={labModel.collectionsLabel} />
            <Field label="Orders (delivered)" value={labModel.ordersVolumeLabel} />
            <Field label="Payments (count)" value={labModel.paymentsCountLabel} />
            <Field label="Outstanding" value={labModel.outstandingLabel} />
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Future Hierarchical Compensation
            </h3>
            <CompensationAttributionPreview preview={labModel.compensationAttribution} />
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{labModel.ordersNote}</p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <OwnershipTimelinePanel events={labModel.ownershipTimeline} />
          </section>
        </div>
      </aside>
    </div>
  );
}
