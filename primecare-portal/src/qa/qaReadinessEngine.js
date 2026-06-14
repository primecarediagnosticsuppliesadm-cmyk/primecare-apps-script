import { predatorStore } from "@/predator/predatorStore.js";
import { summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  loadQaDefects,
  loadLastSuccessfulValidation,
  loadRegressionHistory,
} from "@/qa/qaDefectRegistry.js";

export const RELEASE_STATUS = {
  READY: "Ready",
  PILOT_READY: "Pilot Ready",
  RISKY: "Risky",
  NOT_READY: "Not Ready",
};

/** Coverage areas mapped to Predator module names. */
export const QA_COVERAGE_AREAS = [
  {
    id: "founder",
    label: "Founder",
    modules: [
      "Founder Navigation",
      "Founder Strategy",
      "Founder Financial Intelligence",
      "Distributor Profitability",
    ],
  },
  {
    id: "revenueFunnel",
    label: "Revenue Funnel",
    modules: ["Revenue Funnel"],
  },
  {
    id: "pilotReadiness",
    label: "Pilot Readiness",
    modules: ["Pilot Readiness"],
  },
  {
    id: "distributorOs",
    label: "Distributor OS",
    modules: [
      "Distributor OS",
      "Distributor Workspace",
      "Distributor Provisioning",
      "PrimeCare OS",
      "Tenant Foundation",
    ],
  },
  { id: "billing", label: "Billing", modules: ["Distributor Billing"] },
  { id: "commissions", label: "Commissions", modules: ["Commission Engine"] },
  { id: "contracts", label: "Contracts", modules: ["Lab Contract Engine"] },
  { id: "collections", label: "Collections / AR", modules: ["Collections", "PrimeCare OS"] },
  {
    id: "inventory",
    label: "Inventory",
    modules: ["Inventory Economics", "Inventory Tenant Safety", "Admin Dashboard", "Operations Center"],
  },
  {
    id: "purchaseReorder",
    label: "Purchase/Reorder",
    modules: ["Admin Dashboard", "Operations Center"],
  },
  {
    id: "operations",
    label: "Operations",
    modules: [
      "Operations Center",
      "Operational Tasks",
      "Operational Event Ledger",
      "Executive Intervention",
    ],
  },
  {
    id: "executiveIntelligence",
    label: "Executive Intelligence",
    modules: ["Executive Intelligence"],
  },
  { id: "predator", label: "Predator", modules: ["Tenant + Role Isolation", "Lab Portal"] },
];

const WORKFLOW_MODULES = new Set([
  "Operations Center",
  "Operational Tasks",
  "Executive Intervention",
  "Qualification Analytics",
  "Agent Visits",
  "Collections",
  "Revenue Funnel",
  "Pilot Readiness",
]);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function pct(part, total) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function releaseStatusFromScore(score) {
  const s = clamp(score);
  if (s >= 90) return RELEASE_STATUS.READY;
  if (s >= 75) return RELEASE_STATUS.PILOT_READY;
  if (s >= 60) return RELEASE_STATUS.RISKY;
  return RELEASE_STATUS.NOT_READY;
}

function reportsByModuleName(reports = []) {
  const map = new Map();
  for (const report of reports) {
    if (report?.module) map.set(report.module, report);
  }
  return map;
}

export function buildModuleCoverage(predatorReports = []) {
  const byModule = reportsByModuleName(predatorReports);

  return QA_COVERAGE_AREAS.map((area) => {
    const matched = area.modules
      .map((name) => byModule.get(name))
      .filter(Boolean);
    const entries = matched.flatMap((r) => r.entries || []);
    const summary = summarizePredatorEntries(entries);
    const total = summary.pass + summary.warn + summary.fail;
    const hasValidation = matched.length > 0;

    return {
      id: area.id,
      label: area.label,
      moduleCount: matched.length,
      expectedModules: area.modules.length,
      hasValidation,
      pass: summary.pass,
      warn: summary.warn,
      fail: summary.fail,
      passPct: pct(summary.pass, total),
      warnPct: pct(summary.warn, total),
      failPct: pct(summary.fail, total),
      status: !hasValidation ? "MISSING" : summary.status,
      lastUpdated: matched.reduce((latest, r) => {
        const t = r.updatedAt || "";
        return t > latest ? t : latest;
      }, ""),
    };
  });
}

export function buildPredatorHealth(predatorReports = []) {
  const entries = predatorReports.flatMap((r) => r.entries || []);
  const summary = summarizePredatorEntries(entries);
  return {
    moduleCount: predatorReports.length,
    ...summary,
    passPct: pct(summary.pass, summary.pass + summary.warn + summary.fail),
    warnPct: pct(summary.warn, summary.pass + summary.warn + summary.fail),
    failPct: pct(summary.fail, summary.pass + summary.warn + summary.fail),
  };
}

function computeReadinessScore({
  defects = [],
  predatorHealth = {},
  coverage = [],
  workflowFailures = 0,
}) {
  let score = 100;

  const openCritical = defects.filter(
    (d) => d.status !== "Closed" && d.severity === "Critical"
  ).length;
  const openHigh = defects.filter((d) => d.status !== "Closed" && d.severity === "High").length;
  score -= Math.min(40, openCritical * 10 + openHigh * 4);

  const predatorFails = num(predatorHealth.fail);
  score -= Math.min(30, predatorFails * 2);

  const missingAreas = coverage.filter((c) => !c.hasValidation).length;
  score -= Math.min(25, missingAreas * 5);

  score -= Math.min(15, workflowFailures * 3);

  const lowCoverage = coverage.filter(
    (c) => c.hasValidation && c.passPct < 50 && c.fail > 0
  ).length;
  score -= Math.min(15, lowCoverage * 5);

  return clamp(score);
}

export function buildRegressionCenter(predatorReports = [], history = []) {
  const failedValidations = predatorStore.getFailedValidations();
  const recentFailures = failedValidations.slice(0, 15).map((e) => ({
    module: e.module,
    step: e.step,
    status: e.status,
    timestamp: e.timestamp,
    severity: e.severity,
  }));

  const recentlyFixed = history
    .filter((h) => h.type === "fixed")
    .slice(0, 10);

  const moduleUpdateCounts = new Map();
  for (const report of predatorReports) {
    const name = report.module || "unknown";
    moduleUpdateCounts.set(name, (moduleUpdateCounts.get(name) || 0) + 1);
  }
  const volatileModules = [...moduleUpdateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([module, updates]) => ({ module, updates }));

  return {
    recentFailures,
    recentlyFixed,
    volatileModules,
    failureCount: recentFailures.length,
  };
}

/**
 * @param {{ predatorReports?: object[], defects?: object[], regressionHistory?: object[] }} [input]
 */
export function buildQAReadinessModel(input = {}) {
  const predatorReports =
    input.predatorReports || predatorStore.getModuleReportsForActiveTenant();
  const defects = input.defects || loadQaDefects();
  const regressionHistory = input.regressionHistory || loadRegressionHistory();
  const lastPass = loadLastSuccessfulValidation();

  const coverage = buildModuleCoverage(predatorReports);
  const predatorHealth = buildPredatorHealth(predatorReports);
  const regression = buildRegressionCenter(predatorReports, regressionHistory);

  const workflowFailures = predatorReports
    .filter((r) => WORKFLOW_MODULES.has(r.module))
    .flatMap((r) => r.entries || [])
    .filter((e) => e.status === "FAIL").length;

  const readinessScore = computeReadinessScore({
    defects,
    predatorHealth,
    coverage,
    workflowFailures,
  });

  const openDefects = defects.filter((d) => d.status !== "Closed");
  const criticalDefects = openDefects.filter((d) => d.severity === "Critical");
  const failedTestCases = openDefects.filter(
    (d) => d.failedTestCase || d.severity === "Critical"
  );

  return {
    readinessScore,
    releaseStatus: releaseStatusFromScore(readinessScore),
    predatorHealth,
    coverage,
    defects: {
      open: openDefects.length,
      critical: criticalDefects.length,
      failedTestCases: failedTestCases.length,
      items: defects,
    },
    regression,
    lastSuccessfulValidation: loadLastSuccessfulValidation() || lastPass,
    workflowFailures,
    generatedAt: new Date().toISOString(),
  };
}
