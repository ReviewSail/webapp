import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Get current user and their account ID
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), { status: 401, headers: corsHeaders })
    }

    // Fetch user's account_id
    const { data: userData, error: accountError } = await supabase
      .from('users')
      .select('account_id')
      .eq('id', user.id)
      .single()

    if (accountError || !userData) {
      return new Response(JSON.stringify({ error: "Account not found" }), { status: 404, headers: corsHeaders })
    }

    const accountId = userData.account_id;

    // Fetch existing subscription/customer status
    const { data: account, error: fetchAccountError } = await supabase
      .from('accounts')
      .select('name, stripe_customer_id, subscription_status')
      .eq('id', accountId)
      .single()

    if (fetchAccountError || !account) {
      return new Response(JSON.stringify({ error: "Failed to fetch account info" }), { status: 500, headers: corsHeaders })
    }

    // Check if Stripe key exists, if not, offer a Mock success flow
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const origin = req.headers.get('origin') || 'http://localhost:5173'

    if (!stripeSecretKey) {
      // The mock URL only does anything in a dev build — ReviewSailContext
      // gates the handler behind import.meta.env.DEV. Returned to a deployed
      // client it just redirected to the dashboard, changed nothing and
      // reported no error, so checkout appeared to silently do nothing.
      //
      // Localhost is the test for "this is a dev build", rather than a new env
      // var that has to be remembered: it needs no configuration and fails
      // closed everywhere else.
      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (!isLocalOrigin) {
        console.error("[create-checkout-session] STRIPE_SECRET_KEY is not configured; refusing to mock for a deployed client.");
        return new Response(JSON.stringify({
          error: "Payments aren't set up yet. Please contact support.",
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      console.log("[create-checkout-session] Stripe Secret Key is missing. Triggering Mock checkout link.");
      // Return a special mock flag so client can activate instantly
      return new Response(JSON.stringify({
        url: `${origin}/dashboard?mock_checkout_success=true&account_id=${accountId}`,
        isMock: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Call real Stripe API
    // Construct the pricing plan (e.g. $49/mo)
    // Create checkout session
    const stripeUrl = 'https://api.stripe.com/v1/checkout/sessions'
    const bodyParams = new URLSearchParams()
    
    // Stripe requires customer or we create one
    let customerId = account.stripe_customer_id
    if (!customerId) {
      // Create Stripe Customer first
      const createCustomerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        // Stripe takes nested params as bracketed keys. Passing an object here
        // stringified it to "metadata=[object Object]", so every Stripe
        // customer this created carried no account_id at all. The subscription
        // metadata set further down was correct, which is the only reason the
        // webhook could still resolve the account.
        body: new URLSearchParams({
          name: account.name,
          email: user.email || '',
          'metadata[account_id]': accountId,
        }).toString()
      })
      
      if (createCustomerRes.ok) {
        const custData = await createCustomerRes.json()
        customerId = custData.id
        
        // Save to DB
        const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await supabaseService
          .from('accounts')
          .update({ stripe_customer_id: customerId })
          .eq('id', accountId)
      }
    }

    bodyParams.append('payment_method_types[0]', 'card')
    bodyParams.append('mode', 'subscription')
    bodyParams.append('line_items[0][price_data][currency]', 'usd')
    bodyParams.append('line_items[0][price_data][product_data][name]', 'ReviewSail Premium Pro Plan')
    bodyParams.append('line_items[0][price_data][product_data][description]', 'Unlimited guest feedback review requests, automated multi-channel emails/texts, and full reporting.')
    bodyParams.append('line_items[0][price_data][unit_amount]', '4900') // $49.00
    bodyParams.append('line_items[0][price_data][recurring][interval]', 'month')
    // Stripe's parameter is `quantity`. This said `qty`, which Stripe ignores,
    // and quantity is required for a price_data line item — so every checkout
    // attempt was rejected before it could reach the payment page.
    bodyParams.append('line_items[0][quantity]', '1')
    if (customerId) {
      bodyParams.append('customer', customerId)
    }
    bodyParams.append('success_url', `${origin}/dashboard?checkout_success=true`)
    bodyParams.append('cancel_url', `${origin}/settings`)
    bodyParams.append('subscription_data[metadata][account_id]', accountId)

    const stripeRes = await fetch(stripeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    })

    if (!stripeRes.ok) {
      const errTxt = await stripeRes.text()
      console.error("[create-checkout-session] Stripe Error:", errTxt)
      return new Response(JSON.stringify({ error: "Failed to create checkout session with Stripe: " + errTxt }), { status: 500, headers: corsHeaders })
    }

    const sessionData = await stripeRes.json()
    return new Response(JSON.stringify({ url: sessionData.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[create-checkout-session] Unexpected error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})