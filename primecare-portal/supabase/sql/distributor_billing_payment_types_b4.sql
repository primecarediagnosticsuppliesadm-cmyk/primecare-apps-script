-- Billing B4: extend payment_type labels for Record Payment UI.
-- Idempotent. Run after distributor_billing_migration.sql.

ALTER TABLE public.distributor_billing_payments
  DROP CONSTRAINT IF EXISTS distributor_billing_payments_type_check;

ALTER TABLE public.distributor_billing_payments
  ADD CONSTRAINT distributor_billing_payments_type_check CHECK (
    payment_type IN (
      'platform_fee',
      'revenue_share',
      'per_lab_fee',
      'opening_balance',
      'adjustment',
      'refund'
    )
  );
