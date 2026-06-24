import React from "react";
import { AlertTriangle, Lock, MapPinOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

const VARIANTS = {
  unauthorized: {
    icon: Lock,
    title: "Access not available",
    defaultDescription:
      "Your account does not have permission to view this page. Contact your administrator if you need access.",
    iconClass: "text-amber-700",
    iconBg: "bg-amber-50",
  },
  notFound: {
    icon: MapPinOff,
    title: "Page not found",
    defaultDescription:
      "This section is not available for your role or may have moved. Use the menu to continue.",
    iconClass: "text-slate-600",
    iconBg: "bg-slate-100",
  },
  error: {
    icon: AlertTriangle,
    title: "Something went wrong",
    defaultDescription:
      "We could not load this screen. Refresh the page or return to your dashboard.",
    iconClass: "text-red-700",
    iconBg: "bg-red-50",
  },
};

/**
 * Enterprise-grade access, not-found, and error states.
 */
export default function PortalAccessCard({
  variant = "notFound",
  title,
  description,
  action,
  className,
}) {
  const config = VARIANTS[variant] || VARIANTS.notFound;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-[var(--pc-shadow-card)]",
        className
      )}
      role={variant === "unauthorized" ? "alert" : "status"}
    >
      <div className={cn("rounded-2xl p-3", config.iconBg)}>
        <Icon className={cn("h-8 w-8", config.iconClass)} aria-hidden />
      </div>
      <h2 className={cn(typography.sectionTitle, "mt-4")}>{title || config.title}</h2>
      <p className={cn(typography.pageSubtitle, "mt-2 max-w-md")}>
        {description || config.defaultDescription}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PortalLoadingScreen({ message = "Loading your workspace…" }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--pc-brand-primary)]" aria-hidden />
      <p className="mt-4 text-sm font-medium text-foreground">PrimeCare</p>
      <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

export function PortalAccessAction({ label, onClick, variant = "default" }) {
  return (
    <Button type="button" variant={variant} onClick={onClick}>
      {label}
    </Button>
  );
}

/** Compact route-level suspense fallback — matches enterprise loading pattern. */
export function PageLoadingFallback() {
  return <PortalLoadingScreen message="Loading page…" />;
}
