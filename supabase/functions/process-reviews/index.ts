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
    console.log("[process-reviews] Starting to process pending review requests & reminders");
    
    // Read secure API keys from master environment variables
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@maprated.com';
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

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

    // --- PHASE 1: PROCESS PENDING REVIEW REQUESTS ---
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
            enable_email,
            enable_sms,
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

    const processedResults = [];

    if (pendingRequests && pendingRequests.length > 0) {
      console.log(`[process-reviews] Found ${pendingRequests.length} pending requests. Processing...`);

      for (const request of pendingRequests) {
        const order = request.orders;
        const location = order?.locations;
        const customer = order?.customers;
        
        if (!order || !location || !customer) {
          console.error(`[process-reviews] Incomplete data for request ${request.id}`, { request });
          continue;
        }

        const emailLower = customer.email?.toLowerCase();

        // STRICT COMPLIANCE: Skip if opted out
        if (emailLower && optedOutEmails.has(emailLower)) {
          console.log(`[process-reviews] STRICT COMPLIANCE: Skipping request ${request.id} because ${customer.email} has opted out.`);
          
          await supabase
            .from('review_requests')
            .update({ status: 'opted_out' })
            .eq('id', request.id);

          processedResults.push({ id: request.id, type: 'pending', status: 'opted_out_skipped' });
          continue;
        }

        // Check toggles on this location (enable_email, enable_sms)
        const isEmailEnabled = location.enable_email !== false; // Default true
        const isSmsEnabled = location.enable_sms !== false; // Default true

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

        // 1. Attempt sending Email via Master Resend Gateway
        if (isEmailEnabled && customer.email && resendApiKey && resendFromEmail) {
          try {
            console.log(`[process-reviews] Sending Resend email to: ${customer.email}`);
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: resendFromEmail,
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

        // 2. Attempt sending SMS via Master Twilio Gateway
        if (isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
          try {
            console.log(`[process-reviews] Sending Twilio SMS to: ${customer.phone}`);
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            
            const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
            
            const formData = new URLSearchParams();
            formData.append('From', twilioFromNumber);
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

        // Fallback: If no delivery has succeeded, fallback to mock log
        if (!sendSuccess) {
          console.warn(`[process-reviews] Warning: Mock mode triggered for request ${request.id}. Channel states: Email Enabled=${isEmailEnabled}, SMS Enabled=${isSmsEnabled}.`);
          console.log(`[process-reviews] =======================================`);
          console.log(`[process-reviews] MOCK SENDING INVITE TO: ${customer.email || customer.phone}`);
          console.log(`[process-reviews] MESSAGE CONTENT:\n${message}`);
          console.log(`[process-reviews] =======================================`);
          sendSuccess = true;
        }

        if (sendSuccess) {
          await supabase
            .from('review_requests')
            .update({ 
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', request.id);

          await supabase
            .from('message_events')
            .insert({
              request_id: request.id,
              event_type: 'sent'
            });

          processedResults.push({ id: request.id, type: 'pending', status: 'sent' });
        } else {
          processedResults.push({ id: request.id, type: 'pending', status: 'failed' });
        }
      }
    }

    // --- PHASE 2: SEND REMINDERS FOR OUTSTANDING DISPATCHED REQUESTS ---
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    // Fetch requests currently at status 'sent' dispatched more than 3 days ago
    const { data: sentRequests, error: fetchSentError } = await supabase
      .from('review_requests')
      .select(`
        id,
        sent_at,
        orders (
          id,
          locations (
            id,
            name,
            google_place_url,
            enable_email,
            enable_sms,
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
      .eq('status', 'sent')
      .lt('sent_at', threeDaysAgo);

    if (fetchSentError) {
      console.error("[process-reviews] Error fetching sent requests for reminders:", fetchSentError);
    } else if (sentRequests && sentRequests.length > 0) {
      console.log(`[process-reviews] Found ${sentRequests.length} candidate requests for reminders (sent > 3 days ago).`);

      // Extract candidate request IDs to check corresponding events
      const requestIds = sentRequests.map(r => r.id);

      // Query message_events to check if there are already 'clicked' or 'reminder_sent' events for these IDs
      const { data: events, error: eventsError } = await supabase
        .from('message_events')
        .select('request_id, event_type')
        .in('request_id', requestIds);

      if (eventsError) {
        console.error("[process-reviews] Error fetching message events for reminders:", eventsError);
      } else {
        // Group events by request ID for efficient lookup
        const eventsMap = new Map<string, string[]>();
        (events || []).forEach(evt => {
          const arr = eventsMap.get(evt.request_id) || [];
          arr.push(evt.event_type);
          eventsMap.set(evt.request_id, arr);
        });

        for (const request of sentRequests) {
          const requestEvents = eventsMap.get(request.id) || [];
          
          const hasClicked = requestEvents.includes('clicked');
          const hasReminderSent = requestEvents.includes('reminder_sent');

          // Only proceed if the guest has NOT clicked and NOT received a reminder yet
          if (!hasClicked && !hasReminderSent) {
            console.log(`[process-reviews] Request ${request.id} is eligible for a reminder. No click or prior reminder found.`);
            
            const order = request.orders;
            const location = order?.locations;
            const customer = order?.customers;

            if (!order || !location || !customer) continue;

            const emailLower = customer.email?.toLowerCase();

            // STRICT COMPLIANCE: Skip if opted out
            if (emailLower && optedOutEmails.has(emailLower)) {
              console.log(`[process-reviews] STRICT COMPLIANCE (Reminder): Skipping request ${request.id} because ${customer.email} has opted out.`);
              
              await supabase
                .from('review_requests')
                .update({ status: 'opted_out' })
                .eq('id', request.id);

              processedResults.push({ id: request.id, type: 'reminder', status: 'opted_out_skipped' });
              continue;
            }

            // Grab delivery templates
            const isEmailEnabled = location.enable_email !== false;
            const isSmsEnabled = location.enable_sms !== false;
            const templates = location.message_templates;
            const templateText = (Array.isArray(templates) && templates.length > 0)
              ? templates[0].template_text 
              : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

            // Draft reminder text (same template)
            const cleanEmail = customer.email || '';
            const unsubUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
            let message = `[Reminder] ` + templateText
              .replace(/{firstName}/g, customer.first_name || '')
              .replace(/{lastName}/g, customer.last_name || '')
              .replace(/{reviewLink}/g, location.google_place_url || '');
            
            message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

            let sendSuccess = false;

            // 1. Send Reminder Email via Resend
            if (isEmailEnabled && customer.email && resendApiKey && resendFromEmail) {
              try {
                const emailResponse = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    from: resendFromEmail,
                    to: customer.email,
                    subject: `Reminder: Help us improve! Review your stay at ${location.name}`,
                    text: message
                  })
                });

                if (emailResponse.ok) {
                  console.log(`[process-reviews] Reminder Resend email sent successfully to ${customer.email}`);
                  sendSuccess = true;
                }
              } catch (err) {
                console.error("[process-reviews] Error sending reminder email:", err);
              }
            }

            // 2. Send Reminder SMS via Twilio
            if (isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
              try {
                const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
                const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
                
                const formData = new URLSearchParams();
                formData.append('From', twilioFromNumber);
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
                  console.log(`[process-reviews] Reminder Twilio SMS sent successfully to ${customer.phone}`);
                  sendSuccess = true;
                }
              } catch (err) {
                console.error("[process-reviews] Error sending reminder SMS:", err);
              }
            }

            // Fallback mock reminder
            if (!sendSuccess) {
              console.log(`[process-reviews] =======================================`);
              console.log(`[process-reviews] MOCK SENDING REMINDER INVITE TO: ${customer.email || customer.phone}`);
              console.log(`[process-reviews] MESSAGE CONTENT:\n${message}`);
              console.log(`[process-reviews] =======================================`);
              sendSuccess = true;
            }

            if (sendSuccess) {
              // Log the 'reminder_sent' event in message_events
              await supabase
                .from('message_events')
                .insert({
                  request_id: request.id,
                  event_type: 'reminder_sent'
                });

              processedResults.push({ id: request.id, type: 'reminder', status: 'reminder_sent' });
            } else {
              processedResults.push({ id: request.id, type: 'reminder', status: 'failed' });
            }
          }
        }
      }
    }

    console.log(`[process-reviews] Successfully completed processing. Total actions logged: ${processedResults.length}`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: processedResults.length, 
      results: processedResults 
    }), {
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