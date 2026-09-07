#!/usr/bin/env node
/**
 * HQ freeze policy — structural vs daily ops regression checks (static wiring).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHqOrderFulfillWriteBlocked } from "../src/config/hqOrderFulfillFreezePolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const policy = readFileSync(resolve(root, "src/config/hqReleasePolicy.js"), "utf8");
const fulfillPolicy = readFileSync(
  resolve(root, "src/config/hqOrderFulfillFreezePolicy.js"),
  "utf8"
);
const orders = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const ops = readFileSync(resolve(root, "src/components/operations/UserProvisioningPanel.jsx"), "utf8");
const catalog = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const creditRisk = readFileSync(
  resolve(root, "src/components/hq/HqCreditRiskCommandCenter.jsx"),
  "utf8"
);
const api = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");

assert(/isHqOrderStatusWriteBlocked/.test(policy), "order status write policy");
assert(
  /export function isHqOrderStatusWriteBlocked\(\) \{\s*return isHqAdminFrozen\(\);/.test(policy),
  "generic order status writes remain globally freeze-blocked"
);
assert(/if \(IS_PROD\) return envFlag\("VITE_HQ_ADMIN_FROZEN", true\)/.test(policy), "global HQ freeze remains ON by default in Production");
assert(/isHqStructuralWriteBlocked/.test(policy), "structural write policy");
assert(/isHqCatalogWriteBlocked/.test(policy), "catalog write policy");
assert(/isHqProcurementWriteBlocked/.test(policy), "procurement write policy");
assert(/isHqProspectActivationWriteBlocked/.test(policy), "prospect activation write policy");
assert(
  /export function isHqProspectActivationWriteBlocked\(\) \{\s*return false;/.test(policy),
  "prospect activation is a narrow allow, not a global unfreeze"
);
assert(/HQ configuration is frozen/.test(policy), "default freeze banner copy");
assert(/UI\/UX guards only; no business logic, SQL, RLS, or API changes/.test(policy), "freeze remains UI/UX-only");
assert(/VITE_FLOW3A_CERT_FULFILL_ORDER_ID/.test(policy), "single-order cert fulfill env is named");
assert(/isHqOrderFulfillWriteBlocked/.test(policy), "narrow fulfill helper exists");
assert(
  /export function isHqOrderFulfillWriteBlocked\(orderId, currentStatus\)/.test(policy),
  "fulfill helper is order-id scoped"
);

assert(!/isHqAdminFrozen|VITE_HQ_ADMIN_FROZEN|supabase|rpc\(/i.test(fulfillPolicy), "pure fulfill resolver has no SQL/RPC/global freeze toggle");

assert(/isHqOrderStatusWriteBlocked/.test(orders), "Orders uses status write policy");
assert(/isHqOrderFulfillWriteBlocked/.test(orders), "Orders uses single-order fulfill helper");
assert(!/disabled=\{updatingStatus \|\| hqFrozen\}/.test(orders), "Review not disabled by freeze");
assert(!/disabled=\{hqFrozen\}[\s\S]{0,240}handleRecordOrderPayment/.test(orders), "Record Payment not disabled by freeze");
assert(!/function handleRecordOrderPayment\(\) \{[\s\S]{0,80}if \(hqFrozen\) return;/.test(orders), "Record Payment handler not blocked by freeze");
assert(/Fully Paid/.test(orders), "Fully Paid state preserved");

const ordersStatusActions = orders.slice(orders.indexOf("Status Actions"));
assert(/Mark Processing/.test(ordersStatusActions) && /hqStatusWriteBlocked/.test(ordersStatusActions), "Status writes blocked when frozen");
assert(/Mark Fulfilled/.test(ordersStatusActions) && /hqFulfillWriteBlocked/.test(ordersStatusActions), "Mark Fulfilled uses the single-order fulfill gate");
assert(
  /Reset to Placed[\s\S]{0,800}hqStatusWriteBlocked/.test(ordersStatusActions) ||
    /hqStatusWriteBlocked[\s\S]{0,800}Reset to Placed/.test(ordersStatusActions),
  "Reset remains blocked by generic freeze"
);
assert(
  /Cancel Order[\s\S]{0,800}hqStatusWriteBlocked/.test(ordersStatusActions) ||
    /hqStatusWriteBlocked[\s\S]{0,800}Cancel Order/.test(ordersStatusActions),
  "Cancel remains blocked by generic freeze"
);
assert(
  /if \(str\(nextStatus\) === "Fulfilled"\) \{[\s\S]{0,240}isHqOrderFulfillWriteBlocked\(selectedOrder/.test(orders),
  "handleUpdateStatus independently enforces the exact-order fulfill condition"
);
assert(
  /else if \(hqStatusWriteBlocked\)/.test(orders),
  "non-fulfill status writes still use the generic freeze gate"
);

const certId = "ORD-FLOW3A-CERT-ONLY";
const otherId = "ORD-SOME-OTHER-ORDER";
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: "",
    orderId: certId,
    currentStatus: "Placed",
  }) === true,
  "unset cert env leaves Production fulfill frozen"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: certId,
    orderId: otherId,
    currentStatus: "Placed",
  }) === true,
  "arbitrary Production order cannot Mark Fulfilled"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: certId,
    orderId: certId,
    currentStatus: "Placed",
  }) === false,
  "configured certification order can Mark Fulfilled from Placed"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: certId,
    orderId: certId,
    currentStatus: "Processing",
  }) === false,
  "configured certification order can Mark Fulfilled from Processing"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: certId,
    orderId: otherId,
    currentStatus: "Placed",
  }) === true,
  "another order cannot Mark Fulfilled while the cert env is set"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: true,
    certFulfillOrderId: certId,
    orderId: certId,
    currentStatus: "Fulfilled",
  }) === true,
  "re-fulfillment remains blocked after the cert order is Fulfilled"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: true,
    isProd: false,
    certFulfillOrderId: certId,
    orderId: certId,
    currentStatus: "Placed",
  }) === true,
  "non-Production freeze does not open the cert fulfill exception"
);
assert(
  resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: false,
    isProd: true,
    certFulfillOrderId: "",
    orderId: otherId,
    currentStatus: "Placed",
  }) === false,
  "freeze OFF preserves existing fulfill behavior"
);

assert(/isHqStructuralWriteBlocked/.test(ops), "Operations uses structural write policy");
assert(/disabled=\{hqFrozen\}/.test(ops) && /Create User/.test(ops), "Create User blocked when frozen");
assert(/resolveDirectoryRowActions/.test(ops), "directory row actions wired");

assert(/isHqCatalogWriteBlocked/.test(catalog), "Master catalog uses catalog write policy");
assert(/disabled=\{catalogWriteBlocked\}/.test(catalog), "Catalog writes disabled when frozen");

assert(/Record Payment/.test(creditRisk), "Credit & Risk Record Payment available");
assert(!/hqFrozen/.test(creditRisk), "Credit & Risk not tied to HQ freeze");
assert(/Record Payment/.test(orders), "Orders Record Payment remains allowed");

const drawer = readFileSync(
  resolve(root, "src/components/operations/OperationalLabDrawer.jsx"),
  "utf8"
);
assert(/isHqProspectActivationWriteBlocked/.test(drawer), "Activate Lab uses prospect freeze helper");
assert(
  !/isHqAdminFrozen\(/.test(drawer) && !/isHqStructuralWriteBlocked\(/.test(drawer),
  "Activate Lab is not gated by global HQ freeze"
);
assert(!/isHqOrderFulfillWriteBlocked/.test(drawer), "Activate Lab behavior is unchanged by the fulfill exception");

const updateSlice = api.slice(api.indexOf("export async function updateOrderStatusWrite"));
assert(updateSlice.length > 80, "updateOrderStatusWrite present");
assert(
  !/isHqOrderFulfillWriteBlocked|isHqAdminFrozen|VITE_FLOW3A_CERT_FULFILL_ORDER_ID/.test(updateSlice.slice(0, 4000)),
  "fulfillment API is not freeze-gated; exception is UI-only"
);

const sqlRoots = [resolve(root, "supabase/migrations"), resolve(root, "supabase/sql")];
for (const dir of sqlRoots) {
  const names = readdirSync(dir);
  assert(
    !names.some((name) => /cert_fulfill|flow3a_cert_fulfill|fulfill_exception/i.test(name)),
    `no SQL/RPC security change in ${dir}`
  );
}

console.log("PASS — HQ freeze policy wiring");
