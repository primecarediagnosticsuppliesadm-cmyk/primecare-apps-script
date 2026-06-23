function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseFollowUpDate(value) {
  const raw = str(value);
  if (!raw || raw === "-") return null;
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** HQ Labs attention queue cards from visible lab rows (read-only). */
export function buildLabsAttentionCards(labs = [], users = []) {
  const list = Array.isArray(labs) ? labs : [];
  const today = startOfToday();

  const outstanding = list.filter((lab) => num(lab.outstandingAmount ?? lab.outstanding) > 0);
  const creditHold = list.filter((lab) => str(lab.creditStatus).toUpperCase() === "HOLD");
  const followUpsDue = list.filter((lab) => {
    const d = parseFollowUpDate(lab.nextFollowUp);
    return d && d <= today;
  });
  const unassigned = list.filter((lab) => !isLabAssigned(lab, users));

  return [
    {
      id: "outstanding",
      title: "Outstanding Collections",
      count: outstanding.length,
      severity: outstanding.length > 0 ? "attention" : "healthy",
      description: "Labs with receivables to follow up",
      actionText: outstanding.length > 0 ? "Prioritize collections follow-up" : "All receivables current",
      ctaLabel: outstanding.length > 0 ? "Review Collections" : "View Collections",
      page: "collections",
      filter: "outstanding",
    },
    {
      id: "hold",
      title: "Credit Hold Labs",
      count: creditHold.length,
      severity: creditHold.length > 0 ? "critical" : "healthy",
      description: "Accounts blocked from ordering",
      actionText: creditHold.length > 0 ? "Release or escalate credit holds" : "No labs on hold",
      ctaLabel: creditHold.length > 0 ? "Review Holds" : "View Directory",
      page: null,
      filter: "HOLD",
    },
    {
      id: "followups",
      title: "Follow-Ups Due",
      count: followUpsDue.length,
      severity: followUpsDue.length > 0 ? "monitor" : "healthy",
      description: "Scheduled follow-ups due today or overdue",
      actionText: followUpsDue.length > 0 ? "Complete field follow-ups today" : "No follow-ups due",
      ctaLabel: followUpsDue.length > 0 ? "Review Follow-Ups" : "View Visits",
      page: "visits",
      filter: "followups",
    },
    {
      id: "unassigned",
      title: "Unassigned Labs",
      count: unassigned.length,
      severity: unassigned.length > 0 ? "monitor" : "healthy",
      description: "Labs without an assigned field agent",
      actionText: unassigned.length > 0 ? "Assign agents in Operations Center" : "All labs assigned",
      ctaLabel: unassigned.length > 0 ? "Review Assignments" : "View Directory",
      page: "operationsCenter",
      filter: "unassigned",
    },
  ];
}

export function filterLabsForAttention(labs = [], filter = "ALL", users = []) {
  const list = Array.isArray(labs) ? labs : [];
  const today = startOfToday();
  const f = str(filter).toUpperCase();

  if (f === "ALL") return list;
  if (f === "OK" || f === "NEAR_LIMIT" || f === "HOLD") {
    return list.filter((lab) => str(lab.creditStatus || "OK").toUpperCase() === f);
  }
  if (f === "OUTSTANDING") {
    return list.filter((lab) => num(lab.outstandingAmount ?? lab.outstanding) > 0);
  }
  if (f === "FOLLOWUPS") {
    return list.filter((lab) => {
      const d = parseFollowUpDate(lab.nextFollowUp);
      return d && d <= today;
    });
  }
  if (f === "UNASSIGNED") {
    return list.filter((lab) => !isLabAssigned(lab, users));
  }
  return list;
}

export function buildLabsPortfolioSummary(labs = [], summary = null) {
  const list = Array.isArray(labs) ? labs : [];
  const active = list.filter((x) => str(x.status).toLowerCase() === "active").length;
  return {
    totalLabs: list.length,
    activeLabs: active,
    revenue: num(summary?.totalRevenue),
    outstanding: num(summary?.totalOutstanding),
  };
}

export function formatLabsCurrency(value) {
  return `₹${num(value).toLocaleString("en-IN")}`;
}

export function formatLabsDate(value) {
  const raw = str(value);
  if (!raw || raw === "-") return "";
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function hasLabField(value) {
  const s = str(value);
  return Boolean(s && s !== "-");
}

/** Agent business id from a lab row (v_labs_credit / labs table shapes). */
export function labAssignedAgentId(lab = {}) {
  return str(
    lab.assignedAgentId ??
      lab.assigned_agent_id ??
      lab.agentId ??
      lab.agent_id
  );
}

/** Display name already on the lab row, if any. */
export function labAssignedAgentNameRaw(lab = {}) {
  return str(
    lab.assignedAgent ??
      lab.assigned_agent ??
      lab.agent_name ??
      lab.agentName
  );
}

/** Map agent/user ids → display names from Operations Center directory. */
export function buildAgentDisplayNameLookup(users = []) {
  const map = new Map();
  for (const user of users) {
    const name = str(user.displayName ?? user.name ?? user.agentName);
    if (!name) continue;
    for (const key of [user.agentId, user.userId, user.id]) {
      const k = str(key).toLowerCase();
      if (k && !map.has(k)) map.set(k, name);
    }
  }
  return map;
}

/**
 * Resolve assigned agent display name for HQ Labs UI.
 * Prefer lab.agent_name / assignedAgent; else map assigned_agent_id via directory users.
 */
export function resolveLabAssignedAgentName(lab, users = []) {
  const rawName = labAssignedAgentNameRaw(lab);
  if (rawName) return rawName;

  const agentId = labAssignedAgentId(lab);
  if (!agentId) return "";

  const lookup = buildAgentDisplayNameLookup(users);
  return lookup.get(agentId.toLowerCase()) || "";
}

/** True when lab has an assigned agent id or resolved display name. */
export function isLabAssigned(lab, users = []) {
  return Boolean(labAssignedAgentId(lab) || resolveLabAssignedAgentName(lab, users));
}

/** Directory / drawer label: name, else Unassigned. */
export function resolveLabAssignedAgentDisplay(lab, users = []) {
  return resolveLabAssignedAgentName(lab, users) || "";
}

export function labOutstandingAmount(lab = {}) {
  return num(lab.outstandingAmount ?? lab.outstanding);
}

/**
 * Group visible labs by assigned agent for HQ Agent Coverage summary.
 * Uses resolved agent id/name; unassigned labs returned separately.
 */
export function buildAgentCoverage(labs = [], users = []) {
  const list = Array.isArray(labs) ? labs : [];
  const byAgent = new Map();
  const unassignedLabs = [];

  for (const lab of list) {
    const labName = str(lab.labName) || str(lab.labId) || "Unnamed Lab";
    const labId = str(lab.labId);
    const outstanding = labOutstandingAmount(lab);

    if (!isLabAssigned(lab, users)) {
      unassignedLabs.push({ labId, labName, outstanding });
      continue;
    }

    const agentId = labAssignedAgentId(lab);
    const agentName = resolveLabAssignedAgentName(lab, users) || agentId || "Unknown Agent";
    const key = (agentId || agentName).toLowerCase();

    if (!byAgent.has(key)) {
      byAgent.set(key, {
        agentId,
        agentName,
        labs: [],
        totalOutstanding: 0,
      });
    }

    const entry = byAgent.get(key);
    if (!entry.agentId && agentId) entry.agentId = agentId;
    if (entry.agentName === entry.agentId && agentName !== agentId) entry.agentName = agentName;
    entry.labs.push({ labId, labName, outstanding });
    entry.totalOutstanding += outstanding;
  }

  const agents = Array.from(byAgent.values())
    .map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      labCount: row.labs.length,
      labs: row.labs,
      labNames: row.labs.map((l) => l.labName),
      totalOutstanding: row.totalOutstanding,
      multiLab: row.labs.length > 1,
    }))
    .sort((a, b) => {
      if (b.labCount !== a.labCount) return b.labCount - a.labCount;
      return str(a.agentName).localeCompare(str(b.agentName), undefined, { sensitivity: "base" });
    });

  return {
    agents,
    unassigned: {
      count: unassignedLabs.length,
      labs: unassignedLabs,
      labNames: unassignedLabs.map((l) => l.labName),
      totalOutstanding: unassignedLabs.reduce((sum, l) => sum + l.outstanding, 0),
    },
  };
}
