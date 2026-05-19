import { useEffect, useState } from "react";
import { getStockDashboard } from "../api/primecareSupabaseApi";
import InventoryLedgerPage from "./InventoryLedgerPage";
import InventoryHealthPage from "./InventoryHealthPage";

export default function StockPage() {
  const [activeTab, setActiveTab] = useState("stock");
  const [data, setData] = useState({ stats: {}, inventory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadStock() {
      try {
        const res = await getStockDashboard();

        if (!res.success) {
          throw new Error(res.error || "Failed to load stock");
        }

        const rows = res.data?.inventory ?? [];
        console.log("SUPABASE STOCK:", rows);

        setData(res.data || { stats: {}, inventory: [] });
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadStock();
  }, []);

  const filteredRows = (data.inventory || []).filter((item) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    return (
      (item.productName || "").toLowerCase().includes(q) ||
      (item.productId || "").toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q)
    );
  });

  const switchTab = (nextTab) => {
    console.log("INVENTORY PAGE TAB SWITCH", {
      from: activeTab,
      to: nextTab,
    });
    setActiveTab(nextTab);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Stock Dashboard</h1>
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => switchTab("stock")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "stock" ? styles.activeTabButton : {}),
            }}
          >
            Stock
          </button>
          <button
            type="button"
            onClick={() => switchTab("ledger")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "ledger" ? styles.activeTabButton : {}),
            }}
          >
            Movements
          </button>
          <button
            type="button"
            onClick={() => switchTab("health")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "health" ? styles.activeTabButton : {}),
            }}
          >
            Health
          </button>
        </div>
      </div>

      {activeTab === "health" ? (
        <InventoryHealthPage />
      ) : activeTab === "ledger" ? (
        <InventoryLedgerPage />
      ) : loading ? (
        <h2 style={{ padding: "20px" }}>Loading stock...</h2>
      ) : error ? (
        <h2 style={{ padding: "20px", color: "red" }}>{error}</h2>
      ) : (
        <>

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total SKUs</div>
          <div style={styles.statValue}>{data.stats?.totalSkus || 0}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Critical</div>
          <div style={styles.statValue}>{data.stats?.criticalItems || 0}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Reorder</div>
          <div style={styles.statValue}>{data.stats?.reorderItems || 0}</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by product, ID, category..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.search}
      />

      <div style={styles.list}>
        {filteredRows.length === 0 ? (
          <div style={styles.card}>No stock items found.</div>
        ) : (
          filteredRows.map((item, idx) => (
            <div key={idx} style={styles.card}>
              <div style={styles.itemTitle}>{item.productName || "-"}</div>
              <div style={styles.itemMeta}>
                {item.productId || "-"} {item.category ? `• ${item.category}` : ""}
              </div>

              <div style={styles.grid}>
                <div>
                  Current Stock
                  <div style={styles.metricValue}>{item.currentStock || 0}</div>
                </div>

                <div>
                  Min Stock
                  <div style={styles.metricValue}>{item.minStock || 0}</div>
                </div>

                <div>
                  Reorder Qty
                  <div style={styles.metricValue}>{item.reorderQty || 0}</div>
                </div>

                <div>
                  Health
                  <div style={styles.metricValue}>{item.stockHealth || "-"}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: "20px",
    fontFamily: "Arial, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh",
  },
  title: {
    margin: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
  },
  tabs: {
    display: "flex",
    gap: "8px",
  },
  tabButton: {
    border: "1px solid #cbd5e1",
    background: "white",
    borderRadius: "12px",
    padding: "10px 14px",
    fontSize: "14px",
    cursor: "pointer",
  },
  activeTabButton: {
    background: "#0f172a",
    color: "white",
    borderColor: "#0f172a",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },
  statCard: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "16px",
  },
  statLabel: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "8px",
  },
  statValue: {
    fontSize: "24px",
    fontWeight: "700",
  },
  search: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    marginBottom: "16px",
    fontSize: "14px",
  },
  list: {
    display: "grid",
    gap: "12px",
  },
  card: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  itemTitle: {
    fontSize: "18px",
    fontWeight: "700",
    marginBottom: "4px",
  },
  itemMeta: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "12px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  metricValue: {
    marginTop: "4px",
    fontWeight: "700",
    fontSize: "18px",
  },
};