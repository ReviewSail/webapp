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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse payload
    const payload = await req.json()
    const { type, data } = payload
    console.log(`[stripe-webhook] Received event type: ${type}`);

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

      if (accountId) {
        const { error } = await supabase
          .from('accounts')
          .update({ 
            subscription_status: 'active',
            stripe_customer_id: stripeCustomerId
          })
          .eq('id', accountId)

        if (error) {
          console.error("[stripe-webhook] Database update error:", error)
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
        }
        console.log(`[stripe-webhook] Account ${accountId} marked as active subscription.`)
      } else if (stripeCustomerId) {
        // Fallback: match by stripe_customer_id
        const { error } = await supabase
          .from('accounts')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', stripeCustomerId)

        if (error) {
          console.error("[stripe-webhook] Database update error:", error)
        }
      }
    } else if (type === 'customer.subscription.deleted') {
      const subscription = data.object
      const stripeCustomerId = subscription.customer
      console.log(`[stripe-webhook] Subscription deleted for customer: ${stripeCustomerId}`);

      if (stripeCustomerId) {
        const { error } = await supabase
          .from('accounts')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_customer_id', stripeCustomerId)

        if (error) {
          console.error("[stripe-webhook] Database update error on cancel:", error)
        } else {
          console.log(`[stripe-webhook] Account matching Stripe Customer ID ${stripeCustomerId} marked as canceled.`)
        }
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