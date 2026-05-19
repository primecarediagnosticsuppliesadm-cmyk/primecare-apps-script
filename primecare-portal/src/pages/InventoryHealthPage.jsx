import { useEffect, useMemo, useState } from "react";
import { getInventoryHealthRead } from "@/api/primecareSupabaseApi";

function formatNumber(value, fallback = "-") {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toLocaleString("en-IN");
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function urgencyStyle(urgency) {
  const value = String(urgency || "").toLowerCase();
  if (value === "critical") return { background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" };
  if (value === "high") return { background: "#ffedd5", color: "#c2410c", borderColor: "#fed7aa" };
  if (value === "medium") return { background: "#fef3c7", color: "#a16207", borderColor: "#fde68a" };
  return { background: "#dcfce7", color: "#15803d", borderColor: "#bbf7d0" };
}

export default function InventoryHealthPage() {
  const [data, setData] = useState({ summary: {}, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");

  useEffect(() => {
    async function loadHealth() {
      try {
        setLoading(true);
        setError("");
        const res = await getInventoryHealthRead();
        if (!res?.success) {
          throw new Error(res?.error || "Failed to load inventory health");
        }
        setData(res.data || { summary: {}, rows: [] });
      } catch (err) {
        console.error(err);
        setError(err?.message || "Failed to load inventory health");
      } finally {
        setLoading(false);
      }
    }

    loadHealth();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.rows || []).filter((row) => {
      const matchesSearch =
        !q ||
        String(row.productId || "").toLowerCase().includes(q) ||
        String(row.productName || "").toLowerCase().includes(q) ||
        String(row.category || "").toLowerCase().includes(q);
      const matchesUrgency = !urgencyFilter || row.urgency === urgencyFilter;
      return matchesSearch && matchesUrgency;
    });
  }, [data.rows, search, urgencyFilter]);

  if (loading) return <div style={styles.notice}>Loading inventory health...</div>;
  if (error) return <div style={{ ...styles.notice, color: "#b91c1c" }}>{error}</div>;

  const summary = data.summary || {};

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Inventory Health Intelligence</h1>
          <p style={styles.subtitle}>Read-only operational intelligence from inventory and ledger movement data.</p>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <SummaryCard title="Critical SKUs" value={summary.criticalCount || 0} />
        <SummaryCard title="High Urgency" value={summary.highCount || 0} />
        <SummaryCard title="Fast Moving SKUs" value={summary.fastMovingCount || 0} />
        <SummaryCard title="Slow / Dead Stock" value={summary.slowOrDeadCount || 0} />
        <SummaryCard title="Inventory Value" value={formatCurrency(summary.totalInventoryValue || 0)} />
        <SummaryCard title="Movement Warnings" value={summary.unusualMovementWarnings || 0} />
      </div>

      <div style={styles.filters}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU / product / category"
          style={styles.input}
        />
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          style={styles.input}
        >
          <option value="">All urgency levels</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Urgency</Th>
              <Th>Current / Min</Th>
              <Th>Avg Daily Usage</Th>
              <Th>Projected Stockout</Th>
              <Th>Reorder Qty</Th>
              <Th>Inventory Value</Th>
              <Th>Movement Flags</Th>
              <Th>Warnings</Th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={styles.emptyCell}>No inventory health rows found.</td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.productId}>
                  <Td>
                    <div style={styles.productName}>{row.productName || "-"}</div>
                    <div style={styles.muted}>{row.productId || "-"}</div>
                  </Td>
                  <Td>
                    <span style={{ ...styles.badge, ...urgencyStyle(row.urgency) }}>{row.urgency}</span>
                  </Td>
                  <Td>
                    {formatNumber(row.currentStock)} / {formatNumber(row.minStock)}
                  </Td>
                  <Td>{formatNumber(row.avgDailyConsumption)}</Td>
                  <Td>
                    {row.projectedStockoutDays == null
                      ? "No recent usage"
                      : `${formatNumber(row.projectedStockoutDays)} days`}
                  </Td>
                  <Td>{formatNumber(row.recommendedReorderQty)}</Td>
                  <Td>{formatCurrency(row.inventoryValue)}</Td>
                  <Td>
                    {row.isFastMoving ? <div style={styles.flag}>Fast moving</div> : null}
                    {row.isSlowOrDeadStock ? <div style={styles.flagMuted}>No 30D ORDER_OUT</div> : null}
                  </Td>
                  <Td>
                    {(row.warningNotes || []).length ? (
                      <ul style={styles.warningList}>
                        {row.warningNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={styles.muted}>None</span>
                    )}
                  </Td>
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
    fontFamily: "Arial, sans-serif",
  },
  header: {
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
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
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
    fontSize: "20px",
    fontWeight: 700,
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
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
  },
  emptyCell: {
    padding: "24px",
    textAlign: "center",
    color: "#64748b",
  },
  productName: {
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  muted: {
    color: "#64748b",
    fontSize: "12px",
  },
  badge: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "12px",
    fontWeight: 700,
  },
  flag: {
    color: "#0369a1",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  flagMuted: {
    color: "#64748b",
    whiteSpace: "nowrap",
  },
  warningList: {
    margin: 0,
    paddingLeft: "18px",
    color: "#b45309",
  },
  notice: {
    padding: "20px",
    color: "#475569",
  },
};
