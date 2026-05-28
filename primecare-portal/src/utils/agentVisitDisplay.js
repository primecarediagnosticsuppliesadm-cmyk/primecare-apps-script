import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Pull lab response from folded notes when column is empty.
 */
export function displayResponseLabel(value) {
  const v = str(value);
  if (!v) return "";
  if (v === "Interested") return "Interested";
  if (v === "Warm") return "Moderately Interested";
  if (v === "Not Interested") return "Not Interested";
  if (v === "Converted") return "Order Confirmed";
  if (v === "Need Follow-up") return "Follow-up Needed";
  return v;
}

export function parseLabResponseFromNotes(notes) {
  const raw = str(notes);
  if (!raw) return "";
  const tagMatch = raw.match(/\[Visit\]\s*([\s\S]*)/);
  const segment = tagMatch ? tagMatch[1] : raw;
  const responseMatch = segment.match(/Response:\s*([^·\n]+)/i);
  return responseMatch ? str(responseMatch[1]) : "";
}

/**
 * Normalize a visit row for Recent Visits UI (fills lab name, visit id, outcome).
 * @param {object} visit
 * @param {object[]} labs
 */
export function enrichVisitForDisplay(visit, labs = []) {
  const visitId = str(visit.visitId || visit.id || visit.Visit_ID);
  const labId = labIdKey(visit.labId || visit.Lab_ID);
  const lab = (labs || []).find((l) => labIdKey(l.labId) === labId);
  const labName =
    str(visit.labName || visit.Lab_Name) ||
    str(lab?.labName) ||
    (labId ? `Lab ${labId}` : "");

  const notes = str(visit.notes);
  let labResponse = str(visit.labResponse || visit.lab_response);
  if (!labResponse) {
    labResponse = parseLabResponseFromNotes(notes);
  }

  const visitType = str(visit.visitType || visit.visit_type || visit.Visit_Type) || "Field visit";
  const visitDate = str(visit.date || visit.visitDate || visit.visit_date).slice(0, 10);
  const nextAction = str(visit.nextAction || visit.next_action);
  const nextFollowUpDate = str(
    visit.nextFollowUpDate || visit.next_follow_up_date
  ).slice(0, 10);
  const nextFollowUpType = str(visit.nextFollowUpType || visit.next_follow_up_type) || "Call";
  const soldValue = Number(visit.soldValue ?? visit.sold_value ?? 0);
  const qualificationBand =
    str(visit.qualificationBand || visit.qualification_band) ||
    str(lab?.qualificationBand || lab?.qualification_band) ||
    "";

  const outcomeLabel = labResponse ? displayResponseLabel(labResponse) : "";

  return {
    ...visit,
    visitId,
    id: visitId,
    labId,
    labName,
    visitType,
    date: visitDate,
    visitDate,
    labResponse,
    outcomeLabel,
    soldValue,
    nextAction,
    nextFollowUpDate,
    nextFollowUpType,
    notes,
    qualificationBand,
    area: str(visit.area || lab?.area),
  };
}

export function hasVisitCardContent(visit) {
  return Boolean(
    str(visit.labName) ||
      str(visit.visitType) ||
      str(visit.outcomeLabel) ||
      str(visit.nextAction) ||
      str(visit.notes) ||
      Number(visit.soldValue) > 0
  );
}
