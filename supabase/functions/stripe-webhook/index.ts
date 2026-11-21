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

const objectId = (value: any): string | null => {
  const id = typeof value === 'string' ? value : value?.id
  return typeof id === 'string' && /^[a-z]+_[a-zA-Z0-9]+$/.test(id) ? id : null
}
const subscriptionIdOf = (value: any) =>
  objectId(value?.subscription ?? value?.parent?.subscription_details?.subscription)
const supportedTypes = new Set([
  'checkout.session.completed', 'customer.subscription.created',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed',
])
const mapStatus = (status: string): string => {
  if (['active', 'trialing', 'past_due', 'canceled'].includes(status)) return status
  if (status === 'unpaid') return 'past_due'
  if (['incomplete', 'incomplete_expired', 'paused'].includes(status)) return 'inactive'
  throw new Error('Unrecognized Stripe subscription status')
}
const periodEndOf = (subscription: any): string | null => {
  const ends = subscription.current_period_end != null
    ? [subscription.current_period_end]
    : subscription.items?.data?.map((item: any) => item.current_period_end) ?? []
  const valid = ends.filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
  // The app has one renewal date: use the earliest item end for mixed intervals.
  return valid.length ? new Date(Math.min(...valid) * 1000).toISOString() : null
}

serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'POST required.' })
  let verifiedEventId: string | undefined
  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) return reply(503, { error: 'Webhook not configured.' })
    const rawBody = await req.text()
    const verification = await verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), webhookSecret)
    if (!verification.ok) return reply(400, { error: 'Invalid signature.' })
    let event: any
    try { event = JSON.parse(rawBody) } catch { return reply(400, { error: 'Invalid JSON.' }) }
    if (!objectId(event.id) || typeof event.type !== 'string' || !event.data?.object
      || typeof event.livemode !== 'boolean' || event.account) {
      return reply(400, { error: 'Invalid or unsupported event envelope.' })
    }
    verifiedEventId = event.id
    if (!supportedTypes.has(event.type)) return reply(200, { received: true, ignored: true })
    const object = event.data.object
    if (event.type === 'checkout.session.completed' && object.mode !== 'subscription') {
      return reply(200, { received: true, ignored: true })
    }
    const subscriptionId = event.type.startsWith('customer.subscription.')
      ? objectId(object) : subscriptionIdOf(object)
    // One-off invoices do not change subscription access.
    if (!subscriptionId && event.type.startsWith('invoice.')) return reply(200, { received: true, ignored: true })
    const customerId = objectId(object.customer)
    if (!subscriptionId || !customerId) return reply(400, { error: 'Missing subscription/customer identity.' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) throw new Error('Database not configured')
    const supabase = createClient(supabaseUrl, supabaseKey)
    // EGRESS-COST: low — one processed event ID; retries need no Stripe call.
    const { data: receipt, error: receiptError } = await supabase.from('stripe_webhook_events')
      .select('event_id').eq('event_id', event.id).maybeSingle()
    if (receiptError) throw new Error('Billing receipt lookup failed')
    if (receipt) return reply(200, { received: true, outcome: 'duplicate' })

    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecret) throw new Error('Stripe lookup not configured')
    const getSubscription = async (id: string) => {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${stripeSecret}` }, signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error('Stripe subscription lookup failed')
      const current = await response.json()
      if (current.id !== id || objectId(current.customer) !== customerId
        || current.livemode !== event.livemode) throw new Error('Stripe subscription identity mismatch')
      mapStatus(current.status) // Unknown/invalid states fail closed.
      return current
    }
    const accountColumns = 'id,stripe_customer_id,stripe_subscription_id,billing_revision'
    // At most three short optimistic attempts. Read revision BEFORE obtaining
    // Stripe truth; a competing commit requires a fresh account + Stripe read.
    for (let attempt = 0; attempt < 3; attempt++) {
      // EGRESS-COST: low — a specific customer, maximum two rows to detect ambiguity.
      const { data: matches, error } = await supabase.from('accounts').select(accountColumns)
        .eq('stripe_customer_id', customerId).order('id').limit(2)
      if (error || !Array.isArray(matches) || matches.length > 1) throw new Error('Ambiguous/unavailable billing account')
      let account = matches[0]
      if (!account) {
        // Checkout may precede persistence of its customer ID. Trust only the
        // current Stripe subscription metadata, never a browser-supplied ID.
        const identity = await getSubscription(subscriptionId)
        const accountId = identity.metadata?.account_id
        if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) {
          throw new Error('Billing account mapping unavailable')
        }
        // EGRESS-COST: low — exact metadata account; no tenant enumeration.
        const { data, error: mappingError } = await supabase.from('accounts').select(accountColumns)
          .eq('id', accountId).maybeSingle()
        if (mappingError || !data || (data.stripe_customer_id && data.stripe_customer_id !== customerId)) {
          throw new Error('Billing account mapping mismatch')
        }
        account = data
      }
      const current = await getSubscription(subscriptionId)
      if (current.metadata?.account_id && current.metadata.account_id !== account.id) {
        throw new Error('Subscription metadata account mismatch')
      }
      let allowReplacement = false
      if (account.stripe_subscription_id && account.stripe_subscription_id !== subscriptionId
        && event.type === 'checkout.session.completed') {
        // An old checkout must not replace the newer subscription. Permit a
        // genuinely new checkout only after Stripe confirms the old one ended.
        const previous = await getSubscription(account.stripe_subscription_id)
        allowReplacement = ['canceled', 'incomplete_expired'].includes(previous.status)
          && !['canceled', 'incomplete_expired'].includes(current.status)
          && Number.isFinite(current.created) && Number.isFinite(previous.created)
          && current.created > previous.created
        if (!allowReplacement && !['canceled', 'incomplete_expired'].includes(current.status)) {
          throw new Error('Conflicting subscriptions require billing review')
        }
      }
      // EGRESS-COST: low — one atomic state update and event receipt.
      const { data: applied, error: applyError } = await supabase.rpc('apply_stripe_subscription_event', {
        p_event_id: event.id, p_event_type: event.type, p_account_id: account.id,
        p_customer_id: customerId, p_subscription_id: subscriptionId,
        p_expected_revision: account.billing_revision, p_status: mapStatus(current.status),
        p_period_end: periodEndOf(current), p_cancel_at_period_end: !!current.cancel_at_period_end,
        p_allow_replacement: allowReplacement,
      })
      if (applyError) throw new Error('Billing transaction failed')
      if (applied?.outcome === 'conflict') continue
      if (!['applied', 'duplicate', 'ignored_unrelated'].includes(applied?.outcome)) {
        throw new Error('Invalid billing transaction response')
      }
      return reply(200, { received: true, outcome: applied.outcome })
    }
    throw new Error('Concurrent billing changes; retry required')
  } catch (error) {
    // Stripe retries non-2xx responses. Never acknowledge an unpersisted event.
    // Do not echo provider bodies, secrets or customer data to the requester.
    console.error('[stripe-webhook] Retry required:', verifiedEventId ?? 'unverified',
      error instanceof Error ? error.message : 'processing failure')
    return reply(503, { error: 'Billing update could not be saved. Retry required.' })
  }
})
