import { persistHqNavContext } from "@/operations/hqGlobalSearchEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/** Persist HQ nav context and switch portal page. */
export function hqNavigate(setActivePage, context = {}) {
  const page = str(context.page);
  if (!page) return;
  persistHqNavContext({ ...context, page });
  setActivePage?.(page);
}

export function navigateToLabs(
  setActivePage,
  { labId = "", labName = "", openReviewDrawer = false, creditFilter = "" } = {}
) {
  hqNavigate(setActivePage, {
    page: "labs",
    labId: str(labId),
    labName: str(labName),
    openReviewDrawer: Boolean(openReviewDrawer),
    creditFilter: str(creditFilter).toUpperCase(),
  });
}

export function navigateToOrders(setActivePage, { labId = "", orderId = "" } = {}) {
  hqNavigate(setActivePage, {
    page: "orders",
    labId: str(labId),
    orderId: str(orderId),
  });
}

export function navigateToCollections(
  setActivePage,
  { labId = "", focusSection = "details" } = {}
) {
  hqNavigate(setActivePage, {
    page: "collections",
    labId: str(labId),
    focusSection: str(focusSection) || "details",
  });
}

export function navigateToVisits(setActivePage, { labId = "" } = {}) {
  hqNavigate(setActivePage, {
    page: "visits",
    labId: str(labId),
  });
}

export function navigateToOperationsCenter(
  setActivePage,
  {
    userId = "",
    agentId = "",
    agentName = "",
    openAssignDrawer = false,
    labId = "",
  } = {}
) {
  hqNavigate(setActivePage, {
    page: "operationsCenter",
    userId: str(userId),
    agentId: str(agentId),
    agentName: str(agentName),
    openAssignDrawer: Boolean(openAssignDrawer),
    labId: str(labId),
  });
}

/** Resolve Activity Center event → navigation target (read-only). */
export function resolveActivityEventNav(event = {}) {
  const raw = event.raw || {};
  const payload =
    raw.payload && typeof raw.payload === "object"
      ? raw.payload
      : typeof raw.payload_json === "string"
        ? (() => {
            try {
              return JSON.parse(raw.payload_json);
            } catch {
              return {};
            }
          })()
        : raw.payload || {};

  const orderId = str(
    event.orderId ??
      payload.orderId ??
      payload.order_id ??
      raw.orderId ??
      raw.order_id
  );
  const labId = str(
    event.labId ?? payload.labId ?? payload.lab_id ?? raw.labId ?? raw.lab_id
  );
  const labName = str(payload.labName ?? payload.lab_name);
  const userId = str(payload.userId ?? payload.user_id ?? raw.subjectUserId);
  const module = str(event.module).toLowerCase();

  if (orderId) {
    return { page: "orders", orderId, labId, label: orderId };
  }
  if (labId && (module === "collections" || module === "payments" || event.eventType?.includes("collection"))) {
    return { page: "collections", labId, label: labName || labId };
  }
  if (labId) {
    return { page: "labs", labId, labName, openReviewDrawer: true, label: labName || labId };
  }
  if (userId && module === "provisioning") {
    return { page: "operationsCenter", userId, openAssignDrawer: true, label: str(event.entity) };
  }
  return null;
}

export function navigateFromActivityEvent(setActivePage, event) {
  const target = resolveActivityEventNav(event);
  if (!target) return false;
  const { page, label: _label, ...ctx } = target;
  hqNavigate(setActivePage, { page, ...ctx });
  return true;
}
