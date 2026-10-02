#!/usr/bin/env node
/**
 * Presentation rules for Reviews & Development.
 * Does not connect to a database and does not recalculate evidence.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDisplayRuleActive, isResponseAnswered } from "../src/reviews/displayRule.js";
import {
  agentStatusLabel,
  requiredProgress,
  reviewActionLabel,
  visibleQuestions,
} from "../src/reviews/reviewPresentation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const page = readFileSync(resolve(root, "src/pages/AgentReviewsPage.jsx"), "utf8");
const api = readFileSync(resolve(root, "src/reviews/reviewApi.js"), "utf8");

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

check("empty rule shows", isDisplayRuleActive({}, new Map()));
check("missing parent hides", isDisplayRuleActive({ question_key: "parent", op: "IN", values: ["NO"] }, new Map()) === false);
check(
  "scalar IN shows",
  isDisplayRuleActive(
    { question_key: "parent", op: "IN", values: ["NO"] },
    new Map([["parent", { value: "NO" }]])
  )
);
check(
  "contains any",
  isDisplayRuleActive(
    { question_key: "flags", op: "CONTAINS_ANY", values: ["KEPT_OUTSIDE_APP"] },
    new Map([["flags", { values: ["NONE", "KEPT_OUTSIDE_APP"] }]])
  )
);
check(
  "contains none hides when present",
  isDisplayRuleActive(
    { question_key: "flags", op: "CONTAINS_NONE", values: ["NONE"] },
    new Map([["flags", { values: ["NONE"] }]])
  ) === false
);
check("unknown operator hides", isDisplayRuleActive({ question_key: "parent", op: "OR", values: ["NO"] }, new Map()) === false);

const questions = [
  { id: "a", question_key: "parent", audience: "AGENT", required: true, display_order: 1, section: "A. My first month", response_type: "SINGLE_SELECT", display_rule_json: {} },
  { id: "b", question_key: "child", audience: "AGENT", required: true, display_order: 2, section: "B. Verify my field activity", response_type: "LONG_TEXT", display_rule_json: { question_key: "parent", op: "IN", values: ["NO"] } },
  { id: "c", question_key: "optional", audience: "AGENT", required: false, display_order: 3, section: "A. My first month", response_type: "TEXT", display_rule_json: {} },
  { id: "m", question_key: "mgmt", audience: "MANAGEMENT", required: true, display_order: 4, section: "Reviewer", response_type: "LONG_TEXT", display_rule_json: {} },
];
const hiddenAnswers = new Map([["a", { value: "YES" }], ["b", { text: "kept" }]]);
check("hidden child stays stored but not visible", visibleQuestions(questions, hiddenAnswers).every((q) => q.id !== "b") && hiddenAnswers.get("b").text === "kept");
const shownAnswers = new Map([["a", { value: "NO" }]]);
const progress = requiredProgress(questions, shownAnswers);
check("hidden required is excluded until shown", requiredProgress(questions, hiddenAnswers).total === 1);
check("visible required blocks completion", progress.total === 2 && progress.done === 1);
check("optional does not block required completion", requiredProgress(questions, new Map([["a", { value: "YES" }]])).percent === 100);
check("management question is not in the agent denominator", !visibleQuestions(questions, hiddenAnswers).some((q) => q.audience === "MANAGEMENT"));
check("published is ready to start", agentStatusLabel({ status: "PUBLISHED" }) === "Ready to start");
check("reopen label", agentStatusLabel({ status: "IN_PROGRESS", reopened_at: "2026-10-01" }) === "Reopened for updates");
check("ready is not startable by the label", reviewActionLabel({ status: "READY" }) === "");
check("yes no answered", isResponseAnswered("YES_NO", { value: false }));
check("lab id required", isResponseAnswered("LAB_SELECT", { lab_name: "Only a name" }) === false);
check("performance still redirects", /case "performance":\s*return <PageRedirect[^>]*target="dashboard"/.test(portal));
check("preview cannot save", page.includes("const editing = isAgent && canAgentEdit(cycle)") && page.includes("Preview — Agent View"));
check("no evidence recalculation in the page", !/visits_authored|prospects_sourced/.test(page));
check("api does not read management analysis", !api.includes("agent_review_management_analysis") && api.includes('eq("audience", "AGENT")'));
check("api selects explicit columns", !api.includes("select(\"*\")") && !api.includes(".select(\"*\")"));

if (failed) {
  console.error(`FAIL ${failed}`);
  process.exit(1);
}
console.log("PASS verify-agent-review-ui");
