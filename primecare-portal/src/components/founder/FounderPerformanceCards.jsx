import React from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";

export default function FounderPerformanceCards({ cards = [], onNavigate }) {
  if (!cards.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Performance Decisions
        </h2>
        <StatusBadge variant="info" label="Rule-based" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.id} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{card.answer}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.reason}</p>
            {card.deepLinkPage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => onNavigate?.(card.deepLinkPage)}
              >
                {card.deepLinkLabel || "Open"}
              </Button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
