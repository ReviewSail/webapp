import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log("[process-reviews] Starting to process pending review requests");
    
    // Use the service role key to bypass RLS, since this is a background job 
    // that needs to process requests across all accounts.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pending requests in a batch (e.g., 50 at a time)
    const { data: pendingRequests, error: fetchError } = await supabase
      .from('review_requests')
      .select(`
        id,
        orders (
          id,
          locations (
            id,
            name,
            google_place_url,
            message_templates ( template_text )
          ),
          customers (
            id,
            first_name,
            last_name,
            email,
            phone
          )
        )
      `)
      .eq('status', 'pending')
      .limit(50);

    if (fetchError) {
      console.error("[process-reviews] Error fetching pending requests:", fetchError);
      throw fetchError;
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log("[process-reviews] No pending requests found.");
      return new Response(JSON.stringify({ message: "No pending requests found.", processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`[process-reviews] Found ${pendingRequests.length} pending requests. Processing...`);

    const results = [];

    for (const request of pendingRequests) {
      const order = request.orders;
      const location = order?.locations;
      const customer = order?.customers;
      
      if (!order || !location || !customer) {
        console.error(`[process-reviews] Incomplete data for request ${request.id}`, { request });
        continue;
      }

      // Get template text (fallback if none found)
      // Supabase nested joins might return an array for one-to-many relationships
      const templates = location.message_templates;
      const templateText = (Array.isArray(templates) && templates.length > 0)
        ? templates[0].template_text 
        : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

      // Draft the message by replacing variables
      let message = templateText
        .replace(/{firstName}/g, customer.first_name || '')
        .replace(/{lastName}/g, customer.last_name || '')
        .replace(/{reviewLink}/g, location.google_place_url || '');

      // ==========================================
      // STUB: Replace this with real Resend/Twilio
      // ==========================================
      console.log(`[process-reviews] =======================================`);
      console.log(`[process-reviews] MOCK SENDING EMAIL TO: ${customer.email}`);
      console.log(`[process-reviews] MESSAGE CONTENT:\n${message}`);
      console.log(`[process-reviews] =======================================`);

      // 1. Update request status to 'sent'
      const { error: updateError } = await supabase
        .from('review_requests')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', request.id);

      if (updateError) {
        console.error(`[process-reviews] Failed to update request ${request.id}`, updateError);
        continue;
      }

      // 2. Log 'sent' message event for auditing
      const { error: eventError } = await supabase
        .from('message_events')
        .insert({
          request_id: request.id,
          event_type: 'sent'
        });

      if (eventError) {
        console.error(`[process-reviews] Failed to log message_event for ${request.id}`, eventError);
      }

      results.push({ id: request.id, status: 'sent' });
    }

    console.log(`[process-reviews] Successfully processed ${results.length} requests.`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[process-reviews] Unexpected error processing requests:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
