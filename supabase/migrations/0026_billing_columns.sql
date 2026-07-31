-- Billing state beyond "is it on or off".
--
-- Until now the whole billing schema was accounts.stripe_customer_id plus
-- accounts.subscription_status, so the app could not tell an active plan from
-- one that is scheduled to cancel, could not show a renewal date, and had
-- nowhere to record a failed payment. The Billing tab and the Stripe webhook
-- both need these.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_name              text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean NOT NULL DEFAULT false;

-- The webhook matches incoming subscription and invoice events on the Stripe
-- customer id, which was previously unindexed.
CREATE INDEX IF NOT EXISTS accounts_stripe_customer_id_idx
  ON public.accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.accounts.subscription_status IS
  'inactive | active | trialing | past_due | canceled. Written only by the stripe-webhook function.';
COMMENT ON COLUMN public.accounts.cancel_at_period_end IS
  'True when the customer has cancelled but the paid period has not ended yet.';
