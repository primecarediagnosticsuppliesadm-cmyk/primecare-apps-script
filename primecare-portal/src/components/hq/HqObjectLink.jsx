import React from "react";
import { cn } from "@/lib/utils";

/**
 * Inline HQ object link — styled button for cross-module navigation.
 */
export default function HqObjectLink({
  children,
  onClick,
  className,
  title,
  disabled = false,
}) {
  if (!onClick) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "inline text-left font-medium text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}
