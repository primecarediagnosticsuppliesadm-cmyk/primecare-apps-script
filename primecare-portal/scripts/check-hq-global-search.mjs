#!/usr/bin/env node
/**
 * HQ Global Search matching validation (no live API — fixture index only).
 * Run: node scripts/check-hq-global-search.mjs
 */
import {
  buildHqSearchIndex,
  searchHqIndex,
  summarizeHqSearchIndex,
} from "../src/operations/hqGlobalSearchEngine.js";

const FIXTURE = {
  labs: [
    {
      labId: "LAB-QA-ALPHA",
      labName: "QA Alpha Diagnostics",
      area: "Hyderabad",
      ownerName: "Dr Alpha",
    },
  ],
  users: [
    {
      userId: "u-agent-1",
      display_name: "QA Agent One",
      agent_name: "QA Agent One",
      role: "agent",
      email: "qa.agent.one@test.com",
    },
    {
      userId: "u-agent-2",
      user_name: "QA Test Agent One",
      role: "agent",
      email: "qa.test.agent.one@test.com",
    },
    {
      userId: "u-agent-3",
      user_name: "QA Test Agent2",
      role: "agent",
    },
  ],
  orders: [
    {
      orderId: "ORD-1728",
      labName: "QA Alpha Diagnostics",
      orderStatus: "Placed",
    },
    {
      orderId: "ORD-2001",
      labName: "Other Lab",
      orderStatus: "Fulfilled",
    },
  ],
  products: [],
  purchaseOrders: [],
};

const index = buildHqSearchIndex(FIXTURE);
const counts = summarizeHqSearchIndex(index);

const CASES = [
  {
    query: "QA Alpha Diagnostics",
    expectTypes: ["labs"],
    expectTitles: ["QA Alpha Diagnostics"],
  },
  {
    query: "Alpha",
    expectTypes: ["labs"],
    expectTitles: ["QA Alpha Diagnostics"],
  },
  {
    query: "QA Agent",
    expectTypes: ["users"],
    expectTitles: ["QA Agent One", "QA Test Agent One", "QA Test Agent2"],
  },
  {
    query: "ORD-1728",
    expectTypes: ["orders"],
    expectTitles: ["ORD-1728"],
  },
  {
    query: "1728",
    expectTypes: ["orders"],
    expectTitles: ["ORD-1728"],
  },
];

function flattenResults(groups) {
  return groups.flatMap((g) => g.items.map((item) => ({ type: g.id, title: item.title })));
}

let failed = 0;

console.log("HQ Search fixture index counts:", counts);
console.log("");

for (const testCase of CASES) {
  const groups = searchHqIndex(index, testCase.query);
  const results = flattenResults(groups);
  const titles = results.map((r) => r.title);
  const types = [...new Set(results.map((r) => r.type))];

  const typeOk = testCase.expectTypes.every((t) => types.includes(t));
  const titleOk = testCase.expectTitles.every((title) => titles.includes(title));

  if (typeOk && titleOk) {
    console.log(`PASS  "${testCase.query}" → ${titles.join(", ")}`);
  } else {
    failed += 1;
    console.error(`FAIL  "${testCase.query}"`);
    console.error(`      expected types: ${testCase.expectTypes.join(", ")} got: ${types.join(", ") || "(none)"}`);
    console.error(`      expected titles: ${testCase.expectTitles.join(", ")} got: ${titles.join(", ") || "(none)"}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length} search cases passed.`);
