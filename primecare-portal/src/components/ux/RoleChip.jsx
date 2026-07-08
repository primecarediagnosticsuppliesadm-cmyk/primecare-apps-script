import React from "react";
import { cn } from "@/lib/utils";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

const ROLE_STYLES = {
  executive: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  admin: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  agent: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  lab: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  hr: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
  default: "border-border bg-muted/50 text-muted-foreground",
};

export default function RoleChip({ role = "", className }) {
  const key = String(role || "").toLowerCase();
  const style = ROLE_STYLES[key] || ROLE_STYLES.default;
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : "—";

  return (
    <span className={cn(enterpriseLayout.chip, style, className)}>{label}</span>
  );
}
