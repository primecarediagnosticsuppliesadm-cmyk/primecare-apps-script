/**
 * Phase 9.1 — Architecture / production readiness dashboard (developer/admin).
 * Read-only orchestration — no live cert execution in browser.
 */
import projectionCatalog from "@/projectionOps/projectionOpsCatalog.json";
import { TECH_DEBT_REGISTRY } from "@/platform/platformConsolidationModel.js";

export const READINESS_GATE_STATUS = {
  PASS: "PASS",
  WARN: "WARN",
  FAIL: "FAIL",
  PENDING: "PENDING",
};

/** @typedef {{ id: string, label: string, status: string, detail: string, tier?: string }} ReadinessGate */

/**
 * @returns {{ sections: { id: string, title: string, gates: ReadinessGate[] }[], overallBand: string, openRiskCount: number }}
 */
export function buildProductionReadinessModel() {
  const shadowProjections = (projectionCatalog.projections || []).filter((p) => p.status === "shadow");
  const designProjections = (projectionCatalog.projections || []).filter((p) => p.status === "design");

  /** @type {{ id: string, title: string, gates: ReadinessGate[] }[]} */
  const sections = [
    {
      id: "build",
      title: "Build",
      gates: [
        {
          id: "build.vite",
          label: "Vite production build",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "Run npm run build — verified by audit-phase-9-1-certification.mjs",
          tier: "A",
        },
        {
          id: "build.imports",
          label: "Runtime import safety",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-runtime-import-safety.mjs",
          tier: "A",
        },
      ],
    },
    {
      id: "verification",
      title: "Verification",
      gates: [
        {
          id: "verify.o2c",
          label: "O2C golden path",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-primecare-production-golden-path.mjs",
          tier: "A",
        },
        {
          id: "verify.finance",
          label: "Financial reconciliation",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-financial-reconciliation.mjs — no finance mutation in 9.1",
          tier: "A",
        },
        {
          id: "verify.payroll",
          label: "Payroll boundary",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-payroll-no-finance-mutation.mjs",
          tier: "A",
        },
        {
          id: "verify.nav",
          label: "Navigation consolidation",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-navigation-consolidation.mjs (Phase 9.1)",
          tier: "A",
        },
      ],
    },
    {
      id: "rls",
      title: "RLS & Security",
      gates: [
        {
          id: "rls.reads",
          label: "HQ RLS read contract",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-hq-rls-reads.mjs",
          tier: "A",
        },
        {
          id: "rls.hardening",
          label: "Security hardening",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-security-hardening.mjs",
          tier: "A",
        },
        {
          id: "rls.migration",
          label: "Migration apply manifest",
          status: READINESS_GATE_STATUS.WARN,
          detail: "GAP-BP-001 — confirm single deploy track per environment",
          tier: "A",
        },
      ],
    },
    {
      id: "performance",
      title: "Performance",
      gates: [
        {
          id: "perf.bounded",
          label: "Bounded reads",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "verify-bounded-reads.mjs",
          tier: "A",
        },
        {
          id: "perf.dashboard",
          label: "Admin dashboard projection path",
          status: READINESS_GATE_STATUS.WARN,
          detail: "verify-admin-dashboard-no-transactional-lines.mjs; adapters shadow",
          tier: "B",
        },
        {
          id: "perf.god-pages",
          label: "God-page decomposition",
          status: READINESS_GATE_STATUS.FAIL,
          detail: `${TECH_DEBT_REGISTRY.filter((t) => t.priority === "high" && t.lines).length} pages >1,200 LOC — refactor deferred`,
          tier: "B",
        },
      ],
    },
    {
      id: "coverage",
      title: "Coverage",
      gates: [
        {
          id: "cov.verify-scripts",
          label: "Verify script catalog",
          status: READINESS_GATE_STATUS.PASS,
          detail: "141+ verify-*.mjs scripts in scripts/",
          tier: "A",
        },
        {
          id: "cov.predator",
          label: "Predator batch certification",
          status: READINESS_GATE_STATUS.WARN,
          detail: "Admin cert: Predator failures block full pilot GO",
          tier: "A",
        },
        {
          id: "cov.uat",
          label: "Manual UAT completion",
          status: READINESS_GATE_STATUS.FAIL,
          detail: "PO lifecycle UI, payment record, create lab UI, agent login smoke — open",
          tier: "A",
        },
      ],
    },
    {
      id: "risks",
      title: "Open Risks",
      gates: TECH_DEBT_REGISTRY.filter((t) => t.priority === "high").map((t) => ({
        id: t.id,
        label: t.area,
        status: READINESS_GATE_STATUS.WARN,
        detail: t.issue,
        tier: "A",
      })),
    },
    {
      id: "production_gates",
      title: "Production Gates",
      gates: [
        {
          id: "gate.admin-cert",
          label: "Admin full production pilot",
          status: READINESS_GATE_STATUS.FAIL,
          detail: "docs/QA/Admin_Final_Certification.md — NO-GO",
          tier: "A",
        },
        {
          id: "gate.qa-pilot",
          label: "QA pilot",
          status: READINESS_GATE_STATUS.WARN,
          detail: "CONDITIONAL GO — deploy + browser re-sign-off required",
          tier: "A",
        },
        {
          id: "gate.readiness-score",
          label: "Weighted readiness ≥85%",
          status: READINESS_GATE_STATUS.FAIL,
          detail: "HQ audit ~65% — target 85% before cutover",
          tier: "A",
        },
      ],
    },
    {
      id: "projection",
      title: "Projection Readiness",
      gates: [
        {
          id: "proj.shadow",
          label: "Phase 1 shadow projections",
          status: READINESS_GATE_STATUS.WARN,
          detail: `${shadowProjections.length} projection(s) in shadow mode`,
          tier: "A",
        },
        {
          id: "proj.phase2",
          label: "Phase 2 composites",
          status: READINESS_GATE_STATUS.FAIL,
          detail: `${designProjections.length} composite(s) still design — GAP-BP-022`,
          tier: "B",
        },
        {
          id: "proj.flag-flip",
          label: "Read-adapter flag flip",
          status: READINESS_GATE_STATUS.FAIL,
          detail: "GAP-BP-021 — 7-day shadow parity required before ON",
          tier: "A",
        },
        {
          id: "proj.worker",
          label: "Projection refresh worker",
          status: READINESS_GATE_STATUS.FAIL,
          detail: "GAP-BP-020 — no event queue/worker yet",
          tier: "B",
        },
      ],
    },
    {
      id: "manual_uat",
      title: "Manual UAT",
      gates: [
        {
          id: "uat.nav",
          label: "One home per workspace",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "Commercial, People Ops, Operations Center — no duplicate menu items",
          tier: "A",
        },
        {
          id: "uat.reports",
          label: "No duplicate report entry points",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "Growth analytics via Commercial; payroll via People Ops Reports",
          tier: "A",
        },
        {
          id: "uat.workflow",
          label: "O2C workflow regression",
          status: READINESS_GATE_STATUS.PENDING,
          detail: "Orders → fulfill → invoice → payment → AR unchanged",
          tier: "A",
        },
      ],
    },
  ];

  const allGates = sections.flatMap((s) => s.gates);
  const failCount = allGates.filter((g) => g.status === READINESS_GATE_STATUS.FAIL).length;
  const warnCount = allGates.filter((g) => g.status === READINESS_GATE_STATUS.WARN).length;

  let overallBand = "NOT_READY";
  if (failCount === 0 && warnCount <= 3) overallBand = "CONDITIONAL";
  else if (failCount === 0 && warnCount === 0) overallBand = "READY";

  return {
    sections,
    overallBand,
    openRiskCount: failCount + warnCount,
    gateSummary: {
      total: allGates.length,
      pass: allGates.filter((g) => g.status === READINESS_GATE_STATUS.PASS).length,
      warn: warnCount,
      fail: failCount,
      pending: allGates.filter((g) => g.status === READINESS_GATE_STATUS.PENDING).length,
    },
    updatedAt: new Date().toISOString(),
  };
}
