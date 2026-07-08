import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { buildLabPerformanceContribution } from "@/compensation/labPerformanceContributionModel.js";
import Lab360SectionNav from "@/components/enterprise/Lab360SectionNav.jsx";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";
import { cn } from "@/lib/utils";

const LAB360_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "visits", label: "Visits" },
  { id: "orders", label: "Orders" },
  { id: "contracts", label: "Contracts" },
  { id: "timeline", label: "Timeline" },
];

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

export default function CommercialLab360Drawer({ open, onClose, labModel, performanceContribution = null, onOpenOrders, onOpenCollections }) {
  const [activeSection, setActiveSection] = useState("overview");
  const contribution = useMemo(() => {
    if (performanceContribution) return performanceContribution;
    if (!labModel) return null;
    return buildLabPerformanceContribution({
      commercialLab: labModel,
      visitsCount: (labModel.visits || []).length,
    });
  }, [labModel, performanceContribution]);

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
        <header className={enterpriseLayout.drawerHeader}>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Lab 360</p>
            <h2 className="truncate text-base font-semibold">{labModel.labName}</h2>
            <p className="truncate text-xs text-muted-foreground">{labModel.labId}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className={enterpriseLayout.drawerBody}>
          <Lab360SectionNav sections={LAB360_SECTIONS} activeId={activeSection} onSelect={setActiveSection} />
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info" label="Read only" />
            <StatusBadge variant="success" label={labModel.commercialStageLabel} />
          </div>

          {(activeSection === "overview" || activeSection === "contracts") ? (
            <section className={enterpriseLayout.sectionDense}>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Qualification band" value={labModel.profile?.band} />
                <Field label="Score" value={labModel.profile?.score} />
                <Field label="Decision maker" value={labModel.profile?.decisionMaker} />
                <Field label="Area" value={labModel.profile?.area} />
                <Field label="Pipeline" value={labModel.qualification?.stage} />
                <Field label="Expected value" value={labModel.qualification?.expectedValueLabel} />
              </div>
            </section>
          ) : null}

          {activeSection === "contracts" && labModel.contract ? (
            <section className={enterpriseLayout.sectionDense}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Contract</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Status" value={labModel.contract.status} />
                <Field label="Type" value={labModel.contract.type} />
                <Field label="Renewal" value={labModel.contract.renewalDate || "—"} />
                <Field label="Risk" value={labModel.contract.risk} />
              </div>
            </section>
          ) : null}

          {activeSection === "performance" && contribution ? (
            <section className={enterpriseLayout.sectionDense}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Performance</h3>
                <StatusBadge variant="info" label="Read only" />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Revenue" value={contribution.revenueLabel} />
                <Field label="Collections" value={contribution.collectionsLabel} />
                <Field label="Outstanding" value={contribution.outstandingLabel} />
                <Field label="Visits" value={contribution.visitsCount} />
                <Field label="Primary agent" value={contribution.primaryAgent} />
                <Field label="Reporting admin" value={contribution.reportingAdmin} />
                <Field label="Executive" value={contribution.executive} />
                <Field label="Payroll contribution" value={contribution.payrollContribution} />
                <Field label="Commission contribution" value={contribution.commissionContribution} />
                <Field label="Growth" value={contribution.growth} />
                <Field label="Risk" value={contribution.risk} />
              </div>
            </section>
          ) : null}

          {activeSection === "visits" ? (
            <section className={enterpriseLayout.sectionDense}>
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
          ) : null}

          {activeSection === "orders" ? (
            <section className={cn(enterpriseLayout.sectionDense, "space-y-2")}>
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
          ) : null}

          {activeSection === "timeline" ? (
            <section className={enterpriseLayout.sectionDense}>
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
          ) : null}
        </div>
      </aside>
    </div>
  );
}
