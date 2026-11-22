import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const idOf = (value: any): string | null => typeof value === 'string' ? value : value?.id ?? null
const ended = (status: string) => ['canceled', 'incomplete_expired'].includes(status)

serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'POST required.' })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return reply(401, { error: 'Please sign in.' })
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const client = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return reply(401, { error: 'Please sign in again.' })
    // EGRESS-COST: low — one caller's membership, never client-supplied account ID.
    const { data: member, error: memberError } = await client.from('users')
      .select('account_id,role').eq('id', user.id).single()
    if (memberError || !member?.account_id) return reply(403, { error: 'Account unavailable.' })
    if (member.role !== 'admin') return reply(403, { error: 'Only admins can manage billing.' })

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return reply(503, { error: "Payments aren't set up yet. No purchase was made." })
    // A caller-controlled Origin must never choose the payment return URL.
    const appUrl = new URL(Deno.env.get('APP_URL') || '')
    if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password || appUrl.pathname !== '/'
      || appUrl.search || appUrl.hash) throw new Error('A trusted HTTPS APP_URL origin is required')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey) throw new Error('Checkout storage not configured')
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const prepare = async (expiredOperation: string | null = null) => {
      // EGRESS-COST: low — one serialized account checkout attempt.
      const { data, error } = await admin.rpc('prepare_billing_checkout', {
        p_account_id: member.account_id, p_actor_id: user.id, p_email: user.email || '',
        p_app_url: appUrl.origin, p_expired_operation: expiredOperation,
      })
      if (error || !data) throw new Error('Could not prepare checkout safely')
      return data
    }
    const stripe = async (path: string, params?: URLSearchParams, key?: string) => {
      const res = await fetch('https://api.stripe.com/v1/' + path, {
        method: params ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${stripeKey}`, ...(params ? {
          'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key!,
        } : {}) },
        ...(params ? { body: params.toString() } : {}), signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error('Stripe request failed; retry will keep the same attempt')
      return res.json()
    }
    const record = async (attempt: any, customerId: string, sessionId: string | null = null) => {
      // EGRESS-COST: low — atomic identity persistence for the exact attempt.
      const { data, error } = await admin.rpc('record_billing_checkout', {
        p_account_id: member.account_id, p_actor_id: user.id, p_operation_id: attempt.operation_id,
        p_customer_id: customerId, p_session_id: sessionId,
      })
      if (error || data !== true) throw new Error('Checkout response could not be saved safely')
    }
    const sessionIdentity = (session: any, attempt: any) => {
      if (session.mode !== 'subscription' || session.client_reference_id !== member.account_id
        || idOf(session.customer) !== attempt.customer_id) throw new Error('Checkout session identity mismatch')
    }
    const checkoutUrl = (session: any) => {
      const url = new URL(session.url)
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password) {
        throw new Error('Invalid checkout URL')
      }
      return url.href
    }

    const checkExistingSubscription = async (attempt: any): Promise<boolean> => {
      const customerId = attempt.customer_id
      const subscriptions = await stripe('subscriptions?' + new URLSearchParams({
        customer: customerId, status: 'all', limit: '100',
      }))
      if (!Array.isArray(subscriptions.data) || subscriptions.has_more !== false || subscriptions.data.length > 100) {
        throw new Error('Subscription history requires review')
      }
      if (subscriptions.data.some((s: any) => idOf(s.customer) !== customerId || typeof s.status !== 'string')) {
        throw new Error('Subscription history identity mismatch')
      }
      if (subscriptions.data.some((s: any) => !ended(s.status))) return true
      if (attempt.subscription_id) {
        const bound = await stripe('subscriptions/' + encodeURIComponent(attempt.subscription_id))
        if (bound.id !== attempt.subscription_id || idOf(bound.customer) !== customerId) throw new Error('Subscription identity mismatch')
        if (!ended(bound.status)) return true
      }
      return false
    }
    let attempt = await prepare()
    if (attempt.blocked) return reply(409, { error: 'A subscription already exists. Use Manage Billing.' })
    if (attempt.session_id) {
      const existing = await stripe('checkout/sessions/' + encodeURIComponent(attempt.session_id))
      if (existing.id !== attempt.session_id) throw new Error('Checkout session mismatch')
      sessionIdentity(existing, attempt)
      if (existing.status === 'open') {
        if (await checkExistingSubscription(attempt)) return reply(409, { error: 'An existing subscription needs attention. Use Manage Billing.' })
        return reply(200, { url: checkoutUrl(existing) })
      }
      if (existing.status === 'complete') return reply(409, { error: 'Checkout already completed. Billing is updating; do not purchase again.' })
      if (existing.status !== 'expired') throw new Error('Unknown checkout status')
      attempt = await prepare(attempt.operation_id)
      if (attempt.blocked) return reply(409, { error: 'A subscription already exists. Use Manage Billing.' })
      // A competing request may already have finished the replacement.
      if (attempt.session_id) return reply(409, { error: 'Checkout changed. Please try again.' })
    }
    // Stripe may prune idempotency keys after 24 hours. An unknown attempt must
    // never become a fresh purchase just because time elapsed.
    const age = Date.now() - new Date(attempt.created_at).getTime()
    if (!Number.isFinite(age) || age < -60000 || age >= 20 * 60 * 60 * 1000) {
      return reply(409, { error: 'This checkout needs review before another can be started. No new purchase was created.' })
    }
    let customerId = attempt.customer_id
    if (!customerId) {
      if (attempt.subscription_id) throw new Error('Subscription exists without a customer mapping')
      const customer = await stripe('customers', new URLSearchParams({
        name: attempt.snapshot.name || '', email: attempt.snapshot.email,
        'metadata[account_id]': member.account_id,
      }), 'reviewsail-customer-' + attempt.operation_id)
      if (typeof customer.id !== 'string' || !customer.id.startsWith('cus_')) throw new Error('Invalid customer response')
      customerId = customer.id
      await record(attempt, customerId)
      attempt.customer_id = customerId
    }
    // Check Stripe too: a successful purchase may precede its webhook.
    if (await checkExistingSubscription(attempt)) {
      return reply(409, { error: 'An existing subscription needs attention. Use Manage Billing instead of purchasing again.' })
    }
    const params = new URLSearchParams({
      'payment_method_types[0]': 'card', mode: 'subscription', customer: customerId,
      client_reference_id: member.account_id,
      'metadata[account_id]': member.account_id,
      'subscription_data[metadata][account_id]': member.account_id,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'ReviewSail Premium Pro Plan',
      'line_items[0][price_data][unit_amount]': '4900',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][quantity]': '1',
      success_url: attempt.snapshot.app_url + '/dashboard?checkout_success=true',
      cancel_url: attempt.snapshot.app_url + '/settings',
      expires_at: String(Math.floor(new Date(attempt.created_at).getTime() / 1000) + 23 * 60 * 60),
    })
    const session = await stripe('checkout/sessions', params, 'reviewsail-checkout-' + attempt.operation_id)
    if (typeof session.id !== 'string' || !session.id.startsWith('cs_')) throw new Error('Invalid checkout response')
    sessionIdentity(session, attempt)
    await record(attempt, customerId, session.id)
    if (session.status !== 'open') return reply(409, { error: 'Checkout is no longer open. Please check billing before trying again.' })
    return reply(200, { url: checkoutUrl(session) })
  } catch (error) {
    console.error('[create-checkout-session]', error instanceof Error ? error.message : 'Checkout failed')
    return reply(503, { error: 'Checkout could not be confirmed. Please retry; do not start a separate purchase.' })
  }
})
