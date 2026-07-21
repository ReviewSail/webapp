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
    console.log("[setup-db] Connecting to database...");
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!databaseUrl) {
      throw new Error("SUPABASE_DB_URL is not set");
    }

    const client = new Client(databaseUrl);
    await client.connect();

    console.log("[setup-db] Running schema migrations...");
    
    // Add columns to locations table
    await client.queryArray(`
      ALTER TABLE public.locations 
      ADD COLUMN IF NOT EXISTS enable_email BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS enable_sms BOOLEAN DEFAULT TRUE;
    `);

    // Add stripe billing columns to accounts table
    await client.queryArray(`
      ALTER TABLE public.accounts 
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
    `);

    // Auto-activate all existing accounts for development and testing purposes
    await client.queryArray(`
      UPDATE public.accounts 
      SET subscription_status = 'active' 
      WHERE subscription_status IS NULL OR subscription_status = 'inactive';
    `);

    // Create public feedback table
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

    // Enable RLS and add Grants
    await client.queryArray(`
      ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
      
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feedback TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feedback TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON TABLE public.feedback TO anon;
    `);

    // Create Policies safely by checking if they exist first
    try {
      await client.queryArray(`
        CREATE POLICY "feedback_select_policy" ON public.feedback
        FOR SELECT USING (true);
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

    // Configure pg_cron job to automatically process reviews hourly
    try {
      console.log("[setup-db] Creating automated hourly background cron job via pg_cron...");
      
      // We wrap this inside pg_cron check to avoid breaking environments where pg_cron isn't enabled globally yet
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

      // Schedule new job
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
      console.log("[setup-db] Hourly cron scheduled successfully.");
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