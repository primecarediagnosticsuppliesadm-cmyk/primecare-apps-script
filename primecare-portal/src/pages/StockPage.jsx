import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getStockDashboard, peekStockDashboardReadCache } from "../api/primecareSupabaseApi";
import { fetchDatabaseTenants } from "@/tenant/durableTenantStore.js";
import InventoryLedgerPage from "./InventoryLedgerPage";
import InventoryHealthPage from "./InventoryHealthPage";
import PageSkeleton from "@/components/ux/PageSkeleton";
import PageHeader from "@/components/ux/PageHeader";
import DataFetchError from "@/components/ux/DataFetchError";
import HqInventoryValueAnalytics from "@/components/hq/HqInventoryValueAnalytics.jsx";
import InventoryContextStrip from "@/components/inventory/InventoryContextStrip.jsx";
import InventoryStartHere from "@/components/inventory/InventoryStartHere.jsx";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import {
  distributorNamesFromRegistry,
  loadInventoryEconomicsBundle,
} from "@/inventory/inventoryEconomicsData.js";
import { readPageUiCache, writePageUiCache } from "@/utils/hqPageUiCache.js";
import { useOperatingTenantId } from "@/tenant/useOperatingTenantId.js";
import { persistHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import {
  isHqCatalogWriteBlocked,
  isHqProcurementWriteBlocked,
} from "@/config/hqReleasePolicy.js";
import {
  buildFocusedSkuOutsideFiltersCopy,
  buildInventoryContextParts,
  buildInventoryListEmptyCopy,
  inventorySortLabel,
  skuRowKey,
} from "@/inventory/inventoryContextUi.js";
import {
  consumeInventoryReturnContextIfArmed,
  writeInventoryReturnContext,
} from "@/inventory/inventoryWorkflowReturn.js";
import InventoryCollapsibleSection from "@/components/inventory/InventoryCollapsibleSection.jsx";
import {
  getInventoryExpectedActionCopy,
  INVENTORY_WORKSPACE_PRIMARY_QUESTION,
} from "@/inventory/inventoryWorkspaceUi.js";

function hydrateStockFromCache() {
  const ui = readPageUiCache("inventory:stock");
  if (ui?.data?.inventory?.length) {
    return { data: ui.data, tenantNameById: ui.tenantNameById || new Map() };
  }
  const peeked = peekStockDashboardReadCache();
  if (!peeked?.success || !peeked?.data?.inventory?.length) return null;
  return { data: peeked.data, tenantNameById: new Map() };
}

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

function resolveTenantLabel(tenantId, tenantNameById, homeTenantId) {
  const id = str(tenantId);
  if (!id) return "Distributor: unknown";
  const name = tenantNameById.get(id);
  if (name) return `Distributor: ${name}`;
  if (homeTenantId && id === homeTenantId) return "Distributor: HQ";
  return `Distributor: ${id}`;
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

function healthSortRank(health) {
  const value = normalizeStockHealth(health);
  if (value === "Critical") return 0;
  if (value === "Reorder") return 1;
  if (value === "Healthy") return 2;
  return 3;
}

function sortInventoryRows(rows, sortKey) {
  const key = str(sortKey) || "name";
  return [...(rows || [])].sort((a, b) => {
    if (key === "stock") {
      return Number(b.currentStock || 0) - Number(a.currentStock || 0);
    }
    if (key === "health") {
      const diff = healthSortRank(a.stockHealth) - healthSortRank(b.stockHealth);
      if (diff !== 0) return diff;
    }
    return str(a.productName || a.productId).localeCompare(
      str(b.productName || b.productId),
      undefined,
      { sensitivity: "base" }
    );
  });
}

export default function StockPage({ currentUser = null, setActivePage = null }) {
  const hydratedStock = useMemo(() => hydrateStockFromCache(), []);
  const hadCacheOnMount = useRef(Boolean(hydratedStock));
  const restoredRef = useRef(false);
  const [activeTab, setActiveTab] = useState("stock");
  const [data, setData] = useState(() => hydratedStock?.data ?? { stats: {}, inventory: [] });
  const [tenantNameById, setTenantNameById] = useState(
    () => hydratedStock?.tenantNameById ?? new Map()
  );
  const [loading, setLoading] = useState(() => !hydratedStock);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("hq");
  const [healthFilter, setHealthFilter] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [selectedKey, setSelectedKey] = useState("");
  const [contextWarning, setContextWarning] = useState("");
  const [economicsBundle, setEconomicsBundle] = useState(null);
  const [economicsLoading, setEconomicsLoading] = useState(false);

  const operatingTenantId = useOperatingTenantId(currentUser);
  const homeTenantId = operatingTenantId;
  const freezeActive = isHqCatalogWriteBlocked() || isHqProcurementWriteBlocked();

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const restored = consumeInventoryReturnContextIfArmed();
    if (!restored) return;
    setActiveTab(str(restored.activeTab) || "stock");
    setSearch(str(restored.search));
    setTenantFilter(str(restored.tenantFilter) || "hq");
    setHealthFilter(str(restored.healthFilter));
    setSortKey(str(restored.sortKey) || "name");
    if (str(restored.selectedProductId)) {
      setSelectedKey(`${str(restored.selectedTenantId)}|${str(restored.selectedProductId)}`);
    }
    setContextWarning("Restored your previous Inventory search, filters, and selection.");
  }, []);

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

  const loadStock = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setListRefreshing(true);
      else if (!data.inventory?.length) setLoading(true);
      else setListRefreshing(true);
      setError("");
      const [res, tenantsRes] = await Promise.all([
        getStockDashboard({ force: silent, tenantId: operatingTenantId }),
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
      const nextData = res.data || { stats: {}, inventory: [] };
      setData(nextData);
      writePageUiCache("inventory:stock", { data: nextData, tenantNameById: nameMap });
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
      setListRefreshing(false);
    }
  }, [data.inventory?.length, operatingTenantId]);

  useEffect(() => {
    void loadStock({ silent: hadCacheOnMount.current });
  }, [loadStock]);

  const hasInventoryRows = (data.inventory || []).length > 0;

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

    options.push({ value: "all", label: "All distributors" });
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
    let rows = tenantFilteredRows;
    if (healthFilter) {
      rows = rows.filter((item) => normalizeStockHealth(item.stockHealth) === healthFilter);
    }
    if (q) {
      rows = rows.filter((item) => {
        const tenantLabel = resolveTenantLabel(item.tenantId, tenantNameById, homeTenantId).toLowerCase();
        return (
          (item.productName || "").toLowerCase().includes(q) ||
          (item.productId || "").toLowerCase().includes(q) ||
          (item.category || "").toLowerCase().includes(q) ||
          tenantLabel.includes(q)
        );
      });
    }
    return sortInventoryRows(rows, sortKey);
  }, [tenantFilteredRows, search, healthFilter, sortKey, tenantNameById, homeTenantId]);

  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    return (data.inventory || []).find((item) => skuRowKey(item) === selectedKey) || null;
  }, [data.inventory, selectedKey]);

  const selectedVisible = useMemo(() => {
    if (!selectedKey) return true;
    return filteredRows.some((item) => skuRowKey(item) === selectedKey);
  }, [filteredRows, selectedKey]);

  const tenantFilterLabel = useMemo(() => {
    const match = tenantFilterOptions.find((option) => option.value === tenantFilter);
    return match?.label || "";
  }, [tenantFilterOptions, tenantFilter]);

  const inventoryContextParts = useMemo(
    () =>
      buildInventoryContextParts({
        activeTab,
        selectedProductId: selectedItem?.productId || "",
        selectedCategory: selectedItem?.category || "",
        warehouseLabel: str(selectedItem?.warehouseName || selectedItem?.warehouse || ""),
        searchQuery: search,
        tenantFilterLabel,
        healthFilter,
        sortLabel: inventorySortLabel(sortKey),
        freezeActive,
      }),
    [
      activeTab,
      selectedItem,
      search,
      tenantFilterLabel,
      healthFilter,
      sortKey,
      freezeActive,
    ]
  );

  const emptyCopy = useMemo(
    () =>
      buildInventoryListEmptyCopy({
        inventoryLength: (data.inventory || []).length,
        search,
        tenantFilter,
        healthFilter,
        readFailed: Boolean(error && !hasInventoryRows),
      }),
    [data.inventory, search, tenantFilter, healthFilter, error, hasInventoryRows]
  );

  const focusOutsideCopy = useMemo(
    () =>
      selectedKey && selectedItem && !selectedVisible
        ? buildFocusedSkuOutsideFiltersCopy({ productId: selectedItem.productId })
        : null,
    [selectedKey, selectedItem, selectedVisible]
  );

  const selectedExpectedAction = useMemo(
    () =>
      selectedItem
        ? getInventoryExpectedActionCopy({
            stockHealth: selectedItem.stockHealth,
            currentStock: selectedItem.currentStock,
            minStock: selectedItem.minStock,
            reorderQty: selectedItem.reorderQty,
          })
        : null,
    [selectedItem]
  );

  const captureReturnContext = useCallback(() => {
    writeInventoryReturnContext({
      activeTab,
      search,
      tenantFilter,
      healthFilter,
      sortKey,
      selectedProductId: selectedItem?.productId || "",
      selectedTenantId: selectedItem?.tenantId || "",
    });
  }, [activeTab, search, tenantFilter, healthFilter, sortKey, selectedItem]);

  const navigateAway = useCallback(
    (pageKey, navExtra = {}) => {
      if (typeof setActivePage !== "function") return;
      captureReturnContext();
      if (pageKey === "purchase" || pageKey === "masterCatalog" || pageKey === "orders") {
        persistHqNavContext({ page: pageKey, ...navExtra });
      }
      setActivePage(pageKey);
    },
    [setActivePage, captureReturnContext]
  );

  const clearListFilters = useCallback(() => {
    setSearch("");
    setHealthFilter("");
    setTenantFilter("hq");
    setContextWarning("");
  }, []);

  const handleEmptyAction = useCallback(
    (action) => {
      if (action === "retry" || action === "refresh") {
        void loadStock({ silent: hasInventoryRows });
        return;
      }
      if (action === "clear_search") {
        setSearch("");
        return;
      }
      if (action === "clear_health") {
        setHealthFilter("");
        return;
      }
      if (action === "clear_filters") {
        clearListFilters();
        return;
      }
      if (action === "open_catalog") {
        navigateAway("masterCatalog");
      }
    },
    [loadStock, hasInventoryRows, clearListFilters, navigateAway]
  );

  const handleStartHereAction = useCallback(
    (action) => {
      if (!action) return;
      setContextWarning("");
      if (action.kind === "filter" && action.healthFilter) {
        setActiveTab("stock");
        setHealthFilter(action.healthFilter);
        return;
      }
      if (action.kind === "tab" && action.tab) {
        setActiveTab(action.tab);
        return;
      }
      if (action.kind === "navigate" && action.target) {
        navigateAway(action.target, action.tab ? { tab: action.tab } : {});
      }
    },
    [navigateAway]
  );

  const switchTab = (nextTab) => {
    console.log("INVENTORY PAGE TAB SWITCH", {
      from: activeTab,
      to: nextTab,
    });
    setActiveTab(nextTab);
  };

  const selectSku = (item) => {
    const key = skuRowKey(item);
    setSelectedKey((prev) => (prev === key ? "" : key));
    setContextWarning("");
  };

  return (
    <div style={styles.page} data-inventory-workspace="hq" aria-label="Inventory workspace">
      <PageHeader
        title="Inventory"
        subtitle={INVENTORY_WORKSPACE_PRIMARY_QUESTION}
        icon={Package}
        className="mb-3"
        secondaryActions={
          <div style={styles.tabs} aria-label="Inventory views">
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
        }
      />

      <InventoryContextStrip
        className="mb-3"
        parts={inventoryContextParts}
        warning={contextWarning}
      />

      {activeTab === "health" ? (
        <InventoryHealthPage />
      ) : activeTab === "ledger" ? (
        <InventoryLedgerPage operatingTenantId={operatingTenantId} />
      ) : loading && !hasInventoryRows ? (
        <PageSkeleton kpiCount={0} listRows={8} className="p-4" />
      ) : error && !hasInventoryRows ? (
        <DataFetchError
          message={error}
          onRetry={() => void loadStock()}
          retrying={loading || listRefreshing}
        />
      ) : (
        <>
          {error ? (
            <DataFetchError
              message={error}
              onRetry={() => void loadStock({ silent: hasInventoryRows })}
              retrying={loading || listRefreshing}
              staleDataNote="Showing the last inventory snapshot loaded successfully."
              className="mb-3"
            />
          ) : null}

          <div className="mb-3" data-inventory-start-here-region="true">
            <InventoryStartHere
              criticalCount={portfolioStats.criticalItems}
              reorderCount={portfolioStats.reorderItems}
              inventoryLength={portfolioStats.inventoryRecords}
              loading={loading || listRefreshing}
              onAction={handleStartHereAction}
            />
          </div>

          {focusOutsideCopy ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-semibold">{focusOutsideCopy.title}</p>
              <p className="mt-0.5">{focusOutsideCopy.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={clearListFilters}>
                  {focusOutsideCopy.clearLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    clearListFilters();
                    setActiveTab("stock");
                    setContextWarning("");
                  }}
                >
                  {focusOutsideCopy.returnLabel}
                </Button>
              </div>
            </div>
          ) : null}

          <div style={styles.filterRow} data-inventory-filters="true" aria-label="Inventory search and filters">
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              style={styles.tenantFilter}
              aria-label="Filter inventory by distributor"
            >
              {tenantFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              style={styles.tenantFilter}
              aria-label="Filter inventory by health"
            >
              <option value="">All health</option>
              <option value="Critical">Critical</option>
              <option value="Reorder">Reorder</option>
              <option value="Healthy">Healthy</option>
            </select>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              style={styles.tenantFilter}
              aria-label="Sort inventory"
            >
              <option value="name">Sort: Name</option>
              <option value="health">Sort: Health</option>
              <option value="stock">Sort: On hand</option>
            </select>

            <input
              type="text"
              placeholder="Search by product, ID, category, distributor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.search}
              aria-label="Search inventory"
            />
          </div>

          <div style={styles.tableWrap} className="hidden xl:block" data-inventory-list="true">
            {filteredRows.length === 0 ? (
              <div style={styles.emptyState}>
                <p className="font-medium text-slate-800">{emptyCopy.title}</p>
                <p className="mt-1">{emptyCopy.message}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8"
                  onClick={() => handleEmptyAction(emptyCopy.action)}
                >
                  {emptyCopy.actionLabel}
                </Button>
              </div>
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
                    {showPortfolioView ? <th style={styles.th}>Distributor</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => {
                    const key = skuRowKey(item);
                    const isSelected = selectedKey === key;
                    return (
                      <tr
                        key={key}
                        style={{
                          ...styles.tr,
                          ...(isSelected ? styles.trSelected : {}),
                          cursor: "pointer",
                        }}
                        className={isSelected ? "ring-2 ring-indigo-400 ring-inset" : undefined}
                        aria-selected={isSelected}
                        onClick={() => selectSku(item)}
                      >
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-2 xl:hidden" data-inventory-list-mobile="true">
            {filteredRows.length === 0 ? (
              <div style={styles.emptyState}>
                <p className="font-medium text-slate-800">{emptyCopy.title}</p>
                <p className="mt-1">{emptyCopy.message}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8"
                  onClick={() => handleEmptyAction(emptyCopy.action)}
                >
                  {emptyCopy.actionLabel}
                </Button>
              </div>
            ) : (
              filteredRows.map((item) => {
                const key = skuRowKey(item);
                const isSelected = selectedKey === key;
                return (
                  <button
                    type="button"
                    key={`${key}-mobile`}
                    aria-selected={isSelected}
                    onClick={() => selectSku(item)}
                    className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm ${
                      isSelected
                        ? "border-indigo-400 ring-2 ring-indigo-400"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{item.productName || "—"}</p>
                        <p className="font-mono text-xs text-slate-600">{item.productId || "—"}</p>
                      </div>
                      <HealthBadge health={item.stockHealth} />
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-slate-500">On hand</dt>
                        <dd className="font-semibold tabular-nums">{item.currentStock ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Min</dt>
                        <dd className="font-semibold tabular-nums">{item.minStock ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Reorder</dt>
                        <dd className="font-semibold tabular-nums">{item.reorderQty ?? 0}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-slate-600">{item.category || "—"}</p>
                    {showPortfolioView ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {resolveTenantShortName(item.tenantId, tenantNameById, homeTenantId)}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {selectedItem ? (
            <div
              className="mt-3 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 text-xs text-indigo-950"
              data-inventory-selected-sku={selectedItem.productId}
              aria-label="Selected SKU details"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
                  Selected SKU
                </p>
                <p className="mt-0.5 text-sm font-semibold text-indigo-950">
                  {selectedItem.productName || "—"}{" "}
                  <span className="font-mono text-[11px] font-medium text-indigo-800">
                    ({selectedItem.productId || "—"})
                  </span>
                </p>
              </div>

              {selectedExpectedAction ? (
                <div
                  className="rounded-lg border border-indigo-200 bg-white/80 px-2.5 py-2"
                  data-inventory-expected-action="true"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
                    Expected
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-indigo-950">
                    {selectedExpectedAction.action}
                  </p>
                  <p className="mt-0.5 text-[11px] text-indigo-900/85">{selectedExpectedAction.reason}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-inventory-sku-ops="true">
                <div className="rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5">
                  <p className="text-[10px] text-indigo-700">Current stock</p>
                  <p className="font-semibold tabular-nums">{selectedItem.currentStock ?? 0}</p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5">
                  <p className="text-[10px] text-indigo-700">Min stock</p>
                  <p className="font-semibold tabular-nums">{selectedItem.minStock ?? 0}</p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5">
                  <p className="text-[10px] text-indigo-700">Reorder qty</p>
                  <p className="font-semibold tabular-nums">{selectedItem.reorderQty ?? 0}</p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5">
                  <p className="text-[10px] text-indigo-700">Health</p>
                  <HealthBadge health={selectedItem.stockHealth} />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5" aria-label="Selected SKU actions">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => navigateAway("purchase", { tab: "receive" })}
                >
                  Receive Stock
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-indigo-200 bg-white text-[11px]"
                  onClick={() => navigateAway("purchase", { tab: "create" })}
                >
                  Create Purchase Order
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-indigo-200 bg-white text-[11px]"
                  onClick={() => switchTab("ledger")}
                >
                  Open Ledger
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-indigo-200 bg-white text-[11px]"
                  onClick={() => navigateAway("masterCatalog")}
                >
                  Catalog
                </Button>
              </div>

              <InventoryCollapsibleSection title="SKU details">
                <dl className="grid gap-2 text-[11px] text-slate-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Category</dt>
                    <dd className="font-medium">{selectedItem.category || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Distributor</dt>
                    <dd className="font-medium">
                      {resolveTenantShortName(selectedItem.tenantId, tenantNameById, homeTenantId)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Opening stock</dt>
                    <dd className="font-medium">
                      Set at catalog create only. Use Receive Stock for replenishment.
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Purchase history</dt>
                    <dd className="font-medium">
                      <button
                        type="button"
                        className="text-indigo-700 underline"
                        onClick={() => navigateAway("purchase", { tab: "history" })}
                      >
                        Open Purchase history
                      </button>
                    </dd>
                  </div>
                </dl>
              </InventoryCollapsibleSection>

              <InventoryCollapsibleSection title="Audit identifiers">
                <dl className="grid gap-2 font-mono text-[11px] text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-sans text-slate-500">Product ID</dt>
                    <dd>{selectedItem.productId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-sans text-slate-500">Tenant ID</dt>
                    <dd className="break-all">{selectedItem.tenantId || "—"}</dd>
                  </div>
                </dl>
              </InventoryCollapsibleSection>
            </div>
          ) : null}

          <div className="mt-3">
            <InventoryCollapsibleSection title="Stock summary & valuation">
              {showPortfolioView ? (
                <div style={{ ...styles.portfolioNote, marginBottom: 12 }}>
                  Portfolio inventory: each row is one stock record per distributor. The same SKU may
                  appear under HQ and distributor accounts with separate on-hand quantities.
                </div>
              ) : null}
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
              <div className="mt-3">
                <HqInventoryValueAnalytics
                  model={economicsBundle?.model}
                  healthRows={economicsBundle?.inventoryRows || []}
                  tenantFilter={tenantFilter}
                  homeTenantId={homeTenantId}
                  loading={economicsLoading}
                />
              </div>
            </InventoryCollapsibleSection>
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
    gridTemplateColumns: "minmax(140px, 1fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr) minmax(0, 1.4fr)",
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
  trSelected: {
    background: "#eef2ff",
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
