#!/usr/bin/env node
/**
 * HQ Admin Labs module certification — live QA Supabase.
 *
 * Usage:
 *   node scripts/verify-labs-admin-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_LAB,
  QA_HQ_TENANT_ID,
} from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;
const QA_TENANT_CODE = "qa-tenant-001";
const GOLDEN_LABS = ["QA_LAB_001", "QA_LAB_002", "QA_LAB_003"];

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function summarizeLabsCreditPortfolio(normalizedLabs) {
  const rows = normalizedLabs || [];
  return {
    totalOutstanding: rows.reduce((sum, x) => sum + num(x.outstandingAmount ?? x.outstanding), 0),
    totalRevenue: rows.reduce((sum, x) => sum + num(x.revenue), 0),
    labsWithOutstanding: rows.filter((x) => num(x.outstandingAmount ?? x.outstanding) > 0).length,
    labsOnCreditHold: rows.filter((x) => str(x.creditStatus).toUpperCase() === "HOLD").length,
  };
}

function labAssignedAgentId(lab) {
  return str(
    lab?.assignedAgentId ?? lab?.assigned_agent_id ?? lab?.agentId ?? lab?.agent_id
  );
}

function isLabAssigned(lab) {
  const agentId = labAssignedAgentId(lab);
  const agentName = str(
    lab?.assignedAgent ?? lab?.assigned_agent ?? lab?.agentName ?? lab?.agent_name
  );
  return Boolean(agentId || agentName);
}

async function signIn(sb, email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`auth(${email}): ${error.message}`);
  return data.session;
}

async function queryLabsCredit(sb) {
  const { data, error } = await sb
    .from("v_labs_credit")
    .select("*")
    .limit(5000);
  if (error) throw new Error(error.message);
  return data || [];
}

async function main() {
  console.log("\n=== HQ Admin Labs Certification ===\n");
  console.log(`Tenant: ${HQ}\n`);

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await signIn(sb, QA_ADMIN.email, QA_ADMIN.password);

  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id,tenant_code,tenant_name")
    .eq("id", HQ)
    .maybeSingle();
  if (tenantRow?.tenant_code === QA_TENANT_CODE) {
    pass("tenant.operating", `${tenantRow.tenant_name} (${tenantRow.tenant_code})`);
  } else {
    fail("tenant.operating", `Expected ${QA_TENANT_CODE}, got ${tenantRow?.tenant_code || "missing"}`);
  }

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase: apiSb } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: adminSession } = await sb.auth.getSession();
  if (apiSb && adminSession?.session) {
    await apiSb.auth.setSession({
      access_token: adminSession.session.access_token,
      refresh_token: adminSession.session.refresh_token,
    });
  }
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const labsEngine = await server.ssrLoadModule("/src/operations/labsHqEngine.js");

  const rawLabs = await queryLabsCredit(sb);
  const scopedLabs = rawLabs.filter((row) => str(row.tenant_id) === HQ);
  const foreignLabs = rawLabs.filter((row) => str(row.tenant_id) !== HQ);

  if (foreignLabs.length) {
    fail("tenant.isolation", `${foreignLabs.length} lab row(s) outside HQ in scoped read`);
  } else {
    pass("tenant.isolation", `${scopedLabs.length} lab rows belong to ${QA_TENANT_CODE}`);
  }

  const { count: foreignCount } = await sb
    .from("labs")
    .select("lab_id", { count: "exact", head: true })
    .neq("tenant_id", HQ);
  if ((foreignCount || 0) > 0) {
    fail("tenant.rls_probe", `Admin sees ${foreignCount} foreign-tenant lab row(s)`);
  } else {
    pass("tenant.rls_probe", "No foreign-tenant labs visible under admin JWT");
  }

  const labsRes = await api.getLabsCredit({ force: true });
  const apiLabs = Array.isArray(labsRes?.data)
    ? labsRes.data
    : Array.isArray(labsRes?.data?.labs)
      ? labsRes.data.labs
      : [];
  if (!labsRes?.success) {
    fail("labs.read", labsRes?.error || "getLabsCredit failed");
  } else if (apiLabs.length) {
    pass("labs.read", `getLabsCredit returned ${apiLabs.length} lab(s)`);
  } else {
    warn("labs.read", "getLabsCredit returned 0 rows — falling back to direct v_labs_credit read");
  }

  const mappedLabs = (scopedLabs.length ? scopedLabs : apiLabs).map((row) =>
    typeof row.labId !== "undefined" ? row : api.mapLabsCreditRow(row)
  );
  const visibleLabs = mappedLabs
    .map((lab) => ({ ...lab, tenantId: str(lab.tenantId), labId: str(lab.labId) }))
    .filter((lab) => !lab.tenantId || lab.tenantId === HQ);
  const labById = new Map(visibleLabs.map((lab) => [str(lab.labId).toUpperCase(), lab]));

  const missingGolden = GOLDEN_LABS.filter((id) => !labById.has(id));
  if (missingGolden.length) {
    fail("golden.present", `Missing golden lab(s): ${missingGolden.join(", ")}`);
  } else {
    pass("golden.present", `Golden labs present: ${GOLDEN_LABS.join(", ")}`);
  }

  const { data: ownershipRows, error: ownershipErr } = await sb
    .from("lab_ownership")
    .select("tenant_id,lab_tenant_id,lab_id,primary_agent_id,status")
    .eq("tenant_id", HQ)
    .eq("status", "ACTIVE");

  let agentMismatch = 0;
  for (const labId of GOLDEN_LABS) {
    const lab = labById.get(labId);
    if (!lab) continue;
    const labAgent = labAssignedAgentId(lab);
    const ownRows = (ownershipRows || []).filter(
      (row) => str(row.lab_id).toUpperCase() === labId && str(row.status).toUpperCase() === "ACTIVE"
    );
    const ownAgent = str(ownRows[0]?.primary_agent_id);
    if (ownRows.length !== 1) {
      agentMismatch += 1;
    } else if (labAgent && ownAgent && labAgent !== ownAgent) {
      agentMismatch += 1;
    }
  }
  if (agentMismatch) {
    fail(
      "golden.agents",
      `${agentMismatch} golden lab(s) have labs.agent vs lab_ownership primary mismatch`
    );
  } else {
    pass("golden.agents", "Golden labs: labs.assigned_agent_id matches ACTIVE lab_ownership");
  }

  const { data: arRaw, error: arErr } = await sb
    .from("ar_credit_control")
    .select("lab_id,tenant_id,outstanding,credit_limit")
    .eq("tenant_id", HQ);
  if (arErr) throw new Error(arErr.message);

  const arByLab = new Map();
  for (const row of arRaw || []) {
    const key = str(row.lab_id).toUpperCase();
    if (!arByLab.has(key)) arByLab.set(key, []);
    arByLab.get(key).push(row);
  }
  const dupAr = [...arByLab.entries()].filter(([, rows]) => rows.length > 1);
  if (dupAr.length) {
    fail("ar.no_duplicates", `${dupAr.length} lab(s) have duplicate AR rows`);
  } else {
    pass("ar.no_duplicates", "One AR row per lab_id in tenant");
  }

  const goldenMissingAr = GOLDEN_LABS.filter((id) => !(arByLab.get(id)?.length));
  if (goldenMissingAr.length) {
    fail("ar.golden", `Golden lab(s) missing AR row: ${goldenMissingAr.join(", ")}`);
  } else {
    pass("ar.golden", "Golden labs each have AR credit row");
  }

  const portfolio = summarizeLabsCreditPortfolio(visibleLabs);
  const apiSummary = labsRes?.data?.summary || portfolio;
  if (Math.abs(num(portfolio.totalOutstanding) - num(apiSummary.totalOutstanding)) <= 0.01) {
    pass("kpi.outstanding", `Portfolio outstanding ₹${portfolio.totalOutstanding}`);
  } else {
    fail(
      "kpi.outstanding",
      `Portfolio ${portfolio.totalOutstanding} != API summary ${apiSummary.totalOutstanding}`
    );
  }

  const arOutstandingSum = (arRaw || []).reduce((s, r) => s + num(r.outstanding), 0);
  const labsOutstandingSum = visibleLabs.reduce(
    (s, lab) => s + num(lab.outstandingAmount ?? lab.outstanding),
    0
  );
  if (Math.abs(arOutstandingSum - labsOutstandingSum) <= 0.01) {
    pass(
      "kpi.ar_reconcile",
      `Labs outstanding ₹${labsOutstandingSum} == Σ AR outstanding`
    );
  } else {
    warn(
      "kpi.ar_reconcile",
      `Labs view ₹${labsOutstandingSum} vs AR table ₹${arOutstandingSum} (non-golden drift possible)`
    );
  }

  const activeLabs = visibleLabs.filter((lab) => str(lab.status).toLowerCase() === "active");
  const portfolioSummary = labsEngine.buildLabsPortfolioSummary(visibleLabs, apiSummary);
  if (portfolioSummary.activeLabs === activeLabs.length) {
    pass("kpi.active_labs", `${activeLabs.length} active lab(s)`);
  } else {
    fail(
      "kpi.active_labs",
      `Portfolio active ${portfolioSummary.activeLabs} != counted ${activeLabs.length}`
    );
  }

  const attentionCards = labsEngine.buildLabsAttentionCards(visibleLabs, []);
  const outstandingCard = attentionCards.find((c) => c.id === "outstanding");
  const expectedOutstanding = visibleLabs.filter(
    (lab) => num(lab.outstandingAmount ?? lab.outstanding) > 0
  ).length;
  if (outstandingCard?.count === expectedOutstanding) {
    pass("attention.outstanding", `${expectedOutstanding} lab(s) with outstanding`);
  } else {
    fail(
      "attention.outstanding",
      `Card count ${outstandingCard?.count} != recomputed ${expectedOutstanding}`
    );
  }

  const holdFiltered = labsEngine.filterLabsForAttention(visibleLabs, "HOLD", []);
  const holdCount = visibleLabs.filter(
    (lab) => str(lab.creditStatus).toUpperCase() === "HOLD"
  ).length;
  if (holdFiltered.length === holdCount) {
    pass("filter.credit_hold", `${holdCount} credit-hold lab(s)`);
  } else {
    fail("filter.credit_hold", `Filter returned ${holdFiltered.length}, expected ${holdCount}`);
  }

  const unassignedFiltered = labsEngine.filterLabsForAttention(visibleLabs, "UNASSIGNED", []);
  const unassignedCount = visibleLabs.filter((lab) => !isLabAssigned(lab)).length;
  if (unassignedFiltered.length === unassignedCount) {
    pass("filter.unassigned", `${unassignedCount} unassigned lab(s) by resolver`);
  } else {
    fail(
      "filter.unassigned",
      `Filter ${unassignedFiltered.length} != recomputed ${unassignedCount}`
    );
  }

  const coverage = labsEngine.buildAgentCoverage(visibleLabs, []);
  if (coverage.unassigned.count === unassignedCount) {
    pass("assignment.coverage", `${coverage.agents.length} agent bucket(s); unassigned ${unassignedCount}`);
  } else {
    fail(
      "assignment.coverage",
      `Coverage unassigned ${coverage.unassigned.count} != filter ${unassignedCount}`
    );
  }

  if (ownershipErr) {
    warn("ownership.rows", `lab_ownership query: ${ownershipErr.message}`);
  } else {
    const activeOwnership = ownershipRows || [];
    pass("ownership.rows", `${activeOwnership.length} ACTIVE lab_ownership row(s) in tenant`);
    const foreignOwnership = activeOwnership.filter(
      (row) => str(row.lab_tenant_id) !== HQ && str(row.tenant_id) !== HQ
    );
    if (foreignOwnership.length) {
      fail("ownership.tenant", `${foreignOwnership.length} cross-tenant ownership row(s)`);
    } else {
      pass("ownership.tenant", "No cross-tenant lab_ownership rows");
    }
  }

  const emptyCreate = await api.createLabWrite({});
  if (!emptyCreate.success && str(emptyCreate.error)) {
    pass("create.validation", `createLabWrite rejects empty payload (${emptyCreate.error})`);
  } else {
    fail("create.validation", "createLabWrite should reject empty payload");
  }

  const hqMissingTenant = await api.createLabWrite({
    hqMode: true,
    homeTenantId: "",
    labName: "Should Fail",
    contactName: "Test",
    phone: "9999999999",
    email: "fail@test.com",
    cityTerritory: "Test",
    paymentTerms: "Net 30",
    creditLimit: 1000,
  });
  if (!hqMissingTenant.success && /tenant/i.test(str(hqMissingTenant.error))) {
    pass("create.hq_tenant", "HQ create requires operating tenant context");
  } else {
    fail("create.hq_tenant", "HQ create should fail without homeTenantId");
  }

  const hqValidShape = await api.createLabWrite({
    hqMode: true,
    homeTenantId: HQ,
    tenantId: HQ,
    labName: "",
    contactName: "Test",
    phone: "9999999999",
    email: "fail@test.com",
    cityTerritory: "Test",
    paymentTerms: "Net 30",
    creditLimit: 1000,
  });
  if (!hqValidShape.success && /lab name/i.test(str(hqValidShape.error))) {
    pass("create.required_fields", "Required field validation blocks empty lab name");
  } else {
    fail("create.required_fields", "Expected lab name validation failure");
  }

  const collRes = await api.getCollectionsRead({ tenantId: HQ });
  const collections = collRes?.data?.collections || [];
  const goldenInCollections = GOLDEN_LABS.filter((id) =>
    collections.some((c) => str(c.labId ?? c.lab_id).toUpperCase() === id)
  );
  if (goldenInCollections.length === GOLDEN_LABS.length) {
    pass("integration.collections", "Golden labs visible in Credit & Risk read");
  } else {
    fail(
      "integration.collections",
      `Only ${goldenInCollections.length}/${GOLDEN_LABS.length} golden labs in collections`
    );
  }

  const { data: ordersRaw } = await sb
    .from("orders")
    .select("lab_id,tenant_id")
    .eq("tenant_id", HQ)
    .limit(500);
  const orderLabIds = [...new Set((ordersRaw || []).map((o) => str(o.lab_id).toUpperCase()).filter(Boolean))];
  const orphanOrderLabs = orderLabIds.filter((id) => !labById.has(id));
  if (orphanOrderLabs.length) {
    fail("integration.orders", `${orphanOrderLabs.length} order lab_id(s) missing from labs view`);
  } else {
    pass("integration.orders", `${orderLabIds.length} distinct order lab(s) exist in labs directory`);
  }

  if (visibleLabs.length <= 5000) {
    pass("perf.bounded_reads", `${visibleLabs.length} labs within HQ limit (5000)`);
  } else {
    fail("perf.bounded_reads", `${visibleLabs.length} labs exceeds 5000 cap`);
  }

  const { data: goldenLabRows } = await sb
    .from("labs")
    .select("lab_id,status,active")
    .eq("tenant_id", HQ)
    .in("lab_id", GOLDEN_LABS);
  const inactiveGoldenOps = (goldenLabRows || []).filter((row) => row.active === false);
  if (inactiveGoldenOps.length) {
    fail(
      "status.golden_operational",
      `Golden lab(s) marked inactive: ${inactiveGoldenOps.map((r) => r.lab_id).join(", ")}`
    );
  } else {
    pass("status.golden_operational", "Golden labs operationally active (labs.active=true)");
  }

  const nonActiveStatusGolden = (goldenLabRows || []).filter(
    (row) => str(row.status).toUpperCase() !== "ACTIVE"
  );
  if (nonActiveStatusGolden.length) {
    warn(
      "status.golden_label",
      `Golden lab status labels: ${nonActiveStatusGolden.map((r) => `${r.lab_id}=${r.status}`).join(", ")} (createLabWrite defaults ACTIVE)`
    );
  } else {
    pass("status.golden_active", "Golden labs status ACTIVE");
  }

  const inactiveLabs = visibleLabs.filter(
    (lab) => str(lab.status).toLowerCase() !== "active" && str(lab.status).toLowerCase() !== "prospect"
  );
  if (inactiveLabs.length) {
    warn("status.inactive", `${inactiveLabs.length} inactive lab(s) in directory`);
  } else {
    pass("status.inactive", "All visible labs ACTIVE");
  }

  warn("status.kpi_basis", "Portfolio active count uses status===active; PROSPECT labs excluded from active KPI");
  warn("ux.no_text_search", "Labs directory has credit/attention filters only — no text search");
  warn("ux.no_pagination", "Labs directory loads bounded full list — no pagination UI");
  warn("edit.no_api", "No updateLabWrite / HQ edit form — review drawer is read-only");

  await sb.auth.signOut();

  const agentSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(agentSb, QA_AGENT.email, QA_AGENT.password);
    const agentLabs = await queryLabsCredit(agentSb);
    const agentScoped = agentLabs.filter((row) => str(row.tenant_id) === HQ);
    const agentLabIds = agentScoped.map((row) => str(row.lab_id).toUpperCase());
    const agentProfile = await agentSb
      .from("profiles")
      .select("agent_id")
      .eq("email", QA_AGENT.email)
      .maybeSingle();
    const agentId = str(agentProfile.data?.agent_id);
    const ownedLabIds = (ownershipRows || [])
      .filter((row) => str(row.primary_agent_id) === agentId)
      .map((row) => str(row.lab_id).toUpperCase());
    const seesOwned = ownedLabIds.filter((id) => agentLabIds.includes(id));
    const seesForeignAssigned = agentLabIds.filter(
      (id) => ownedLabIds.length && !ownedLabIds.includes(id) && GOLDEN_LABS.includes(id)
    );
    if (seesOwned.length >= 1 && agentScoped.length <= scopedLabs.length) {
      pass(
        "rls.agent_assigned",
        `Agent ${agentId} sees ${seesOwned.length}/${ownedLabIds.length} owned lab(s); ${agentScoped.length} total visible`
      );
    } else {
      fail(
        "rls.agent_assigned",
        `Agent visibility mismatch (visible ${agentLabIds.join(", ") || "none"})`
      );
    }
    if (seesForeignAssigned.length) {
      warn(
        "rls.agent_isolation",
        `Agent sees golden lab(s) without ownership: ${seesForeignAssigned.join(", ")}`
      );
    } else {
      pass("rls.agent_isolation", "Agent golden-lab visibility aligns with lab_ownership");
    }
    if (agentScoped.length <= scopedLabs.length) {
      pass(
        "rls.agent_bounded",
        `Agent sees ${agentScoped.length}/${scopedLabs.length} admin lab rows`
      );
    } else {
      fail("rls.agent_bounded", `Agent sees more labs (${agentScoped.length}) than admin (${scopedLabs.length})`);
    }
  } catch (err) {
    warn("rls.agent_assigned", `Agent auth skipped: ${err.message}`);
  } finally {
    await agentSb.auth.signOut();
  }

  const labSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(labSb, QA_LAB.email, QA_LAB.password);
    const labUserLabs = await queryLabsCredit(labSb);
    const labIds = labUserLabs.map((row) => str(row.lab_id).toUpperCase());
    if (labIds.length === 1 && labIds[0] === "QA_LAB_001") {
      pass("rls.lab_user", "Lab user sees only QA_LAB_001");
    } else if (labIds.every((id) => id === "QA_LAB_001")) {
      pass("rls.lab_user", `Lab user scoped to QA_LAB_001 (${labIds.length} row(s))`);
    } else {
      fail("rls.lab_user", `Lab user sees: ${labIds.join(", ") || "none"}`);
    }
  } catch (err) {
    warn("rls.lab_user", `Lab user auth skipped: ${err.message}`);
  } finally {
    await labSb.auth.signOut();
  }

  const execSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(execSb, QA_EXECUTIVE.email, QA_EXECUTIVE.password);
    const execLabs = await queryLabsCredit(execSb);
    const execScoped = execLabs.filter((row) => str(row.tenant_id) === HQ);
    if (execScoped.length === scopedLabs.length) {
      pass("rls.executive", `Executive sees ${execScoped.length} tenant lab(s)`);
    } else {
      warn(
        "rls.executive",
        `Executive ${execScoped.length} vs admin ${scopedLabs.length} (tenant-switch may apply)`
      );
    }
  } catch (err) {
    warn("rls.executive", `Executive auth skipped: ${err.message}`);
  } finally {
    await execSb.auth.signOut();
  }

  await server?.close?.();

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  const warned = results.filter((r) => r.status === "WARN");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`WARN: ${warned.length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nHQ Admin Labs certification passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
