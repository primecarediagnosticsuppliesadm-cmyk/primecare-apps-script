-- Phase 3A — lab delivery snapshot persist via SECURITY DEFINER RPC (no broad orders UPDATE for lab).

CREATE OR REPLACE FUNCTION public.persist_order_delivery_snapshot(
  p_tenant_id text,
  p_order_id text,
  p_merchandise_subtotal numeric,
  p_delivery_charge_amount numeric,
  p_delivery_charge_reason text,
  p_delivery_method_intent text,
  p_delivery_policy_snapshot jsonb DEFAULT NULL,
  p_delivery_charge_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid text;
  v_tid_uuid uuid;
  v_oid text;
  v_order public.orders%ROWTYPE;
  v_lab text;
  v_profile_lab text;
  v_subtotal numeric;
  v_charge numeric;
  v_reason text;
  v_intent text;
  v_status text;
  v_now timestamptz := now();
BEGIN
  v_tid := btrim(p_tenant_id);
  v_oid := btrim(p_order_id);
  v_subtotal := round(COALESCE(p_merchandise_subtotal, 0), 2);
  v_charge := round(GREATEST(COALESCE(p_delivery_charge_amount, 0), 0), 2);
  v_reason := nullif(btrim(p_delivery_charge_reason), '');
  v_intent := nullif(btrim(p_delivery_method_intent), '');
  v_status := nullif(btrim(p_delivery_charge_status), '');

  IF v_tid IS NULL OR v_oid IS NULL THEN
    RAISE EXCEPTION 'tenant_and_order_required';
  END IF;
  IF v_subtotal < 0 OR v_charge < 0 THEN
    RAISE EXCEPTION 'invalid_delivery_amounts';
  END IF;

  v_tid_uuid := v_tid::uuid;

  SELECT * INTO v_order
  FROM public.orders
  WHERE tenant_id = v_tid_uuid
    AND order_id = v_oid
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  v_lab := public.primecare_normalize_lab_id(v_order.lab_id);
  v_profile_lab := public.primecare_normalize_lab_id(public.current_profile_lab_id());

  IF NOT (
    public.can_write_ops_for_tenant(v_tid_uuid)
    OR (
      public.current_user_role() = 'lab'
      AND v_profile_lab IS NOT NULL
      AND v_profile_lab = v_lab
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Idempotent: snapshot already persisted with matching operational quote.
  IF v_order.delivery_charge_status IS NOT NULL
    AND round(COALESCE(v_order.merchandise_subtotal, 0), 2) = v_subtotal
    AND round(COALESCE(v_order.delivery_charge_amount, 0), 2) = v_charge
    AND COALESCE(v_order.delivery_charge_reason, '') = COALESCE(v_reason, '')
    AND COALESCE(v_order.delivery_method_intent, '') = COALESCE(v_intent, '')
    AND COALESCE(v_order.delivery_charge_status, '') = COALESCE(v_status, '')
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'delivery', jsonb_build_object(
        'order_id', v_order.order_id,
        'merchandise_subtotal', v_order.merchandise_subtotal,
        'delivery_charge_amount', v_order.delivery_charge_amount,
        'delivery_charge_reason', v_order.delivery_charge_reason,
        'delivery_method_intent', v_order.delivery_method_intent,
        'delivery_policy_snapshot', v_order.delivery_policy_snapshot,
        'delivery_charge_status', v_order.delivery_charge_status
      )
    );
  END IF;

  UPDATE public.orders
  SET
    merchandise_subtotal = v_subtotal,
    delivery_charge_amount = v_charge,
    delivery_charge_reason = v_reason,
    delivery_method_intent = v_intent,
    delivery_policy_snapshot = p_delivery_policy_snapshot,
    delivery_charge_status = v_status,
    updated_at = v_now
  WHERE tenant_id = v_tid_uuid
    AND order_id = v_oid;

  SELECT * INTO v_order
  FROM public.orders
  WHERE tenant_id = v_tid_uuid
    AND order_id = v_oid
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'delivery', jsonb_build_object(
      'order_id', v_order.order_id,
      'merchandise_subtotal', v_order.merchandise_subtotal,
      'delivery_charge_amount', v_order.delivery_charge_amount,
      'delivery_charge_reason', v_order.delivery_charge_reason,
      'delivery_method_intent', v_order.delivery_method_intent,
      'delivery_policy_snapshot', v_order.delivery_policy_snapshot,
      'delivery_charge_status', v_order.delivery_charge_status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_order_delivery_snapshot(
  text, text, numeric, numeric, text, text, jsonb, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.persist_order_delivery_snapshot(
  text, text, numeric, numeric, text, text, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.persist_order_delivery_snapshot IS
  'Phase 3A: persist operational delivery quote on orders without granting lab direct UPDATE on orders.';
