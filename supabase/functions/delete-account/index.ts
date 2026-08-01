import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Cancels the account's Stripe subscription immediately, before its row is
 * deleted.
 *
 * Fails the deletion rather than proceeding on a Stripe error: leaving a live
 * subscription behind means the customer keeps paying with no account, no
 * billing portal, and no `accounts` row for the webhook to match on. A failed
 * delete they can retry is recoverable; silent perpetual billing is not.
 */
const cancelSubscription = async (
  // Untyped, as everywhere else in these functions: there is no generated
  // Database type here, and ReturnType<typeof createClient> resolves to a
  // never-schema client that nothing can actually be passed to.
  adminClient: any,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { data: account, error } = await adminClient
    .from('accounts')
    .select('stripe_subscription_id')
    .eq('id', accountId)
    .maybeSingle()

  if (error) {
    console.error('[delete-account] Could not read billing state:', error)
    return { ok: false, error: "Couldn't check your subscription. Nothing was deleted — please try again." }
  }

  const subscriptionId = (account as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id
  if (!subscriptionId) {
    console.log(`[delete-account] Account ${accountId} has no subscription to cancel.`)
    return { ok: true }
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeSecretKey) {
    // Local/mock setups never created a real subscription in the first place.
    console.warn('[delete-account] STRIPE_SECRET_KEY missing; skipping cancellation.')
    return { ok: true }
  }

  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
  })

  // 404 means Stripe has no such subscription — already cancelled elsewhere,
  // which is the state we wanted anyway.
  if (res.ok || res.status === 404) {
    console.log(`[delete-account] Subscription ${subscriptionId} cancelled for account ${accountId}.`)
    return { ok: true }
  }

  console.error('[delete-account] Stripe cancellation failed:', await res.text())
  return {
    ok: false,
    error: "Couldn't cancel your subscription, so nothing was deleted. Cancel it from the billing portal first, then try again.",
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing authentication headers." }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize client using caller's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate the JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid user session." }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[delete-account] User ${user.id} requested account deletion`);

    // Get the user's account_id and role from public.users
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('account_id, role')
      .eq('id', user.id)
      .single();

    if (userDataError) {
      console.error(`[delete-account] Failed to fetch user data:`, userDataError);
      return new Response(JSON.stringify({ error: "Failed to look up account." }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // This endpoint destroys the whole tenant, so it is admin-only — the same
    // check create-portal-session and invite-team-member already make. Settings
    // hides the button from staff, but the function is directly invokable with
    // any member's token, so hiding it was never the control.
    if (userData?.role !== 'admin') {
      console.error(`[delete-account] Rejected non-admin ${user.id} (role: ${userData?.role ?? 'unknown'}).`);
      return new Response(JSON.stringify({ error: "Only admins can delete the account." }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create admin client for privileged operations
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    // Delete the account (CASCADE will remove locations, customers, users, orders, etc.)
    if (userData?.account_id) {
      // Cancel billing FIRST. Deleting the account row removes the only thing
      // the Stripe webhook matches on (stripe_customer_id), so an uncancelled
      // subscription would bill forever with nothing left to reconcile it
      // against — and no UI to cancel it from.
      const cancelled = await cancelSubscription(adminClient, userData.account_id);
      if (!cancelled.ok) {
        return new Response(JSON.stringify({ error: cancelled.error }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: deleteAccountError } = await adminClient
        .from('accounts')
        .delete()
        .eq('id', userData.account_id);

      if (deleteAccountError) {
        console.error(`[delete-account] Failed to delete account:`, deleteAccountError);
        return new Response(JSON.stringify({ error: "Failed to delete account data." }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[delete-account] Account ${userData.account_id} deleted successfully`);
    }

    // Delete the auth user (CASCADE will remove public.users record)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteAuthError) {
      console.error(`[delete-account] Failed to delete auth user:`, deleteAuthError);
      return new Response(JSON.stringify({ error: "Failed to delete user account." }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[delete-account] User ${user.id} account fully deleted`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[delete-account] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
