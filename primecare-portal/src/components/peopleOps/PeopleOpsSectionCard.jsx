import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

/**
 * Standard section card for People Operations modules.
 */
export default function PeopleOpsSectionCard({
  title,
  subtitle = "",
  icon: Icon = null,
  rightAction = null,
  children,
  className,
  contentClassName,
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)] md:p-5",
        className
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn(typography.sectionTitle, "flex items-center gap-2 text-base")}>
            {Icon ? <Icon className="h-4 w-4 text-[var(--pc-brand-primary)]" aria-hidden /> : null}
            {title}
          </h2>
          {subtitle ? <p className={cn(typography.sectionSubtitle, "mt-1")}>{subtitle}</p> : null}
        </div>
        {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
