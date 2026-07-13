#!/usr/bin/env node
/**
 * Generates supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql
 * by injecting _proj_assert_refresh_access_v1 into refresh_proj_* function bodies.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outPath = resolve(
  root,
  "supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql"
);

const AUTH_HELPER = `-- Sprint 3A — Production Safety Hardening (SEC-01, TD-025/032, SEC-04/TD-026)
-- Blueprint-first: docs/PrimeCare_System_Blueprint/CHANGELOG.md Sprint 3A entry

-- ---------------------------------------------------------------------------
-- _proj_assert_refresh_access_v1 — executive, admin+tenant, or service_role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._proj_assert_refresh_access_v1(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN;
  END IF;
  IF public.current_user_role() = 'executive' THEN
    RETURN;
  END IF;
  IF public.current_user_role() = 'admin'
     AND public.tenant_id_matches(p_tenant_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden';
END;
$$;

REVOKE ALL ON FUNCTION public._proj_assert_refresh_access_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._proj_assert_refresh_access_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._proj_assert_refresh_access_v1(uuid) TO service_role;

`;

const READ_FIX = `
-- ---------------------------------------------------------------------------
-- SEC-04 / TD-026 — tenant-scoped todayCollections (no cross-tenant SUM)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_lab_receivables_list_v1(
  p_limit integer DEFAULT 5000,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
  v_rows jsonb;
  v_as_of timestamptz;
  v_today date := CURRENT_DATE;
  v_today_collections numeric(14, 2) := 0;
  v_total_outstanding numeric(14, 2) := 0;
  v_overdue_count integer := 0;
  v_high_risk_count integer := 0;
  v_last_payment_map jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_as_of
  FROM public.proj_lab_receivable_v1 p;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.tenant_id,
      p.lab_id,
      p.lab_name,
      p.outstanding_amount AS outstanding,
      p.total_paid,
      p.total_delivered,
      p.credit_limit,
      p.credit_hold,
      p.overdue_days,
      p.risk_status,
      p.payment_status,
      p.assigned_agent,
      p.agent_id,
      p.area,
      p.last_payment_date,
      p.refreshed_at
    FROM public.proj_lab_receivable_v1 p
    WHERE (
      COALESCE(p.outstanding_amount, 0) > 0
      OR COALESCE(p.total_paid, 0) > 0
      OR COALESCE(p.total_delivered, 0) > 0
      OR COALESCE(p.overdue_days, 0) > 0
      OR upper(btrim(COALESCE(p.credit_hold, ''))) IN ('HOLD', 'YES')
      OR lower(btrim(COALESCE(p.risk_status, ''))) IN ('high', 'medium')
    )
    ORDER BY p.outstanding_amount DESC NULLS LAST, p.lab_id
    LIMIT v_limit
  ) t;

  SELECT COALESCE(SUM(p.amount_received), 0)
  INTO v_today_collections
  FROM public.payments p
  WHERE p.payment_date = v_today
    AND p.tenant_id IN (
      SELECT DISTINCT (elem->>'tenant_id')::uuid
      FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem
      WHERE elem->>'tenant_id' IS NOT NULL
        AND btrim(elem->>'tenant_id') <> ''
    );

  SELECT
    COALESCE(SUM((elem->>'outstanding')::numeric), 0),
    COUNT(*) FILTER (WHERE COALESCE((elem->>'overdue_days')::numeric, 0) > 0),
    COUNT(*) FILTER (WHERE lower(btrim(COALESCE(elem->>'risk_status', ''))) = 'high')
  INTO v_total_outstanding, v_overdue_count, v_high_risk_count
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem;

  SELECT COALESCE(
    jsonb_object_agg(elem->>'lab_id', elem->>'last_payment_date'),
    '{}'::jsonb
  )
  INTO v_last_payment_map
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem
  WHERE elem->>'last_payment_date' IS NOT NULL
    AND btrim(elem->>'last_payment_date') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-COL-LAB-v1',
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', jsonb_build_object(
      'collections', v_rows,
      'summary', jsonb_build_object(
        'totalOutstanding', v_total_outstanding,
        'overdueCount', v_overdue_count,
        'highRiskCount', v_high_risk_count,
        'todayCollections', v_today_collections
      ),
      'lastPaymentByLabId', v_last_payment_map
    )
  );
END;
$$;

`;

const GRANTS = `
-- ---------------------------------------------------------------------------
-- TD-032 — least-privilege EXECUTE on refresh RPCs (guarded body auth)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.refresh_proj_order_row_v1(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_order_row_v1(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_order_row_v1(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_order_row_v1(uuid, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_proj_tenant_order_metrics_v1(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_tenant_order_metrics_v1(uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_order_metrics_v1(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_order_metrics_v1(uuid, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(uuid, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_proj_tenant_executive_metrics_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_proj_tenant_executive_metrics_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_executive_metrics_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_executive_metrics_v1(uuid) TO service_role;

-- Legacy 2-arg overloads (if present from Phase 1)
DO $$
BEGIN
  IF to_regprocedure('public.refresh_proj_order_row_v1(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_proj_order_row_v1(uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_proj_order_row_v1(uuid, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_proj_order_row_v1(uuid, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_proj_order_row_v1(uuid, text) TO service_role';
  END IF;
  IF to_regprocedure('public.refresh_proj_lab_receivable_row_v1(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text) TO service_role';
  END IF;
END;
$$;
`;

const REFRESH_FUNCTIONS = [
  {
    name: "refresh_proj_tenant_order_metrics_v1",
    source: "supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql",
    insertAfter: /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION 'tenant_id_required';\s+END IF;/,
  },
  {
    name: "refresh_proj_tenant_receivable_metrics_v1",
    source: "supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql",
    insertAfter: /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION 'tenant_id_required';\s+END IF;/,
  },
  {
    name: "refresh_proj_tenant_executive_metrics_v1",
    source: "supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql",
    insertAfter: /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION 'tenant_id_required';\s+END IF;/,
  },
  {
    name: "refresh_proj_order_row_v1",
    source: "supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql",
    insertAfter:
      /IF p_tenant_id IS NULL OR v_order_id = '' THEN\s+RAISE EXCEPTION 'order_refresh_args_required';\s+END IF;/,
  },
  {
    name: "refresh_proj_lab_receivable_row_v1",
    source: "supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql",
    insertAfter:
      /IF p_tenant_id IS NULL OR v_lab IS NULL THEN\s+RAISE EXCEPTION 'receivable_refresh_args_required';\s+END IF;/,
  },
  {
    name: "refresh_proj_tenant_dashboard_metrics_v1",
    source: "supabase/migrations/20260702160100_fix_dashboard_visits_count.sql",
    insertAfter: /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION 'tenant_id_required';\s+END IF;/,
  },
];

function extractFunction(sql, funcName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${funcName}`;
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  const end = sql.indexOf("\n$$;", start);
  if (end < 0) return null;
  return sql.slice(start, end + 4);
}

function injectAuth(funcSql, insertAfter) {
  if (funcSql.includes("_proj_assert_refresh_access_v1")) return funcSql;
  const authLine = "\n  PERFORM public._proj_assert_refresh_access_v1(p_tenant_id);";
  return funcSql.replace(insertAfter, (m) => `${m}${authLine}`);
}

const phase2 = readFileSync(resolve(root, REFRESH_FUNCTIONS[0].source), "utf8");
const dashFix = readFileSync(
  resolve(root, "supabase/migrations/20260702160100_fix_dashboard_visits_count.sql"),
  "utf8"
);

const sources = { [REFRESH_FUNCTIONS[0].source]: phase2, dashFix: dashFix };
sources["supabase/migrations/20260702160100_fix_dashboard_visits_count.sql"] = dashFix;

let refreshSql = "\n-- ---------------------------------------------------------------------------\n-- refresh_proj_* — tenant authorization (SEC-01 / TD-025)\n-- ---------------------------------------------------------------------------\n";

for (const spec of REFRESH_FUNCTIONS) {
  const src =
    spec.source.includes("fix_dashboard") ? dashFix : phase2;
  let fn = extractFunction(src, spec.name);
  if (!fn) {
    console.warn(`WARN  skip ${spec.name} — not found in ${spec.source}`);
    continue;
  }
  fn = injectAuth(fn, spec.insertAfter);
  refreshSql += `\n${fn}\n`;
}

writeFileSync(outPath, AUTH_HELPER + refreshSql + READ_FIX + GRANTS, "utf8");
console.log(`PASS  wrote ${outPath}`);
