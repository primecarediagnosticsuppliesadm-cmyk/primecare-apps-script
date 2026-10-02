#!/usr/bin/env node
/**
 * Static contract for the Gate 3B evidence and generation engine.
 * Live QA certification is the SQL run against zipuzmfkwwucbchlphcj.
 * This script does not connect to Production.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEW_TIME_ZONE,
  REVIEW_UNAVAILABLE_PHRASE,
  REVIEW_SCALAR_PLACEHOLDERS,
  REVIEW_UNAVAILABLE_METRICS,
} from "../src/reviews/reviewEvidence.js";
import { generateReviewCycle } from "../src/reviews/generateReviewCycle.js";
import { buildReviewEvidence } from "../src/reviews/reviewEvidence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  resolve(root, "supabase/sql/agent_review_generation_3b.sql"),
  "utf8"
);

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

check("timezone", REVIEW_TIME_ZONE === "Asia/Kolkata" && sql.includes("Asia/Kolkata"));
check("phrase", sql.includes(REVIEW_UNAVAILABLE_PHRASE));
check(
  "scalar placeholders",
  REVIEW_SCALAR_PLACEHOLDERS.every((key) => sql.includes(`'${key}'`))
);
check(
  "unavailable metrics",
  REVIEW_UNAVAILABLE_METRICS.every((key) => sql.includes(`'${key}'`))
);
check("no row cap", !/LIMIT\s+500|LIMIT\s+200/i.test(sql));
check("no named labs", !/Vishwa|Sriya|Medixx|Lucid/i.test(sql));
check("builder and generator stay separate", sql.includes("agent_review_build_evidence") && sql.includes("agent_review_generate_cycle"));
check("snapshot immutable", sql.includes("review_snapshot_immutable"));
check("functions exported", typeof buildReviewEvidence === "function" && typeof generateReviewCycle === "function");
check("not a react page", !sql.includes("React") && !readFileSync(resolve(root, "src/reviews/reviewEvidence.js"), "utf8").includes("jsx"));

if (failed) {
  console.error(`FAIL ${failed}`);
  process.exit(1);
}
console.log("PASS verify-agent-review-generation");
