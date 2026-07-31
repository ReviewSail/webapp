import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Returns a Stripe Billing Portal URL for the caller's account.
 *
 * Cancelling, resuming, swapping the payment method and downloading invoices
 * all happen in Stripe's hosted portal, so none of that lives in this app.
 *
 * Requires the portal to be configured once at
 * https://dashboard.stripe.com/settings/billing/portal
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: userData, error: userRowError } = await supabase
      .from('users')
      .select('account_id, role')
      .eq('id', user.id)
      .single()

    if (userRowError || !userData) {
      return json({ error: 'Account not found' }, 404)
    }

    // Billing is admin-only. RLS already hides accounts rows from staff, but the
    // check belongs here too so the failure is a clear 403 rather than a 404.
    if (userData.role !== 'admin') {
      return json({ error: 'Only admins can manage billing.' }, 403)
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('stripe_customer_id')
      .eq('id', userData.account_id)
      .single()

    if (accountError || !account) {
      return json({ error: 'Account not found' }, 404)
    }

    const origin = req.headers.get('origin') || Deno.env.get('APP_URL') || 'http://localhost:5173'
    const returnUrl = `${origin.replace(/\/+$/, '')}/settings?tab=billing`

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.log('[create-portal-session] STRIPE_SECRET_KEY missing; returning mock portal URL.')
      return json({ url: `${returnUrl}&portal_mock=true`, isMock: true })
    }

    // No Stripe customer means they have never checked out. The client turns
    // this into an "Upgrade" prompt rather than an error.
    if (!account.stripe_customer_id) {
      return json({ error: 'no_customer' }, 400)
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: account.stripe_customer_id,
        return_url: returnUrl,
      }).toString(),
    })

    if (!stripeRes.ok) {
      // Stripe's message can name internal configuration; log it, don't ship it.
      console.error('[create-portal-session] Stripe error:', await stripeRes.text())
      return json({ error: "Couldn't open the billing portal. Try again in a moment." }, 502)
    }

    const session = await stripeRes.json()
    return json({ url: session.url })

  } catch (error) {
    console.error('[create-portal-session] Unexpected error:', error)
    return json({ error: "Couldn't open the billing portal. Try again in a moment." }, 500)
  }
})
