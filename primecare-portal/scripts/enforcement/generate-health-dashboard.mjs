#!/usr/bin/env node
/**
 * Enterprise Health Dashboard — aggregates enforcement scores + governance signals.
 *
 * Usage: node scripts/enforcement/generate-health-dashboard.mjs
 * Output: docs/Architecture/Enforcement/reports/health-dashboard.json
 *         docs/Architecture/Enforcement/reports/health-dashboard.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  PORTAL_ROOT,
  parseGapBpItems,
  readJson,
  readText,
  walkFiles,
} from "./lib/fs-utils.mjs";
import { EnforcementSummary } from "./lib/report.mjs";
import { runArchitectureValidator } from "./validators/architecture-validator.mjs";
import { runBlueprintValidator } from "./validators/blueprint-validator.mjs";
import { runProjectionValidator } from "./validators/projection-validator.mjs";
import { runApiValidator } from "./validators/api-validator.mjs";
import { runPerformanceValidator } from "./validators/performance-validator.mjs";
import { runSecurityValidator } from "./validators/security-validator.mjs";
import { runDocumentationValidator } from "./validators/documentation-validator.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(REPO_ROOT, "docs/Architecture/Enforcement/reports");

async function main() {
  process.env.ENFORCEMENT_MODE = "full";
  const summary = new EnforcementSummary();

  summary.add(await runArchitectureValidator({ incremental: false }));
  summary.add(await runBlueprintValidator({ incremental: false }));
  summary.add(await runProjectionValidator({ incremental: false, runLive: false }));
  summary.add(await runApiValidator({ incremental: false }));
  summary.add(await runPerformanceValidator({ incremental: false }));
  summary.add(await runSecurityValidator({ incremental: false }));
  summary.add(await runDocumentationValidator({ staged: false, scopeFiles: [] }));

  const dims = summary.dimensionScores();
  const changelog = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/CHANGELOG.md`);
  const openGaps = parseGapBpItems(changelog).filter((g) => g.status === "OPEN");
  const tdRegister = readText(`${REPO_ROOT}/docs/Architecture/Technical_Debt_Register.md`);
  const openBlockers = (tdRegister.match(/\|\s*TD-\d+\s*\|[^|]*\|\s*OPEN\s*\|/g) || []).length;
  const mitigated = (tdRegister.match(/\|\s*TD-\d+\s*\|[^|]*\|\s*MITIGATED/g) || []).length;

  const deps = readJson("Projection_Dependencies.json");
  const shadowProjections = deps.nodes.filter((n) => n.status === "shadow").length;
  const plannedProjections = deps.nodes.filter((n) => n.status === "planned").length;

  const fitness = readJson("Fitness_Functions.json");

  const dashboard = {
    generated_at: new Date().toISOString(),
    architecture_score: dims.Architecture ?? 0,
    documentation_score: dims.Documentation ?? 0,
    projection_health: dims.Projection ?? 0,
    performance_health: dims.Performance ?? 0,
    security_health: dims.Security ?? 0,
    certification_health: dims.Blueprint ?? 0,
    api_health: dims.API ?? 0,
    aggregate_score: summary.aggregateScore(),
    technical_debt: { open_blockers: openBlockers, mitigated_count: mitigated },
    projection_freshness: {
      shadow_count: shadowProjections,
      planned_count: plannedProjections,
      note: "Live staleness requires verify-projection-staleness.mjs with QA creds",
    },
    open_gap_bp: openGaps,
    fitness_functions: fitness.fitness_functions.map((ff) => ({
      id: ff.id,
      name: ff.name,
      validator: ff.validator,
      cadence: ff.cadence,
    })),
    enforcement: summary.toJSON(),
  };

  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "health-dashboard.json");
  writeFileSync(jsonPath, JSON.stringify(dashboard, null, 2));

  const md = `# Enterprise Architecture Health Dashboard

Generated: ${dashboard.generated_at}

## Scores

| Dimension | Score |
|-----------|------:|
| **Aggregate** | **${dashboard.aggregate_score}** |
| Architecture | ${dashboard.architecture_score} |
| Blueprint / Certification | ${dashboard.certification_health} |
| Documentation | ${dashboard.documentation_score} |
| Projection | ${dashboard.projection_health} |
| API | ${dashboard.api_health} |
| Performance | ${dashboard.performance_health} |
| Security | ${dashboard.security_health} |

## Technical Debt

- Open blockers: ${openBlockers}
- Mitigated items: ${mitigated}

## Projection Platform

- Shadow: ${shadowProjections}
- Planned: ${plannedProjections}

## Open GAP-BP Items

${openGaps.length ? openGaps.map((g) => `- ${g.id} (${g.status})`).join("\n") : "- None"}

## Fitness Functions

${fitness.fitness_functions.map((ff) => `- **${ff.id}** ${ff.name} → \`${ff.validator}\` [${ff.cadence.join(", ")}]`).join("\n")}

## Validator Failures

${summary.reports
  .flatMap((r) => r.findings.filter((f) => f.severity === "error"))
  .map((f) => `- **${f.code}**: ${f.message}`)
  .join("\n") || "- None"}

---
*Auto-generated by generate-health-dashboard.mjs — do not edit manually.*
`;

  const mdPath = resolve(outDir, "health-dashboard.md");
  writeFileSync(mdPath, md);

  console.log(`Health dashboard written:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(`Aggregate score: ${dashboard.aggregate_score}/100`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
