/**
 * AE-1A live QA isolation. Refuses Production.
 * No table writes. Agent B fixture may use the existing password-reset helper.
 */
import { createClient } from "@supabase/supabase-js";
import { register } from "node:module";
import { QA_ADMIN, QA_AGENT, QA_HQ_TENANT_ID } from "../qaCredentials.mjs";
import { signInWithQaCredentials } from "../qaSignIn.mjs";
import { loadEnvLocal, assertQaOnly, createReporter } from "./agentVisitEvidenceLiveQa.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./primecareReleaseManifest.mjs";

register("./srcAliasLoader.mjs", import.meta.url);

const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;

function anonClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function repairFixtureAgent(env, adminSb, email) {
  const token = (await adminSb.auth.getSession()).data?.session?.access_token;
  if (!token) return "";
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/reset-platform-user-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ tenantId: QA_HQ_TENANT_ID, email }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.data?.temporaryPassword || "";
}

async function signIn(env, cred, options = {}) {
  const sb = anonClient(env);
  const result = await signInWithQaCredentials(sb, cred, options);
  if (!result.ok) return { sb: null, error: result.error, userId: null };
  const { data } = await sb.auth.getUser();
  return { sb, error: null, userId: data?.user?.id || null, email: result.email };
}

async function profileFor(sb, userId) {
  const { data, error } = await sb
    .from("profiles")
    .select("user_id, tenant_id, role, agent_id, agent_name, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return { row: data || null, error };
}

function actorFromProfile(row, roleFallback) {
  return {
    role: String(row?.role || roleFallback || "").toLowerCase(),
    tenantId: row?.tenant_id || QA_HQ_TENANT_ID,
    agentId: row?.agent_id || "",
  };
}

async function fetchVisits(sb, { tenantId, agentId } = {}) {
  let q = sb.from("agent_visits").select("id,lab_id,agent_id,visit_date,commercial_outcome,next_follow_up_date,notes,next_action");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q.limit(200);
  return { rows: data || [], error };
}

async function fetchLabs(sb, { tenantId } = {}) {
  let q = sb.from("v_labs_credit").select("lab_id,lab_name,assigned_agent_id,sourced_by_agent_id,status,tenant_id");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(500);
  return { rows: data || [], error };
}

async function fetchOrders(sb, labIds, tenantId) {
  if (!labIds.length) return { rows: [], error: null };
  let q = sb.from("orders").select("order_id,lab_id,order_date,total_amount").in("lab_id", labIds.slice(0, 80));
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(200);
  return { rows: data || [], error };
}

async function fetchPayments(sb, labIds, tenantId) {
  if (!labIds.length) return { rows: [], error: null };
  let q = sb.from("payments").select("payment_id,lab_id,payment_date,amount_received").in("lab_id", labIds.slice(0, 80));
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(200);
  return { rows: data || [], error };
}

function mapLabs(rows) {
  return (rows || []).map((row) => ({
    labId: row.lab_id,
    labName: row.lab_name,
    status: row.status,
    assignedAgentId: row.assigned_agent_id,
    sourcedByAgentId: row.sourced_by_agent_id,
  }));
}

function mapVisits(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    labId: row.lab_id,
    agentId: row.agent_id,
    visitDate: String(row.visit_date || "").slice(0, 10),
    commercialOutcome: row.commercial_outcome,
    nextFollowUpDate: String(row.next_follow_up_date || "").slice(0, 10),
    notes: row.notes,
    nextAction: row.next_action,
  }));
}

export async function runLiveAe1aIsolation() {
  const reporter = createReporter();
  const { pass, fail, skip, assert } = reporter;
  console.log("\n=== AE-1A live isolation (QA only, read-only) ===\n");

  const env = loadEnvLocal();
  const ident = assertQaOnly(env);
  pass("live.env.qa", `QA ref ${ident.ref || QA_REF}`);

  const { resolveMyBusinessSubjectAgent } = await import("../../src/myBusiness/myBusinessAuth.js");
  const { resolveMyBusinessRange } = await import("../../src/myBusiness/myBusinessCalendar.js");
  const { buildMyBusinessModel } = await import("../../src/myBusiness/myBusinessModel.js");

  const agentA = await signIn(env, QA_AGENT, { repairAgent: true, fallbackEmail: "qa.agent@primecare.test" });
  if (!agentA.sb) {
    fail("live.auth.agent_a", agentA.error || "Agent A sign-in failed");
    return { failures: reporter.failures, criticalSkips: reporter.criticalSkips };
  }
  pass("live.auth.agent_a", agentA.email || QA_AGENT.email);

  const profileA = await profileFor(agentA.sb, agentA.userId);
  if (!profileA.row?.agent_id) {
    fail("live.profile.agent_a", profileA.error?.message || "Agent A profile missing agent_id");
    return { failures: reporter.failures, criticalSkips: reporter.criticalSkips };
  }
  const agentAId = String(profileA.row.agent_id).trim();
  const tenantId = profileA.row.tenant_id || QA_HQ_TENANT_ID;
  pass("live.profile.agent_a", `agent_id=${agentAId}`);

  const forged = resolveMyBusinessSubjectAgent({
    actor: actorFromProfile(profileA.row, "agent"),
    requestedSubjectAgentId: "FORGED-OTHER-AGENT",
  });
  assert(
    forged.ok && String(forged.subjectAgentId).toUpperCase() === agentAId.toUpperCase() && forged.ignoredClientSubjectAgentId,
    "live.auth.forged_subject",
    "Agent session discards forged subjectAgentId"
  );

  const visitsA = await fetchVisits(agentA.sb, { tenantId });
  const labsA = await fetchLabs(agentA.sb, { tenantId });
  assert(!visitsA.error, "live.read.agent_a_visits", visitsA.error?.message || `${visitsA.rows.length} visits visible`);
  assert(!labsA.error, "live.read.agent_a_labs", labsA.error?.message || `${labsA.rows.length} labs visible`);

  const foreignVisits = (visitsA.rows || []).filter(
    (row) => String(row.agent_id || "").toUpperCase() !== agentAId.toUpperCase()
  );
  const labById = new Map((labsA.rows || []).map((row) => [String(row.lab_id), row]));
  const offBook = foreignVisits.filter((row) => {
    const lab = labById.get(String(row.lab_id));
    if (!lab) return true;
    const assigned = String(lab.assigned_agent_id || "").toUpperCase() === agentAId.toUpperCase();
    const sourced = String(lab.sourced_by_agent_id || "").toUpperCase() === agentAId.toUpperCase();
    return !assigned && !sourced;
  });
  assert(
    offBook.length === 0,
    "live.iso.agent_a_offbook_visits",
    offBook.length
      ? `Agent A session returned visits for labs not assigned/sourced to A`
      : "no off-book visits in Agent A session"
  );

  const range = resolveMyBusinessRange({ preset: "this_month" });
  const scopedLabIds = labsA.rows
    .filter((row) => {
      const assigned = String(row.assigned_agent_id || "").toUpperCase() === agentAId.toUpperCase();
      const sourced = String(row.sourced_by_agent_id || "").toUpperCase() === agentAId.toUpperCase();
      return assigned || sourced;
    })
    .map((row) => row.lab_id)
    .filter(Boolean);
  const ordersA = await fetchOrders(agentA.sb, scopedLabIds, tenantId);
  const paysA = await fetchPayments(agentA.sb, scopedLabIds, tenantId);
  const modelA = buildMyBusinessModel({
    range,
    subjectAgentId: agentAId,
    actor: actorFromProfile(profileA.row, "agent"),
    labs: mapLabs(labsA.rows),
    visits: mapVisits(visitsA.rows),
    orders: (ordersA.rows || []).map((row) => ({
      orderId: row.order_id,
      labId: row.lab_id,
      orderDate: row.order_date,
      total_amount: row.total_amount,
    })),
    payments: (paysA.rows || []).map((row) => ({
      paymentId: row.payment_id,
      labId: row.lab_id,
      paymentDate: row.payment_date,
      amount_received: row.amount_received,
    })),
  });
  pass(
    "live.model.agent_a",
    `kpis visits=${modelA.kpis.visitsLogged} quote=${modelA.kpis.quoteOpportunities} ₹ord=${modelA.kpis.rupeesOrdered} ₹col=${modelA.kpis.rupeesCollected}`
  );
  const foreignIds = new Set(foreignVisits.map((row) => `visit:${row.id}`));
  assert(
    !modelA.ledger.some((row) => foreignIds.has(row.id)),
    "live.iso.model_excludes_foreign_visits",
    "My Business subject filter excludes other agent_id visits even if lab-scoped RLS returns them"
  );
  if (foreignVisits.length) {
    pass(
      "live.iso.lab_scoped_history",
      `${foreignVisits.length} historical visit(s) on Agent A labs with another agent_id; not a My Business subject leak`
    );
  }

  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  if (!admin.sb) {
    fail("live.auth.admin", admin.error || "Admin sign-in failed");
    return { failures: reporter.failures, criticalSkips: reporter.criticalSkips };
  }
  pass("live.auth.admin", QA_ADMIN.email);

  const { data: directory } = await admin.sb
    .from("profiles")
    .select("user_id, tenant_id, role, agent_id, email")
    .eq("tenant_id", tenantId)
    .eq("role", "agent");

  const picker = resolveMyBusinessSubjectAgent({
    actor: { role: "admin", tenantId },
    requestedSubjectAgentId: agentAId,
    agentDirectory: directory || [],
  });
  assert(picker.ok && String(picker.subjectAgentId).toUpperCase() === agentAId.toUpperCase(), "live.admin.picker", "Admin can select QA Agent One");

  const cross = resolveMyBusinessSubjectAgent({
    actor: { role: "admin", tenantId },
    requestedSubjectAgentId: "NOT-AN-AGENT-IN-TENANT",
    agentDirectory: directory || [],
  });
  assert(cross.error === "agent_not_found", "live.admin.unknown_agent", "Admin cannot select a missing Agent");

  const visitsAdmin = await fetchVisits(admin.sb, { tenantId, agentId: agentAId });
  const labsAdmin = await fetchLabs(admin.sb, { tenantId });
  const ordersAdmin = await fetchOrders(admin.sb, scopedLabIds, tenantId);
  const paysAdmin = await fetchPayments(admin.sb, scopedLabIds, tenantId);
  const modelAdmin = buildMyBusinessModel({
    range,
    subjectAgentId: agentAId,
    actor: { role: "admin", tenantId },
    labs: mapLabs(labsAdmin.rows),
    visits: mapVisits(visitsAdmin.rows),
    orders: (ordersAdmin.rows || []).map((row) => ({
      orderId: row.order_id,
      labId: row.lab_id,
      orderDate: row.order_date,
      total_amount: row.total_amount,
    })),
    payments: (paysAdmin.rows || []).map((row) => ({
      paymentId: row.payment_id,
      labId: row.lab_id,
      paymentDate: row.payment_date,
      amount_received: row.amount_received,
    })),
  });

  const aVisitIds = new Set(modelA.ledger.filter((row) => row.activity === "VISIT").map((row) => row.id));
  const adminVisitIds = new Set(modelAdmin.ledger.filter((row) => row.activity === "VISIT").map((row) => row.id));
  const sameVisits =
    aVisitIds.size === adminVisitIds.size && [...aVisitIds].every((id) => adminVisitIds.has(id));
  assert(
    sameVisits &&
      modelA.kpis.visitsLogged === modelAdmin.kpis.visitsLogged &&
      modelA.kpis.quoteOpportunities === modelAdmin.kpis.quoteOpportunities &&
      modelA.kpis.rupeesOrdered === modelAdmin.kpis.rupeesOrdered &&
      modelA.kpis.rupeesCollected === modelAdmin.kpis.rupeesCollected,
    "live.admin.parity",
    `same IST month: Agent visits=${modelA.kpis.visitsLogged} Admin visits=${modelAdmin.kpis.visitsLogged}`
  );

  const agent2Email = process.env.QA_AGENT_2_EMAIL || "qa.test.agent2@primecare.test";
  const agent2Password = process.env.QA_AGENT_2_PASSWORD || "1234";
  let agentB = await signIn(env, { email: agent2Email, password: agent2Password }, { repairAgent: false });
  if (!agentB.sb) {
    const temp = await repairFixtureAgent(env, admin.sb, agent2Email);
    if (temp) {
      agentB = await signIn(env, { email: agent2Email, password: temp }, { repairAgent: false });
    }
  }
  let agentBId = "";
  if (agentB.sb && agentB.userId !== agentA.userId) {
    const profileB = await profileFor(agentB.sb, agentB.userId);
    agentBId = String(profileB.row?.agent_id || "").trim();
    pass("live.auth.agent_b", agent2Email);
  } else {
    agentB = { sb: null };
  }
  if (!agentB.sb) {
    skip("live.iso.agent_b", "No second QA Agent session available", { critical: true });
  } else {
    const visitsB = await fetchVisits(agentB.sb, { tenantId });
    const labsB = await fetchLabs(agentB.sb, { tenantId });
    const aExclusiveLabs = labsA.rows
      .filter((row) => {
        const assigned = String(row.assigned_agent_id || "").toUpperCase() === agentAId.toUpperCase();
        const sourced = String(row.sourced_by_agent_id || "").toUpperCase() === agentAId.toUpperCase();
        const bAssigned = String(row.assigned_agent_id || "").toUpperCase() === String(agentBId).toUpperCase();
        const bSourced = String(row.sourced_by_agent_id || "").toUpperCase() === String(agentBId).toUpperCase();
        return (assigned || sourced) && !bAssigned && !bSourced;
      })
      .map((row) => String(row.lab_id));
    const bLabIds = new Set((labsB.rows || []).map((row) => String(row.lab_id)));
    const leakedLabs = aExclusiveLabs.filter((id) => bLabIds.has(id));
    assert(
      leakedLabs.length === 0,
      "live.iso.agent_b_labs",
      leakedLabs.length ? `Agent B saw Agent A labs ${leakedLabs.slice(0, 3).join(",")}` : "Agent B cannot see Agent A exclusive labs"
    );

    const aVisitIdsRaw = new Set((visitsA.rows || []).map((row) => String(row.id)));
    const leakedVisits = (visitsB.rows || []).filter((row) => aVisitIdsRaw.has(String(row.id)));
    assert(
      leakedVisits.length === 0,
      "live.iso.agent_b_visits",
      leakedVisits.length ? "Agent B saw Agent A visit rows" : "Agent B cannot see Agent A visits"
    );

    const forgedB = resolveMyBusinessSubjectAgent({
      actor: { role: "agent", tenantId, agentId: agentBId },
      requestedSubjectAgentId: agentAId,
    });
    assert(
      String(forgedB.subjectAgentId).toUpperCase() === String(agentBId).toUpperCase(),
      "live.iso.agent_b_forged_a",
      "Agent B cannot forge Agent A subjectAgentId"
    );

    if (agentAId) {
      const probe = await agentB.sb
        .from("agent_visits")
        .select("id,agent_id")
        .eq("agent_id", agentAId)
        .limit(20);
      const probeRows = probe.data || [];
      assert(
        probeRows.length === 0,
        "live.iso.request_agent_a_id",
        probeRows.length
          ? "Agent B PostgREST filter agent_id=A returned rows"
          : "direct agent_visits filter for Agent A is empty under Agent B session"
      );
    }
  }

  pass("live.no_rls_change", "no RLS/policy change made; existing lab/visit/order/payment RLS remains authoritative");

  if (reporter.failures) {
    console.error(`\nLIVE: NO-GO (${reporter.failures} failure(s)) — stop before any security-policy change`);
  } else if (reporter.criticalSkips) {
    console.error(`\nLIVE: HOLD (${reporter.criticalSkips} critical skip(s))`);
  } else {
    console.log("\nLIVE: GO — authenticated Agent A / Agent B / Admin isolation\n");
  }
  return { failures: reporter.failures, criticalSkips: reporter.criticalSkips };
}
