 const API_BASE =
  import.meta.env.VITE_PRIMECARE_PROXY_URL ||
  "/api/primecare"; 
  //VITE_PRIMECARE_PROXY_URL=https://script.google.com/macros/s/AKfycbzBV1N2Ae3PZttnMcJ4YdUiljYf3cHPMrQo129kTDv0I57gNQwcHduCCXx58qJ_OKf43w/exec

/************************************************************
 * Core request helpers
 ************************************************************/

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  console.log("RAW RESPONSE:", text);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!contentType.includes("application/json")) {
    console.error("Non-JSON API response:", {
      url: response.url,
      status: response.status,
      contentType,
      bodyPreview: text.slice(0, 500),
    });
    throw new Error(
      `Expected JSON but got ${contentType || "unknown content-type"} from ${response.url}`
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("Invalid JSON response:", {
      url: response.url,
      status: response.status,
      bodyPreview: text.slice(0, 500),
    });
    throw new Error(`Invalid JSON from ${response.url}`);
  }

  if (data && data.success === false) {
    throw new Error(data.error || data.message || "API request failed");
  }

  return data;
}

export async function apiGet(action, params = {}) {
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

export async function apiPost(action, payload = {}) {
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

export async function getAgentWorkspace(params = {}) {
  return apiGet("getAgentWorkspace", params);
}

export async function completeAgentTask(payload) {
  return apiPost("completeAgentTask", payload);
}

export async function getCollectionDetails(labId, params = {}) {
  return apiGet("getCollectionDetails", {
    labId,
    ...params,
  });
}

export async function getCollectionHistory(labId, params = {}) {
  return apiGet("getCollectionHistory", {
    labId,
    ...params,
  });
}

export async function updateCollection(payload) {
  return apiPost("updateCollection", payload);
}

export async function getLabCatalog(params = {}) {
  return apiGet("getLabCatalog", params);
}

export async function getLabRecentOrders(params = {}) {
  return apiGet("getLabRecentOrders", params);
}

export async function submitLabOrder(payload) {
  return apiPost("submitLabOrder", payload);
}

export async function getOrders(params = {}) {
  return apiGet("getOrders", params);
}

export async function getOrderDetails(orderId, params = {}) {
  return apiGet("getOrderDetails", {
    orderId,
    ...params,
  });
}

export async function updateOrderStatus(payload) {
  return apiPost("updateOrderStatus", payload);
}

export async function getPurchaseDashboard(params = {}) {
  return apiGet("getPurchaseDashboard", params);
}

export async function getPurchaseOrders(params = {}) {
  return apiGet("getPurchaseOrders", params);
}

export async function getReorderCandidates(params = {}) {
  return apiGet("getReorderCandidates", params);
}

export async function createPurchaseOrder(payload) {
  return apiPost("createPurchaseOrder", payload);
}

export async function receivePurchaseOrder(payload) {
  return apiPost("receivePurchaseOrder", payload);
}

export async function getSmartReorder(params = {}) {
  return apiGet("getSmartReorder", params);
}

export async function getAutoPurchaseTriggers(params = {}) {
  return apiGet("getAutoPurchaseTriggers", params);
}

export async function bulkCreateDraftPurchaseOrders(payload) {
  return apiPost("bulkCreateDraftPurchaseOrders", payload);
}

/************************************************************
 * Auth APIs
 ************************************************************/

export async function getCurrentUser(params = {}) {
  return apiPost("getCurrentUser", params);
}

export async function loginUser(payload) {
  return apiPost("loginUser", payload);
}

export async function logoutUser({ sessionToken }) {
  try {
    const res = await apiPost("logoutUser", {
      sessionToken,
    });

    console.log("logoutUser response:", res);
    return res;
  } catch (err) {
    console.error("logoutUser failed", err);
    return { success: false };
  }
}

/************************************************************
 * Client debug logging
 * Temporary local-only fallback until backend action exists
 ************************************************************/

export async function logClientErrorApi(payload) {
  console.error("Client error:", payload);
  return { success: false, localOnly: true };
}