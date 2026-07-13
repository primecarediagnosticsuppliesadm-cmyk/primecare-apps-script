import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Single next best action — Problem, Reason, Consequence, one CTA.
 */
export default function Employee360NextBestActionCard({ action, onAction, className }) {
  if (!action) return null;

  return (
    <section
      className={cn("rounded-xl border border-[var(--pc-brand-primary)]/30 bg-[var(--pc-brand-primary)]/5 p-4", className)}
      data-testid="employee360-nba"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--pc-brand-primary)]">Next best action</p>
      <h3 className="mt-1 text-base font-semibold text-foreground">{action.title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why</dt>
          <dd className="text-foreground">{action.reason}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            If you don&apos;t
          </dt>
          <dd className="text-muted-foreground">{action.consequence}</dd>
        </div>
      </dl>
      {action.actionKey && action.actionKey !== "none" ? (
        <Button type="button" size="sm" className="mt-4" onClick={() => onAction?.(action.actionKey)}>
          {action.ctaLabel}
        </Button>
      ) : null}
    </section>
  );
}
