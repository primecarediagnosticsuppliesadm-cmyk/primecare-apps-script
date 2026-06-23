/**
 * Edge-case audit for resolveLabAgent() — run: node scripts/audit-lab-agent-resolver.mjs
 */
import {
  resolveLabAgent,
  resolveLabAgentForLabId,
} from "../src/operations/labAgentResolver.js";

const DIRECTORY = [
  {
    userId: "user-001",
    agentId: "QA_AGENT_001",
    name: "QA Test Agent One",
  },
  {
    userId: "user-002",
    agentId: "QA_AGENT_002",
    name: "QA Test Agent2",
  },
];

const LAB_ROWS = [
  {
    labId: "QA_LAB_001",
    labName: "QA Alpha Diagnostics",
    assignedAgentId: "QA_AGENT_002",
  },
  {
    labId: "QA_LAB_003",
    labName: "QA Gamma Unassigned",
    assignedAgentId: "QA_AGENT_001",
    assignedAgent: "QA Test Agent One",
  },
];

function auditCase(id, label, fn) {
  let result;
  let crash = null;
  try {
    result = fn();
  } catch (err) {
    crash = err?.message || String(err);
  }
  return { id, label, result, crash };
}

const cases = [
  {
    id: 1,
    label: "assigned agent exists (id + directory name)",
    run: () => resolveLabAgent(LAB_ROWS[0], DIRECTORY),
  },
  {
    id: 2,
    label: "assignedAgentId exists but user record missing",
    run: () =>
      resolveLabAgent(
        { labId: "X", assignedAgentId: "GHOST_AGENT_999" },
        DIRECTORY
      ),
  },
  {
    id: 3,
    label: "assignedAgentId null",
    run: () => resolveLabAgent({ labId: "QA_LAB_002", labName: "QA Beta Labs" }, DIRECTORY),
  },
  {
    id: 4,
    label: "agent deleted (id on row, absent from directory)",
    run: () =>
      resolveLabAgent(
        { labId: "X", assignedAgentId: "DELETED_AGENT_OLD" },
        DIRECTORY
      ),
  },
  {
    id: 5,
    label: "directoryUsers empty",
    run: () => resolveLabAgent(LAB_ROWS[1], []),
  },
  {
    id: 6,
    label: "labRow undefined",
    run: () => resolveLabAgent(undefined, DIRECTORY),
  },
  {
    id: "6b",
    label: "labRow null (explicit)",
    run: () => resolveLabAgent(null, DIRECTORY),
  },
  {
    id: 7,
    label: "labId not found (resolveLabAgentForLabId)",
    run: () => resolveLabAgentForLabId("UNKNOWN_LAB", LAB_ROWS, DIRECTORY),
  },
];

console.log("resolveLabAgent() edge-case audit\n");
console.log("| # | Case | displayLabel | isAssigned | agentId | agentName | Crash |");
console.log("|---|------|--------------|------------|---------|-----------|-------|");

for (const c of cases) {
  const { result, crash } = auditCase(c.id, c.label, c.run);
  if (crash) {
    console.log(`| ${c.id} | ${c.label} | — | — | — | — | **${crash}** |`);
    continue;
  }
  const r = result;
  console.log(
    `| ${c.id} | ${c.label} | ${r.displayLabel} | ${r.isAssigned} | ${r.agentId || "—"} | ${r.agentName || "—"} | None |`
  );
}

console.log("\nFull returned objects:\n");
for (const c of cases) {
  const { result, crash } = auditCase(c.id, c.label, c.run);
  console.log(`--- Case ${c.id}: ${c.label} ---`);
  if (crash) {
    console.log("CRASH:", crash);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  console.log();
}
