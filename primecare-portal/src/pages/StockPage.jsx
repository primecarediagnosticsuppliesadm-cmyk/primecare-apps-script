import { useEffect, useMemo, useState } from "react";
import { getStockDashboard } from "../api/primecareSupabaseApi";
import { fetchDatabaseTenants } from "@/tenant/durableTenantStore.js";
import InventoryLedgerPage from "./InventoryLedgerPage";
import InventoryHealthPage from "./InventoryHealthPage";
import PageSkeleton from "@/components/ux/PageSkeleton";
import HqInventoryValueAnalytics from "@/components/hq/HqInventoryValueAnalytics.jsx";
import {
  distributorNamesFromRegistry,
  loadInventoryEconomicsBundle,
} from "@/inventory/inventoryEconomicsData.js";

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

function resolveTenantShortName(tenantId, tenantNameById, homeTenantId) {
  const id = str(tenantId);
  if (!id) return "Unknown";
  const name = tenantNameById.get(id);
  if (name) return name;
  if (homeTenantId && id === homeTenantId) return "HQ";
  return id.slice(0, 8) + "…";
}

function normalizeStockHealth(health) {
  const value = str(health);
  if (value === "Critical") return "Critical";
  if (value === "Reorder") return "Reorder";
  if (value === "Healthy") return "Healthy";
  return value || "—";
}

function healthBadgeStyle(health) {
  const normalized = normalizeStockHealth(health);
  if (normalized === "Critical") {
    return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
  }
  if (normalized === "Reorder") {
    return { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
  }
  if (normalized === "Healthy") {
    return { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" };
  }
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function HealthBadge({ health }) {
  const label = normalizeStockHealth(health);
  return (
    <span style={{ ...styles.healthBadge, ...healthBadgeStyle(health) }}>{label}</span>
  );
}

export default function StockPage({ currentUser = null }) {
  const [activeTab, setActiveTab] = useState("stock");
  const [data, setData] = useState({ stats: {}, inventory: [] });
  const [tenantNameById, setTenantNameById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("hq");
  const [economicsBundle, setEconomicsBundle] = useState(null);
  const [economicsLoading, setEconomicsLoading] = useState(false);

  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  useEffect(() => {
    if (activeTab !== "stock") return;
    let cancelled = false;

    async function loadEconomics() {
      setEconomicsLoading(true);
      try {
        const tenantsRes = await fetchDatabaseTenants().catch(() => ({ rows: [] }));
        const distributorNames = distributorNamesFromRegistry(tenantsRes.rows || []);
        const bundle = await loadInventoryEconomicsBundle({ distributorNames });
        if (!cancelled) setEconomicsBundle(bundle);
      } catch {
        if (!cancelled) setEconomicsBundle(null);
      } finally {
        if (!cancelled) setEconomicsLoading(false);
      }
    }

    void loadEconomics();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

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
    const options = [];
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

    options.push({ value: "all", label: "All tenants" });
    return options;
  }, [data.inventory, homeTenantId, tenantNameById]);

  const showPortfolioView = tenantFilter === "all";

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
        <PageSkeleton kpiCount={4} kpiColumns={4} listRows={8} className="p-4" />
      ) : error ? (
        <h2 style={{ padding: "20px", color: "red" }}>{error}</h2>
      ) : (
        <>
          {showPortfolioView ? (
            <div style={styles.portfolioNote}>
              Portfolio inventory: each row is one stock record per tenant. The same SKU may
              appear under HQ and distributor tenants with separate on-hand quantities.
            </div>
          ) : null}

          <HqInventoryValueAnalytics
            model={economicsBundle?.model}
            healthRows={economicsBundle?.inventoryRows || []}
            tenantFilter={tenantFilter}
            homeTenantId={homeTenantId}
            loading={economicsLoading}
          />

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

          <div style={styles.tableWrap}>
            {filteredRows.length === 0 ? (
              <div style={styles.emptyState}>No stock items found.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>Category</th>
                    <th style={{ ...styles.th, ...styles.thNumeric }}>Current Stock</th>
                    <th style={{ ...styles.th, ...styles.thNumeric }}>Min Stock</th>
                    <th style={{ ...styles.th, ...styles.thNumeric }}>Reorder Qty</th>
                    <th style={styles.th}>Health</th>
                    {showPortfolioView ? <th style={styles.th}>Tenant</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr key={`${item.tenantId || "tenant"}-${item.productId}`} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.productName}>{item.productName || "—"}</div>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{item.productId || "—"}</td>
                      <td style={styles.td}>{item.category || "—"}</td>
                      <td style={{ ...styles.td, ...styles.tdNumeric }}>{item.currentStock ?? 0}</td>
                      <td style={{ ...styles.td, ...styles.tdNumeric }}>{item.minStock ?? 0}</td>
                      <td style={{ ...styles.td, ...styles.tdNumeric }}>{item.reorderQty ?? 0}</td>
                      <td style={styles.td}>
                        <HealthBadge health={item.stockHealth} />
                      </td>
                      {showPortfolioView ? (
                        <td style={styles.td}>
                          <span style={styles.tenantBadge}>
                            {resolveTenantShortName(item.tenantId, tenantNameById, homeTenantId)}
                          </span>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
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
  tableWrap: {
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  table: {
    width: "100%",
    minWidth: "720px",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "11px",
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  },
  thNumeric: {
    textAlign: "right",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
  },
  td: {
    padding: "10px 12px",
    verticalAlign: "middle",
    color: "#0f172a",
  },
  tdNumeric: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontWeight: "600",
  },
  tdMono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    color: "#475569",
  },
  productName: {
    fontWeight: "600",
    lineHeight: 1.35,
  },
  healthBadge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  emptyState: {
    padding: "24px 16px",
    textAlign: "center",
    color: "#64748b",
    fontSize: "14px",
  },
  tenantBadge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "11px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
};
