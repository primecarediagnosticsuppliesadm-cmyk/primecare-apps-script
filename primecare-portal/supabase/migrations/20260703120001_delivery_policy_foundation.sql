-- Delivery policy foundation — policy type + capability flags (no distance calculations yet).

ALTER TABLE public.tenant_delivery_policy
  ADD COLUMN IF NOT EXISTS policy_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS customer_pickup_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS express_delivery_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_delivery_radius_km numeric(8, 2),
  ADD COLUMN IF NOT EXISTS policy_reason text;

ALTER TABLE public.tenant_delivery_policy
  DROP CONSTRAINT IF EXISTS tenant_delivery_policy_type_check;

ALTER TABLE public.tenant_delivery_policy
  ADD CONSTRAINT tenant_delivery_policy_type_check
  CHECK (
    policy_type IN ('standard', 'premium', 'local', 'remote', 'contract', 'manual_override')
  );

ALTER TABLE public.tenant_delivery_policy
  DROP CONSTRAINT IF EXISTS tenant_delivery_policy_radius_nonneg;

ALTER TABLE public.tenant_delivery_policy
  ADD CONSTRAINT tenant_delivery_policy_radius_nonneg
  CHECK (max_delivery_radius_km IS NULL OR max_delivery_radius_km >= 0);

COMMENT ON COLUMN public.tenant_delivery_policy.policy_type IS
  'Policy classification: standard | premium | local | remote | contract | manual_override.';
COMMENT ON COLUMN public.tenant_delivery_policy.customer_pickup_allowed IS
  'Whether customer pickup is offered under this policy (foundation flag; quote engine uses method intent).';
COMMENT ON COLUMN public.tenant_delivery_policy.express_delivery_allowed IS
  'Whether express delivery is offered (foundation flag; no routing yet).';
COMMENT ON COLUMN public.tenant_delivery_policy.max_delivery_radius_km IS
  'Optional max delivery radius in km — stored only; distance calculations deferred.';
COMMENT ON COLUMN public.tenant_delivery_policy.policy_reason IS
  'Optional admin note explaining policy type or override.';
