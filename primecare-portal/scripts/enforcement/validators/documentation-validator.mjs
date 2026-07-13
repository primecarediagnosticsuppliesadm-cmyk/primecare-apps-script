#!/usr/bin/env node
/**
 * Documentation Validator — ensures implementation changes update required governance artifacts.
 */
import {
  ENFORCEMENT_ROOT,
  PORTAL_ROOT,
  REPO_ROOT,
  getChangedFiles,
  isIncrementalMode,
  readJson,
  readText,
} from "../lib/fs-utils.mjs";
import { ValidationReport } from "../lib/report.mjs";

const DOC_REQUIREMENTS = [
  {
    trigger: (files) => files.some((f) => f.includes("supabase/migrations/")),
    required: [
      "primecare-portal/docs/PrimeCare_System_Blueprint/CHANGELOG.md",
      "primecare-portal/docs/PrimeCare_System_Blueprint/01_Database_Schema.md",
    ],
    code: "DOC-MISSING-BLUEPRINT",
    message: "Schema migration requires CHANGELOG + 01_Database_Schema.md update",
  },
  {
    trigger: (files) => files.some((f) => f.includes("proj_") && f.includes("migration")),
    required: ["docs/Architecture/Projection_Registry.md"],
    code: "DOC-MISSING-REGISTRY",
    message: "Projection migration requires Projection_Registry.md update",
  },
  {
    trigger: (files) => files.some((f) => f.startsWith("primecare-portal/scripts/verify-")),
    required: ["primecare-portal/docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md"],
    code: "DOC-MISSING-VERIFY-MATRIX",
    message: "New verify script requires Verification Matrix 13 update",
  },
  {
    trigger: (files) => files.some((f) => f.includes("src/pages/") || f.includes("Screen")),
    required: ["primecare-portal/docs/Certification_Framework/02_Screen_Ownership_Catalog.md"],
    code: "DOC-MISSING-SCREEN-CATALOG",
    message: "Screen change should update Screen Ownership Catalog",
    severity: "warn",
  },
  {
    trigger: (files) => files.some((f) => f.includes("readProjectionFlags") || f.includes("VITE_READ_ADAPTER")),
    required: [
      "primecare-portal/docs/PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md",
      "docs/Architecture/Projection_Registry.md",
    ],
    code: "DOC-MISSING-PROJECTION-DOC",
    message: "Projection flag change requires Blueprint 18 + Registry update",
  },
];

export async function runDocumentationValidator(options = {}) {
  const report = new ValidationReport("Documentation");
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? getChangedFiles({ staged: options.staged ?? true });

  if (!scopeFiles.length) {
    report.info("DOC-NO-CHANGES", "No staged/changed files — documentation gate skipped");
    return report;
  }

  for (const rule of DOC_REQUIREMENTS) {
    if (!rule.trigger(scopeFiles)) continue;
    for (const req of rule.required) {
      if (!scopeFiles.some((f) => f === req || f.endsWith(req.split("/").slice(-1)[0]))) {
        const fn = rule.severity === "warn" ? "warn" : "error";
        report[fn](rule.code, `${rule.message} (missing: ${req})`);
      }
    }
  }

  // --- ADR requirement heuristics ---
  const adrRegistry = readJson("ADR_Registry.json");
  const needsAdr =
    scopeFiles.some((f) => f.includes("proj_") && f.includes("migration")) ||
    scopeFiles.some((f) => f.includes("supabase/migrations/") && f.includes("rls")) ||
    scopeFiles.some((f) => f.includes("rolePermissionMatrix"));

  if (needsAdr) {
    const hasAdr = scopeFiles.some((f) => f.includes("docs/Architecture/ADR-"));
    if (!hasAdr) {
      report.warn("DOC-ADR-SUGGEST", "Change may require ADR — see ADR_Registry.json triggers");
    }
  }

  // --- Technical Debt Register for new TODO/TD patterns ---
  const tdRegister = readText(`${REPO_ROOT}/docs/Architecture/Technical_Debt_Register.md`);
  if (scopeFiles.some((f) => f.includes("src/metrics/") || f.includes("mega-loader"))) {
    if (!scopeFiles.some((f) => f.includes("Technical_Debt_Register.md"))) {
      report.warn("DOC-MISSING-TD", "Performance/architecture change should update Technical_Debt_Register.md");
    }
  }

  // --- Certification framework for read model changes ---
  if (scopeFiles.some((f) => f.includes("projectionReadAdapters") || f.includes("read_"))) {
    const certUpdated = scopeFiles.some(
      (f) => f.includes("Certification_Framework/08") || f.includes("Read_Model_Certification")
    );
    if (!certUpdated) {
      report.warn("DOC-MISSING-CERT", "Read model change should update 08_Read_Model_Certification_Matrix.md");
    }
  }

  if (!report.failed()) report.pass("DOC-OK", "Documentation validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runDocumentationValidator({ staged: !process.argv.includes("--all") });
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
