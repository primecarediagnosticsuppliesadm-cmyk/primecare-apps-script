import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

/**
 * @param {{
 *   title: string,
 *   description?: string,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   action?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export default function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  compact = false,
}) {
  return (
    <div
      className={cn(
        compact
          ? "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center"
          : "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-[var(--pc-shadow-card)]",
        className
      )}
    >
      <div className={cn(compact ? "rounded-lg bg-[var(--pc-neutral-bg)] p-2" : "rounded-2xl bg-[var(--pc-neutral-bg)] p-3")}>
        <Icon className={cn("text-[var(--pc-brand-primary)]", compact ? "h-5 w-5" : "h-8 w-8")} />
      </div>
      <h3 className={cn(compact ? "mt-2 text-sm font-semibold" : cn(typography.sectionTitle, "mt-4"))}>{title}</h3>
      {description ? (
        <p className={cn(typography.pageSubtitle, "mt-2 max-w-md")}>{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
