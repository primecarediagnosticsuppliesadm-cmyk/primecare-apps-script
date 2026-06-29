import React from "react";
import { StatusBadge } from "@/components/ux";

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function statusVariant(status) {
  const key = normalizeStatus(status);
  if (key === "credit hold") return "danger";
  if (key === "paid") return "success";
  if (key === "overdue") return "danger";
  if (key === "partially paid" || key === "partially_paid" || key === "partial") return "warning";
  if (key === "sent" || key === "open" || key === "outstanding" || key === "unpaid") return "info";
  if (key === "draft") return "neutral";
  if (key === "cancelled" || key === "failed") return "danger";
  return "neutral";
}

function statusLabel(status) {
  const key = normalizeStatus(status);
  if (!key) return "—";
  if (key === "partially_paid") return "Partially paid";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function InvoiceStatusBadge({ status, displayStatus, compact = true }) {
  const resolved = normalizeStatus(displayStatus || status);
  const isCreditHold = resolved === "credit hold";
  return (
    <StatusBadge
      variant={statusVariant(resolved)}
      compact={compact}
      className={isCreditHold ? "border-red-900 bg-red-950 text-red-50" : undefined}
    >
      {statusLabel(resolved)}
    </StatusBadge>
  );
}
