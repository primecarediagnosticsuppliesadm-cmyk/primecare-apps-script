/**
 * Phase 9.0 — Commercial workspace derivations (read-only compose layer).
 *
 * Reuses (does not replace):
 *   - lab_qualifications pipeline via getQualificationReviewRead
 *   - agent_visits via bounded visit reads
 *   - lab_contracts via loadVisibleLabContracts
 *
 * No payroll / finance / orders / inventory mutations.
 * No second CRM schema.
 */
import {
  getPipelineStageLabel,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(num(value) * 100) / 100;
}

function formatInr(value) {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

function daysBetween(fromIso, toDate = new Date()) {
  const from = new Date(fromIso || 0);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((toDate.getTime() - from.getTime()) / 86400000));
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** UI commercial stages mapped onto existing SoTs — display labels only. */
export const COMMERCIAL_PIPELINE_STAGES = Object.freeze([
  {
    id: "prospect",
    label: "Prospect",
    sources: ["new"],
    probabilityDefault: 10,
  },
  {
    id: "qualified",
    label: "Qualified",
    sources: ["qualified"],
    probabilityDefault: 40,
  },
  {
    id: "meeting_scheduled",
    label: "Meeting Scheduled",
    sources: ["contacted"],
    probabilityDefault: 25,
  },
  {
    id: "sample_sent",
    label: "Sample Sent",
    sources: ["sample_sent"],
    probabilityDefault: 45,
  },
  {
    id: "quotation_sent",
    label: "Quotation Sent",
    sources: [],
    probabilityDefault: 50,
    proxyNote: "No quotes SoT — shown when negotiation expected value is set without contract",
  },
  {
    id: "negotiation",
    label: "Negotiation",
    sources: ["negotiation", "reagent_rental_discussion"],
    probabilityDefault: 60,
  },
  {
    id: "contract_review",
    label: "Contract Review",
    sources: [],
    probabilityDefault: 75,
    contractStatuses: ["Under Review", "Draft"],
  },
  {
    id: "activated",
    label: "Activated",
    sources: ["won"],
    probabilityDefault: 90,
  },
  {
    id: "customer",
    label: "Customer",
    sources: [],
    probabilityDefault: 100,
    contractStatuses: ["Active"],
  },
  {
    id: "lost",
    label: "Lost",
    sources: ["lost"],
    probabilityDefault: 0,
  },
]);

function mapVisit(row = {}) {
  return {
    id: str(row.visitId || row.visit_id || row.id),
    labId: str(row.labId || row.lab_id),
    labName: str(row.labName || row.lab_name) || str(row.labId || row.lab_id) || "—",
    agentId: str(row.agentId || row.agent_id),
    agentName: str(row.agentName || row.agent_name || row.agent) || "—",
    visitType: str(row.visitType || row.visit_type) || "Visit",
    visitDate: str(row.visitDate || row.visit_date).slice(0, 10),
    nextAction: str(row.nextAction || row.next_action),
    notes: str(row.notes),
    activityKind: "visit",
  };
}

function mapContract(row = {}) {
  const status = str(row.status || row.contract_status);
  return {
    id: str(row.id),
    labId: str(row.labId || row.lab_id),
    labName: str(row.labName || row.lab_name) || str(row.labId || row.lab_id),
    type: str(row.type || row.contract_type),
    status,
    revenue: num(row.commercialTerms?.estimatedMonthlyRevenue ?? row.estimatedMonthlyRevenue ?? row.revenue),
    products: row.products || row.lineItems || [],
    pricingLabel: str(row.commercialTerms?.pricingSummary || row.pricingSummary) || "—",
    renewalDate: str(row.endDate || row.end_date || row.renewalDate).slice(0, 10),
    risk: str(row.healthBand || row.health_band || row.risk) || "—",
    renewalProbability: num(row.renewalProbability ?? row.renewal_probability),
  };
}

function resolveCommercialStage(qual = {}, contractByLab = new Map()) {
  const pipeline = normalizeQualificationPipelineStage(qual.pipelineStage || qual.pipeline_stage);
  const labId = str(qual.labId || qual.lab_id).toLowerCase();
  const contract = contractByLab.get(labId);

  if (pipeline === "lost") return "lost";
  if (contract && str(contract.status) === "Active") return "customer";
  if (pipeline === "won" || (contract && str(contract.status) === "Active")) return "activated";
  if (contract && ["Under Review", "Draft"].includes(str(contract.status))) return "contract_review";
  if (pipeline === "negotiation" || pipeline === "reagent_rental_discussion") return "negotiation";
  if (pipeline === "sample_sent") return "sample_sent";
  if (pipeline === "qualified") return "qualified";
  if (pipeline === "contacted") return "meeting_scheduled";
  if (
    !pipeline ||
    pipeline === "new" ||
    pipeline === "hold"
  ) {
    if (num(qual.pipelineExpectedValue || qual.pipeline_expected_value) > 0 && !contract) {
      return "quotation_sent";
    }
    return "prospect";
  }
  return "prospect";
}

function stageMeta(stageId) {
  return COMMERCIAL_PIPELINE_STAGES.find((row) => row.id === stageId) || COMMERCIAL_PIPELINE_STAGES[0];
}

export function buildCommercialPipelineBoard({ qualifications = [], contracts = [] } = {}) {
  const contractByLab = new Map(
    (contracts || []).map((row) => [str(row.labId || row.lab_id).toLowerCase(), mapContract(row)])
  );

  const buckets = Object.fromEntries(
    COMMERCIAL_PIPELINE_STAGES.map((stage) => [
      stage.id,
      {
        ...stage,
        count: 0,
        expectedRevenue: 0,
        expectedCollection: 0,
        labs: [],
      },
    ])
  );

  for (const qual of qualifications || []) {
    const stageId = resolveCommercialStage(qual, contractByLab);
    const bucket = buckets[stageId];
    if (!bucket) continue;
    const expected = num(qual.pipelineExpectedValue ?? qual.pipeline_expected_value);
    const probability =
      num(qual.pipelineProbability ?? qual.pipeline_probability) || stageMeta(stageId).probabilityDefault;
    const weighted = roundMoney((expected * probability) / 100);
    const daysInStage = daysBetween(qual.pipelineStageUpdatedAt || qual.pipeline_stage_updated_at || qual.updatedAt);
    const lab = {
      labId: str(qual.labId),
      labName: str(qual.labName) || str(qual.labId),
      owner: str(qual.agentName) || str(qual.agentId) || "—",
      pipelineStage: normalizeQualificationPipelineStage(qual.pipelineStage) || "new",
      pipelineStageLabel: getPipelineStageLabel(qual.pipelineStage),
      commercialStage: stageId,
      expectedRevenue: expected,
      expectedRevenueLabel: formatInr(expected),
      probability,
      expectedCollection: weighted,
      expectedCollectionLabel: formatInr(weighted),
      daysInStage: daysInStage == null ? "—" : daysInStage,
      band: str(qual.qualificationBand),
      area: str(qual.area),
    };
    bucket.count += 1;
    bucket.expectedRevenue = roundMoney(bucket.expectedRevenue + expected);
    bucket.expectedCollection = roundMoney(bucket.expectedCollection + weighted);
    bucket.labs.push(lab);
  }

  return COMMERCIAL_PIPELINE_STAGES.map((stage) => {
    const bucket = buckets[stage.id];
    return {
      ...stage,
      count: bucket.count,
      expectedRevenue: bucket.expectedRevenue,
      expectedRevenueLabel: formatInr(bucket.expectedRevenue),
      expectedCollection: bucket.expectedCollection,
      expectedCollectionLabel: formatInr(bucket.expectedCollection),
      probability: stage.probabilityDefault,
      labs: bucket.labs.sort((a, b) => b.expectedRevenue - a.expectedRevenue),
    };
  });
}

export function buildCommercialDashboardKpis({
  qualifications = [],
  contracts = [],
  visits = [],
  pipelineBoard = [],
} = {}) {
  const board = pipelineBoard.length
    ? pipelineBoard
    : buildCommercialPipelineBoard({ qualifications, contracts });
  const byId = Object.fromEntries(board.map((row) => [row.id, row]));

  const weekStart = startOfWeek();
  const meetingsThisWeek = (visits || []).filter((visit) => {
    const d = new Date(str(visit.visitDate || visit.visit_date).slice(0, 10));
    return !Number.isNaN(d.getTime()) && d >= weekStart;
  }).length;

  const samplesOutstanding = byId.sample_sent?.count || 0;
  const quotesSent = byId.quotation_sent?.count || 0;
  const contractsPending = (contracts || []).filter((row) =>
    ["Draft", "Under Review"].includes(str(row.status))
  ).length;
  const activated = (byId.activated?.count || 0) + (byId.customer?.count || 0);
  const pipelineValue = roundMoney(board.reduce((sum, row) => sum + num(row.expectedRevenue), 0));
  const forecastCollections = roundMoney(board.reduce((sum, row) => sum + num(row.expectedCollection), 0));
  const open = board.filter((row) => !["lost", "customer"].includes(row.id)).reduce((sum, row) => sum + row.count, 0);
  const wonish = activated;
  const conversionRate = open + wonish > 0 ? Math.round((wonish / (open + wonish)) * 100) : 0;

  const cycleDays = board
    .flatMap((row) => row.labs)
    .map((lab) => num(lab.daysInStage))
    .filter((n) => n > 0);
  const averageSalesCycle = cycleDays.length
    ? Math.round(cycleDays.reduce((sum, n) => sum + n, 0) / cycleDays.length)
    : 0;

  return {
    totalProspects: byId.prospect?.count || 0,
    qualifiedLabs: byId.qualified?.count || 0,
    meetingsThisWeek,
    samplesOutstanding,
    quotesSent,
    contractsPending,
    labsActivated: activated,
    pipelineValue,
    pipelineValueLabel: formatInr(pipelineValue),
    forecastRevenue: pipelineValue,
    forecastRevenueLabel: formatInr(pipelineValue),
    forecastCollections,
    forecastCollectionsLabel: formatInr(forecastCollections),
    conversionRate,
    conversionRateLabel: `${conversionRate}%`,
    averageSalesCycle,
    averageSalesCycleLabel: averageSalesCycle ? `${averageSalesCycle} days` : "—",
  };
}

export function buildCommercialActivities({ visits = [], qualifications = [] } = {}) {
  const visitRows = (visits || []).map(mapVisit);
  const followUps = (qualifications || [])
    .filter((row) => str(row.nextFollowUpDate || row.next_follow_up_date))
    .map((row) => ({
      id: `followup-${str(row.labId)}`,
      labId: str(row.labId),
      labName: str(row.labName) || str(row.labId),
      agentName: str(row.agentName) || "—",
      visitType: "Follow-up",
      visitDate: str(row.nextFollowUpDate || row.next_follow_up_date).slice(0, 10),
      nextAction: str(row.pipelineNextAction || row.pipeline_next_action || row.notes),
      notes: "Qualification follow-up",
      activityKind: "follow_up",
    }));

  return [...visitRows, ...followUps]
    .sort((a, b) => str(b.visitDate).localeCompare(str(a.visitDate)))
    .slice(0, 200);
}

export function buildCommercialLab360({
  labId,
  qualifications = [],
  contracts = [],
  visits = [],
  ownershipContext = null,
} = {}) {
  const key = str(labId).toLowerCase();
  if (!key) return null;
  const qual = (qualifications || []).find((row) => str(row.labId).toLowerCase() === key);
  const contract = (contracts || []).find((row) => str(row.labId || row.lab_id).toLowerCase() === key);
  const labVisits = (visits || [])
    .map(mapVisit)
    .filter((row) => str(row.labId).toLowerCase() === key)
    .slice(0, 20);
  const mappedContract = contract ? mapContract(contract) : null;
  const stage = resolveCommercialStage(qual || {}, new Map(contract ? [[key, mappedContract]] : []));

  return {
    labId: str(qual?.labId || mappedContract?.labId || labId),
    labName: str(qual?.labName || mappedContract?.labName || labId),
    commercialStage: stage,
    commercialStageLabel: stageMeta(stage).label,
    profile: {
      band: str(qual?.qualificationBand) || "—",
      score: qual?.qualificationScore ?? "—",
      decisionMaker: str(qual?.decisionMaker) || "—",
      supplier: str(qual?.currentSupplier) || "—",
      paymentTerms: str(qual?.paymentTerms) || "—",
      area: str(qual?.area) || "—",
    },
    ownership: ownershipContext,
    qualification: qual
      ? {
          stage: getPipelineStageLabel(qual.pipelineStage),
          expectedValueLabel: formatInr(qual.pipelineExpectedValue ?? qual.pipeline_expected_value),
          probability: num(qual.pipelineProbability ?? qual.pipeline_probability),
          nextAction: str(qual.pipelineNextAction || qual.pipeline_next_action),
        }
      : null,
    visits: labVisits,
    contract: mappedContract,
    products: mappedContract?.products || [],
    quotesNote: "Commercial quotes SoT not present — use pipeline expected value as proxy.",
    ordersNote: "Open Orders page for order SoT — Commercial does not mutate orders.",
    collectionsNote: "Open Collections for AR SoT — Commercial does not mutate collections.",
    competitors: str(qual?.currentSupplier) ? [str(qual.currentSupplier)] : [],
    opportunities: str(qual?.reagentRentalPotential)
      ? [`Reagent rental: ${str(qual.reagentRentalPotential)}`]
      : [],
    risks: [
      mappedContract?.risk && mappedContract.risk !== "—" ? `Contract ${mappedContract.risk}` : null,
      str(qual?.qualificationBand) === "cold" ? "Cold qualification band" : null,
    ].filter(Boolean),
    timeline: [
      ...labVisits.map((visit) => ({
        id: `v-${visit.id}`,
        at: visit.visitDate,
        title: visit.visitType,
        subtitle: visit.nextAction || visit.notes || "Visit",
      })),
      mappedContract
        ? {
            id: `c-${mappedContract.id}`,
            at: mappedContract.renewalDate || "—",
            title: `Contract ${mappedContract.status}`,
            subtitle: mappedContract.type || "Lab contract",
          }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => str(b.at).localeCompare(str(a.at))),
    previewOnly: true,
  };
}

export function buildCommercialForecast({ pipelineBoard = [], contracts = [] } = {}) {
  const expectedRevenue = roundMoney(pipelineBoard.reduce((sum, row) => sum + num(row.expectedRevenue), 0));
  const expectedCollections = roundMoney(
    pipelineBoard.reduce((sum, row) => sum + num(row.expectedCollection), 0)
  );
  const activeContractRevenue = roundMoney(
    (contracts || [])
      .filter((row) => str(row.status) === "Active")
      .reduce((sum, row) => sum + num(mapContract(row).revenue), 0)
  );

  return {
    expectedRevenue,
    expectedRevenueLabel: formatInr(expectedRevenue),
    expectedCollections,
    expectedCollectionsLabel: formatInr(expectedCollections),
    expectedOrdersNote: "Order volume forecast remains on Inventory / Funnel — read-only deep-link.",
    expectedPayrollImpactLabel: "Read-only — open People Operations Budgeting for payroll envelope.",
    expectedInventoryDemandNote: "Inventory demand remains on Reorder / Funnel modules.",
    activeContractRevenue,
    activeContractRevenueLabel: formatInr(activeContractRevenue),
    previewOnly: true,
  };
}

export function buildAgentCommercialPerformance({ qualifications = [], visits = [], contracts = [] } = {}) {
  const byAgent = new Map();

  const ensure = (agentKey, name) => {
    if (!byAgent.has(agentKey)) {
      byAgent.set(agentKey, {
        agentId: agentKey,
        agentName: name || agentKey,
        visits: 0,
        meetings: 0,
        quotes: 0,
        contracts: 0,
        activatedLabs: 0,
        collectionsLabel: "—",
        revenue: 0,
        growthLabs: 0,
      });
    }
    return byAgent.get(agentKey);
  };

  for (const visit of visits || []) {
    const mapped = mapVisit(visit);
    const key = mapped.agentId || mapped.agentName || "unknown";
    const row = ensure(key, mapped.agentName);
    row.visits += 1;
    if (/meeting|follow|new lead|closing/i.test(mapped.visitType)) row.meetings += 1;
  }

  for (const qual of qualifications || []) {
    const key = str(qual.agentId) || str(qual.agentName) || "unknown";
    const row = ensure(key, str(qual.agentName) || key);
    row.revenue = roundMoney(row.revenue + num(qual.pipelineExpectedValue ?? qual.pipeline_expected_value));
    const stage = normalizeQualificationPipelineStage(qual.pipelineStage);
    if (stage === "negotiation" || stage === "sample_sent") row.quotes += 1;
    if (stage === "won" || stage === "qualified") row.growthLabs += 1;
  }

  for (const contract of contracts || []) {
    const mapped = mapContract(contract);
    const qual = (qualifications || []).find((row) => str(row.labId).toLowerCase() === str(mapped.labId).toLowerCase());
    const key = str(qual?.agentId) || str(qual?.agentName) || "unknown";
    const row = ensure(key, str(qual?.agentName) || key);
    row.contracts += 1;
    if (mapped.status === "Active") row.activatedLabs += 1;
    row.revenue = roundMoney(row.revenue + mapped.revenue);
  }

  return [...byAgent.values()]
    .map((row) => ({ ...row, revenueLabel: formatInr(row.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildCommercialReports({ pipelineBoard = [], agentPerformance = [], contracts = [] } = {}) {
  const lost = pipelineBoard.find((row) => row.id === "lost")?.labs || [];
  const growth = pipelineBoard.find((row) => row.id === "activated")?.labs || [];
  const renewals = (contracts || [])
    .map(mapContract)
    .filter((row) => row.renewalDate && row.renewalDate !== "");

  return {
    salesFunnel: pipelineBoard.map((row) => ({
      stage: row.label,
      count: row.count,
      valueLabel: row.expectedRevenueLabel,
    })),
    conversion: buildCommercialDashboardKpis({ pipelineBoard }).conversionRateLabel,
    agentPerformance,
    lostLabs: lost.slice(0, 25),
    growthLabs: growth.slice(0, 25),
    contractRenewals: renewals.slice(0, 25),
    forecastAccuracyNote: "Forecast accuracy requires closed-period compare — deferred beyond Phase 9.0 shell.",
  };
}

export function buildCommercialWorkspace({
  qualifications = [],
  contracts = [],
  visits = [],
} = {}) {
  const mappedContracts = (contracts || []).map(mapContract);
  const pipelineBoard = buildCommercialPipelineBoard({ qualifications, contracts });
  const kpis = buildCommercialDashboardKpis({
    qualifications,
    contracts,
    visits,
    pipelineBoard,
  });
  const activities = buildCommercialActivities({ visits, qualifications });
  const forecast = buildCommercialForecast({ pipelineBoard, contracts });
  const agentPerformance = buildAgentCommercialPerformance({
    qualifications,
    visits,
    contracts,
  });
  const reports = buildCommercialReports({
    pipelineBoard,
    agentPerformance,
    contracts,
  });

  return {
    previewOnly: true,
    readOnly: true,
    canonicalSources: ["lab_qualifications", "agent_visits", "lab_contracts", "labs"],
    kpis,
    pipelineBoard,
    activities,
    contracts: mappedContracts,
    forecast,
    agentPerformance,
    reports,
    qualifications,
    resolveLab360: (labId) =>
      buildCommercialLab360({
        labId,
        qualifications,
        contracts,
        visits,
      }),
  };
}
