const API_BASE =
  import.meta.env.VITE_PRIMECARE_PROXY_URL ||
  "/api/primecare";

/************************************************************
 * Core request helpers
 ************************************************************/

async function parseResponse(response) {
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (data && data.success === false) {
    throw new Error(data.error || data.message || "API request failed");
  }

  return data;
}

async function apiGet(action, params = {}) {
  if (!API_BASE) {
    throw new Error("Missing PrimeCare API URL configuration");
  }

  const url = new URL(API_BASE, window.location.origin);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "same-origin",
  });

  return parseResponse(response);
}

async function apiPost(action, payload = {}) {
  if (!API_BASE) {
    throw new Error("Missing PrimeCare API URL configuration");
  }

  const url = new URL(API_BASE, window.location.origin);

  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      payload,
    }),
  });

  return parseResponse(response);
}

/************************************************************
 * Existing APIs
 ************************************************************/

export async function getStock(params = {}) {
  return apiGet("getStock", params);
}

export async function getLabs(params = {}) {
  return apiGet("getLabs", params);
}

export async function getLabsDashboard(params = {}) {
  return apiGet("getLabsDashboard", params);
}

export async function getDashboard(params = {}) {
  return apiGet("getDashboard", params);
}

export async function getExecutiveSnapshot(params = {}) {
  return apiGet("getExecutiveSnapshot", params);
}

export async function getRecentVisits(params = {}) {
  return apiGet("getRecentVisits", params);
}

export async function getCollections(params = {}) {
  return apiGet("getCollections", params);
}

export async function getAIInsights(params = {}) {
  return apiGet("getAIInsights", params);
}

export async function getReorderForecast(params = {}) {
  return apiGet("getReorderForecast", params);
}

export async function saveAgentVisit(payload) {
  return apiPost("saveAgentVisit", payload);
}

/************************************************************
 * Lab ordering APIs
 ************************************************************/

export async function getLabCatalog(labId) {
  return apiGet("getLabCatalog", { labId });
}

export async function getLabRecentOrders(labId) {
  return apiGet("getLabRecentOrders", { labId });
}

export async function submitLabOrder(payload) {
  return apiPost("submitLabOrder", payload);
}

export async function getOrders(params = {}) {
  return apiGet("getOrders", params);
}

export async function getOrderDetails(orderId) {
  return apiGet("getOrderDetails", { orderId });
}

export async function updateOrderStatus(payload) {
  return apiPost("updateOrderStatus", payload);
}

export async function getCollectionDetails(labId) {
  return apiGet("getCollectionDetails", { labId });
}

export async function getCollectionHistory(labId) {
  return apiGet("getCollectionHistory", { labId });
}

export async function updateCollection(payload) {
  return apiPost("updateCollection", payload);
}

/************************************************************
 * Purchase dashboard optimized APIs
 ************************************************************/

export async function getPurchaseDashboard(params = {}) {
  return apiGet("getPurchaseDashboard", params);
}

export async function getReorderCandidates() {
  return apiGet("getReorderCandidates");
}

export async function getPurchaseOrders() {
  return apiGet("getPurchaseOrders");
}

export async function createPurchaseOrder(payload) {
  return apiPost("createPurchaseOrder", payload);
}

export async function receivePurchaseOrder(payload) {
  return apiPost("receivePurchaseOrder", payload);
}

export async function getSmartReorder() {
  return apiGet("getSmartReorder");
}

export async function getAutoPurchaseTriggers() {
  return apiGet("getAutoPurchaseTriggers");
}

export async function bulkCreateDraftPurchaseOrders(payload) {
  return apiPost("bulkCreateDraftPurchaseOrders", payload);
}

export async function getSupplierDashboard() {
  return apiGet("getSupplierDashboard");
}

/************************************************************
 * Auth APIs
 ************************************************************/

export async function loginUser(payload) {
  return apiPost("loginUser", payload);
}

export async function getCurrentUser(payload) {
  return apiPost("getCurrentUser", payload);
}

export async function logoutUser(payload) {
  return apiPost("logoutUser", payload);
}
export async function getAgentDashboard(params = {}) {
  return apiGet("getAgentDashboard", params);
}