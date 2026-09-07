-- Flow 3A follow-up — least-privilege EXECUTE on financial posting RPCs (QA only).
-- Do NOT apply to Production from this sprint.
--
-- Does not alter function bodies, payments table DML, AR trigger, Flow 1/2,
-- or the historical 20260906120000 ledger condition.
--
-- Exact signatures from live QA 20260906120000 objects.

REVOKE EXECUTE ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
