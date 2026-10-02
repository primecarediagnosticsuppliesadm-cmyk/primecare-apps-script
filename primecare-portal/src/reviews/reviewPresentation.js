import { isDisplayRuleActive, isResponseAnswered } from "./displayRule.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const REVIEW_TYPE_LABELS = {
  FIRST_MONTH: "First Month Review",
  MONTHLY: "Monthly Review",
  QUARTERLY: "Quarterly Review",
  ANNUAL: "Annual Review",
};

function parts(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatReviewPeriod(periodStart, periodEnd) {
  const start = parts(periodStart);
  const end = parts(periodEnd);
  if (!start || !end) return [periodStart, periodEnd].filter(Boolean).join(" – ");
  const startLabel = `${MONTHS[start.month - 1]} ${start.year}`;
  const endLabel = `${MONTHS[end.month - 1]} ${end.year}`;
  if (start.year === end.year && start.month === end.month) return startLabel;
  if (start.year === end.year) return `${MONTHS[start.month - 1]}–${MONTHS[end.month - 1]} ${start.year}`;
  return `${startLabel} – ${endLabel}`;
}

export function reviewTypeLabel(reviewType) {
  return REVIEW_TYPE_LABELS[reviewType] || "Development review";
}

/**
 * Agent-facing status. Database names stay off the card.
 * @param {{ status?: string, reopened_at?: string | null }} cycle
 */
export function agentStatusLabel(cycle) {
  const status = String(cycle?.status || "");
  if (status === "IN_PROGRESS" && cycle?.reopened_at) return "Reopened for updates";
  switch (status) {
    case "PUBLISHED":
      return "Ready to start";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Submitted";
    case "ANALYZED":
      return "Under review";
    case "ONE_ON_ONE_COMPLETED":
      return "1:1 completed";
    case "FINALIZED":
      return "Finalized";
    case "DRAFT":
    case "READY":
      return "Being prepared";
    default:
      return "In preparation";
  }
}

export function reviewActionLabel(cycle) {
  const status = String(cycle?.status || "");
  if (status === "PUBLISHED") return "Start Review";
  if (status === "IN_PROGRESS") return "Continue Review";
  if (["SUBMITTED", "ANALYZED", "ONE_ON_ONE_COMPLETED", "FINALIZED"].includes(status)) {
    return "View Review";
  }
  return "";
}

export function canAgentEdit(cycle) {
  return String(cycle?.status || "") === "IN_PROGRESS";
}

export function isReadOnlyStatus(cycle) {
  return ["SUBMITTED", "ANALYZED", "ONE_ON_ONE_COMPLETED", "FINALIZED"].includes(
    String(cycle?.status || "")
  );
}

export function sectionTitle(section) {
  const text = String(section || "").toLowerCase();
  if (text.includes("first month")) return "My First Month";
  if (text.includes("field activity")) return "Verify My Field Activity";
  if (text.includes("opportunit")) return "Labs & Opportunities";
  if (text.includes("market") || text.includes("procurement")) return "Market & Procurement Intelligence";
  if (text.includes("blocker") || text.includes("training")) return "Blockers, Training & Development";
  if (text.includes("app")) return "PrimeCare App";
  if (text.includes("support")) return "PrimeCare Support";
  if (text.includes("next month")) return "Next Month";
  if (text.includes("evidence")) return "Evidence";
  return String(section || "Review");
}

export function responsesByQuestionKey(questions, answersByInstanceId) {
  const map = new Map();
  for (const question of questions) {
    const answer = answersByInstanceId.get(question.id);
    if (answer) map.set(question.question_key, answer);
  }
  return map;
}

export function visibleQuestions(questions, answersByInstanceId) {
  const byKey = responsesByQuestionKey(questions, answersByInstanceId);
  return questions
    .filter((question) => question.audience === "AGENT")
    .filter((question) => isDisplayRuleActive(question.display_rule_json || {}, byKey))
    .slice()
    .sort((a, b) => Number(a.display_order) - Number(b.display_order));
}

export function groupSections(questions) {
  const groups = [];
  const index = new Map();
  for (const question of questions) {
    const title = sectionTitle(question.section);
    if (!index.has(title)) {
      index.set(title, groups.length);
      groups.push({ title, questions: [] });
    }
    groups[index.get(title)].questions.push(question);
  }
  return groups;
}

/**
 * Completion means required questions that are currently displayed.
 * Optional questions are not part of the denominator.
 */
export function requiredProgress(questions, answersByInstanceId) {
  const visible = visibleQuestions(questions, answersByInstanceId);
  const required = visible.filter((question) => question.required);
  const done = required.filter((question) =>
    isResponseAnswered(question.response_type, answersByInstanceId.get(question.id))
  );
  const total = required.length;
  return {
    done: done.length,
    total,
    percent: total === 0 ? 100 : Math.round((done.length / total) * 100),
    unanswered: required.filter(
      (question) => !isResponseAnswered(question.response_type, answersByInstanceId.get(question.id))
    ),
  };
}

export function showsRecordedCue(questionText) {
  return /PrimeCare recorded|PrimeCare shows/i.test(String(questionText || ""));
}
