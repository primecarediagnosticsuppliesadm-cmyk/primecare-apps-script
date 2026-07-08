import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { cn } from "@/lib/utils";

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

export default function CommercialLab360Drawer({ open, onClose, labModel, onOpenOrders, onOpenCollections }) {
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
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Commercial Lab 360">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commercial Lab 360</p>
            <h2 className="truncate text-lg font-semibold">{labModel.labName}</h2>
            <p className="truncate text-xs text-muted-foreground">{labModel.labId}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info" label="Read only" />
            <StatusBadge variant="success" label={labModel.commercialStageLabel} />
          </div>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
            <Field label="Qualification band" value={labModel.profile?.band} />
            <Field label="Score" value={labModel.profile?.score} />
            <Field label="Decision maker" value={labModel.profile?.decisionMaker} />
            <Field label="Area" value={labModel.profile?.area} />
            <Field label="Pipeline" value={labModel.qualification?.stage} />
            <Field label="Expected value" value={labModel.qualification?.expectedValueLabel} />
          </section>

          {labModel.contract ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Contract</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Status" value={labModel.contract.status} />
                <Field label="Type" value={labModel.contract.type} />
                <Field label="Renewal" value={labModel.contract.renewalDate || "—"} />
                <Field label="Risk" value={labModel.contract.risk} />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Visit history</h3>
            <div className="space-y-2">
              {(labModel.visits || []).length ? (
                labModel.visits.map((visit) => (
                  <div key={visit.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                    <p className="font-medium">{visit.visitType} · {visit.visitDate}</p>
                    <p className="text-muted-foreground">{visit.nextAction || visit.notes || "—"}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No visits recorded.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground">{labModel.quotesNote}</p>
            <p className="text-xs text-muted-foreground">{labModel.ordersNote}</p>
            <p className="text-xs text-muted-foreground">{labModel.collectionsNote}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={onOpenOrders}>
                Open Orders
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onOpenCollections}>
                Open Collections
              </Button>
            </div>
          </section>

          {(labModel.risks?.length || labModel.opportunities?.length) ? (
            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Risks</h3>
                <ul className="space-y-1 text-xs">
                  {(labModel.risks || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Opportunities</h3>
                <ul className="space-y-1 text-xs">
                  {(labModel.opportunities || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Timeline</h3>
            <div className="space-y-2">
              {(labModel.timeline || []).map((event) => (
                <div key={event.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-muted-foreground">{event.subtitle}</p>
                  <p className="text-[10px] text-muted-foreground">{event.at}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
