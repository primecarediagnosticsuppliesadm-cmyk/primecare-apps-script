import React from "react";
import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractReadHealth,
  readHealthBannerMessage,
  readHealthBannerVariant,
} from "@/observability/readHealth.js";

const VARIANT_STYLES = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-amber-300/80 bg-amber-50 text-amber-900",
};

/**
 * Surfaces readFailed / degraded / stale projection state for operators.
 * @param {{ result?: object|null, health?: object|null, className?: string, title?: string }} props
 */
export default function ReadHealthBanner({ result = null, health = null, className, title }) {
  const resolved = health || extractReadHealth(result);
  const variant = readHealthBannerVariant(resolved);
  const message = readHealthBannerMessage(resolved);

  if (!variant || !message) return null;

  const Icon = variant === "error" ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm",
        VARIANT_STYLES[variant],
        className
      )}
      data-read-health={variant}
      data-projection={resolved.projection ? "true" : "false"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <p className={title ? "mt-0.5" : undefined}>{message}</p>
      </div>
    </div>
  );
}
