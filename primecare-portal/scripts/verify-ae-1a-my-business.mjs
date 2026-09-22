#!/usr/bin/env node
/**
 * AE-1A — My Business static certification.
 * No Production deploy. No schema apply. No live writes.
 */
import { register } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

register("./lib/srcAliasLoader.mjs", import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, detail) {
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
function readRel(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

const {
  resolveMyBusinessRange,
  MY_BUSINESS_TIME_ZONE,
  formatYmdInTimeZone,
} = await import("../src/myBusiness/myBusinessCalendar.js");
const { resolveMyBusinessSubjectAgent, canAccessMyBusiness } = await import(
  "../src/myBusiness/myBusinessAuth.js"
);
const {
  buildMyBusinessModel,
  deriveFollowUpStatus,
  MY_BUSINESS_KPI_SOURCES,
  STALE_VISIT_DAYS,
} = await import("../src/myBusiness/myBusinessModel.js");
const { splitFieldMobileNav, AGENT_FIELD_PRIMARY_NAV_KEYS } = await import(
  "../src/layout/fieldMobileNav.js"
);

console.log("\n=== AE-1A My Business — static certification ===\n");

const now = new Date("2026-09-16T08:00:00.000Z"); // IST 2026-09-16 13:30, Wednesday
const todayIst = formatYmdInTimeZone(now);
assert(todayIst === "2026-09-16", "ist.today", `IST civil date is ${todayIst}`);
assert(MY_BUSINESS_TIME_ZONE === "Asia/Kolkata", "ist.tz", "Asia/Kolkata calendar");

const today = resolveMyBusinessRange({ preset: "today", now });
assert(
  today.from === "2026-09-16" && today.to === "2026-09-16",
  "ist.today_bounds",
  `${today.from} → ${today.to}`
);

const week = resolveMyBusinessRange({ preset: "this_week", now });
assert(
  week.from === "2026-09-14" && week.to === "2026-09-16",
  "ist.week_mon_today",
  `Mon–today ${week.from} → ${week.to}`
);

const month = resolveMyBusinessRange({ preset: "this_month", now });
assert(
  month.from === "2026-09-01" && month.to === "2026-09-16",
  "ist.month",
  `${month.from} → ${month.to}`
);

const prev = resolveMyBusinessRange({ preset: "previous_month", now });
assert(
  prev.from === "2026-08-01" && prev.to === "2026-08-31",
  "ist.previous_month",
  `${prev.from} → ${prev.to}`
);

const custom = resolveMyBusinessRange({
  preset: "custom",
  from: "2026-09-20",
  to: "2026-09-10",
  now,
});
assert(
  custom.from === "2026-09-10" && custom.to === "2026-09-20",
  "ist.custom_swap",
  "custom from>to is swapped"
);

const founderToday = resolveMyBusinessRange({ preset: "today", now });
assert(
  founderToday.from === today.from && founderToday.to === today.to,
  "ist.shared_boundaries",
  "Founder and Agent share IST range helper"
);

assert(deriveFollowUpStatus("2026-09-16", "2026-09-16") === "DUE", "followup.due", "due today");
assert(deriveFollowUpStatus("2026-09-15", "2026-09-16") === "OVERDUE", "followup.overdue", "past due");
assert(deriveFollowUpStatus("2026-09-20", "2026-09-16") === "FUTURE", "followup.future", "future due");
assert(deriveFollowUpStatus("", "2026-09-16") === "NONE", "followup.none", "missing date");
assert(
  deriveFollowUpStatus("2026-09-01", "2026-09-16", true) === "NONE",
  "followup.later_visit_clears",
  "later visit clears overdue"
);

const agentA = { role: "agent", agentId: "AGT-A", tenantId: "tenant-1" };
const agentB = { role: "agent", agentId: "AGT-B", tenantId: "tenant-1" };
const admin = { role: "admin", tenantId: "tenant-1" };
const executive = { role: "executive", tenantId: "tenant-1" };
const directory = [
  { agentId: "AGT-A", role: "agent", tenantId: "tenant-1" },
  { agentId: "AGT-B", role: "agent", tenantId: "tenant-1" },
  { agentId: "AGT-X", role: "agent", tenantId: "tenant-2" },
  { agentId: "ADM-1", role: "admin", tenantId: "tenant-1" },
];

const self = resolveMyBusinessSubjectAgent({
  actor: agentA,
  requestedSubjectAgentId: "AGT-B",
  agentDirectory: directory,
});
assert(self.ok && self.subjectAgentId === "AGT-A", "auth.agent_self", "Agent subject is profile agent_id");
assert(self.ignoredClientSubjectAgentId === true, "auth.forged_id", "client Agent ID is discarded");

const aSeesB = resolveMyBusinessSubjectAgent({
  actor: agentA,
  requestedSubjectAgentId: "AGT-B",
  agentDirectory: directory,
});
assert(
  aSeesB.subjectAgentId !== "AGT-B",
  "auth.agent_a_not_b",
  "Agent A cannot select Agent B"
);

const hq = resolveMyBusinessSubjectAgent({
  actor: admin,
  requestedSubjectAgentId: "AGT-B",
  agentDirectory: directory,
});
assert(hq.ok && hq.subjectAgentId === "AGT-B", "auth.admin_picker", "Admin may select same-tenant Agent");

const execPick = resolveMyBusinessSubjectAgent({
  actor: executive,
  requestedSubjectAgentId: "AGT-A",
  agentDirectory: directory,
});
assert(execPick.ok && execPick.subjectAgentId === "AGT-A", "auth.executive_picker", "Executive picker");

const missing = resolveMyBusinessSubjectAgent({ actor: admin, agentDirectory: directory });
assert(missing.error === "agent_required", "auth.admin_required", "Admin must pick an Agent");

const cross = resolveMyBusinessSubjectAgent({
  actor: admin,
  requestedSubjectAgentId: "AGT-X",
  agentDirectory: directory,
});
assert(cross.error === "cross_tenant", "auth.cross_tenant", "cross-tenant Agent rejected");

const notAgent = resolveMyBusinessSubjectAgent({
  actor: admin,
  requestedSubjectAgentId: "ADM-1",
  agentDirectory: directory,
});
assert(notAgent.error === "not_an_agent", "auth.not_an_agent", "non-Agent directory row rejected");

assert(canAccessMyBusiness(agentA) && canAccessMyBusiness(admin) && canAccessMyBusiness(executive), "auth.allow_roles", "Agent/Admin/Executive allowed");
assert(
  !canAccessMyBusiness({ role: "hr" }) &&
    !canAccessMyBusiness({ role: "lab" }) &&
    !canAccessMyBusiness({ role: "read_only_auditor" }),
  "auth.deny_hr_lab_auditor",
  "HR/Lab/Auditor forbidden"
);

const range = resolveMyBusinessRange({ preset: "this_month", now });
const labs = [
  {
    labId: "LAB-A",
    labName: "Alpha Labs",
    status: "ACTIVE",
    assignedAgentId: "AGT-A",
    sourcedByAgentId: "AGT-A",
    createdAt: "2026-09-05",
    outstanding: 0,
    daysOverdue: 0,
    soldValue: 999999,
    estimated_monthly_wallet_inr: 888888,
    wallet_range_band: "HIGH",
  },
  {
    labId: "LAB-B",
    labName: "Beta Labs",
    status: "ACTIVE",
    assignedAgentId: "AGT-B",
    sourcedByAgentId: "AGT-B",
    createdAt: "2026-09-05",
    outstanding: 2500,
    daysOverdue: 12,
    soldValue: 777777,
  },
  {
    labId: "LAB-P",
    labName: "Prospect Lab",
    status: "PROSPECT",
    assignedAgentId: "AGT-A",
    sourcedByAgentId: "AGT-A",
    createdAt: "2026-09-12",
  },
  {
    labId: "LAB-STALE",
    labName: "Stale Lab",
    status: "ACTIVE",
    assignedAgentId: "AGT-A",
    sourcedByAgentId: "AGT-A",
    createdAt: "2026-01-01",
  },
];
const visits = [
  {
    id: "v-old",
    labId: "LAB-A",
    agentId: "AGT-A",
    visitDate: "2026-09-02",
    nextFollowUpDate: "2026-09-03",
    commercialOutcome: "REQUIREMENT",
    notes: "older visit",
    nextAction: "Call",
  },
  {
    id: "v-new",
    labId: "LAB-A",
    agentId: "AGT-A",
    visitDate: "2026-09-10",
    nextFollowUpDate: "2026-09-16",
    commercialOutcome: "QUOTE_OPPORTUNITY",
    notes: "latest",
    nextAction: "Send quote follow-up",
  },
  {
    id: "v-b",
    labId: "LAB-B",
    agentId: "AGT-B",
    visitDate: "2026-09-08",
    nextFollowUpDate: "2026-09-01",
    commercialOutcome: "REQUIREMENT",
  },
  {
    id: "v-future",
    labId: "LAB-P",
    agentId: "AGT-A",
    visitDate: "2026-09-12",
    nextFollowUpDate: "2026-09-30",
    commercialOutcome: "",
  },
];
const orders = [
  { orderId: "ORD-A", labId: "LAB-A", orderDate: "2026-09-11", total_amount: 1500, soldValue: 999999 },
  { orderId: "ORD-B", labId: "LAB-B", orderDate: "2026-09-11", total_amount: 4000 },
];
const payments = [
  { paymentId: "PAY-A", labId: "LAB-A", paymentDate: "2026-09-12", amount_received: 700 },
  { paymentId: "PAY-B", labId: "LAB-B", paymentDate: "2026-09-12", amount_received: 2000 },
];

const modelA = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-A",
  actor: agentA,
  labs,
  visits,
  orders,
  payments,
  discoveryLines: [
    { visitUuid: "v-new", lineKind: "ANALYSER", brand: "Sysmex", monthly_spend_inr: 50000, approx_price_pack: 1200 },
  ],
});
const modelB = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-B",
  actor: agentB,
  labs,
  visits,
  orders,
  payments,
});
const modelFounderA = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-A",
  actor: executive,
  labs,
  visits,
  orders,
  payments,
  discoveryLines: [
    { visitUuid: "v-new", lineKind: "ANALYSER", brand: "Sysmex", monthly_spend_inr: 50000, approx_price_pack: 1200 },
  ],
});

assert(modelA.kpis.prospectsAdded === 2, "kpi.prospects", "Prospects added from sourced labs in period");
assert(
  modelA.ledger.some((row) => row.activity === "PROSPECT_CREATED" && row.labId === "LAB-P"),
  "ledger.prospect_rows",
  "PROSPECT_CREATED included"
);
assert(modelA.kpis.visitsLogged === 3, "kpi.visits", "Visits logged for subject Agent only");
assert(modelA.kpis.requirements === 1, "kpi.requirements", "REQUIREMENT commercial_outcome");
assert(modelA.kpis.quoteOpportunities === 1, "kpi.quotes", "QUOTE_OPPORTUNITY commercial_outcome");
assert(modelA.kpis.ordersFromMyLabs === 1, "kpi.orders", "canonical orders for in-scope labs");
assert(modelA.kpis.rupeesOrdered === 1500, "kpi.rupees_ordered", "orders.total_amount only");
assert(modelA.kpis.rupeesCollected === 700, "kpi.rupees_collected", "payments.amount_received only");
assert(
  MY_BUSINESS_KPI_SOURCES.rupeesOrdered === "orders.total_amount" &&
    MY_BUSINESS_KPI_SOURCES.rupeesCollected === "payments.amount_received",
  "kpi.source_labels",
  "canonical monetary sources"
);
assert(
  modelA.kpiLabels.rupeesOrdered === "₹ ordered by my labs" &&
    modelA.kpiLabels.rupeesCollected === "₹ collected from my labs" &&
    modelA.kpiLabels.visitsLogged === "Visits logged",
  "kpi.honest_labels",
  "honest KPI labels"
);

assert(
  !modelA.ledger.some((row) => row.labId === "LAB-B") &&
    !modelB.ledger.some((row) => row.labId === "LAB-A" || row.labId === "LAB-P"),
  "iso.agent_a_not_b",
  "Agent A ledger excludes Agent B labs"
);
assert(modelB.kpis.rupeesOrdered === 4000 && modelB.kpis.rupeesCollected === 2000, "iso.agent_b_money", "Agent B monetary KPIs isolated");

assert(
  JSON.stringify(modelA.kpis) === JSON.stringify(modelFounderA.kpis) &&
    JSON.stringify(modelA.ledger) === JSON.stringify(modelFounderA.ledger),
  "same_period.same_ledger",
  "Agent and Founder same subject+period → same ledger/KPIs"
);

const latestVisit = modelA.ledger.find((row) => row.id === "visit:v-new");
const olderVisit = modelA.ledger.find((row) => row.id === "visit:v-old");
assert(latestVisit?.followUpStatus === "DUE", "ledger.followup_due", "latest visit DUE today");
assert(olderVisit?.followUpStatus === "NONE", "ledger.later_visit_rule", "older follow-up cleared by later visit");
assert(
  modelA.ledger.find((row) => row.id === "visit:v-future")?.followUpStatus === "FUTURE",
  "ledger.followup_future",
  "future follow-up"
);

assert(
  modelA.attention.some((g) => g.type === "FOLLOW_UP_DUE") &&
    !modelA.attention.some((g) => g.type === "FOLLOW_UP_OVERDUE"),
  "attention.later_visit_no_overdue",
  "later visit prevents overdue attention for LAB-A"
);
assert(
  modelA.attention.some((g) => g.type === "REVISIT" && g.items.some((i) => i.labId === "LAB-STALE")),
  "attention.stale",
  `stale revisit after ${STALE_VISIT_DAYS}d`
);
assert(
  modelB.attention.some((g) => g.type === "COLLECTION_DUE"),
  "attention.collection",
  "collection due from outstanding/overdue"
);
assert(
  !modelA.attention.some((g) => /waiting on primecare/i.test(g.title)),
  "attention.no_waiting_on_hq",
  "Waiting on PrimeCare not shown"
);

assert(
  !JSON.stringify(modelA).includes("999999") &&
    !JSON.stringify(modelA.kpis).includes("888888") &&
    modelA.kpis.rupeesOrdered !== 999999,
  "firewall.soldValue_ignored",
  "soldValue/wallet fixtures do not affect ₹ KPIs"
);
assert(
  !modelA.ledger.some((row) => String(row.discovery).includes("50000") || String(row.discovery).includes("1200")),
  "firewall.discovery_spend_ignored",
  "discovery monthly_spend / approx_price_pack omitted"
);

const fakeCrm = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-A",
  actor: agentA,
  labs,
  visits: visits.map((v) => ({ ...v, pipeline_expected_value: 123456, salesLoggedToday: 50 })),
  orders: [],
  payments: [],
});
assert(fakeCrm.kpis.rupeesOrdered === 0 && fakeCrm.kpis.ordersFromMyLabs === 0, "firewall.no_crm_proxy", "CRM quote proxy does not create orders");

const capModel = buildMyBusinessModel({
  range: { from: "2026-09-01", to: "2026-09-16", todayYmd: "2026-09-16" },
  subjectAgentId: "AGT-A",
  actor: agentA,
  labs: Array.from({ length: 210 }, (_, i) => ({
    labId: `CAP-${i}`,
    labName: `Cap ${i}`,
    status: "PROSPECT",
    sourcedByAgentId: "AGT-A",
    createdAt: "2026-09-02",
  })),
  ledgerCap: 200,
});
assert(capModel.ledgerTruncated && capModel.ledger.length === 200, "perf.ledger_cap", "ledger cap 200 with truncate flag");

const menu = [
  { key: "myBusiness", label: "My Business" },
  { key: "dashboard", label: "Dashboard" },
  { key: "visits", label: "Visits" },
  { key: "agentResources", label: "Resources" },
  { key: "labs", label: "Labs" },
  { key: "collections", label: "Collections" },
];
const split = splitFieldMobileNav("agent", menu);
assert(
  JSON.stringify(split.primary.map((i) => i.key)) ===
    JSON.stringify(["myBusiness", "visits", "labs", "collections"]),
  "mobile.primary",
  "primary: My Business, Visits, Labs, Collections"
);
assert(
  split.more.some((i) => i.key === "dashboard") && split.more.some((i) => i.key === "agentResources"),
  "mobile.more",
  "Dashboard + Resources under More"
);
assert(
  JSON.stringify(AGENT_FIELD_PRIMARY_NAV_KEYS) === JSON.stringify(["myBusiness", "visits", "labs", "collections"]),
  "mobile.keys",
  "field primary key contract"
);

const src = {
  page: readRel("src/pages/MyBusinessPage.jsx"),
  portal: readRel("src/PrimeCareWebPortal.jsx"),
  menu: readRel("src/config/menuConfig.js"),
  perms: readRel("src/config/rolePermissionMatrix.js"),
  routing: readRel("src/config/pageRouting.js"),
  layout: readRel("src/layout/PortalLayout.jsx"),
  nav: readRel("src/layout/fieldMobileNav.js"),
  read: readRel("src/myBusiness/myBusinessRead.js"),
  model: readRel("src/myBusiness/myBusinessModel.js"),
  prefetch: readRel("src/utils/routePrefetch.js"),
};
const ae1aBlob = Object.values(src).join("\n");

assert(/pathToPageKey|case "my-business"/.test(src.routing), "route.path", "/my-business alias");
assert(/key: "myBusiness", label: "My Business"/.test(src.menu), "menu.label", "Agent menu My Business");
assert(/myBusiness: \[ROLES\.AGENT, ROLES\.ADMIN, ROLES\.EXECUTIVE\]/.test(src.perms), "perm.allow", "Agent/Admin/Executive");
assert(!/myBusiness: \[[^\]]*ROLES\.HR/.test(src.perms), "perm.no_hr", "HR denied");
assert(!/myBusiness: \[[^\]]*ROLES\.LAB/.test(src.perms), "perm.no_lab", "Lab denied");
assert(/\[ROLES\.READ_ONLY_AUDITOR\]: \[[^\]]*myBusiness/.test(src.perms.replace(/\n/g, " ")), "perm.no_auditor_menu", "Auditor unauthorized list includes myBusiness");
assert(/case "myBusiness"/.test(src.portal) && /MyBusinessPage/.test(src.portal), "route.page", "MyBusinessPage routed");
assert(
  /case "dashboard":\s*return \(\s*<AgentDashboard/.test(src.portal) &&
    !/case "dashboard":\s*return \(\s*<MyBusinessPage/.test(src.portal),
  "dashboard.unchanged",
  "existing Dashboard remains AgentDashboard"
);
assert(!/setActivePage\(["']myBusiness["']\)/.test(src.portal.split("function PageRedirect")[0] || ""), "dashboard.no_default_redirect", "portal default is not My Business");
assert(/getMyBusinessRead/.test(src.read) && !/getAgentWorkspaceRead\s*\(/.test(src.read), "arch.dedicated_read", "dedicated loader, not workspace god-loader");
assert(/fetchLabsForSubject/.test(src.read) && !/fetchLabsForTenant/.test(src.read), "arch.bounded_labs", "labs fetched by subject, not HQ-wide");
assert(/requestedSubjectAgentId: isHq \? selectedAgentId : ""/.test(src.page), "ui.agent_no_picker_id", "Agent does not send client Agent ID");
assert(/data-testid="my-business-agent-picker"/.test(src.page), "ui.hq_picker", "Admin/Executive Agent picker");
assert(/data-testid="my-business-attention"/.test(src.page), "ui.attention_first", "Needs my attention present");
assert(src.page.indexOf("my-business-attention") < src.page.indexOf("my-business-kpis"), "ui.attention_above_kpis", "attention above KPIs");
assert(/md:hidden/.test(src.page) && /hidden overflow-x-auto[\s\S]*md:block/.test(src.page), "mobile.390_cards", "ledger cards on small screens, table on md+");
assert(/field-mobile-primary-nav/.test(src.layout) && /MoreHorizontal/.test(src.layout), "mobile.nav_more", "bottom nav More sheet");
assert(/text-\[10px\]/.test(src.layout) && !/max-w-\[70px\]/.test(src.layout), "mobile.truncation_fix", "primary labels use cell width, not 70px clip");
assert(/PAGE_LOADERS[\s\S]*myBusiness:/.test(src.prefetch), "prefetch.loader", "myBusiness lazy loader");
assert(!/Waiting on PrimeCare|Waiting on HQ/.test(ae1aBlob), "scope.no_waiting_on_hq", "AE-1C ownership not invented");
assert(!/visit_handoffs|agent_tasks|Daily Notes|meaningful flag|xlsx|XLSX/.test(ae1aBlob), "scope.no_future_slices", "no AE-1B/C, VE-4, tasks, XLSX");
assert(!/\.insert\(|\.update\(|\.upsert\(/.test(src.read), "security.no_financial_write", "My Business read has no write path");
assert(!/soldValue|pipeline_expected_value|salesLoggedToday/.test(src.model), "firewall.model_no_proxies", "model source has no CRM money proxies");
assert(/totalAmount \?\? order\.total_amount/.test(src.model) && /amountReceived \?\? pay\.amount_received/.test(src.model), "firewall.model_canonical", "canonical order/payment fields");
assert(
  !/primecare-portal-prod|app\.primecarediagnostics\.in|VITE_APP_ENV.*prod/.test(ae1aBlob),
  "qa.no_prod_refs",
  "AE-1A sources do not hardcode Production"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — AE-1A My Business static certification\n");
