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

    // Get the user's account_id from public.users
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('account_id')
      .eq('id', user.id)
      .single();

    if (userDataError) {
      console.error(`[delete-account] Failed to fetch user data:`, userDataError);
      return new Response(JSON.stringify({ error: "Failed to look up account." }), {
        status: 500,
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
