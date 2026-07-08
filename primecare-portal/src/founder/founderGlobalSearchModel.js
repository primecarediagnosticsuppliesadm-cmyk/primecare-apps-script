/**
 * Phase 9.2 — Founder global search catalog (extends HQ search groups; UI filter only).
 */
import { HQ_SEARCH_GROUPS, normalizeSearchText, scoreHqSearchMatch } from "@/operations/hqGlobalSearchEngine.js";

export const FOUNDER_SEARCH_GROUPS = Object.freeze([
  ...HQ_SEARCH_GROUPS,
  { id: "employees", label: "Employees" },
  { id: "contracts", label: "Contracts" },
  { id: "collections", label: "Collections" },
  { id: "activities", label: "Activities" },
  { id: "reports", label: "Reports" },
]);

function str(value) {
  return String(value ?? "").trim();
}

function buildHaystack(parts) {
  const haystack = normalizeSearchText(parts.filter(Boolean).join(" "));
  return {
    haystack,
    haystackCompact: haystack.replace(/\s+/g, ""),
    tokens: haystack ? haystack.split(" ") : [],
  };
}

/**
 * Build searchable index from founder read bundle (no new API calls).
 */
export function buildFounderSearchIndex(readBundle = {}) {
  const items = [];

  for (const lab of readBundle.opsPayload?.dashboard?.labs || readBundle.commercialRaw?.qualifications || []) {
    const title = str(lab.labName || lab.lab_name) || str(lab.labId || lab.lab_id);
    if (!title) continue;
    items.push({
      id: `lab-${str(lab.labId || lab.lab_id)}`,
      group: "labs",
      title,
      subtitle: str(lab.area || lab.pipelineStage),
      page: "commercialCrm",
      ...buildHaystack([title, lab.labId, lab.area, lab.agentName]),
    });
  }

  for (const profile of readBundle.compensationRaw?.profiles || []) {
    const title = str(profile.display_name || profile.agent_name || profile.username);
    if (!title) continue;
    items.push({
      id: `emp-${str(profile.user_id)}`,
      group: "employees",
      title,
      subtitle: str(profile.role),
      page: "compensationPayroll",
      ...buildHaystack([title, profile.email, profile.role, profile.agent_id]),
    });
  }

  for (const order of readBundle.opsPayload?.orders || []) {
    const title = str(order.orderId || order.order_id) || "Order";
    items.push({
      id: `ord-${title}`,
      group: "orders",
      title,
      subtitle: str(order.labName || order.lab_name),
      page: "orders",
      ...buildHaystack([title, order.labName, order.orderStatus, order.status]),
    });
  }

  for (const contract of readBundle.commercialRaw?.contracts || []) {
    const title = str(contract.labName || contract.lab_name) || str(contract.id);
    items.push({
      id: `con-${str(contract.id)}`,
      group: "contracts",
      title,
      subtitle: str(contract.status),
      page: "labContractEngine",
      ...buildHaystack([title, contract.status, contract.type]),
    });
  }

  for (const row of readBundle.opsPayload?.collections || []) {
    const title = str(row.labName || row.lab_name) || "Collection";
    items.push({
      id: `col-${str(row.labId || row.lab_id)}`,
      group: "collections",
      title,
      subtitle: `Outstanding ${row.outstandingAmount}`,
      page: "risk",
      ...buildHaystack([title, row.labId, row.riskStatus]),
    });
  }

  for (const visit of readBundle.commercialRaw?.visits || []) {
    const title = str(visit.labName) || str(visit.labId);
    items.push({
      id: `act-${str(visit.visitId)}`,
      group: "activities",
      title: `${visit.visitType || "Visit"} · ${title}`,
      subtitle: str(visit.visitDate),
      page: "commercialCrm",
      ...buildHaystack([title, visit.agentName, visit.visitType, visit.notes]),
    });
  }

  items.push({
    id: "report-commercial",
    group: "reports",
    title: "Commercial Reports",
    subtitle: "Pipeline and agent performance",
    page: "commercialCrm",
    ...buildHaystack(["commercial reports pipeline analytics"]),
  });
  items.push({
    id: "report-people",
    group: "reports",
    title: "People Operations Analytics",
    subtitle: "Payroll and compensation reports",
    page: "compensationPayroll",
    ...buildHaystack(["people operations payroll compensation reports"]),
  });
  items.push({
    id: "report-efi",
    group: "reports",
    title: "Executive Financial Intelligence",
    subtitle: "HQ financial intelligence",
    page: "executiveFinancialIntelligence",
    ...buildHaystack(["executive financial intelligence revenue collections"]),
  });

  return items;
}

export function searchFounderIndex(index = [], query = "", { groupId = "all", limit = 25 } = {}) {
  const q = str(query);
  if (!q) return [];
  const filtered = groupId === "all" ? index : index.filter((row) => row.group === groupId);
  return filtered
    .map((item) => ({ item, score: scoreHqSearchMatch(item, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.item);
}
