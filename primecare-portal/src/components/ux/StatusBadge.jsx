import React from "react";
import { cn } from "@/lib/utils";
import {
  normalizeSemanticVariant,
  STATUS_BADGE_CLASSES,
} from "@/utils/statusTokens";

/**
 * PrimeCare semantic status badge.
 * @param {{
 *   variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral',
 *   children: React.ReactNode,
 *   className?: string,
 *   compact?: boolean,
 * }} props
 */
export default function StatusBadge({
  variant = "neutral",
  children,
  className,
  compact = false,
}) {
  const tone = normalizeSemanticVariant(variant);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center border font-medium whitespace-nowrap",
        compact
          ? "rounded-full px-1.5 py-0 text-[10px]"
          : "rounded-full px-2 py-0.5 text-xs",
        STATUS_BADGE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
