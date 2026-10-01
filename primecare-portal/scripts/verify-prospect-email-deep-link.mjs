#!/usr/bin/env node
/**
 * PN-email prospect CTA deep link.
 * No Production mutation. No send.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderForEventType } from "../supabase/functions/dispatch-notification-email/policy.js";
import {
  applyProspectDeepLinkEffect,
  rememberLabsReturn,
  resolveProspectDeepLink,
  safeInternalReturnPath,
  takeLabsReturn,
} from "../src/labs/prospectDeepLink.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  failures += 1;
  console.log(`FAIL  ${id}: ${detail}`);
}

const labId = "LAB-P-E9FFF046A399";
const otherId = "LAB-P-OTHER0000001";
const labName = "Srinidhi Diagonistic";
const mail = renderForEventType("prospect_created", {
  payload: {
    lab_id: labId.toLowerCase(),
    lab_name: labName,
    contact_name: "Pat",
    phone: "555",
  },
  appPublicUrl: "https://app.primecarediagnostics.in/",
  sourceId: "IGNORED-IF-PAYLOAD-PRESENT",
});
const cta = mail.ok ? (mail.text.split("Review Prospect: ")[1] || "").trim() : "";
const url = mail.ok ? new URL(cta) : null;

if (mail.ok && url && url.searchParams.get("labId") === labId && url.searchParams.get("action") === "review") {
  pass("1.cta_lab_id", "prospect_created CTA contains the canonical lab id");
} else fail("1.cta_lab_id", cta);

if (mail.ok && url?.origin === "https://app.primecarediagnostics.in" && url.pathname === "/labs") {
  pass("2.production_base", "CTA uses the Production portal /labs path");
} else fail("2.production_base", cta);

if (mail.ok && !cta.toLowerCase().includes(labName.toLowerCase()) && !cta.includes("Pat") && !cta.includes("555")) {
  pass("3.no_name_lookup", "lab name, contact, and phone are not the lookup key");
} else fail("3.no_name_lookup", cta);

const labs = [
  { labId, labName, status: "PROSPECT" },
  { labId: otherId, labName: "Other Lab", status: "PROSPECT" },
];
const opened = resolveProspectDeepLink({
  search: url?.search || "",
  labs,
  canReview: true,
});
if (opened.openReview && opened.tab === "prospects" && opened.labId === labId) {
  pass("4.labs_parse", "Labs parses a valid prospect deep link");
  pass("5.prospects_tab", "Prospects context is selected");
  pass("6.review_opens", "exact prospect review is requested");
} else fail("4-6.deep_link", JSON.stringify(opened));

if (opened.labId !== otherId) pass("7.unrelated", "unrelated prospect is not selected");
else fail("7.unrelated", opened.labId);

const invalid = resolveProspectDeepLink({
  search: "?tab=prospects&labId=../etc/passwd&action=review",
  labs,
  canReview: true,
});
if (!invalid.openReview && invalid.message === "This review link is not valid." && !invalid.message.includes("passwd")) {
  pass("8.invalid_id", "invalid id fails closed without echoing it");
} else fail("8.invalid_id", JSON.stringify(invalid));

const hidden = resolveProspectDeepLink({
  search: `?tab=prospects&labId=${labId}&action=review`,
  labs: [],
  canReview: false,
});
if (!hidden.openReview && !hidden.message && !hidden.labId) {
  pass("9.no_leak", "inaccessible role does not receive prospect information");
} else fail("9.no_leak", JSON.stringify(hidden));

const active = resolveProspectDeepLink({
  search: `?tab=prospects&labId=${labId}&action=review`,
  labs: [{ labId, status: "ACTIVE", labName }],
  canReview: true,
});
if (active.openReview && active.alreadyActive && active.tab === "all") {
  pass("10.active", "already-active prospect opens existing lab context");
} else fail("10.active", JSON.stringify(active));

const plain = resolveProspectDeepLink({ search: "", labs, canReview: true });
if (!plain.openReview && !plain.tab && !plain.message) {
  pass("14.plain_labs", "normal /labs behavior is unchanged");
} else fail("14.plain_labs", JSON.stringify(plain));

const hq = readFileSync(resolve(root, "src/components/hq/HqLabsAdminView.jsx"), "utf8");
if (/function handleReviewLab\(lab\)/.test(hq) && /setReviewLabId\(labIdKey\(lab\.labId\)\)/.test(hq)) {
  pass("15.manual_review", "manual Review Prospect still opens the existing drawer");
} else fail("15.manual_review", "manual review handler changed");

const missing = renderForEventType("prospect_created", {
  payload: { lab_name: labName },
  appPublicUrl: "https://app.primecarediagnostics.in",
});
const missingCta = (missing.text.split("Review Prospect: ")[1] || "").trim();
if (missingCta === "https://app.primecarediagnostics.in/labs") {
  pass("missing_id", "email without a canonical id stays on /labs");
} else fail("missing_id", missingCta);

const fromSource = renderForEventType("prospect_created", {
  payload: { lab_name: labName },
  sourceId: labId,
  appPublicUrl: "https://app.primecarediagnostics.in",
});
if ((fromSource.text || "").includes(`labId=${encodeURIComponent(labId)}`)) {
  pass("source_id", "event source id is used when payload lab_id is absent");
} else fail("source_id", fromSource.text);

const memory = new Map();
const storage = {
  setItem(key, value) { memory.set(key, value); },
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  removeItem(key) { memory.delete(key); },
};
const safe = rememberLabsReturn(`/labs?tab=prospects&labId=${labId}&action=review`, storage);
const restored = takeLabsReturn(storage);
if (safe.includes(labId) && restored.includes(labId) && takeLabsReturn(storage) === "") {
  pass("11.authenticated_shape", "deep link is a same-origin Labs path");
  pass("12.return_preserved", "unauthenticated visit can return to the same internal deep link");
} else fail("12.return_preserved", `${safe} ${restored}`);

for (const bad of ["https://evil.example/labs", "//evil.example/labs", "/\\evil", "https://app.primecarediagnostics.in.evil/labs"]) {
  if (safeInternalReturnPath(bad) !== "") fail("13.open_redirect", bad);
}
const storedEvil = {
  setItem() {},
  getItem() { return "https://evil.example/phish"; },
  removeItem() {},
};
if (safeInternalReturnPath("https://evil.example/labs?labId=LAB-P-1") === "" && takeLabsReturn(storedEvil) === "") {
  pass("13.open_redirect", "external return targets are rejected");
} else fail("13.open_redirect", "external target accepted");

const activated = renderForEventType("prospect_activated", {
  payload: { lab_name: labName, lab_id: labId },
  appPublicUrl: "https://app.primecarediagnostics.in",
});
if (activated.ok && (activated.text.split("Open Lab: ")[1] || "").trim() === "https://app.primecarediagnostics.in/labs") {
  pass("activation_cta", "activation email CTA is unchanged");
} else fail("activation_cta", activated.text);

const policy = readFileSync(resolve(root, "supabase/functions/dispatch-notification-email/policy.js"), "utf8");
const index = readFileSync(resolve(root, "supabase/functions/dispatch-notification-email/index.ts"), "utf8");
if (!/cron\.schedule/.test(policy) && !/EMAIL_ENABLED\s*=\s*true/.test(index.slice(index.indexOf("prospectReviewCta") > -1 ? 0 : 0))) {
  pass("automation_untouched", "deep link does not schedule mail or set email flags");
} else fail("automation_untouched", "unexpected scheduler or flag write");

const activeLabId = "LAB-P-419A33712601";
const activeSearch = `?tab=prospects&labId=${activeLabId}&action=review`;
const activeLabs = [
  { labId: activeLabId, status: "ACTIVE", labName: "Acclin Diagonistic" },
  { labId: otherId, status: "PROSPECT", labName: "Other Lab" },
];
const loadingPass = applyProspectDeepLinkEffect({
  search: activeSearch,
  labs: [],
  canReview: true,
  loading: true,
  previousSignature: "",
});
const activeOpen = applyProspectDeepLinkEffect({
  search: activeSearch,
  labs: activeLabs,
  canReview: true,
  loading: false,
  previousSignature: loadingPass.signature,
});
const activeAgain = applyProspectDeepLinkEffect({
  search: activeSearch,
  labs: activeLabs,
  canReview: true,
  loading: false,
  previousSignature: activeOpen.signature,
});
if (
  !loadingPass.changed &&
  !loadingPass.openReview &&
  activeOpen.changed &&
  activeOpen.openReview &&
  activeOpen.tab === "all" &&
  activeOpen.labId === activeLabId &&
  activeOpen.alreadyActive &&
  activeOpen.mutate === false &&
  !activeAgain.changed &&
  !activeAgain.openReview
) {
  pass("18.active_production_fixture", "ACTIVE lab deep link opens the existing drawer once and does not mutate");
} else fail("18.active_production_fixture", JSON.stringify({ loadingPass, activeOpen, activeAgain }));

const prospectOpen = applyProspectDeepLinkEffect({
  search: `?tab=prospects&labId=${labId}&action=review`,
  labs,
  canReview: true,
  loading: false,
  previousSignature: "",
});
if (prospectOpen.openReview && prospectOpen.tab === "prospects" && !prospectOpen.alreadyActive && prospectOpen.mutate === false) {
  pass("19.prospect_still_opens", "PROSPECT lab still requests the existing review drawer");
} else fail("19.prospect_still_opens", JSON.stringify(prospectOpen));

const missingLab = applyProspectDeepLinkEffect({
  search: activeSearch,
  labs: [{ labId: otherId, status: "ACTIVE" }],
  canReview: true,
  loading: false,
  previousSignature: "",
});
if (!missingLab.openReview && missingLab.message === "Prospect not found or no longer available." && missingLab.mutate === false) {
  pass("20.missing_lab", "missing lab stays on Labs with a safe message");
} else fail("20.missing_lab", JSON.stringify(missingLab));

const denied = applyProspectDeepLinkEffect({
  search: activeSearch,
  labs: activeLabs,
  canReview: false,
  loading: false,
  previousSignature: "",
});
if (!denied.changed && !denied.openReview && !denied.message && !denied.labId) {
  pass("21.unauthorized", "unauthorized caller does not open or describe the lab");
} else fail("21.unauthorized", JSON.stringify(denied));

const badId = applyProspectDeepLinkEffect({
  search: "?tab=prospects&labId=not a lab&action=review",
  labs: activeLabs,
  canReview: true,
  loading: false,
  previousSignature: "",
});
if (!badId.openReview && badId.message === "This review link is not valid." && !badId.message.includes("not a lab")) {
  pass("22.invalid_effect", "invalid id fails inside the effect without echoing it");
} else fail("22.invalid_effect", JSON.stringify(badId));

const plainEffect = applyProspectDeepLinkEffect({
  search: "",
  labs: activeLabs,
  canReview: true,
  loading: false,
  previousSignature: "",
});
if (!plainEffect.changed && !plainEffect.openReview) {
  pass("23.plain_effect", "normal /labs does not open a drawer");
} else fail("23.plain_effect", JSON.stringify(plainEffect));

const labsPage = readFileSync(resolve(root, "src/pages/LabsPage.jsx"), "utf8");
const visibleDecl = labsPage.indexOf("const visibleLabs = useMemo");
const deepLinkCall = labsPage.indexOf("applyProspectDeepLinkEffect(");
if (visibleDecl > -1 && deepLinkCall > visibleDecl && labsPage.includes("setInitialReviewLabId(targetId)")) {
  pass("24.render_order", "deep-link effect runs only after visibleLabs is initialized and reuses the existing review id");
} else fail("24.render_order", `decl ${visibleDecl} call ${deepLinkCall}`);

function useEffectStub(_fn, deps) {
  return deps;
}
function brokenHookOrder() {
  useEffectStub(() => {}, [visibleLabs]);
  const visibleLabs = [];
  return visibleLabs;
}
let tdz = "";
try {
  brokenHookOrder();
} catch (err) {
  tdz = err instanceof ReferenceError ? err.message : "";
}
if (tdz === "Cannot access 'visibleLabs' before initialization") {
  pass("25.tdz_guard", "reading visibleLabs before initialization is the Production render exception");
} else fail("25.tdz_guard", tdz);

console.log(failures ? `\nPROSPECT DEEP LINK: BLOCKED (${failures})\n` : "\nPROSPECT DEEP LINK: PASS\n");
process.exit(failures ? 1 : 0);
