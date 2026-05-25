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
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-[var(--pc-shadow-card)]",
        className
      )}
    >
      <div className="rounded-2xl bg-[var(--pc-neutral-bg)] p-3">
        <Icon className="h-8 w-8 text-[var(--pc-brand-primary)]" />
      </div>
      <h3 className={cn(typography.sectionTitle, "mt-4")}>{title}</h3>
      {description ? (
        <p className={cn(typography.pageSubtitle, "mt-2 max-w-md")}>{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
