/**
 * Review package generator. Server operation. Not a React module.
 * Writes the cycle, snapshot V1, and frozen question instances in one
 * database function. A repeat call for the same subject and period returns
 * the existing cycle.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ subjectAgentId: string, periodStart: string, periodEnd: string, templateKey: string }} input
 */
export async function generateReviewCycle(client, input) {
  const { data, error } = await client.rpc("agent_review_generate_cycle", {
    p_subject_agent_id: input.subjectAgentId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_template_key: input.templateKey,
  });
  if (error) throw error;
  return data;
}
