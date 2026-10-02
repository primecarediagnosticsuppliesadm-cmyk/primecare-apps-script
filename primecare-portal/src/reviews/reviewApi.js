import { supabase } from "@/api/supabaseClient.js";
import { ROLES } from "@/config/roles.js";

const CYCLE_COLUMNS =
  "id, subject_agent_id, review_type, period_start, period_end, status, reopened_at, template_key";
const INSTANCE_COLUMNS =
  "id, question_key, question_version, section, question_text, response_type, options_json, required, display_order, audience, display_rule_json";
const RESPONSE_COLUMNS = "id, instance_id, response_json, updated_at";

function fail(error) {
  return { ok: false, error: error?.message || String(error || "request failed") };
}

export async function listReviewCycles() {
  if (!supabase) return fail(new Error("Supabase is not configured"));
  const { data, error } = await supabase
    .from("agent_review_cycles")
    .select(CYCLE_COLUMNS)
    .order("period_start", { ascending: false });
  if (error) return fail(error);
  return { ok: true, cycles: data || [] };
}

export async function loadAgentQuestionnaire(cycleId) {
  if (!supabase) return fail(new Error("Supabase is not configured"));
  const [instances, responses, cycle] = await Promise.all([
    supabase
      .from("agent_review_question_instances")
      .select(INSTANCE_COLUMNS)
      .eq("cycle_id", cycleId)
      .eq("audience", "AGENT")
      .order("display_order", { ascending: true }),
    supabase.from("agent_review_responses").select(RESPONSE_COLUMNS).eq("cycle_id", cycleId),
    supabase.from("agent_review_cycles").select(CYCLE_COLUMNS).eq("id", cycleId).maybeSingle(),
  ]);
  if (instances.error) return fail(instances.error);
  if (responses.error) return fail(responses.error);
  if (cycle.error) return fail(cycle.error);
  if (!cycle.data) return fail(new Error("This review is not available."));
  const questions = (instances.data || []).filter((row) => row.audience === "AGENT");
  return {
    ok: true,
    cycle: cycle.data,
    questions,
    responses: responses.data || [],
  };
}

export async function saveReviewResponse({ tenantId, cycleId, instanceId, userId, responseJson }) {
  if (!supabase) return fail(new Error("Supabase is not configured"));
  const { data, error } = await supabase
    .from("agent_review_responses")
    .upsert(
      {
        tenant_id: tenantId,
        cycle_id: cycleId,
        instance_id: instanceId,
        response_json: responseJson,
        answered_by_user_id: userId,
      },
      { onConflict: "instance_id" }
    )
    .select(RESPONSE_COLUMNS)
    .maybeSingle();
  if (error) return fail(error);
  return { ok: true, response: data };
}

export async function transitionReview(cycleId, status) {
  if (!supabase) return fail(new Error("Supabase is not configured"));
  const { data, error } = await supabase
    .from("agent_review_cycles")
    .update({ status })
    .eq("id", cycleId)
    .select(CYCLE_COLUMNS)
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return fail(new Error("The review could not be updated."));
  return { ok: true, cycle: data };
}

export async function listAgentDirectory(tenantId) {
  if (!supabase || !tenantId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("agent_id, agent_name, display_name, active, role, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("role", ROLES.AGENT);
  if (error) return [];
  return (data || [])
    .filter((row) => row.active !== false && row.agent_id)
    .map((row) => ({
      agentId: row.agent_id,
      agentName: row.display_name || row.agent_name || row.agent_id,
    }))
    .sort((a, b) => a.agentName.localeCompare(b.agentName));
}

/**
 * Laboratories the signed-in user is allowed to see. RLS is the boundary.
 * Used only for the agent's own selectors, not for a management write.
 */
export async function listVisibleLabs() {
  if (!supabase) return fail(new Error("Supabase is not configured"));
  const { data, error } = await supabase
    .from("labs")
    .select("lab_id, lab_name")
    .order("lab_name", { ascending: true })
    .limit(1000);
  if (error) return fail(error);
  return {
    ok: true,
    labs: (data || [])
      .filter((row) => row.lab_id)
      .map((row) => ({ labId: row.lab_id, labName: row.lab_name || row.lab_id })),
  };
}
