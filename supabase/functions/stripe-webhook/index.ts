import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

// Stripe cannot present a Supabase JWT, so the signature IS the authentication for
// this endpoint. Without it, anyone could POST a checkout.session.completed event
// and grant themselves a paid subscription.
const SIGNATURE_TOLERANCE_SECONDS = 300

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

const verifyStripeSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  if (!signatureHeader) return { ok: false, reason: 'missing stripe-signature header' }

  // Header format: t=<unix ts>,v1=<hex hmac>[,v1=<hex hmac>...]
  let timestamp: string | null = null
  const providedSignatures: string[] = []
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key?.trim() === 't') timestamp = value?.trim() ?? null
    else if (key?.trim() === 'v1' && value) providedSignatures.push(value.trim())
  }

  if (!timestamp || providedSignatures.length === 0) {
    return { ok: false, reason: 'malformed stripe-signature header' }
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp)
  if (!Number.isFinite(age) || Math.abs(age) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'signature timestamp outside tolerance' }
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  )
  const expected = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (!providedSignatures.some(sig => timingSafeEqual(sig, expected))) {
    return { ok: false, reason: 'signature mismatch' }
  }

  return { ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured; rejecting.')
      return new Response(JSON.stringify({ error: 'Webhook not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Must read the body raw — parsing first would break the HMAC.
    const rawBody = await req.text()
    const verification = await verifyStripeSignature(
      rawBody,
      req.headers.get('stripe-signature'),
      webhookSecret,
    )

    if (!verification.ok) {
      console.error(`[stripe-webhook] Rejected unverified event: ${verification.reason}`)
      return new Response(JSON.stringify({ error: 'Invalid signature.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.parse(rawBody)
    const { type, data } = payload
    console.log(`[stripe-webhook] Received event type: ${type}`);

    // Every handler below is a plain column overwrite, so a Stripe retry of the
    // same event is harmless and no event-id dedupe table is needed yet.
    const patchAccount = async (
      match: { column: 'id' | 'stripe_customer_id'; value: string },
      patch: Record<string, unknown>,
    ) => {
      const { error } = await supabase.from('accounts').update(patch).eq(match.column, match.value)
      if (error) {
        console.error(`[stripe-webhook] Failed to update account by ${match.column}:`, error)
      }
      return !error
    }

    // Stripe's subscription statuses are a superset of the ones the app renders.
    const mapStatus = (stripeStatus: string) => {
      switch (stripeStatus) {
        case 'active':
        case 'trialing':
        case 'past_due':
        case 'canceled':
          return stripeStatus
        case 'incomplete':
        case 'incomplete_expired':
          return 'inactive'
        case 'unpaid':
          return 'past_due'
        default:
          return 'inactive'
      }
    }

    const toIso = (seconds: number | null | undefined) =>
      typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null

    if (type === 'checkout.session.completed') {
      const session = data.object
      const stripeCustomerId = session.customer
      const subscriptionId = session.subscription
      
      // Look for account ID from metadata
      let accountId = session.metadata?.account_id || session.subscription_data?.metadata?.account_id
      
      // If not in session metadata, let's check subscription metadata
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!accountId && subscriptionId && stripeSecretKey) {
        try {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripeSecretKey}` }
          })
          if (subRes.ok) {
            const subData = await subRes.json()
            accountId = subData.metadata?.account_id
          }
        } catch (err) {
          console.error("[stripe-webhook] Error fetching subscription metadata:", err)
        }
      }

      console.log(`[stripe-webhook] Checkout completed. Stripe Customer ID: ${stripeCustomerId}, Account ID: ${accountId}`);

      const patch: Record<string, unknown> = {
        subscription_status: 'active',
        plan_name: 'Premium Pro',
        cancel_at_period_end: false,
      }
      if (subscriptionId) patch.stripe_subscription_id = subscriptionId

      if (accountId) {
        await patchAccount({ column: 'id', value: accountId }, { ...patch, stripe_customer_id: stripeCustomerId })
        console.log(`[stripe-webhook] Account ${accountId} marked as active subscription.`)
      } else if (stripeCustomerId) {
        // Fallback: match by stripe_customer_id
        await patchAccount({ column: 'stripe_customer_id', value: stripeCustomerId }, patch)
      }
    } else if (type === 'customer.subscription.updated') {
      // Plan changes, trial transitions, scheduled cancellations and recoveries
      // all arrive here. Before this the app never learned about any of them.
      const subscription = data.object
      const stripeCustomerId = subscription.customer

      if (stripeCustomerId) {
        await patchAccount({ column: 'stripe_customer_id', value: stripeCustomerId }, {
          subscription_status: mapStatus(subscription.status),
          stripe_subscription_id: subscription.id,
          current_period_end: toIso(subscription.current_period_end),
          cancel_at_period_end: !!subscription.cancel_at_period_end,
        })
        console.log(
          `[stripe-webhook] Subscription updated for ${stripeCustomerId}: ` +
          `${subscription.status}, cancel_at_period_end=${!!subscription.cancel_at_period_end}`
        )
      }
    } else if (type === 'customer.subscription.deleted') {
      const subscription = data.object
      const stripeCustomerId = subscription.customer
      console.log(`[stripe-webhook] Subscription deleted for customer: ${stripeCustomerId}`);

      if (stripeCustomerId) {
        // current_period_end is kept as the date the plan actually ended.
        await patchAccount({ column: 'stripe_customer_id', value: stripeCustomerId }, {
          subscription_status: 'canceled',
          cancel_at_period_end: false,
          current_period_end: toIso(subscription.current_period_end),
        })
        console.log(`[stripe-webhook] Account matching Stripe Customer ID ${stripeCustomerId} marked as canceled.`)
      }
    } else if (type === 'invoice.payment_failed') {
      const stripeCustomerId = data.object.customer
      if (stripeCustomerId) {
        await patchAccount({ column: 'stripe_customer_id', value: stripeCustomerId }, {
          subscription_status: 'past_due',
        })
        console.log(`[stripe-webhook] Payment failed for ${stripeCustomerId}; marked past_due.`)
      }
    } else if (type === 'invoice.paid') {
      const invoice = data.object
      const stripeCustomerId = invoice.customer
      // Only a subscription invoice should reactivate a plan.
      if (stripeCustomerId && invoice.subscription) {
        const periodEnd = toIso(invoice.lines?.data?.[0]?.period?.end)
        await patchAccount({ column: 'stripe_customer_id', value: stripeCustomerId }, {
          subscription_status: 'active',
          // Don't clear a known renewal date just because this invoice lacks one.
          ...(periodEnd ? { current_period_end: periodEnd } : {}),
        })
        console.log(`[stripe-webhook] Invoice paid for ${stripeCustomerId}; marked active.`)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error("[stripe-webhook] Webhook error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})