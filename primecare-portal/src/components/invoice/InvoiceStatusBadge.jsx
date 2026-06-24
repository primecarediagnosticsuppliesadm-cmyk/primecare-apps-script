import React from "react";
import { StatusBadge } from "@/components/ux";

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function statusVariant(status) {
  const key = normalizeStatus(status);
  if (key === "paid") return "success";
  if (key === "overdue") return "danger";
  if (key === "partially_paid" || key === "partial") return "warning";
  if (key === "sent") return "warning";
  if (key === "draft") return "neutral";
  if (key === "cancelled" || key === "failed") return "danger";
  return "neutral";
}

function statusLabel(status) {
  const key = normalizeStatus(status);
  if (!key) return "—";
  if (key === "overdue") return "Overdue";
  if (key === "partially_paid") return "Partially paid";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function InvoiceStatusBadge({ status, displayStatus, compact = true }) {
  const resolved = normalizeStatus(displayStatus || status);
  return (
    <StatusBadge variant={statusVariant(resolved)} compact={compact}>
      {statusLabel(resolved)}
    </StatusBadge>
  );
}
