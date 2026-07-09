import React, { useEffect, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PEOPLE_OPS_ONBOARDING_STEPS,
  PEOPLE_OPS_ONBOARDING_STORAGE_KEY,
} from "@/peopleOps/peopleOpsBusinessCopy.js";

/**
 * RC5 — Dismissible first-time guided path (UI only).
 */
export default function PeopleOpsGuidedOnboarding({ onNavigate }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const dismissed = window.localStorage.getItem(PEOPLE_OPS_ONBOARDING_STORAGE_KEY);
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(PEOPLE_OPS_ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* ignore storage failures */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-[var(--pc-brand-primary)]/30 bg-[var(--pc-brand-primary)]/5 px-3 py-2.5" role="region" aria-label="People Operations guided start">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-[var(--pc-brand-primary)]" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-foreground">Start here — People Operations in five steps</p>
            <p className="text-[11px] text-muted-foreground">
              Employees → Compensation → Business Ownership → Payroll → Reports
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={dismiss}>
          <X className="mr-1 h-3 w-3" />
          Dismiss
        </Button>
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
        {PEOPLE_OPS_ONBOARDING_STEPS.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              className="flex h-full w-full flex-col rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
              onClick={() => onNavigate?.(step.route)}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {index + 1}. {step.title}
              </span>
              <span className="mt-0.5 text-[11px] text-foreground">{step.detail}</span>
              <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--pc-brand-primary)]">
                Open <ArrowRight className="h-3 w-3" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
