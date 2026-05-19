import { useEffect, useMemo, useState } from "react";
import { getInventoryLedgerRead } from "@/api/primecareSupabaseApi";

const SOURCE_LABELS = {
  ORDER_OUT: "Lab Order Fulfillment",
  PURCHASE_IN: "Purchase Receipt",
  OUT: "Manual Out",
  IN: "Manual In",
};

function movementLabel(type) {
  return SOURCE_LABELS[String(type || "").toUpperCase()] || String(type || "-");
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signedQtyClass(value) {
  if (Number(value) < 0) return "#b91c1c";
  if (Number(value) > 0) return "#15803d";
  return "#334155";
}

export default function InventoryLedgerPage() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    product: "",
    movementType: "",
    startDate: "",
    endDate: "",
    source: "",
  });

  useEffect(() => {
    console.log("INVENTORY LEDGER MOUNTED");

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
    const rows = movements.filter((m) => {
      const matchesProduct =
        !product ||
        String(m.productId || "").toLowerCase().includes(product) ||
        String(m.productName || "").toLowerCase().includes(product);
      const matchesType = !filters.movementType || m.movementType === filters.movementType;
      const movementDate = dateOnly(m.createdAt);
      const matchesStart = !filters.startDate || movementDate >= filters.startDate;
      const matchesEnd = !filters.endDate || movementDate <= filters.endDate;
      const sourceText = [
        m.orderId,
        m.referenceType,
        m.referenceId,
      ].join(" ").toLowerCase();
      const matchesSource = !source || sourceText.includes(source);
      return matchesProduct && matchesType && matchesStart && matchesEnd && matchesSource;
    });

    console.log("INVENTORY LEDGER FILTERED", {
      filters,
      count: rows.length,
      rows,
    });
    return rows;
  }, [movements, filters]);

  const summary = useMemo(() => {
    const bySku = new Map();
    let inward = 0;
    let outward = 0;

    for (const row of filteredMovements) {
      if (row.signedQuantity > 0) inward += row.signedQuantity;
      if (row.signedQuantity < 0) outward += Math.abs(row.signedQuantity);
      const sku = row.productId || "-";
      bySku.set(sku, (bySku.get(sku) || 0) + 1);
    }

    let mostActiveSku = "-";
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
          <p style={styles.subtitle}>Read-only stock ledger visibility from Supabase.</p>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <SummaryCard title="Total Movements" value={summary.totalMovements} />
        <SummaryCard title="Total Stock Inward" value={summary.totalStockInward} />
        <SummaryCard title="Total Stock Outward" value={summary.totalStockOutward} />
        <SummaryCard title="Most Active SKU" value={summary.mostActiveSku} />
      </div>

      <div style={styles.filters}>
        <input
          value={filters.product}
          onChange={(e) => setFilter("product", e.target.value)}
          placeholder="Filter product / SKU"
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
              {type}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilter("startDate", e.target.value)}
          style={styles.input}
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilter("endDate", e.target.value)}
          style={styles.input}
        />
        <input
          value={filters.source}
          onChange={(e) => setFilter("source", e.target.value)}
          placeholder="Source transaction / reference"
          style={styles.input}
        />
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Th>Created</Th>
              <Th>Product</Th>
              <Th>Movement</Th>
              <Th>Signed Qty</Th>
              <Th>Source</Th>
              <Th>Reference</Th>
              <Th>Created By</Th>
              <Th>Stock Before</Th>
              <Th>Stock After</Th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.length === 0 ? (
              <tr>
                <td colSpan={9} style={styles.emptyCell}>
                  No inventory movements found.
                </td>
              </tr>
            ) : (
              filteredMovements.map((row, idx) => (
                <tr key={row.id || `${row.productId}-${row.createdAt}-${idx}`}>
                  <Td>{formatDateTime(row.createdAt)}</Td>
                  <Td>
                    <div style={styles.productName}>{row.productName || "-"}</div>
                    <div style={styles.muted}>{row.productId || "-"}</div>
                  </Td>
                  <Td>
                    <div style={styles.badge}>{row.movementType || "-"}</div>
                    <div style={styles.muted}>{movementLabel(row.movementType)}</div>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 700, color: signedQtyClass(row.signedQuantity) }}>
                      {row.signedQuantity > 0 ? "+" : ""}
                      {row.signedQuantity}
                    </span>
                  </Td>
                  <Td>{row.orderId || "-"}</Td>
                  <Td>
                    <div>{row.referenceType || "-"}</div>
                    <div style={styles.muted}>{row.referenceId || "-"}</div>
                  </Td>
                  <Td>{row.createdBy || "-"}</Td>
                  <Td>{row.stockBefore}</Td>
                  <Td>{row.stockAfter}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryTitle}>{title}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={styles.th}>{children}</th>;
}

function Td({ children }) {
  return <td style={styles.td}>{children}</td>;
}

const styles = {
  page: {
    padding: "20px",
    fontFamily: "Arial, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "24px",
    fontWeight: 700,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "14px",
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
    borderRadius: "14px",
    padding: "16px",
  },
  summaryTitle: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "8px",
  },
  summaryValue: {
    fontSize: "22px",
    fontWeight: 700,
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "16px",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    background: "white",
  },
  tableWrap: {
    overflowX: "auto",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "12px",
    borderBottom: "1px solid #e2e8f0",
    color: "#475569",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  emptyCell: {
    padding: "24px",
    textAlign: "center",
    color: "#64748b",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    fontWeight: 700,
  },
  productName: {
    fontWeight: 700,
  },
  muted: {
    color: "#64748b",
    fontSize: "12px",
    marginTop: "2px",
  },
  notice: {
    padding: "20px",
    color: "#475569",
  },
};
