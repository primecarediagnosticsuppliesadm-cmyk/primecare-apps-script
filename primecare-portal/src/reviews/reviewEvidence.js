/**
 * Review evidence builder. Server operation. Not a React module.
 * Aggregation runs in agent_review_build_evidence so the read is complete
 * and uses Asia/Kolkata business dates.
 */

export const REVIEW_TIME_ZONE = "Asia/Kolkata";

export const REVIEW_UNAVAILABLE_PHRASE =
  "not available in PrimeCare for this review period";

export const REVIEW_SCALAR_PLACEHOLDERS = Object.freeze([
  "prospects_sourced",
  "visits_authored",
  "unique_labs_visited",
  "labs_with_repeat_visits_in_period",
  "visits_with_notes",
  "visits_with_next_action",
  "visits_with_scheduled_follow_up",
]);

export const REVIEW_UNAVAILABLE_METRICS = Object.freeze([
  "follow_up_completion_rate",
  "commercial_outcome",
  "discovery_lines",
  "decision_maker_coverage",
  "wallet",
  "complaint",
  "qualification",
  "personal_order_credit",
  "personal_collection_credit",
]);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ subjectAgentId: string, periodStart: string, periodEnd: string, reviewType: string }} input
 */
export async function buildReviewEvidence(client, input) {
  const { data, error } = await client.rpc("agent_review_build_evidence", {
    p_subject_agent_id: input.subjectAgentId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_review_type: input.reviewType,
  });
  if (error) throw error;
  return data;
}
