/**
 * RC2 — Enterprise layout class tokens (UI only; no business logic).
 * Use these instead of ad-hoc spacing in module pages.
 */
import { cn } from "@/lib/utils";

export const enterpriseLayout = {
  page: "space-y-3 p-3 sm:p-4",
  pageDense: "space-y-2 p-3 sm:p-4",
  section: "rounded-xl border border-border bg-card p-3 shadow-[var(--pc-shadow-card)]",
  sectionDense: "rounded-xl border border-border bg-card p-3 shadow-sm",
  sectionHeader: "mb-2 flex flex-wrap items-start justify-between gap-2",
  gridKpi: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  gridKpi4: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4",
  gridTwoCol: "grid gap-3 xl:grid-cols-2",
  stickyToolbar:
    "sticky top-0 z-20 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90",
  tableWrap: "overflow-x-auto rounded-xl border border-border bg-card shadow-sm",
  tableHead:
    "sticky top-0 z-10 border-b border-border bg-[var(--pc-neutral-bg)] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
  tableRow: "border-b border-border/60 last:border-0 transition-colors hover:bg-muted/40",
  tableCell: "px-2.5 py-2 text-xs text-foreground",
  tableCellHead: "px-2.5 py-2",
  drawerHeader: "flex items-center justify-between gap-2 border-b border-border px-3 py-2.5",
  drawerBody: "min-h-0 flex-1 space-y-3 overflow-y-auto p-3",
  fieldLabel: "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
  fieldValue: "text-sm text-foreground",
  chip: "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
};

export function enterprisePageClass(dense = true) {
  return dense ? enterpriseLayout.pageDense : enterpriseLayout.page;
}

export function enterpriseSectionClass(dense = true, className) {
  return cn(dense ? enterpriseLayout.sectionDense : enterpriseLayout.section, className);
}
