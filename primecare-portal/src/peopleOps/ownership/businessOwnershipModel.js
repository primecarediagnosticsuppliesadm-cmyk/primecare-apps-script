/**
 * Phase 8.4 — Business Ownership read façade (Years 1–3).
 *
 * CANONICAL OWNERSHIP SoT (do not invent a second model):
 *   Table:  lab_ownership (ACTIVE = current; INACTIVE = history)
 *   Engine: src/operations/labOwnershipEngine.js
 *   Writes: src/api/labOwnershipApi.js (Operations Center only)
 *   Legacy: labs.assigned_agent_id — sync fallback via buildOwnershipIndex
 *
 * This module is People Ops UI projection only — not a parallel ownership system.
 * No payroll / commission / finance / schema mutations.
 */
import { formatInr, num, roundMoney } from "@/compensation/analytics/analyticsFormatters.js";
import {
  buildOwnershipIndex,
  computeOwnershipMetrics,
  enrichLabAssignmentsWithOwnership,
  mapLabOwnershipRow,
  OWNERSHIP_STATUS,
  resolveAgentLabTerritoryLabel,
} from "@/operations/labOwnershipEngine.js";

function str(value) {
  return String(value ?? "").trim();
}

function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return str(value);
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function inReportingPeriod(payment, reportingContext = {}) {
  const date = str(payment.payment_date ?? payment.paymentDate).slice(0, 10);
  if (!date) return false;
  const start = str(reportingContext.periodStart).slice(0, 10);
  const end = str(reportingContext.periodEnd).slice(0, 10);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return num(payment.amount_received ?? payment.amountReceived) > 0;
}

function mapLabAssignments(labs = []) {
  return (labs || []).map((lab) => ({
    labId: str(lab.lab_id ?? lab.labId),
    labName: str(lab.lab_name ?? lab.labName),
    tenantId: str(lab.tenant_id ?? lab.tenantId),
    assignedAgentId: str(lab.assigned_agent_id ?? lab.assignedAgentId),
    area: str(lab.area ?? lab.territory),
    outstanding: num(lab.outstanding),
    creditStatus: lab.credit_status ?? lab.creditStatus,
    daysOverdue: num(lab.days_overdue ?? lab.daysOverdue),
  }));
}

function buildProfileDirectory({ profiles = [], employeeList = [] } = {}) {
  const byUserId = new Map();
  const byAgentId = new Map();

  for (const profile of profiles || []) {
    const userId = str(profile.user_id ?? profile.userId ?? profile.id);
    if (!userId) continue;
    const row = {
      userId,
      agentId: str(profile.agent_id ?? profile.agentId),
      role: str(profile.role).toLowerCase(),
      name: str(profile.display_name ?? profile.displayName ?? profile.full_name ?? profile.name) || userId,
      territory: str(profile.territory ?? profile.area),
      active: profile.active !== false && str(profile.status).toLowerCase() !== "inactive",
    };
    byUserId.set(userId, row);
    if (row.agentId) byAgentId.set(row.agentId.toLowerCase(), row);
  }

  for (const employee of employeeList || []) {
    const userId = str(employee.profileUserId);
    if (!userId || byUserId.has(userId)) continue;
    const row = {
      userId,
      agentId: str(employee.agentId),
      role: str(employee.role).toLowerCase() || "agent",
      name: str(employee.employeeName ?? employee.name) || userId,
      territory: str(employee.territory),
      active: true,
    };
    byUserId.set(userId, row);
    if (row.agentId) byAgentId.set(row.agentId.toLowerCase(), row);
  }

  return { byUserId, byAgentId };
}

function profileName(directory, { userId = "", agentId = "" } = {}) {
  if (userId && directory.byUserId.has(userId)) return directory.byUserId.get(userId).name;
  if (agentId && directory.byAgentId.has(agentId.toLowerCase())) {
    return directory.byAgentId.get(agentId.toLowerCase()).name;
  }
  return userId || agentId || "—";
}

function collectionsByLab(payments = [], reportingContext = {}) {
  const totals = new Map();
  for (const payment of payments || []) {
    if (!inReportingPeriod(payment, reportingContext)) continue;
    const labId = str(payment.lab_id ?? payment.labId).toLowerCase();
    if (!labId) continue;
    totals.set(labId, roundMoney((totals.get(labId) || 0) + num(payment.amount_received ?? payment.amountReceived)));
  }
  return totals;
}

function commissionByAgent(previewRows = []) {
  const totals = new Map();
  for (const row of previewRows || []) {
    if (!row.inReportingContext) continue;
    const agentId = str(row.agentId).toLowerCase();
    if (!agentId) continue;
    totals.set(agentId, roundMoney((totals.get(agentId) || 0) + num(row.commissionAmount)));
  }
  return totals;
}

export function buildOwnershipTimelineForLab(labId, ownershipRows = [], directory) {
  const key = str(labId).toLowerCase();
  const rows = (ownershipRows || [])
    .filter((row) => str(row.labId ?? row.lab_id).toLowerCase() === key)
    .map(mapLabOwnershipRow)
    .sort((a, b) => new Date(a.assignedAt || a.createdAt || 0) - new Date(b.assignedAt || b.createdAt || 0));

  const events = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;
    const agentName = profileName(directory, { agentId: row.primaryAgentId });
    const adminName = profileName(directory, { userId: row.managerId });
    const base = {
      labId: row.labId,
      primaryAgentId: row.primaryAgentId,
      primaryAgentName: agentName,
      adminId: row.managerId,
      adminName,
      status: row.status,
    };

    const agentChanged =
      prev &&
      str(prev.primaryAgentId).toLowerCase() !== str(row.primaryAgentId).toLowerCase() &&
      str(prev.primaryAgentId) &&
      str(row.primaryAgentId);

    if (agentChanged) {
      events.push({
        id: `${row.id || row.labId}-transferred`,
        eventType: "transferred",
        at: row.assignedAt || row.createdAt,
        atLabel: dateLabel(row.assignedAt || row.createdAt),
        ...base,
        notes: `Transferred from ${profileName(directory, { agentId: prev.primaryAgentId })} → ${agentName}`,
      });
    } else if (row.assignedAt || row.createdAt) {
      events.push({
        id: `${row.id || row.labId}-assigned`,
        eventType: row.status === OWNERSHIP_STATUS.ACTIVE ? "current" : "assigned",
        at: row.assignedAt || row.createdAt,
        atLabel: dateLabel(row.assignedAt || row.createdAt),
        ...base,
        notes: row.status === OWNERSHIP_STATUS.ACTIVE ? "Current ownership" : "Assigned",
      });
    }

    if (
      row.updatedAt &&
      row.updatedAt !== row.assignedAt &&
      !agentChanged &&
      row.status === OWNERSHIP_STATUS.ACTIVE
    ) {
      events.push({
        id: `${row.id || row.labId}-changed`,
        eventType: "changed",
        at: row.updatedAt,
        atLabel: dateLabel(row.updatedAt),
        ...base,
        notes: "Ownership changed",
      });
    }

    if (row.status === OWNERSHIP_STATUS.INACTIVE) {
      events.push({
        id: `${row.id || row.labId}-ended`,
        eventType: "ended",
        at: row.updatedAt || row.assignedAt,
        atLabel: dateLabel(row.updatedAt || row.assignedAt),
        ...base,
        notes: "Ownership ended",
      });
    }
  }

  if (!events.length) {
    events.push({
      id: `${key}-derived`,
      eventType: "current",
      atLabel: "—",
      notes: "Derived from labs.assigned_agent_id (canonical lab_ownership row missing)",
      primaryAgentName: "—",
      adminName: "—",
      status: "DERIVED",
    });
  }

  return events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

export function resolveOwnerOnPaymentDate(labId, paymentDate, ownershipRows = []) {
  const target = str(paymentDate).slice(0, 10);
  const key = str(labId).toLowerCase();
  if (!target || !key) return null;

  const candidates = (ownershipRows || [])
    .filter((row) => str(row.labId ?? row.lab_id).toLowerCase() === key)
    .map(mapLabOwnershipRow)
    .filter((row) => {
      const assigned = str(row.assignedAt || row.createdAt).slice(0, 10);
      return !assigned || assigned <= target;
    })
    .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));

  return candidates[0] || null;
}

export function buildCompensationAttributionPreview({
  collectionsAmount = 0,
  agentCommissionAmount = 0,
  adminOverrideBps = 50,
  executiveOverrideBps = 25,
} = {}) {
  const collections = num(collectionsAmount);
  const agentCommission = roundMoney(agentCommissionAmount);
  const adminOverride = roundMoney((collections * num(adminOverrideBps)) / 10000);
  const executiveOverride = roundMoney((collections * num(executiveOverrideBps)) / 10000);
  return {
    previewOnly: true,
    displayOnly: true,
    title: "Hierarchical Compensation (Display)",
    collectionLabel: formatInr(collections),
    agentDirectCommissionAmount: agentCommission,
    agentDirectCommissionLabel: formatInr(agentCommission),
    adminOverrideLabel: formatInr(adminOverride),
    adminOverrideAmount: adminOverride,
    executiveOverrideLabel: formatInr(executiveOverride),
    executiveOverrideAmount: executiveOverride,
    totalTeamPayableLabel: formatInr(roundMoney(agentCommission + adminOverride + executiveOverride)),
    futureOverrideNote:
      "Display-only hierarchical overrides. Does not change payroll, commission engine, or payouts.",
  };
}

function dominantAdminForTerritory(labs = []) {
  const counts = new Map();
  for (const lab of labs) {
    const adminId = str(lab.managerId);
    if (!adminId) continue;
    counts.set(adminId, (counts.get(adminId) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "";
}

function dominantAgentForTerritory(labs = []) {
  const counts = new Map();
  for (const lab of labs) {
    const agentId = str(lab.primaryAgentId);
    if (!agentId) continue;
    counts.set(agentId, (counts.get(agentId) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "";
}

export function buildTerritoryDashboard({
  enrichedLabs = [],
  directory,
  collectionsByLabMap = new Map(),
  commissionByAgentMap = new Map(),
  executives = [],
} = {}) {
  const byTerritory = new Map();
  for (const lab of enrichedLabs) {
    const territory = resolveAgentLabTerritoryLabel(lab) || "Unassigned";
    const bucket = byTerritory.get(territory) || [];
    bucket.push(lab);
    byTerritory.set(territory, bucket);
  }

  const primaryExecutive = executives[0] || null;

  return [...byTerritory.entries()]
    .map(([territoryName, labs]) => {
      const adminId = dominantAdminForTerritory(labs);
      const agentId = dominantAgentForTerritory(labs);
      const collections = roundMoney(
        labs.reduce((sum, lab) => sum + num(collectionsByLabMap.get(str(lab.labId).toLowerCase())), 0)
      );
      const potentialCommission = roundMoney(num(commissionByAgentMap.get(str(agentId).toLowerCase())));
      const outstanding = roundMoney(labs.reduce((sum, lab) => sum + num(lab.outstanding), 0));

      return {
        territoryId: territoryName.toLowerCase().replace(/\s+/g, "-"),
        territoryName,
        executiveName: primaryExecutive?.name || "—",
        adminName: profileName(directory, { userId: adminId }),
        primaryAgentName: profileName(directory, { agentId }),
        labCount: labs.length,
        collections,
        collectionsLabel: formatInr(collections),
        potentialCompensation: potentialCommission,
        potentialCompensationLabel: formatInr(potentialCommission),
        outstandingLabel: formatInr(outstanding),
        healthStatus: outstanding > collections * 0.5 ? "attention" : "healthy",
      };
    })
    .sort((a, b) => b.collections - a.collections);
}

function buildAgentNodes({
  agentIds = [],
  enrichedLabs = [],
  directory,
  collectionsByLabMap,
  commissionByAgentMap,
  onLabSelect,
}) {
  return agentIds.map((agentId) => {
    const agentProfile = directory.byAgentId.get(str(agentId).toLowerCase());
    const labs = enrichedLabs.filter((lab) => str(lab.primaryAgentId).toLowerCase() === str(agentId).toLowerCase());
    const collections = roundMoney(
      labs.reduce((sum, lab) => sum + num(collectionsByLabMap.get(str(lab.labId).toLowerCase())), 0)
    );
    const commission = roundMoney(num(commissionByAgentMap.get(str(agentId).toLowerCase())));

    return {
      id: `agent-${agentId}`,
      type: "agent",
      entityId: agentId,
      profileUserId: agentProfile?.userId || "",
      label: profileName(directory, { agentId }),
      subtitle: `${labs.length} lab${labs.length === 1 ? "" : "s"}`,
      collections,
      collectionsLabel: formatInr(collections),
      payrollImpactLabel: formatInr(commission),
      compensationPreview: buildCompensationAttributionPreview({
        collectionsAmount: collections,
        agentCommissionAmount: commission,
      }),
      children: labs.map((lab) => ({
        id: `lab-${lab.labId}`,
        type: "lab",
        entityId: lab.labId,
        label: lab.labName || lab.labId,
        subtitle: resolveAgentLabTerritoryLabel(lab) || "—",
        collections: num(collectionsByLabMap.get(str(lab.labId).toLowerCase())),
        collectionsLabel: formatInr(collectionsByLabMap.get(str(lab.labId).toLowerCase()) || 0),
        payrollImpactLabel: formatInr(commission),
        managerId: lab.managerId,
        primaryAgentId: lab.primaryAgentId,
        onSelect: onLabSelect,
      })),
    };
  });
}

export function buildSalesOrgTree({
  enrichedLabs = [],
  directory,
  collectionsByLabMap = new Map(),
  commissionByAgentMap = new Map(),
  executives = [],
  admins = [],
} = {}) {
  const agentsByAdmin = new Map();
  const orphanAgents = new Set();

  for (const lab of enrichedLabs) {
    const adminId = str(lab.managerId);
    const agentId = str(lab.primaryAgentId);
    if (!agentId) continue;
    if (adminId) {
      const bucket = agentsByAdmin.get(adminId) || new Set();
      bucket.add(agentId);
      agentsByAdmin.set(adminId, bucket);
    } else {
      orphanAgents.add(agentId);
    }
  }

  const adminIds = admins.length
    ? admins.map((row) => row.userId)
    : [...agentsByAdmin.keys()];

  const executiveNodes = (executives.length ? executives : [{ userId: "tenant", name: "Executive" }]).map(
    (executive) => {
      const adminChildren = adminIds.map((adminId) => {
        const agentIds = [...(agentsByAdmin.get(adminId) || [])];
        const agentNodes = buildAgentNodes({
          agentIds,
          enrichedLabs,
          directory,
          collectionsByLabMap,
          commissionByAgentMap,
        });
        const adminCollections = roundMoney(agentNodes.reduce((sum, n) => sum + num(n.collections), 0));
        const adminLabs = agentNodes.reduce((sum, n) => sum + (n.children?.length || 0), 0);
        return {
          id: `admin-${adminId}`,
          type: "admin",
          entityId: adminId,
          profileUserId: adminId,
          label: profileName(directory, { userId: adminId }),
          subtitle: `${agentIds.length} agent${agentIds.length === 1 ? "" : "s"} · ${adminLabs} labs`,
          collections: adminCollections,
          collectionsLabel: formatInr(adminCollections),
          children: agentNodes,
        };
      });

      if (orphanAgents.size) {
        const orphanNodes = buildAgentNodes({
          agentIds: [...orphanAgents],
          enrichedLabs,
          directory,
          collectionsByLabMap,
          commissionByAgentMap,
        });
        const orphanCollections = roundMoney(orphanNodes.reduce((sum, n) => sum + num(n.collections), 0));
        adminChildren.push({
          id: "admin-unassigned",
          type: "admin",
          entityId: "",
          label: "Unassigned Admin",
          subtitle: "Labs without reporting admin",
          collections: orphanCollections,
          collectionsLabel: formatInr(orphanCollections),
          children: orphanNodes,
        });
      }

      const execCollections = roundMoney(adminChildren.reduce((sum, n) => sum + num(n.collections), 0));
      const execAgents = adminChildren.reduce((sum, n) => sum + (n.children?.length || 0), 0);
      const execLabs = adminChildren.reduce(
        (sum, n) => sum + (n.children || []).reduce((inner, a) => inner + (a.children?.length || 0), 0),
        0
      );

      return {
        id: `executive-${executive.userId}`,
        type: "executive",
        entityId: executive.userId,
        profileUserId: executive.userId,
        label: executive.name,
        subtitle: `${adminChildren.length} admins · ${execAgents} agents · ${execLabs} labs`,
        collections: execCollections,
        collectionsLabel: formatInr(execCollections),
        children: adminChildren,
      };
    }
  );

  return executiveNodes;
}

export function buildRoleScopedOwnershipDashboard({
  actorRole = "executive",
  actorUserId = "",
  actorAgentId = "",
  orgTree = [],
  enrichedLabs = [],
  territories = [],
  metrics = {},
  collectionsByLabMap = new Map(),
  commissionByAgentMap = new Map(),
  directory,
  arRows = [],
} = {}) {
  const role = str(actorRole).toLowerCase();
  let scopedLabs = enrichedLabs;
  let scopedTerritories = territories;

  if (role === "admin") {
    scopedLabs = enrichedLabs.filter((lab) => str(lab.managerId) === str(actorUserId));
    const territoryNames = new Set(scopedLabs.map((lab) => resolveAgentLabTerritoryLabel(lab) || "Unassigned"));
    scopedTerritories = territories.filter((row) => territoryNames.has(row.territoryName));
  } else if (role === "agent") {
    scopedLabs = enrichedLabs.filter(
      (lab) => str(lab.primaryAgentId).toLowerCase() === str(actorAgentId).toLowerCase()
    );
    const territoryNames = new Set(scopedLabs.map((lab) => resolveAgentLabTerritoryLabel(lab) || "Unassigned"));
    scopedTerritories = territories.filter((row) => territoryNames.has(row.territoryName));
  }

  const collections = roundMoney(
    scopedLabs.reduce((sum, lab) => sum + num(collectionsByLabMap.get(str(lab.labId).toLowerCase())), 0)
  );

  const agentIds = new Set(scopedLabs.map((lab) => str(lab.primaryAgentId).toLowerCase()).filter(Boolean));
  const potentialCompensation = roundMoney(
    [...agentIds].reduce((sum, agentId) => sum + num(commissionByAgentMap.get(agentId)), 0)
  );

  const admins = new Set(scopedLabs.map((lab) => lab.managerId).filter(Boolean));
  const agents = agentIds.size;

  const scopedLabKeys = new Set(scopedLabs.map((lab) => str(lab.labId).toLowerCase()));
  const revenue = roundMoney(
    (arRows || [])
      .filter((row) => scopedLabKeys.has(str(row.lab_id ?? row.labId).toLowerCase()))
      .reduce((sum, row) => sum + num(row.total_delivered ?? row.totalDelivered), 0)
  );
  const outstanding = roundMoney(scopedLabs.reduce((sum, lab) => sum + num(lab.outstanding), 0));
  const commission = potentialCompensation;

  let growth = "stable";
  if (collections > 0 && outstanding > collections * 0.5) growth = "at-risk";
  else if (collections > 0) growth = "positive";

  const roleRollups =
    role === "executive"
      ? {
          collections,
          collectionsLabel: formatInr(collections),
          revenue,
          revenueLabel: formatInr(revenue),
          commission,
          commissionLabel: formatInr(commission),
          payroll: commission,
          payrollLabel: formatInr(commission),
          labs: scopedLabs.length,
          agents,
          admins: admins.size,
          executives: orgTree.length,
          growth,
        }
      : role === "admin"
        ? {
            collections,
            collectionsLabel: formatInr(collections),
            commission,
            commissionLabel: formatInr(commission),
            payroll: commission,
            payrollLabel: formatInr(commission),
            agents,
            labs: scopedLabs.length,
            growth,
          }
        : role === "agent"
          ? {
              collections,
              collectionsLabel: formatInr(collections),
              commission,
              commissionLabel: formatInr(commission),
              labs: scopedLabs.length,
              visitsNote: "See Commercial workspace for visit activity",
              growth,
            }
          : {
              revenue,
              revenueLabel: formatInr(revenue),
              collections,
              collectionsLabel: formatInr(collections),
              outstanding,
              outstandingLabel: formatInr(outstanding),
              contribution: commission,
              contributionLabel: formatInr(commission),
              growth,
            };

  return {
    role,
    kpis: [
      role === "executive"
        ? { id: "executives", label: "Executives", value: orgTree.length }
        : null,
      role !== "agent" ? { id: "admins", label: "Admins", value: admins.size } : null,
      role !== "agent" ? { id: "agents", label: "Agents", value: agents } : null,
      { id: "labs", label: role === "agent" ? "My Labs" : "Labs", value: scopedLabs.length },
      { id: "territories", label: "Territories", value: scopedTerritories.length },
      { id: "collections", label: "Collections", value: collections, valueLabel: formatInr(collections) },
      {
        id: "potential_compensation",
        label: "Potential Compensation",
        value: potentialCompensation,
        valueLabel: formatInr(potentialCompensation),
      },
      revenue > 0
        ? { id: "revenue", label: "Revenue", value: revenue, valueLabel: formatInr(revenue) }
        : null,
      outstanding > 0
        ? { id: "outstanding", label: "Outstanding", value: outstanding, valueLabel: formatInr(outstanding) }
        : null,
      { id: "growth", label: "Growth signal", value: growth, valueLabel: growth },
    ].filter(Boolean),
    roleRollups,
    scopedLabs,
    scopedTerritories,
    coveragePct: metrics.coveragePct ?? 0,
    unassignedLabs: scopedLabs.filter((lab) => !lab.hasOwnership).length,
    ownershipGaps: scopedLabs
      .filter((lab) => !lab.hasOwnership || !lab.managerId)
      .slice(0, 20)
      .map((lab) => ({
        labId: lab.labId,
        labName: lab.labName || lab.labId,
        gap: !lab.hasOwnership ? "No primary agent" : "No reporting admin",
      })),
  };
}

export function buildLab360Model({
  labId,
  enrichedLabs = [],
  ownershipRows = [],
  directory,
  payments = [],
  arRows = [],
  reportingContext = {},
  commissionByAgentMap = new Map(),
} = {}) {
  const lab = enrichedLabs.find((row) => str(row.labId).toLowerCase() === str(labId).toLowerCase());
  if (!lab) return null;

  const labKey = str(labId).toLowerCase();
  const periodPayments = (payments || []).filter(
    (payment) =>
      str(payment.lab_id ?? payment.labId).toLowerCase() === labKey && inReportingPeriod(payment, reportingContext)
  );
  const collections = roundMoney(
    periodPayments.reduce((sum, payment) => sum + num(payment.amount_received ?? payment.amountReceived), 0)
  );
  const orderVolume = roundMoney(
    (arRows || [])
      .filter((row) => str(row.lab_id ?? row.labId).toLowerCase() === labKey)
      .reduce((sum, row) => sum + num(row.total_delivered ?? row.totalDelivered), 0)
  );

  const agentCommission = roundMoney(num(commissionByAgentMap.get(str(lab.primaryAgentId).toLowerCase())));
  const executives = [...directory.byUserId.values()].filter((row) => row.role === "executive" && row.active);

  return {
    labId: lab.labId,
    labName: lab.labName || lab.labId,
    territory: resolveAgentLabTerritoryLabel(lab) || "—",
    executiveName: executives[0]?.name || "—",
    adminName: profileName(directory, { userId: lab.managerId }),
    agentName: profileName(directory, { agentId: lab.primaryAgentId }),
    primaryAgentId: lab.primaryAgentId,
    managerId: lab.managerId,
    ownershipStatus: lab.hasOwnership ? "ACTIVE" : "UNASSIGNED",
    collections,
    collectionsLabel: formatInr(collections),
    paymentsCount: periodPayments.length,
    paymentsCountLabel: String(periodPayments.length),
    ordersVolume: orderVolume,
    ordersVolumeLabel: formatInr(orderVolume),
    outstandingLabel: formatInr(lab.outstanding),
    ordersNote:
      "Orders volume = AR delivered totals; payments = reporting-period cash collections. Read-only — no orders table mutation.",
    compensationAttribution: buildCompensationAttributionPreview({
      collectionsAmount: collections,
      agentCommissionAmount: agentCommission,
    }),
    ownershipTimeline: buildOwnershipTimelineForLab(lab.labId, ownershipRows, directory),
    previewOnly: true,
    canonicalSource: "lab_ownership",
  };
}

export function buildEmployeeOwnershipContext({
  workspace,
  profileUserId = "",
  agentId = "",
} = {}) {
  if (!workspace) return null;
  const directory = workspace.directory;
  const profile =
    directory.byUserId.get(str(profileUserId)) ||
    (agentId ? directory.byAgentId.get(str(agentId).toLowerCase()) : null);
  if (!profile) return null;

  const role = profile.role;
  let managedLabs = [];
  if (role === "agent") {
    managedLabs = workspace.enrichedLabs.filter(
      (lab) => str(lab.primaryAgentId).toLowerCase() === str(profile.agentId).toLowerCase()
    );
  } else if (role === "admin") {
    managedLabs = workspace.enrichedLabs.filter((lab) => str(lab.managerId) === str(profile.userId));
  } else if (role === "executive") {
    managedLabs = workspace.enrichedLabs;
  }

  const territories = [...new Set(managedLabs.map((lab) => resolveAgentLabTerritoryLabel(lab) || "Unassigned"))];
  const collections = roundMoney(
    managedLabs.reduce(
      (sum, lab) => sum + num(workspace.collectionsByLabMap.get(str(lab.labId).toLowerCase())),
      0
    )
  );
  const commission = roundMoney(
    role === "agent" ? num(workspace.commissionByAgentMap.get(str(profile.agentId).toLowerCase())) : 0
  );

  const reportingAdminIds = new Set(managedLabs.map((lab) => lab.managerId).filter(Boolean));
  const reportingAdmins = [...reportingAdminIds].map((id) => profileName(directory, { userId: id }));
  const executives = [...directory.byUserId.values()].filter((row) => row.role === "executive");

  let managedAgents = [];
  if (role === "admin") {
    managedAgents = [
      ...new Set(managedLabs.map((lab) => profileName(directory, { agentId: lab.primaryAgentId })).filter(Boolean)),
    ];
  }

  return {
    previewOnly: true,
    canonicalSource: "lab_ownership",
    territories: territories.join(", ") || "—",
    managedLabCount: managedLabs.length,
    managedLabs: managedLabs.slice(0, 12).map((lab) => ({
      labId: lab.labId,
      labName: lab.labName,
      territory: resolveAgentLabTerritoryLabel(lab) || "—",
    })),
    reportingExecutive: executives.map((row) => row.name).join(", ") || "—",
    reportingAdmin: reportingAdmins.join(", ") || "—",
    reportingTo: role === "agent" ? reportingAdmins.join(", ") || "—" : executives.map((row) => row.name).join(", ") || "—",
    managedBy: role === "agent" ? reportingAdmins.join(", ") || "—" : "—",
    manages:
      role === "admin"
        ? managedAgents.join(", ") || "—"
        : role === "executive"
          ? `${workspace.metrics?.enrichedLabs?.length || managedLabs.length} labs`
          : "—",
    ownershipChain:
      role === "agent"
        ? `${executives[0]?.name || "Executive"} → ${reportingAdmins[0] || "Admin"} → ${profile.name}`
        : role === "admin"
          ? `${executives[0]?.name || "Executive"} → ${profile.name}`
          : profile.name,
    collectionAttributionLabel: formatInr(collections),
    potentialOverrideCompensation: buildCompensationAttributionPreview({
      collectionsAmount: collections,
      agentCommissionAmount: commission,
    }),
  };
}

export function buildPeopleOpsOwnershipWorkspace({
  model,
  employeeList = [],
  ownershipRows = [],
  actorRole = "executive",
  actorUserId = "",
  actorAgentId = "",
  profiles = [],
  tenantId = "",
  payments = [],
  labs = [],
  arRows = [],
} = {}) {
  const hqTenantId = str(tenantId || model?.reportingContext?.tenantId);
  const reportingContext = model?.reportingContext || {};
  const labAssignments = mapLabAssignments(labs.length ? labs : model?.labs || []);
  const ownershipIndex = buildOwnershipIndex(ownershipRows, labAssignments, hqTenantId);
  const metrics = computeOwnershipMetrics({
    labAssignments,
    ownershipIndex,
    agents: Object.values(model?.agentProfiles || {}),
    hqTenantId,
  });
  const enrichedLabs = metrics.enrichedLabs || [];
  const directory = buildProfileDirectory({ profiles, employeeList });
  const paymentRows = payments.length ? payments : model?.payments || [];
  const arRowsResolved = arRows.length ? arRows : model?.arRows || [];
  const collectionsByLabMap = collectionsByLab(paymentRows, reportingContext);
  const commissionByAgentMap = commissionByAgent(model?.previewRows || []);

  const executives = [...directory.byUserId.values()].filter((row) => row.role === "executive" && row.active);
  const admins = [...directory.byUserId.values()].filter((row) => row.role === "admin" && row.active);

  const territories = buildTerritoryDashboard({
    enrichedLabs,
    directory,
    collectionsByLabMap,
    commissionByAgentMap,
    executives,
  });

  const orgTree = buildSalesOrgTree({
    enrichedLabs,
    directory,
    collectionsByLabMap,
    commissionByAgentMap,
    executives,
    admins,
  });

  const dashboard = buildRoleScopedOwnershipDashboard({
    actorRole,
    actorUserId,
    actorAgentId,
    orgTree,
    enrichedLabs,
    territories,
    metrics,
    collectionsByLabMap,
    commissionByAgentMap,
    directory,
    arRows: arRowsResolved,
  });

  return {
    previewOnly: true,
    readOnly: true,
    canonicalSource: "lab_ownership",
    writeSurface: "Operations Center (labOwnershipApi) — not People Ops",
    directory,
    enrichedLabs,
    ownershipRows,
    metrics,
    territories,
    orgTree,
    dashboard,
    collectionsByLabMap,
    commissionByAgentMap,
    reportingContext,
    resolveLab360: (labId) =>
      buildLab360Model({
        labId,
        enrichedLabs,
        ownershipRows,
        directory,
        payments: paymentRows,
        arRows: arRowsResolved,
        reportingContext,
        commissionByAgentMap,
      }),
    resolveEmployeeOwnership: ({ profileUserId, agentId }) =>
      buildEmployeeOwnershipContext({ workspace: null, profileUserId, agentId }),
    buildEmployeeOwnershipContext: ({ profileUserId, agentId }) =>
      buildEmployeeOwnershipContext({
        workspace: {
          directory,
          enrichedLabs,
          collectionsByLabMap,
          commissionByAgentMap,
          metrics,
        },
        profileUserId,
        agentId,
      }),
    resolveOwnerOnPaymentDate: (labId, paymentDate) =>
      resolveOwnerOnPaymentDate(labId, paymentDate, ownershipRows),
    buildOwnershipTimelineForLab: (labId) => buildOwnershipTimelineForLab(labId, ownershipRows, directory),
  };
}
