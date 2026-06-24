import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

/**
 * Standard customer-facing page header.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions = null,
  secondaryActions = null,
  freshness = null,
  className,
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon className="h-5 w-5 shrink-0 text-[var(--pc-brand-primary)]" aria-hidden />
          ) : null}
          <h1 className={typography.pageTitle}>{title}</h1>
        </div>
        {subtitle ? <p className={cn(typography.pageSubtitle, "mt-0.5")}>{subtitle}</p> : null}
        {freshness}
      </div>
      {actions || secondaryActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
