import { useEffect, useMemo, useState } from "react";
import { getStockDashboard } from "../api/primecareSupabaseApi";
import { fetchDatabaseTenants } from "@/tenant/durableTenantStore.js";
import InventoryLedgerPage from "./InventoryLedgerPage";
import InventoryHealthPage from "./InventoryHealthPage";

function str(v) {
  return String(v ?? "").trim();
}

function normalizeProductId(productId) {
  return str(productId).toUpperCase();
}

function countUniqueSkus(rows) {
  const ids = new Set();
  for (const item of rows || []) {
    const key = normalizeProductId(item.productId);
    if (key) ids.add(key);
  }
  return ids.size;
}

function countHealthBuckets(rows) {
  let criticalItems = 0;
  let reorderItems = 0;
  for (const item of rows || []) {
    const health = str(item.stockHealth);
    if (health === "Critical") criticalItems += 1;
    else if (health === "Reorder") reorderItems += 1;
  }
  return { criticalItems, reorderItems };
}

/**
 * @param {string} tenantId
 * @param {Map<string, string>} tenantNameById
 * @param {string} homeTenantId
 */
function resolveTenantLabel(tenantId, tenantNameById, homeTenantId) {
  const id = str(tenantId);
  if (!id) return "Tenant: unknown";
  const name = tenantNameById.get(id);
  if (name) return `Tenant: ${name}`;
  if (homeTenantId && id === homeTenantId) return "Tenant: HQ";
  return `Tenant: ${id}`;
}

export default function StockPage({ currentUser = null }) {
  const [activeTab, setActiveTab] = useState("stock");
  const [data, setData] = useState({ stats: {}, inventory: [] });
  const [tenantNameById, setTenantNameById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");

  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  useEffect(() => {
    async function loadStock() {
      try {
        const [res, tenantsRes] = await Promise.all([
          getStockDashboard(),
          fetchDatabaseTenants(),
        ]);

        if (!res.success) {
          throw new Error(res.error || "Failed to load stock");
        }

        const rows = res.data?.inventory ?? [];
        console.log("SUPABASE STOCK:", rows);

        const nameMap = new Map();
        for (const tenant of tenantsRes.rows || []) {
          const id = str(tenant.id);
          const name = str(tenant.tenant_name || tenant.tenantName);
          if (id && name) nameMap.set(id, name);
        }
        setTenantNameById(nameMap);
        setData(res.data || { stats: {}, inventory: [] });
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadStock();
  }, []);

  const tenantFilterOptions = useMemo(() => {
    const options = [{ value: "all", label: "All tenants" }];
    if (homeTenantId) {
      const hqName = tenantNameById.get(homeTenantId);
      options.push({
        value: "hq",
        label: hqName ? `HQ only (${hqName})` : "HQ only",
      });
    }

    const seen = new Set();
    for (const item of data.inventory || []) {
      const id = str(item.tenantId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (homeTenantId && id === homeTenantId) continue;
      const name = tenantNameById.get(id);
      options.push({
        value: id,
        label: name || `Distributor ${id.slice(0, 8)}…`,
      });
    }

    return options;
  }, [data.inventory, homeTenantId, tenantNameById]);

  const tenantFilteredRows = useMemo(() => {
    const rows = data.inventory || [];
    if (tenantFilter === "all") return rows;
    if (tenantFilter === "hq") {
      return homeTenantId
        ? rows.filter((item) => str(item.tenantId) === homeTenantId)
        : rows;
    }
    return rows.filter((item) => str(item.tenantId) === tenantFilter);
  }, [data.inventory, tenantFilter, homeTenantId]);

  const portfolioStats = useMemo(() => {
    const { criticalItems, reorderItems } = countHealthBuckets(tenantFilteredRows);
    return {
      inventoryRecords: tenantFilteredRows.length,
      uniqueSkus: countUniqueSkus(tenantFilteredRows),
      criticalItems,
      reorderItems,
    };
  }, [tenantFilteredRows]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tenantFilteredRows;

    return tenantFilteredRows.filter((item) => {
      const tenantLabel = resolveTenantLabel(item.tenantId, tenantNameById, homeTenantId).toLowerCase();
      return (
        (item.productName || "").toLowerCase().includes(q) ||
        (item.productId || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q) ||
        tenantLabel.includes(q)
      );
    });
  }, [tenantFilteredRows, search, tenantNameById, homeTenantId]);

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
          <div style={styles.portfolioNote}>
            Portfolio inventory: each card is one stock record per tenant. The same SKU may
            appear under HQ and distributor tenants with separate on-hand quantities.
          </div>

          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Inventory Records</div>
              <div style={styles.statValue}>{portfolioStats.inventoryRecords}</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Unique SKUs</div>
              <div style={styles.statValue}>{portfolioStats.uniqueSkus}</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Critical</div>
              <div style={styles.statValue}>{portfolioStats.criticalItems}</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Reorder</div>
              <div style={styles.statValue}>{portfolioStats.reorderItems}</div>
            </div>
          </div>

          <div style={styles.filterRow}>
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              style={styles.tenantFilter}
              aria-label="Filter inventory by tenant"
            >
              {tenantFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search by product, ID, category, tenant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.search}
            />
          </div>

          <div style={styles.list}>
            {filteredRows.length === 0 ? (
              <div style={styles.card}>No stock items found.</div>
            ) : (
              filteredRows.map((item) => (
                <div
                  key={`${item.tenantId || "tenant"}-${item.productId}`}
                  style={styles.card}
                >
                  <div style={styles.itemTitle}>{item.productName || "-"}</div>
                  <div style={styles.tenantBadge}>
                    {resolveTenantLabel(item.tenantId, tenantNameById, homeTenantId)}
                  </div>
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
  portfolioNote: {
    marginBottom: "16px",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1e3a8a",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
  filterRow: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
    gap: "12px",
    marginBottom: "16px",
  },
  tenantFilter: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    background: "white",
  },
  search: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
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
  tenantBadge: {
    display: "inline-block",
    marginBottom: "8px",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "11px",
    fontWeight: "600",
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
