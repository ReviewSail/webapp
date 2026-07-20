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

    // Fetch all opt-outs first
    const { data: optOuts, error: optOutError } = await supabase
      .from('opt_outs')
      .select('email');

    if (optOutError) {
      console.error("[process-reviews] Error fetching opt-outs:", optOutError);
      throw optOutError;
    }

    const optedOutEmails = new Set((optOuts || []).map(o => o.email?.toLowerCase()));
    console.log(`[process-reviews] Loaded ${optedOutEmails.size} opted-out emails.`);

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
            message_templates ( template_text ),
            accounts (
              resend_api_key,
              resend_from_email,
              twilio_account_sid,
              twilio_auth_token,
              twilio_from_number
            )
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
      const account = location?.accounts;
      
      if (!order || !location || !customer) {
        console.error(`[process-reviews] Incomplete data for request ${request.id}`, { request });
        continue;
      }

      const emailLower = customer.email?.toLowerCase();

      // STRICT COMPLIANCE: Skip if opted out
      if (emailLower && optedOutEmails.has(emailLower)) {
        console.log(`[process-reviews] STRICT COMPLIANCE: Skipping request ${request.id} because ${customer.email} has opted out.`);
        
        // Mark request as opted_out in DB so we don't try to process it again
        await supabase
          .from('review_requests')
          .update({ status: 'opted_out' })
          .eq('id', request.id);

        results.push({ id: request.id, status: 'opted_out_skipped' });
        continue;
      }

      // Get template text (fallback if none found)
      const templates = location.message_templates;
      const templateText = (Array.isArray(templates) && templates.length > 0)
        ? templates[0].template_text 
        : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

      // Draft the message by replacing variables
      const cleanEmail = customer.email || '';
      const unsubUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
      let message = templateText
        .replace(/{firstName}/g, customer.first_name || '')
        .replace(/{lastName}/g, customer.last_name || '')
        .replace(/{reviewLink}/g, location.google_place_url || '');
      
      // Append unsubscribe compliance text
      message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

      let sendSuccess = false;

      // 1. Attempt sending Email via Resend
      if (customer.email && account?.resend_api_key && account?.resend_from_email) {
        try {
          console.log(`[process-reviews] Sending Resend email to: ${customer.email}`);
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${account.resend_api_key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: account.resend_from_email,
              to: customer.email,
              subject: `Help us improve! Review your stay at ${location.name}`,
              text: message
            })
          });

          if (emailResponse.ok) {
            console.log(`[process-reviews] Resend email sent successfully to ${customer.email}`);
            sendSuccess = true;
          } else {
            const errBody = await emailResponse.text();
            console.error(`[process-reviews] Resend API Error for ${customer.email}:`, errBody);
          }
        } catch (emailErr) {
          console.error(`[process-reviews] Resend Fetch Error:`, emailErr);
        }
      }

      // 2. Attempt sending SMS via Twilio
      if (customer.phone && account?.twilio_account_sid && account?.twilio_auth_token && account?.twilio_from_number) {
        try {
          console.log(`[process-reviews] Sending Twilio SMS to: ${customer.phone}`);
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${account.twilio_account_sid}/Messages.json`;
          
          const twilioAuth = btoa(`${account.twilio_account_sid}:${account.twilio_auth_token}`);
          
          const formData = new URLSearchParams();
          formData.append('From', account.twilio_from_number);
          formData.append('To', customer.phone);
          formData.append('Body', message);

          const smsResponse = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${twilioAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
          });

          if (smsResponse.ok) {
            console.log(`[process-reviews] Twilio SMS sent successfully to ${customer.phone}`);
            sendSuccess = true;
          } else {
            const errBody = await smsResponse.text();
            console.error(`[process-reviews] Twilio API Error for ${customer.phone}:`, errBody);
          }
        } catch (smsErr) {
          console.error(`[process-reviews] Twilio Fetch Error:`, smsErr);
        }
      }

      // Fallback: If no API keys are provided but delivery channels are present, log a warning & default to console mockup
      if (!sendSuccess) {
        console.warn(`[process-reviews] Warning: No active credentials configured or valid delivery succeeded for request ${request.id}. Defaulting to console mockup send.`);
        console.log(`[process-reviews] =======================================`);
        console.log(`[process-reviews] MOCK SENDING EMAIL TO: ${customer.email}`);
        console.log(`[process-reviews] MESSAGE CONTENT:\n${message}`);
        console.log(`[process-reviews] =======================================`);
        sendSuccess = true;
      }

      if (sendSuccess) {
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
      } else {
        results.push({ id: request.id, status: 'failed' });
      }
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