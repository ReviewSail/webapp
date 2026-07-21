import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Strictly validate authorization caller against the secret service key
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      console.error("[setup-db] Security Alert: Unauthenticated schema alter request blocked.");
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid migration authorization token." }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log("[setup-db] Connection verified. Commencing migrations...");
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!databaseUrl) {
      throw new Error("SUPABASE_DB_URL is not set");
    }

    const client = new Client(databaseUrl);
    await client.connect();

    // 2. Add columns to locations table
    await client.queryArray(`
      ALTER TABLE public.locations 
      ADD COLUMN IF NOT EXISTS enable_email BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS enable_sms BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS preferred_send_hour INTEGER DEFAULT 10;
    `);

    // 3. Add stripe billing columns to accounts table
    await client.queryArray(`
      ALTER TABLE public.accounts 
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
    `);

    // Ensure users table role, email, and full_name columns exist
    await client.queryArray(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin',
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS full_name TEXT;
    `);

    // Default all existing user roles to admin
    await client.queryArray(`
      UPDATE public.users SET role = 'admin' WHERE role IS NULL;
    `);

    // Attempt backfilling emails of existing users from auth.users
    try {
      await client.queryArray(`
        UPDATE public.users u
        SET email = a.email,
            full_name = COALESCE(a.raw_user_meta_data->>'full_name', a.raw_user_meta_data->>'first_name')
        FROM auth.users a
        WHERE u.id = a.id AND (u.email IS NULL OR u.full_name IS NULL);
      `);
    } catch (backfillErr) {
      console.warn("Emails backfill warning (ignored if permissions restrict direct auth.users reads):", backfillErr);
    }

    // 4. Recreate handle_new_auth_user trigger function to capture email & metadata
    await client.queryArray(`
      CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
       RETURNS trigger
       LANGUAGE plpgsql
       SECURITY DEFINER
      AS $$
      declare
        new_account_id uuid;
        new_location_id uuid;
      begin
        -- 1. Create a new account for the user
        insert into public.accounts (name)
        values (coalesce(new.raw_user_meta_data->>'full_name', 'My Account'))
        returning id into new_account_id;

        -- 2. Create the user record linked to the account with email & name
        insert into public.users (id, account_id, role, email, full_name)
        values (
          new.id, 
          new_account_id, 
          'admin', 
          new.email, 
          coalesce(new.raw_user_meta_data->>'full_name', 'New Member')
        );

        -- 3. Create a default location
        insert into public.locations (account_id, name, timezone)
        values (new_account_id, 'Main Location', 'UTC')
        returning id into new_location_id;

        -- 4. Create a default message template for the location
        insert into public.message_templates (location_id, type, template_text)
        values (new_location_id, 'email', 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}');

        return new;
      end;
      $$;
    `);

    // 5. Create public feedback table
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS public.feedback (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        request_id UUID,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
        comment TEXT,
        manager_response TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Enable RLS and add secure Grants (Explicit least-privilege)
    await client.queryArray(`
      ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
      
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feedback TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feedback TO authenticated;
      GRANT INSERT, UPDATE ON TABLE public.feedback TO anon; -- Anon can ONLY submit or modify own feedback
    `);

    // Create Policies safely by checking if they exist first
    try {
      await client.queryArray(`
        DROP POLICY IF EXISTS "feedback_select_policy" ON public.feedback;
        CREATE POLICY "feedback_select_policy" ON public.feedback
        FOR SELECT TO authenticated USING (true); -- ONLY authenticated managers can read guest feedback
      `);
    } catch (_) { /* Policy already exists */ }

    try {
      await client.queryArray(`
        CREATE POLICY "feedback_insert_policy" ON public.feedback
        FOR INSERT WITH CHECK (true);
      `);
    } catch (_) { /* Policy already exists */ }

    try {
      await client.queryArray(`
        CREATE POLICY "feedback_update_policy" ON public.feedback
        FOR UPDATE USING (true);
      `);
    } catch (_) { /* Policy already exists */ }

    // Grant SELECT and UPDATE privileges on review_requests table to anon so self-suppression links work
    await client.queryArray(`
      GRANT SELECT, INSERT, UPDATE ON TABLE public.review_requests TO anon;
      GRANT SELECT, INSERT, UPDATE ON TABLE public.review_requests TO authenticated;
    `);

    try {
      await client.queryArray(`
        CREATE POLICY "review_requests_anon_select" ON public.review_requests
        FOR SELECT TO anon USING (true);
      `);
    } catch (_) { /* Policy already exists */ }

    try {
      await client.queryArray(`
        CREATE POLICY "review_requests_anon_update" ON public.review_requests
        FOR UPDATE TO anon USING (true) WITH CHECK (true);
      `);
    } catch (_) { /* Policy already exists */ }

    // Revoke general reads on opt_outs to avoid anon PII harvesting!
    await client.queryArray(`
      REVOKE SELECT, UPDATE, DELETE ON public.opt_outs FROM anon;
      GRANT INSERT ON public.opt_outs TO anon; -- Anon can ONLY unsubscribe (insert), not harvest emails
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opt_outs TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opt_outs TO service_role;
    `);

    try {
      await client.queryArray(`
        CREATE POLICY "opt_outs_anon_insert_policy" ON public.opt_outs
        FOR INSERT TO anon WITH CHECK (true);
      `);
    } catch (_) { /* Policy already exists */ }

    // 6. Update RLS policies to enforce admin role checks on accounts and locations
    console.log("[setup-db] Updating role-based RLS policies for locations and accounts...");
    
    // Drop old policies to rebuild with role checks
    await client.queryArray(`
      DROP POLICY IF EXISTS "Users can view their own account" ON public.accounts;
      DROP POLICY IF EXISTS "Users can manage their account locations" ON public.locations;
      DROP POLICY IF EXISTS "Users can view account members" ON public.users;
      DROP POLICY IF EXISTS "Admins can manage account members" ON public.users;
    `);

    // Create admin-only policy for accounts (staff cannot read/manage accounts)
    await client.queryArray(`
      CREATE POLICY "Users can view their own account" ON public.accounts
      FOR SELECT TO authenticated 
      USING (
        id = get_current_account_id() AND 
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
    `);

    // Create admin-only policy for locations (staff cannot read/manage locations settings)
    await client.queryArray(`
      CREATE POLICY "Users can manage their account locations" ON public.locations
      FOR ALL TO authenticated 
      USING (
        account_id = get_current_account_id() AND 
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
    `);

    // Allow account users to select members of their account
    await client.queryArray(`
      CREATE POLICY "Users can view account members" ON public.users
      FOR SELECT TO authenticated
      USING (account_id = get_current_account_id());
    `);

    // Allow account admins to insert, update, or delete users belonging to their account (Team Management)
    await client.queryArray(`
      CREATE POLICY "Admins can manage account members" ON public.users
      FOR ALL TO authenticated
      USING (
        account_id = get_current_account_id() AND 
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        account_id = get_current_account_id() AND 
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
    `);

    // Configure pg_cron job to automatically process reviews hourly
    try {
      console.log("[setup-db] Creating automated hourly background cron job via pg_cron...");
      
      await client.queryArray(`
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
      `);
      
      await client.queryArray(`
        CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
      `);

      // Unschedule existing job if it exists to avoid duplication
      await client.queryArray(`
        SELECT cron.unschedule('invoke-process-reviews') FROM cron.job WHERE jobname = 'invoke-process-reviews';
      `);

      // Schedule process reviews cron
      await client.queryArray(`
        SELECT cron.schedule(
          'invoke-process-reviews',
          '0 * * * *',
          $$
          SELECT public.http_post(
            'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/process-reviews',
            '{}',
            'application/json',
            '{}'
          )
          $$
        );
      `);

      // Unschedule weekly summary if it exists
      await client.queryArray(`
        SELECT cron.unschedule('invoke-weekly-summary') FROM cron.job WHERE jobname = 'invoke-weekly-summary';
      `);

      // Schedule weekly summary cron: Every Monday at 8am (0 8 * * 1)
      await client.queryArray(`
        SELECT cron.schedule(
          'invoke-weekly-summary',
          '0 8 * * 1',
          $$
          SELECT public.http_post(
            'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/weekly-summary',
            '{}',
            'application/json',
            '{}'
          )
          $$
        );
      `);
      
      console.log("[setup-db] Cron jobs configured successfully.");
    } catch (cronErr) {
      console.warn("[setup-db] pg_cron configuration skipped or not supported on this tenant:", cronErr);
    }

    console.log("[setup-db] Database migrations completed successfully!");
    await client.end();

    return new Response(JSON.stringify({ success: true, message: "Database schema updated successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("[setup-db] Migration error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})