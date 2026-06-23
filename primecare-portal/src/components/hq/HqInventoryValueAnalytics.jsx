import React from "react";
import { buildInventoryValueAnalytics } from "@/inventory/inventoryValueAnalyticsEngine.js";

const cardStyle = {
  flex: "1 1 140px",
  minWidth: 130,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "12px 14px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#64748b",
  marginBottom: 4,
};

const valueStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a",
  lineHeight: 1.2,
};

const subStyle = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 4,
};

const warnValueStyle = {
  ...valueStyle,
  fontSize: 14,
  color: "#b45309",
};

/**
 * Inventory value analytics strip for HQ Stock tab.
 */
export default function HqInventoryValueAnalytics({
  model,
  healthRows = [],
  tenantFilter = "all",
  homeTenantId = "",
  loading = false,
}) {
  const analytics = buildInventoryValueAnalytics(model, healthRows, {
    tenantFilter,
    homeTenantId,
  });

  if (loading) {
    return (
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#64748b", padding: "8px 0" }}>
          Loading value analytics…
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
        Value analytics use unit cost from inventory records. When cost is missing, amounts show
        &quot;Not enough cost data&quot; instead of estimates.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Total inventory value</div>
          <div style={analytics.hasCostData ? valueStyle : warnValueStyle}>
            {analytics.totalInventoryValueLabel}
          </div>
          <div style={subStyle}>{analytics.skuCount} SKU records in scope</div>
        </div>

        <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fff7f7" }}>
          <div style={{ ...labelStyle, color: "#b91c1c" }}>Critical stock at risk</div>
          <div style={analytics.hasCostData ? valueStyle : warnValueStyle}>
            {analytics.criticalValueAtRiskLabel}
          </div>
          <div style={subStyle}>
            {analytics.lowStockSkuCount > 0
              ? `${analytics.lowStockSkuCount} below minimum`
              : "No low-stock SKUs in scope"}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Dead / slow stock</div>
          <div style={analytics.hasCostData ? valueStyle : warnValueStyle}>
            {analytics.hasCostData
              ? `${analytics.slowMovingValueLabel} slow · ${analytics.deadStockValueLabel} dead`
              : analytics.slowMovingValueLabel}
          </div>
          <div style={subStyle}>
            {analytics.deadSlowDerivable
              ? "Derived from ledger movement age"
              : "Movement history needed for classification"}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Stockout risk</div>
          <div style={valueStyle}>{analytics.stockoutRiskLabel}</div>
          <div style={subStyle}>Critical urgency or ≤7 days projected</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Reorder forecast</div>
          <div style={valueStyle}>{analytics.reorderForecastLabel}</div>
          <div style={subStyle}>
            {analytics.hasCostData
              ? `Exposure: ${analytics.reorderExposureLabel}`
              : "Days-left from 30-day consumption"}
          </div>
        </div>
      </div>
    </div>
  );
}
