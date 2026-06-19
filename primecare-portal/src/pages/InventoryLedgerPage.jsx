import { Fragment, useEffect, useMemo, useState } from "react";
import { getInventoryLedgerRead } from "@/api/primecareSupabaseApi";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {string} type
 * @param {{ orderId?: string }} [row]
 */
function movementLabel(type, row = {}) {
  const t = str(type).toUpperCase();
  if (t === "PURCHASE_IN") return "Purchase Receipt";
  if (t === "ORDER_OUT") return "Order Fulfillment";
  if (t === "IN") {
    const ref = str(row.orderId);
    if (ref.startsWith("OPENING-")) return "Opening Stock";
    return "Inventory Adjustment";
  }
  if (t === "OUT") return "Stock Removal";
  return str(type) || "—";
}

function dateOnly(value) {
  return str(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return str(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSignedQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function quantityColor(value) {
  const n = Number(value);
  if (n > 0) return "#15803d";
  if (n < 0) return "#b91c1c";
  return "#475569";
}

function formatReference(row) {
  const orderId = str(row.orderId);
  if (orderId) return orderId;
  const refId = str(row.referenceId);
  if (refId) return refId;
  const refType = str(row.referenceType);
  if (refType) return refType;
  return "—";
}

function formatSource(row) {
  const orderId = str(row.orderId);
  if (orderId) return orderId;
  const parts = [row.referenceType, row.referenceId].map(str).filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export default function InventoryLedgerPage() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedKey, setExpandedKey] = useState(null);
  const [filters, setFilters] = useState({
    product: "",
    movementType: "",
    startDate: "",
    endDate: "",
    source: "",
  });

  useEffect(() => {
    async function loadLedger() {
      try {
        setLoading(true);
        setError("");
        const res = await getInventoryLedgerRead();
        if (!res?.success) {
          throw new Error(res?.error || "Failed to load inventory ledger");
        }
        setMovements(Array.isArray(res?.data?.movements) ? res.data.movements : []);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Failed to load inventory movements");
      } finally {
        setLoading(false);
      }
    }

    loadLedger();
  }, []);

  const movementTypes = useMemo(() => {
    return Array.from(new Set(movements.map((m) => m.movementType).filter(Boolean))).sort();
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const product = filters.product.trim().toLowerCase();
    const source = filters.source.trim().toLowerCase();
    return movements.filter((m) => {
      const matchesProduct =
        !product ||
        str(m.productId).toLowerCase().includes(product) ||
        str(m.productName).toLowerCase().includes(product);
      const matchesType = !filters.movementType || m.movementType === filters.movementType;
      const movementDate = dateOnly(m.createdAt);
      const matchesStart = !filters.startDate || movementDate >= filters.startDate;
      const matchesEnd = !filters.endDate || movementDate <= filters.endDate;
      const sourceText = [m.orderId, m.referenceType, m.referenceId].join(" ").toLowerCase();
      const matchesSource = !source || sourceText.includes(source);
      return matchesProduct && matchesType && matchesStart && matchesEnd && matchesSource;
    });
  }, [movements, filters]);

  const summary = useMemo(() => {
    const bySku = new Map();
    let inward = 0;
    let outward = 0;

    for (const row of filteredMovements) {
      if (row.signedQuantity > 0) inward += row.signedQuantity;
      if (row.signedQuantity < 0) outward += Math.abs(row.signedQuantity);
      const sku = row.productId || "—";
      bySku.set(sku, (bySku.get(sku) || 0) + 1);
    }

    let mostActiveSku = "—";
    let maxCount = 0;
    for (const [sku, count] of bySku.entries()) {
      if (count > maxCount) {
        mostActiveSku = sku;
        maxCount = count;
      }
    }

    return {
      totalMovements: filteredMovements.length,
      totalStockInward: inward,
      totalStockOutward: outward,
      mostActiveSku,
    };
  }, [filteredMovements]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  function rowKey(row, idx) {
    return row.id || `${row.productId}-${row.createdAt}-${idx}`;
  }

  function toggleExpanded(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  if (loading) {
    return <div style={styles.notice}>Loading inventory movements...</div>;
  }

  if (error) {
    return <div style={{ ...styles.notice, color: "#b91c1c" }}>{error}</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Inventory Movements</h1>
          <p style={styles.subtitle}>Stock in and out for your tenant — what changed, when, and why.</p>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <SummaryCard title="Movements" value={summary.totalMovements} />
        <SummaryCard title="Stock added" value={`+${summary.totalStockInward}`} valueColor="#15803d" />
        <SummaryCard title="Stock removed" value={`-${summary.totalStockOutward}`} valueColor="#b91c1c" />
        <SummaryCard title="Most active SKU" value={summary.mostActiveSku} />
      </div>

      <div style={styles.filters}>
        <input
          value={filters.product}
          onChange={(e) => setFilter("product", e.target.value)}
          placeholder="Search product or SKU"
          style={styles.input}
        />
        <select
          value={filters.movementType}
          onChange={(e) => setFilter("movementType", e.target.value)}
          style={styles.input}
        >
          <option value="">All movement types</option>
          {movementTypes.map((type) => (
            <option key={type} value={type}>
              {movementLabel(type)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilter("startDate", e.target.value)}
          style={styles.input}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilter("endDate", e.target.value)}
          style={styles.input}
          aria-label="To date"
        />
        <input
          value={filters.source}
          onChange={(e) => setFilter("source", e.target.value)}
          placeholder="Reference / PO / order"
          style={styles.input}
        />
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Th style={styles.thExpand} />
              <Th>Date</Th>
              <Th>Product</Th>
              <Th>Movement type</Th>
              <Th align="right">Quantity</Th>
              <Th>Reference</Th>
              <Th>User</Th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.length === 0 ? (
              <tr>
                <td colSpan={7} style={styles.emptyCell}>
                  No inventory movements found.
                </td>
              </tr>
            ) : (
              filteredMovements.map((row, idx) => {
                const key = rowKey(row, idx);
                const isExpanded = expandedKey === key;
                return (
                  <Fragment key={key}>
                    <tr
                      style={styles.dataRow}
                      onClick={() => toggleExpanded(key)}
                    >
                      <Td style={styles.tdExpand}>
                        <button
                          type="button"
                          style={styles.expandBtn}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Hide details" : "Show details"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(key);
                          }}
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </Td>
                      <Td>{formatDate(row.createdAt)}</Td>
                      <Td>
                        <div style={styles.productName}>{row.productName || "—"}</div>
                      </Td>
                      <Td>
                        <span style={styles.movementPill}>
                          {movementLabel(row.movementType, row)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          style={{
                            ...styles.qty,
                            color: quantityColor(row.signedQuantity),
                          }}
                        >
                          {formatSignedQuantity(row.signedQuantity)}
                        </span>
                      </Td>
                      <Td>{formatReference(row)}</Td>
                      <Td>{row.createdBy || "—"}</Td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${key}-detail`} style={styles.detailRow}>
                        <td colSpan={7} style={styles.detailCell}>
                          <div style={styles.detailGrid}>
                            <DetailItem label="Stock before" value={row.stockBefore} />
                            <DetailItem label="Stock after" value={row.stockAfter} />
                            <DetailItem label="Source" value={formatSource(row)} />
                            <DetailItem label="SKU" value={row.productId || "—"} mono />
                            <DetailItem label="Movement code" value={row.movementType || "—"} mono />
                            <DetailItem label="Ledger ID" value={row.id || "—"} mono />
                            {row.referenceType ? (
                              <DetailItem label="Reference type" value={row.referenceType} mono />
                            ) : null}
                            {row.referenceId ? (
                              <DetailItem label="Reference ID" value={row.referenceId} mono />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, valueColor }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryTitle}>{title}</div>
      <div style={{ ...styles.summaryValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</div>
    </div>
  );
}

function DetailItem({ label, value, mono = false }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={mono ? styles.detailValueMono : styles.detailValue}>{value}</div>
    </div>
  );
}

function Th({ children, align, style }) {
  return (
    <th style={{ ...styles.th, ...(align === "right" ? styles.thRight : {}), ...style }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }) {
  return (
    <td style={{ ...styles.td, ...(align === "right" ? styles.tdRight : {}), ...style }}>
      {children}
    </td>
  );
}

const styles = {
  page: {
    padding: "20px",
    fontFamily: "Arial, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh",
  },
  header: {
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 700,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },
  summaryCard: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  summaryTitle: {
    fontSize: "11px",
    color: "#64748b",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  summaryValue: {
    fontSize: "20px",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "10px",
    marginBottom: "16px",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    background: "white",
  },
  tableWrap: {
    overflowX: "auto",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
  },
  table: {
    width: "100%",
    minWidth: "680px",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    color: "#64748b",
    background: "#f8fafc",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  },
  thRight: {
    textAlign: "right",
  },
  thExpand: {
    width: "36px",
    padding: "10px 8px",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  },
  tdRight: {
    textAlign: "right",
  },
  tdExpand: {
    width: "36px",
    padding: "10px 8px",
  },
  dataRow: {
    cursor: "pointer",
  },
  emptyCell: {
    padding: "24px",
    textAlign: "center",
    color: "#64748b",
  },
  expandBtn: {
    width: "24px",
    height: "24px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "white",
    color: "#475569",
    fontSize: "14px",
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
  productName: {
    fontWeight: 600,
    color: "#0f172a",
  },
  movementPill: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "12px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  qty: {
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    fontSize: "14px",
  },
  detailRow: {
    background: "#f8fafc",
  },
  detailCell: {
    padding: "10px 12px 14px 44px",
    borderBottom: "1px solid #e2e8f0",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px 16px",
  },
  detailItem: {
    minWidth: 0,
  },
  detailLabel: {
    fontSize: "10px",
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "2px",
  },
  detailValue: {
    fontSize: "13px",
    color: "#334155",
    wordBreak: "break-word",
  },
  detailValueMono: {
    fontSize: "12px",
    color: "#475569",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    wordBreak: "break-all",
  },
  notice: {
    padding: "20px",
    color: "#475569",
  },
};
