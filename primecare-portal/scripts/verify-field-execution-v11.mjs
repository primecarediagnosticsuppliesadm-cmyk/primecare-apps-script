#!/usr/bin/env node
/**
 * Field Execution V1.1 — local certification.
 * No Production deploy. No schema apply. No live writes.
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyVisitEvidenceForm } from "../src/visits/agentVisitEvidenceFormModel.js";
import { formatYmdInTimeZone } from "../src/myBusiness/myBusinessCalendar.js";

register("./lib/srcAliasLoader.mjs", import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
let passes = 0;
function pass(id, detail) {
  passes += 1;
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  failures += 1;
  console.error(`FAIL  ${id}: ${detail}`);
}
function assert(cond, id, detail) {
  if (cond) pass(id, detail);
  else fail(id, detail);
}

const { buildMyBusinessModel } = await import("../src/myBusiness/myBusinessModel.js");
const { businessYmd, resolveMyBusinessRange } = await import("../src/myBusiness/myBusinessCalendar.js");
const { compactDiscoveryLine } = await import("../src/visits/agentVisitEvidenceFormModel.js");
const validation = await import("../src/visits/fastVisitValidation.js");

const range = resolveMyBusinessRange({
  preset: "custom",
  from: "2026-09-01",
  to: "2026-10-24",
  now: new Date("2026-10-24T08:00:00.000Z"),
});

const agent = "AGT_VISHWAK_RATA_36CC";
const labs = [
  { labId: "LAB-REAL", labName: "Real Lab", status: "PROSPECT", sourcedByAgentId: agent, createdAt: "2026-09-08", recordOrigin: "field" },
  { labId: "LAB-P-7CDAE963963F", labName: "PN EMAIL STAGE3E REAL RECIPIENT CERT — DO NOT CONTACT", status: "ACTIVE", sourcedByAgentId: agent, createdAt: "2026-09-29", recordOrigin: "certification" },
  { labId: "LAB-P-E9FFF046A399", labName: "PN EMAIL STAGE3F REAL RECIPIENT CERT — DO NOT CONTACT", status: "ACTIVE", sourcedByAgentId: agent, createdAt: "2026-09-29", recordOrigin: "certification" },
  { labId: "LAB-TESLA-DIAGNOSTIC-DP8J", labName: "Tesla Diagnostic", status: "ACTIVE", assignedAgentId: agent, sourcedByAgentId: "", createdAt: "2026-09-01", recordOrigin: "field" },
];
const visits = [
  { id: "v1", labId: "LAB-REAL", agentId: agent, visitDate: "2026-09-15", createdAt: "2026-10-11T12:00:00.000Z", notes: "[Visit] Area: X · Lab: Real Lab", commercialOutcome: "UNKNOWN", nextAction: "Confirm the conversation" },
  { id: "v2", labId: "LAB-REAL", agentId: agent, visitDate: "2026-09-16", createdAt: "2026-09-16T08:00:00.000Z", notes: "Customer uses local tubes", commercialOutcome: "REQUIREMENT", nextAction: "Send list", nextFollowUpDate: "2026-09-20" },
];
const orders = [
  { orderId: "ORD-1788803535585-vfjqng", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", orderDate: "2026-09-07T00:00:00.000Z", total_amount: 1000, status: "Fulfilled", recordOrigin: "certification", agentId: null },
  { orderId: "ORD-REAL", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", orderDate: "2026-09-11", total_amount: 500, status: "Fulfilled", recordOrigin: "field", agentId: "SOMEONE_ELSE" },
  { orderId: "ORD-CANCELLED", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", orderDate: "2026-09-12", total_amount: 250, status: "Cancelled", recordOrigin: "field" },
  { orderId: "ORD-TEST", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", orderDate: "2026-09-13", total_amount: 800, status: "Fulfilled", recordOrigin: "test" },
  { orderId: "ORD-OTHER", labId: "LAB-OUTSIDE", orderDate: "2026-09-12", total_amount: 9000, status: "Fulfilled", recordOrigin: "field", agentId: agent },
];
const payments = [
  { paymentId: "PAY-dfc63c604d9c4b8c9e26234b1994096e", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", paymentDate: "2026-09-07", amount_received: 100, orderId: "ORD-1788803535585-vfjqng" },
  { paymentId: "PAY-REAL", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", paymentDate: "2026-09-11", amount_received: 50, orderId: "ORD-REAL" },
  { paymentId: "PAY-CANCELLED", labId: "LAB-TESLA-DIAGNOSTIC-DP8J", paymentDate: "2026-09-12", amount_received: 25, orderId: "ORD-CANCELLED" },
];

const model = buildMyBusinessModel({
  range,
  subjectAgentId: agent,
  actor: { role: "agent" },
  labs,
  visits,
  orders,
  payments,
});

assert(model.kpis.prospectsAdded === 1, "kpi.prospects", "certification labs excluded; one genuine prospect remains");
assert(model.kpis.ordersFromMyLabs === 1, "kpi.orders", "fulfilled field order counts; cancelled, certification and test orders do not");
assert(model.kpis.rupeesOrdered === 500, "kpi.sales", "sales sum is the fulfilled field order only");
assert(model.kpis.rupeesCollected === 75, "kpi.collection_link", "certification payment is excluded; a payment on a cancelled order remains");
assert(!model.ledger.some((row) => row.id.includes("ORD-CANCELLED")), "ledger.cancelled", "a cancelled order is omitted from the agent order card");
assert(!model.ledger.some((row) => row.id.includes("ORD-TEST")), "ledger.test", "a test order is omitted from the agent order card");
assert(model.ledger.some((row) => row.id.includes("ORD-REAL") && row.orderAmount === 500), "ledger.fulfilled", "a fulfilled field order remains");
assert(
  model.kpis.ordersFromMyLabs === 1 && orders.find((row) => row.orderId === "ORD-REAL").agentId === "SOMEONE_ELSE",
  "kpi.attribution",
  "a field order on an assigned lab still counts without using orders.agent_id"
);
assert(!model.ledger.some((row) => row.id.includes("ORD-1788803535585")), "ledger.cert_order", "certification order is not an agent activity row");
assert(model.kpis.visitsLogged === 2, "kpi.visits", "visit rows stay on the agent who wrote them");
assert(model.kpis.visitsEnteredLate === 1, "kpi.late", "save on a later India date is late");
assert(model.kpis.incompleteVisits === 1, "kpi.incomplete", "a next-action correction does not complete a stamp-only visit");
assert(
  validation.visitRecordIncomplete({
    notes: "[Visit]\nArea: Guntur · Lab: Pilot Lab 6",
    nextAction: "Confirm the September conversation",
    noDiscussionReason: "",
  }),
  "visit.correction_stays_incomplete",
  "incomplete stays until an observation or a no-discussion reason exists"
);
assert(
  !validation.visitRecordIncomplete({
    notes: "[Visit]\nArea: Guntur · Lab: Pilot Lab 6",
    nextAction: "Confirm the September conversation",
    noDiscussionReason: "RECEPTION_ONLY",
  }),
  "visit.reason_completes",
  "a listed no-discussion reason completes the record"
);
assert(
  !validation.visitRecordIncomplete({ notes: "Customer asked for a price list", noDiscussionReason: "" }),
  "visit.observation_completes",
  "a meaningful observation completes the record"
);

const boundary = buildMyBusinessModel({
  range: resolveMyBusinessRange({
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-01",
    now: new Date("2026-10-24T08:00:00.000Z"),
  }),
  subjectAgentId: agent,
  labs: [
    {
      labId: "LAB-EDGE",
      status: "PROSPECT",
      sourcedByAgentId: agent,
      createdAt: "2026-09-30T20:00:00.000Z",
      recordOrigin: "field",
    },
  ],
});
assert(businessYmd("2026-09-30T20:00:00.000Z") === "2026-10-01", "date.ist_midnight", "20:00 UTC is the next India date");
assert(businessYmd("2026-09-30T18:29:00.000Z") === "2026-09-30", "date.ist_before_midnight", "18:29 UTC is still 30 Sep in India");
assert(businessYmd("2026-09-07") === "2026-09-07", "date.date_only", "a date-only value is not shifted");
assert(businessYmd("2026-09-07T00:00:00.000Z") === "2026-09-07", "date.midnight_utc", "midnight UTC stays 7 Sep in India");
assert(boundary.kpis.prospectsAdded === 1, "date.range", "the India date, not the UTC date, decides the period");

const empty = validation.validateFastVisit({ labId: "LAB-1", visitDate: "2026-10-01", commercialOutcome: "UNKNOWN", notes: "" });
assert(empty.some((item) => /customer said/i.test(item)), "visit.empty_note", "a new visit needs an observation or a reason");

const reception = validation.validateFastVisit({
  labId: "LAB-1",
  visitDate: "2026-10-01",
  commercialOutcome: "UNKNOWN",
  notes: "",
  noDiscussionReason: "RECEPTION_ONLY",
});
assert(reception.length === 0, "visit.reception", "reception only does not require product details");

const follow = validation.validateFastVisit({
  labId: "LAB-1",
  visitDate: "2026-10-01",
  commercialOutcome: "FOLLOW_UP",
  notes: "Main person will meet next week",
});
assert(follow.some((item) => /next action/i.test(item)) && follow.some((item) => /follow-up date/i.test(item)), "visit.follow_up", "a follow-up result needs the next step");

const stored = "Met reception\n[Visit] Area: Kphb · Lab: Lyf";
const historical = validation.validateFastVisit(
  {
    labId: "LAB-1",
    visitDate: "2026-09-15",
    commercialOutcome: "UNKNOWN",
    notes: "Met reception",
    nextFollowUpDate: "2026-09-18",
  },
  { mode: "update", storedNotes: stored, storedOutcome: "UNKNOWN", storedFollowUpDate: "2026-09-18" }
);
assert(historical.length === 0, "visit.historical_correction", "an unchanged historical note can be saved with other corrections");
assert(
  validation.notesForVisitWrite({ notes: "Met reception" }, { mode: "update", storedNotes: stored }) === stored,
  "visit.note_preserved",
  "an unchanged correction writes the original stored note"
);
const wiped = validation.validateFastVisit(
  { labId: "LAB-1", visitDate: "2026-09-15", commercialOutcome: "UNKNOWN", notes: "" },
  { mode: "update", storedNotes: "Customer asked for tubes", storedOutcome: "UNKNOWN" }
);
assert(wiped.length > 0, "visit.no_wipe", "clearing a real note is rejected");

const line = compactDiscoveryLine({
  id: "line-1",
  lineKind: "CONSUMABLE",
  productCategory: "Tubes",
  brand: "Not shared",
  monthlyQuantity: "0",
  quantityDisclosure: "NOT_SHARED",
  supplier: "Unknown",
});
assert(line && line.monthly_quantity == null && line.approx_volume == null, "visit.unknown_quantity", "not shared does not store zero");
assert(/Not shared/.test(line.notes), "visit.quantity_words", "the disclosure is stored as text");

const realZero = compactDiscoveryLine({
  id: "line-2",
  lineKind: "REAGENT",
  description: "Wash",
  monthlyQuantity: "0",
});
assert(realZero.monthly_quantity === 0, "visit.explicit_zero", "a typed zero stays zero");

const requestId = validation.createClientRequestId();
assert(validation.isClientRequestId(requestId), "visit.client_request", "a new visit gets one reusable request id");
const apiSrc = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
const builder = apiSrc.split("export function buildAgentVisitInsertRow")[1]?.split("export async function createAgentVisitWrite")[0] || "";
assert(/validateFastVisit\(payload/.test(builder) && /client_request_id/.test(builder), "visit.builder", "the visit insert builder enforces the new rules and sends the request id");
assert(/!persisted\.duplicate/.test(apiSrc), "visit.no_second_notice", "a duplicate retry does not send another notification");

const original = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "6c83b03f-2993-4aef-88a2-f23c42f242e8",
  agent_id: agent,
};
assert(
  validation.acceptDuplicateVisit(original, { tenantId: original.tenant_id, agentId: agent, viaAuthorizedRpc: true }),
  "dup.authorized",
  "the original row is returned after the tenant and agent check"
);
assert(
  !validation.acceptDuplicateVisit(original, { tenantId: original.tenant_id, agentId: "OTHER", viaAuthorizedRpc: true }),
  "dup.other_agent",
  "another agent's row is not returned"
);
assert(
  !validation.acceptDuplicateVisit(original, { tenantId: "other-tenant", agentId: agent, viaAuthorizedRpc: true }),
  "dup.other_tenant",
  "another tenant's row is not returned"
);
assert(
  !validation.acceptDuplicateVisit(original, { tenantId: original.tenant_id, agentId: agent, viaAuthorizedRpc: false }),
  "dup.no_rpc",
  "a row is not accepted before the authorization check"
);

const sql = readFileSync(
  resolve(root, "supabase/migrations/20261024130000_field_execution_v11_classification.sql"),
  "utf8"
);
const updates = sql.match(/UPDATE\s+public\.\w+/gi) || [];
assert(updates.length === 3, "sql.update_count", "the migration classifies exactly three rows");
assert(updates.filter((item) => /labs$/i.test(item)).length === 2, "sql.labs", "exactly two laboratory records are classified");
assert(updates.filter((item) => /orders$/i.test(item)).length === 1, "sql.order", "exactly one order is classified");
assert(sql.includes("LAB-P-7CDAE963963F") && sql.includes("LAB-P-E9FFF046A399"), "sql.lab_ids", "both certification laboratories are named");
assert(sql.includes("ORD-1788803535585-vfjqng") && sql.includes("FLOW3A-PROD-CERT-20260907") && sql.includes("AND total_amount = 1000"), "sql.order_guard", "the order match requires the note and the amount");
assert(!/UPDATE\s+public\.(invoices|payments|inventory_ledger|ar_|receivable)/i.test(sql), "sql.finance_untouched", "invoices, payments, stock, and receivables are not updated");
assert(!/DELETE FROM/i.test(sql), "sql.no_delete", "the migration does not delete rows");
assert(!/cancelled_at|total_amount\s*=/i.test(sql.replace("AND total_amount = 1000", "")), "sql.no_amount_write", "amounts are a match guard, not an update");
assert(/CREATE UNIQUE INDEX IF NOT EXISTS agent_visits_client_request_uidx/.test(sql), "sql.unique", "duplicate protection is a unique index");
assert(/auth\.uid\(\) IS NULL/.test(sql) && /record_origin_forbidden/.test(sql), "sql.trigger", "non-admins cannot reclassify; migration sessions can");
assert(/SECURITY INVOKER/.test(sql) && /current_tenant_id\(\)/.test(sql) && /current_profile_agent_id\(\)/.test(sql), "sql.rpc", "duplicate lookup checks tenant and agent without definer rights");
assert(!/CREATE POLICY/.test(sql), "sql.no_policy", "existing RLS policies are not replaced");

const page = readFileSync(resolve(root, "src/pages/MyBusinessPage.jsx"), "utf8");
const ordersPage = readFileSync(resolve(root, "src/pages/LabOrderingPage.jsx"), "utf8");
assert(/my-business-visit-quality/.test(page), "ui.quality", "My Business shows late and incomplete visits");
assert(!/record_origin/.test(ordersPage), "ui.finance_untouched", "lab ordering does not filter on the new classification");

const blankVisit = createEmptyVisitEvidenceForm();
assert(
  blankVisit.visitDate === formatYmdInTimeZone(new Date()),
  "date.kolkata",
  "a new visit date is today's Asia/Kolkata calendar date"
);
const formModel = readFileSync(resolve(root, "src/visits/agentVisitEvidenceFormModel.js"), "utf8");
const fastForm = readFileSync(resolve(root, "src/components/agent/AgentVisitEvidenceForm.jsx"), "utf8");
assert(!/getFullYear\(\)/.test(formModel), "date.not_local", "the fast form does not use the browser calendar");
assert(/type="date"/.test(fastForm) && /visitDate: e.target.value/.test(fastForm), "date.editable", "the agent can still choose the visit date");
assert(/data-testid="fast-visit-save-bar"/.test(fastForm) && /visualViewport/.test(fastForm), "ui.save_bar", "save stays above the mobile nav and keyboard");
assert(/visitEnteredLate/.test(readFileSync(resolve(root, "src/visits/fastVisitValidation.js"), "utf8")), "date.late_unchanged", "late entry still compares the save timestamp");

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
