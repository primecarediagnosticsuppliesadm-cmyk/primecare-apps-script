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

export function buildHqSearchIndex(sources = {}) {
  const labs = (sources.labs || []).map((lab) => ({
    id: `lab:${str(lab.labId ?? lab.lab_id)}`,
    type: "labs",
    title: str(lab.labName ?? lab.lab_name ?? lab.name) || str(lab.labId),
    subtitle: str(lab.labId ?? lab.lab_id),
    page: "labs",
    context: { labId: str(lab.labId ?? lab.lab_id) },
    haystack: [lab.labName, lab.lab_id, lab.labId, lab.city, lab.territory].join(" ").toLowerCase(),
  }));

  const users = (sources.users || []).map((user) => ({
    id: `user:${str(user.userId ?? user.user_id)}`,
    type: "users",
    title: str(user.name ?? user.displayName ?? user.display_name) || str(user.email),
    subtitle: str(user.roleLabel ?? user.role ?? "User"),
    page: "operationsCenter",
    context: { userId: str(user.userId ?? user.user_id) },
    haystack: [user.name, user.displayName, user.email, user.role, user.agentId].join(" ").toLowerCase(),
  }));

  const orders = (sources.orders || []).map((order) => ({
    id: `order:${str(order.orderId ?? order.order_id)}`,
    type: "orders",
    title: str(order.orderId ?? order.order_id),
    subtitle: `${str(order.labName ?? order.lab_name) || "Lab"} · ${str(order.orderStatus ?? order.status)}`,
    page: "orders",
    context: { orderId: str(order.orderId ?? order.order_id) },
    haystack: [order.orderId, order.labName, order.labId, order.invoiceId, order.orderStatus].join(" ").toLowerCase(),
  }));

  const products = (sources.products || []).map((product) => ({
    id: `product:${str(product.productId ?? product.product_id ?? product.sku)}`,
    type: "products",
    title: str(product.productName ?? product.product_name ?? product.name) || str(product.productId),
    subtitle: str(product.productId ?? product.product_id ?? product.sku),
    page: "masterCatalog",
    context: { productId: str(product.productId ?? product.product_id) },
    haystack: [product.productName, product.productId, product.category, product.sku].join(" ").toLowerCase(),
  }));

  const purchaseOrders = (sources.purchaseOrders || []).map((po) => ({
    id: `po:${str(po.poId ?? po.po_id ?? po.id)}`,
    type: "purchaseOrders",
    title: `PO ${str(po.poId ?? po.po_id ?? po.id)}`,
    subtitle: str(po.status ?? po.poStatus ?? "Purchase order"),
    page: "purchase",
    context: { poId: str(po.poId ?? po.po_id ?? po.id) },
    haystack: [po.poId, po.po_id, po.status, po.supplierName, po.supplier_name].join(" ").toLowerCase(),
  }));

  return [...labs, ...users, ...orders, ...products, ...purchaseOrders].filter((item) => item.title);
}

export function searchHqIndex(index = [], query = "", limitPerGroup = 5) {
  const q = str(query).toLowerCase();
  if (!q) return [];

  const matched = index.filter((item) => item.haystack.includes(q));
  const grouped = new Map();

  for (const item of matched) {
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
