/**
 * PrimeCare design tokens — single source for theme values used in JS and CSS.
 * Tailwind utilities are wired via CSS variables in index.css (@theme inline).
 */

/** @typedef {'success' | 'warning' | 'danger' | 'info' | 'neutral'} SemanticVariant */

export const SEMANTIC_VARIANTS = /** @type {const} */ ([
  "success",
  "warning",
  "danger",
  "info",
  "neutral",
]);

export const colors = {
  brandPrimary: "#0f766e",
  brandPrimaryHover: "#0d9488",
  brandPrimaryForeground: "#f0fdfa",
  brandSecondary: "#4f46e5",
  brandSecondaryHover: "#6366f1",
  brandSecondaryForeground: "#eef2ff",
  surface: "#f8fafc",
  surfaceElevated: "#ffffff",
  foreground: "#0f172a",
  mutedForeground: "#64748b",
  border: "#e2e8f0",
  success: "#047857",
  successBg: "#ecfdf5",
  successBorder: "#a7f3d0",
  warning: "#b45309",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  dangerBorder: "#fecaca",
  info: "#1d4ed8",
  infoBg: "#eff6ff",
  infoBorder: "#bfdbfe",
  neutral: "#475569",
  neutralBg: "#f1f5f9",
  neutralBorder: "#cbd5e1",
};

export const spacing = {
  pageX: "1rem",
  pageXMd: "1.5rem",
  sectionY: "1.5rem",
  cardPadding: "1rem",
  cardPaddingMd: "1.25rem",
  touchMin: "2.75rem",
};

export const shadows = {
  card: "0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
  cardHover: "0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
  toast: "0 10px 15px -3px rgb(15 23 42 / 0.12), 0 4px 6px -4px rgb(15 23 42 / 0.08)",
};

export const radius = {
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.25rem",
  full: "9999px",
};

export const typography = {
  pageTitle: "text-xl font-semibold tracking-tight text-foreground",
  pageSubtitle: "text-sm text-muted-foreground",
  sectionTitle: "text-lg font-semibold text-foreground",
  sectionSubtitle: "text-sm text-muted-foreground",
  kpiLabel: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  kpiValue: "text-2xl font-semibold text-foreground",
  kpiSubtitle: "text-xs text-muted-foreground",
  body: "text-sm text-foreground",
  caption: "text-xs text-muted-foreground",
};

/** Toast auto-dismiss (ms) */
export const TOAST_DURATION_MS = 4500;
