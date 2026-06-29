import { persistHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { ROLES } from "@/config/roles.js";

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

/** Role-aware collections destination (never returns a page the role cannot access). */
export function resolveCollectionsPageForRole(role) {
  const r = str(role).toLowerCase();
  if (r === ROLES.LAB) return "labAccount";
  if (r === ROLES.EXECUTIVE || r === ROLES.ADMIN) return "risk";
  if (r === ROLES.AGENT || r === ROLES.READ_ONLY_AUDITOR) return "collections";
  return null;
}

export function canNavigateToCollections(role) {
  return Boolean(resolveCollectionsPageForRole(role));
}

export function collectionsNavLabelForRole(role) {
  const r = str(role).toLowerCase();
  if (r === ROLES.LAB) return "Payments & Account";
  if (r === ROLES.EXECUTIVE || r === ROLES.ADMIN) return "Credit & Risk";
  return "Collections";
}

export function navigateToLabInvoiceCenter(setActivePage) {
  if (!setActivePage) return false;
  hqNavigate(setActivePage, { page: "labInvoices" });
  return true;
}

export function navigateToCollections(
  setActivePage,
  { labId = "", focusSection = "details", role = "" } = {}
) {
  const page = resolveCollectionsPageForRole(role);
  if (!page || !setActivePage) return false;
  hqNavigate(setActivePage, {
    page,
    labId: str(labId),
    focusSection: str(focusSection) || "details",
  });
  return true;
}

export function navigateToCreditRisk(
  setActivePage,
  { labId = "", attentionFilter = "" } = {}
) {
  hqNavigate(setActivePage, {
    page: "risk",
    labId: str(labId),
    attentionFilter: str(attentionFilter),
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
    tab = "",
  } = {}
) {
  hqNavigate(setActivePage, {
    page: "operationsCenter",
    userId: str(userId),
    agentId: str(agentId),
    agentName: str(agentName),
    openAssignDrawer: Boolean(openAssignDrawer),
    labId: str(labId),
    tab: str(tab),
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
