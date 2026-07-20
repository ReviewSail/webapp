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