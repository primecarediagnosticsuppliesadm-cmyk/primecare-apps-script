function str(v) {
  return String(v ?? "").trim();
}

export const HQ_SEARCH_GROUPS = [
  { id: "labs", label: "Labs" },
  { id: "users", label: "Users" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "Products / SKUs" },
  { id: "purchaseOrders", label: "Purchase Orders" },
];

export const HQ_SEARCH_INDEXED_FIELDS = {
  labs: ["labName", "labId", "area", "city", "territory", "ownerName", "assignedAgent"],
  users: ["name", "displayName", "agentName", "userName", "username", "email", "role", "agentId"],
  orders: ["orderId", "orderIdCompact", "labName", "labId", "invoiceId", "orderStatus"],
  products: ["productName", "productId", "sku", "category"],
  purchaseOrders: ["poId", "status", "supplierName"],
};

/** Lowercase, strip punctuation to spaces for token matching. */
export function normalizeSearchText(value) {
  return str(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

/** Build normalized haystack + compact (no spaces) forms from field parts. */
export function buildSearchHaystack(parts = []) {
  const raw = (Array.isArray(parts) ? parts : [parts])
    .flat()
    .map(str)
    .filter(Boolean);
  const haystack = normalizeSearchText(raw.join(" "));
  const haystackCompact = haystack.replace(/\s+/g, "");
  return { haystack, haystackCompact, tokens: haystack ? haystack.split(" ") : [] };
}

/**
 * Score a query against an index item (higher = better match).
 * Supports substring, prefix, tokenized, and compact ID matching.
 */
export function scoreHqSearchMatch(item, query) {
  const qNorm = normalizeSearchText(query);
  if (!qNorm) return 0;

  const titleNorm = normalizeSearchText(item.title);
  const haystack = item.haystack || "";
  const haystackCompact = item.haystackCompact || haystack.replace(/\s+/g, "");
  const qCompact = qNorm.replace(/\s+/g, "");

  if (titleNorm === qNorm) return 100;
  if (titleNorm.startsWith(qNorm)) return 95;
  if (haystack.startsWith(qNorm)) return 90;
  if (haystack.includes(qNorm)) return 85;
  if (qCompact.length >= 2 && haystackCompact.includes(qCompact)) return 80;

  const qTokens = tokenizeSearchText(query);
  const hTokens = item.tokens || tokenizeSearchText(haystack);
  if (qTokens.length > 0) {
    const allTokensMatch = qTokens.every(
      (qt) =>
        hTokens.some((ht) => ht === qt || ht.startsWith(qt) || ht.includes(qt)) ||
        haystack.includes(qt) ||
        (qt.length >= 2 && haystackCompact.includes(qt.replace(/\s+/g, "")))
    );
    if (allTokensMatch) return 70 + Math.min(qTokens.length, 5);
  }

  return 0;
}

export function matchesHqSearchQuery(item, query) {
  return scoreHqSearchMatch(item, query) > 0;
}

export function buildHqSearchIndex(sources = {}) {
  const labs = (sources.labs || []).map((lab) => {
    const labId = str(lab.labId ?? lab.lab_id);
    const labName = str(lab.labName ?? lab.lab_name ?? lab.name) || labId;
    const { haystack, haystackCompact, tokens } = buildSearchHaystack([
      labName,
      labId,
      lab.area,
      lab.city,
      lab.territory,
      lab.ownerName ?? lab.owner_name,
      lab.assignedAgent ?? lab.assigned_agent,
    ]);
    return {
      id: `lab:${labId}`,
      type: "labs",
      title: labName,
      subtitle: labId,
      page: "labs",
      context: { labId, labName },
      haystack,
      haystackCompact,
      tokens,
    };
  });

  const users = (sources.users || []).map((user) => {
    const userId = str(user.userId ?? user.user_id);
    const displayName = str(user.displayName ?? user.display_name);
    const agentName = str(user.agentName ?? user.agent_name);
    const userName = str(user.userName ?? user.user_name);
    const name = str(user.name) || userName || displayName || agentName || str(user.email);
    const { haystack, haystackCompact, tokens } = buildSearchHaystack([
      name,
      displayName,
      agentName,
      userName,
      user.username,
      user.email,
      user.role,
      user.roleLabel,
      user.agentId ?? user.agent_id,
    ]);
    return {
      id: `user:${userId}`,
      type: "users",
      title: name || str(user.email),
      subtitle: str(user.roleLabel ?? user.role ?? "User"),
      page: "operationsCenter",
      context: { userId },
      haystack,
      haystackCompact,
      tokens,
    };
  });

  const orders = (sources.orders || []).map((order) => {
    const orderId = str(order.orderId ?? order.order_id);
    const { haystack, haystackCompact, tokens } = buildSearchHaystack([
      orderId,
      orderId.replace(/-/g, ""),
      order.labName ?? order.lab_name,
      order.labId ?? order.lab_id,
      order.invoiceId ?? order.invoice_id,
      order.orderStatus ?? order.status,
    ]);
    return {
      id: `order:${orderId}`,
      type: "orders",
      title: orderId,
      subtitle: `${str(order.labName ?? order.lab_name) || "Lab"} · ${str(order.orderStatus ?? order.status)}`,
      page: "orders",
      context: { orderId },
      haystack,
      haystackCompact,
      tokens,
    };
  });

  const products = (sources.products || []).map((product) => {
    const productId = str(product.productId ?? product.product_id ?? product.sku);
    const productName =
      str(product.productName ?? product.product_name ?? product.name) || productId;
    const { haystack, haystackCompact, tokens } = buildSearchHaystack([
      productName,
      productId,
      product.sku,
      product.category,
    ]);
    return {
      id: `product:${productId}`,
      type: "products",
      title: productName,
      subtitle: productId,
      page: "masterCatalog",
      context: { productId },
      haystack,
      haystackCompact,
      tokens,
    };
  });

  const purchaseOrders = (sources.purchaseOrders || []).map((po) => {
    const poId = str(po.poId ?? po.po_id ?? po.id);
    const { haystack, haystackCompact, tokens } = buildSearchHaystack([
      poId,
      poId.replace(/-/g, ""),
      po.status ?? po.poStatus,
      po.supplierName ?? po.supplier_name,
    ]);
    return {
      id: `po:${poId}`,
      type: "purchaseOrders",
      title: poId ? `PO ${poId}` : "Purchase order",
      subtitle: str(po.status ?? po.poStatus ?? "Purchase order"),
      page: "purchase",
      context: { poId },
      haystack,
      haystackCompact,
      tokens,
    };
  });

  return [...labs, ...users, ...orders, ...products, ...purchaseOrders].filter((item) => item.title);
}

export function summarizeHqSearchIndex(index = []) {
  const counts = {
    labs: 0,
    users: 0,
    orders: 0,
    products: 0,
    purchaseOrders: 0,
    total: 0,
  };
  for (const item of index) {
    if (counts[item.type] != null) counts[item.type] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Static coverage metadata + runtime counts for operators and dev diagnostics. */
export function buildHqSearchCoverageReport(index = [], sourceMeta = {}) {
  const counts = summarizeHqSearchIndex(index);
  return {
    labs: {
      sourceApi: "getLabsCredit",
      indexedFields: HQ_SEARCH_INDEXED_FIELDS.labs,
      countIndexed: counts.labs,
      sourceCount: sourceMeta.labs ?? counts.labs,
      error: sourceMeta.labsError ?? null,
    },
    users: {
      sourceApi: "getOperationsPlatformUsersRead",
      indexedFields: HQ_SEARCH_INDEXED_FIELDS.users,
      countIndexed: counts.users,
      sourceCount: sourceMeta.users ?? counts.users,
      error: sourceMeta.usersError ?? null,
    },
    orders: {
      sourceApi: "getOrdersRead",
      indexedFields: HQ_SEARCH_INDEXED_FIELDS.orders,
      countIndexed: counts.orders,
      sourceCount: sourceMeta.orders ?? counts.orders,
      error: sourceMeta.ordersError ?? null,
    },
    products: {
      sourceApi: "loadMasterCatalog",
      indexedFields: HQ_SEARCH_INDEXED_FIELDS.products,
      countIndexed: counts.products,
      sourceCount: sourceMeta.products ?? counts.products,
      error: sourceMeta.productsError ?? null,
    },
    purchaseOrders: {
      sourceApi: "getPurchaseOrdersRead",
      indexedFields: HQ_SEARCH_INDEXED_FIELDS.purchaseOrders,
      countIndexed: counts.purchaseOrders,
      sourceCount: sourceMeta.purchaseOrders ?? counts.purchaseOrders,
      error: sourceMeta.purchaseOrdersError ?? null,
    },
  };
}

export function logHqSearchDiagnostics(report = {}, options = {}) {
  const isDev =
    options.force === true ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV === true);
  if (!isDev) return;

  const lines = [
    `[HQ Search] Indexed counts — Labs: ${report.labs?.countIndexed ?? 0}, Users: ${report.users?.countIndexed ?? 0}, Orders: ${report.orders?.countIndexed ?? 0}, Products: ${report.products?.countIndexed ?? 0}, POs: ${report.purchaseOrders?.countIndexed ?? 0}`,
  ];
  for (const key of ["labs", "users", "orders", "products", "purchaseOrders"]) {
    const row = report[key];
    if (row?.error) lines.push(`[HQ Search] ${key} load warning: ${row.error}`);
  }
  console.info(lines.join("\n"));
}

export function searchHqIndex(index = [], query = "", limitPerGroup = 5) {
  const q = str(query);
  if (!q) return [];

  const scored = index
    .map((item) => ({ item, score: scoreHqSearchMatch(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  const grouped = new Map();
  for (const { item } of scored) {
    const list = grouped.get(item.type) || [];
    if (list.length < limitPerGroup) list.push(item);
    grouped.set(item.type, list);
  }

  return HQ_SEARCH_GROUPS.filter((g) => grouped.has(g.id)).map((g) => ({
    ...g,
    items: grouped.get(g.id) || [],
  }));
}

export function persistHqNavContext(context = {}) {
  try {
    sessionStorage.setItem("hq_nav_context", JSON.stringify({ ...context, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function consumeHqNavContext(pageKey) {
  try {
    const raw = sessionStorage.getItem("hq_nav_context");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (str(parsed.page) !== str(pageKey)) return null;
    sessionStorage.removeItem("hq_nav_context");
    return parsed;
  } catch {
    return null;
  }
}
