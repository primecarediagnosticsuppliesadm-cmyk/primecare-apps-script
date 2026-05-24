import { labIdKey } from "@/utils/labId";

/**
 * Same response-shape handling as LabsPage getLabsCredit().
 */
export function extractLabsCreditRows(res) {
  if (!res?.success) return [];
  const raw = res.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.labs)) return raw.labs;
  return [];
}

/**
 * Normalizes Supabase / Apps Script lab rows for portal UI (LabsPage-compatible).
 */
export function normalizePortalLab(lab) {
  const labId = labIdKey(lab?.labId ?? lab?.lab_id ?? lab?.Lab_ID);
  const labName = String(
    lab?.labName ?? lab?.lab_name ?? lab?.Lab_Name ?? lab?.name ?? ""
  ).trim();

  return {
    ...lab,
    labId,
    lab_id: labId,
    labName,
    lab_name: labName,
    area: String(lab?.area ?? lab?.Area ?? "").trim(),
    assignedAgentId: String(
      lab?.assignedAgentId ??
        lab?.assigned_agent_id ??
        lab?.agentId ??
        lab?.agent_id ??
        ""
    ).trim(),
    assigned_agent_id: String(
      lab?.assigned_agent_id ??
        lab?.assignedAgentId ??
        lab?.agent_id ??
        lab?.agentId ??
        ""
    ).trim(),
    assignedAgent: String(
      lab?.assignedAgent ??
        lab?.assigned_agent ??
        lab?.agentName ??
        lab?.agent_name ??
        ""
    ).trim(),
  };
}

/** Native select options: { value, label } with canonical lab id keys. */
export function buildLabSelectOptions(labs) {
  return (labs || [])
    .map((lab) => {
      const value = labIdKey(lab?.labId ?? lab?.lab_id);
      if (!value) return null;
      const name = String(lab?.labName ?? lab?.lab_name ?? "").trim() || value;
      return { value, label: `${name} (${value})` };
    })
    .filter(Boolean);
}
