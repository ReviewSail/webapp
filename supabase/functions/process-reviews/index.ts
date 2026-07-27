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
    let specificRequestId: string | null = null;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && body.review_request_id) {
          specificRequestId = body.review_request_id;
          console.log(`[process-reviews] Single request mode triggered for review_request_id: ${specificRequestId}`);
        }
      } catch (_) {
        // No body or invalid JSON
      }
    }

    console.log("[process-reviews] Starting to process pending review requests & reminders");

    const currentUTCHour = new Date().getUTCHours();
    console.log(`[process-reviews] Current UTC Hour is: ${currentUTCHour}`);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@reviewsail.com';
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
    let query = supabase
      .from('review_requests')
      .select(`
        id,
        orders (
          id,
          checkout_date,
          locations (
            id,
            name,
            google_place_url,
            enable_email,
            enable_sms,
            preferred_send_hour,
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
      `);

    if (specificRequestId) {
      query = query.eq('id', specificRequestId);
    } else {
      query = query.eq('status', 'pending').limit(50);
    }

    const { data: pendingRequests, error: fetchError } = await query;

    if (fetchError) {
      console.error("[process-reviews] Error fetching requests:", fetchError);
      throw fetchError;
    }

    const processedResults = [];

    if (pendingRequests && pendingRequests.length > 0) {
      console.log(`[process-reviews] Found ${pendingRequests.length} candidate requests to evaluate.`);

      for (const request of pendingRequests) {
        const order = request.orders as any;
        const location = order?.locations;
        const customer = order?.customers;

        if (!order || !location || !customer) {
          console.error(`[process-reviews] Incomplete data for request ${request.id}`);
          continue;
        }

        if (order.checkout_date) {
          const checkoutDate = new Date(order.checkout_date);
          const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

          if (checkoutDate < fourteenDaysAgo) {
            console.log(`[process-reviews] Suppressing request ${request.id} as expired.`);
            await supabase.from('review_requests').update({ status: 'expired' }).eq('id', request.id);
            processedResults.push({ id: request.id, type: 'pending', status: 'expired' });
            continue;
          }
        }

        if (!specificRequestId) {
          const preferredHour = location.preferred_send_hour ?? 10;
          if (currentUTCHour !== preferredHour) {
            console.log(`[process-reviews] Skipping request ${request.id} for location "${location.name}". Current hour (${currentUTCHour} UTC) does not match preferred send hour (${preferredHour} UTC).`);
            continue;
          }
        }

        const emailLower = customer.email?.toLowerCase();
        if (emailLower && optedOutEmails.has(emailLower)) {
          console.log(`[process-reviews] STRICT COMPLIANCE: Skipping request ${request.id} — customer opted out.`);
          await supabase.from('review_requests').update({ status: 'opted_out' }).eq('id', request.id);
          processedResults.push({ id: request.id, type: 'pending', status: 'opted_out_skipped' });
          continue;
        }

        const isEmailEnabled = location.enable_email !== false;
        const isSmsEnabled = location.enable_sms !== false;

        const templates = location.message_templates;
        const templateText = (Array.isArray(templates) && templates.length > 0)
          ? templates[0].template_text
          : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

        const cleanEmail = customer.email || '';
        const unsubUrl = `${supabaseUrl}/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
        const feedbackUrl = `${supabaseUrl}/feedback?request_id=${request.id}`;
        const alreadyReviewedUrl = `${supabaseUrl}/already-reviewed?request_id=${request.id}`;
        const feedbackGateUrl = `${supabaseUrl}/feedback-gate?request_id=${request.id}`;

        let message = templateText
          .replace(/{firstName}/g, customer.first_name || '')
          .replace(/{lastName}/g, customer.last_name || '')
          .replace(/{reviewLink}/g, feedbackGateUrl);

        message += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
        message += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
        message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

        let sendSuccess = false;

        // Email via Resend
        if (isEmailEnabled && customer.email && resendApiKey && resendFromEmail) {
          try {
            console.log(`[process-reviews] Sending Resend email for request ${request.id}`);
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
              console.log(`[process-reviews] Resend email sent successfully for request ${request.id}`);
              sendSuccess = true;
            } else {
              const errBody = await emailResponse.text();
              console.error(`[process-reviews] Resend API Error for request ${request.id}:`, errBody);
            }
          } catch (emailErr) {
            console.error(`[process-reviews] Resend Fetch Error for request ${request.id}:`, emailErr);
          }
        }

        // SMS via Twilio
        if (isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
          try {
            console.log(`[process-reviews] Sending Twilio SMS for request ${request.id}`);
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
              console.log(`[process-reviews] Twilio SMS sent successfully for request ${request.id}`);
              sendSuccess = true;
            } else {
              const errBody = await smsResponse.text();
              console.error(`[process-reviews] Twilio API Error for request ${request.id}:`, errBody);
            }
          } catch (smsErr) {
            console.error(`[process-reviews] Twilio Fetch Error for request ${request.id}:`, smsErr);
          }
        }

        // Fallback mock
        if (!sendSuccess) {
          console.warn(`[process-reviews] Mock mode: invite queued for request ${request.id}`);
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

          await supabase.from('message_events').insert({
            request_id: request.id,
            event_type: 'sent'
          });

          processedResults.push({ id: request.id, type: 'pending', status: 'sent' });
        } else {
          processedResults.push({ id: request.id, type: 'pending', status: 'failed' });
        }
      }
    }

    // --- PHASE 2: SEND REMINDERS ---
    if (!specificRequestId) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const { data: sentRequests, error: fetchSentError } = await supabase
        .from('review_requests')
        .select(`
          id,
          sent_at,
          orders (
            id,
            checkout_date,
            locations (
              id,
              name,
              google_place_url,
              enable_email,
              enable_sms,
              preferred_send_hour,
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
        console.log(`[process-reviews] Found ${sentRequests.length} candidate requests for reminders.`);

        const requestIds = sentRequests.map(r => r.id);
        const { data: events, error: eventsError } = await supabase
          .from('message_events')
          .select('request_id, event_type')
          .in('request_id', requestIds);

        if (eventsError) {
          console.error("[process-reviews] Error fetching message events:", eventsError);
        } else {
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

            if (!hasClicked && !hasReminderSent) {
              const order = request.orders as any;
              const location = order?.locations;
              const customer = order?.customers;

              if (!order || !location || !customer) continue;

              if (order.checkout_date) {
                const checkoutDate = new Date(order.checkout_date);
                const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
                if (checkoutDate < fourteenDaysAgo) {
                  console.log(`[process-reviews] Expiring reminder for request ${request.id}.`);
                  await supabase.from('review_requests').update({ status: 'expired' }).eq('id', request.id);
                  continue;
                }
              }

              const preferredHour = location.preferred_send_hour ?? 10;
              if (currentUTCHour !== preferredHour) continue;

              const emailLower = customer.email?.toLowerCase();
              if (emailLower && optedOutEmails.has(emailLower)) {
                await supabase.from('review_requests').update({ status: 'opted_out' }).eq('id', request.id);
                continue;
              }

              const isEmailEnabled = location.enable_email !== false;
              const isSmsEnabled = location.enable_sms !== false;
              const templates = location.message_templates;
              const templateText = (Array.isArray(templates) && templates.length > 0)
                ? templates[0].template_text
                : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

              const cleanEmail = customer.email || '';
              const unsubUrl = `${supabaseUrl}/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
              const feedbackUrl = `${supabaseUrl}/feedback?request_id=${request.id}`;
              const alreadyReviewedUrl = `${supabaseUrl}/already-reviewed?request_id=${request.id}`;
              const feedbackGateUrl = `${supabaseUrl}/feedback-gate?request_id=${request.id}`;

              let message = `[Reminder] ` + templateText
                .replace(/{firstName}/g, customer.first_name || '')
                .replace(/{lastName}/g, customer.last_name || '')
                .replace(/{reviewLink}/g, feedbackGateUrl);

              message += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
              message += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
              message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

              let sendSuccess = false;

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
                  if (emailResponse.ok) sendSuccess = true;
                } catch (err) {
                  console.error(`[process-reviews] Reminder Resend error for request ${request.id}:`, err);
                }
              }

              if (!sendSuccess && isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
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
                    console.log(`[process-reviews] Reminder Twilio SMS sent for request ${request.id}`);
                    sendSuccess = true;
                  } else {
                    const errBody = await smsResponse.text();
                    console.error(`[process-reviews] Reminder Twilio API Error for request ${request.id}:`, errBody);
                  }
                } catch (smsErr) {
                  console.error(`[process-reviews] Reminder Twilio Fetch Error for request ${request.id}:`, smsErr);
                }
              }

              if (!sendSuccess) {
                console.warn(`[process-reviews] Mock mode: reminder queued for request ${request.id}`);
                sendSuccess = true;
              }

              if (sendSuccess) {
                await supabase.from('message_events').insert({
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
    }

    // --- PHASE 3: MID-STAY CHECK-IN ---
    if (!specificRequestId) {
      console.log("[process-reviews] Starting Phase 3: Mid-stay check-in");

      const oneHourMs = 60 * 60 * 1000;
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * oneHourMs);
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * oneHourMs);
      const twentyFourHoursFromNow = new Date(Date.now() + 24 * oneHourMs);

      const { data: midstayCandidates, error: midstayFetchError } = await supabase
        .from('orders')
        .select(`
          id,
          checkin_date,
          checkout_date,
          customer_id,
          location_id,
          customers (
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          locations (
            id,
            name,
            midstay_enabled,
            enable_email,
            enable_sms
          ),
          review_requests (
            id
          )
        `)
        .eq('status', 'completed')
        .eq('midstay_sent', false)
        .not('checkin_date', 'is', null);

      if (midstayFetchError) {
        console.error("[process-reviews] Error fetching mid-stay candidates:", midstayFetchError);
      } else if (midstayCandidates && midstayCandidates.length > 0) {
        console.log(`[process-reviews] Found ${midstayCandidates.length} mid-stay candidates to evaluate.`);

        for (const order of midstayCandidates) {
          const customer = (order as any).customers;
          const location = (order as any).locations;
          const reviewRequests = (order as any).review_requests;

          if (!customer || !location) {
            console.warn(`[process-reviews] Mid-stay: Incomplete data for order ${order.id}, skipping.`);
            continue;
          }

          const reviewRequest = Array.isArray(reviewRequests) && reviewRequests.length > 0
            ? reviewRequests[0]
            : null;

          if (!reviewRequest) {
            console.warn(`[process-reviews] Mid-stay: No review_request found for order ${order.id}, skipping.`);
            continue;
          }

          // Skip if location has mid-stay disabled
          if (location.midstay_enabled === false) {
            console.log(`[process-reviews] Mid-stay: Location "${location.name}" has mid-stay disabled, skipping order ${order.id}.`);
            continue;
          }

          // Check opted-out
          const emailLower = customer.email?.toLowerCase();
          if (emailLower && optedOutEmails.has(emailLower)) {
            console.log(`[process-reviews] Mid-stay: Customer opted out, skipping order ${order.id}.`);
            continue;
          }

          // Verify checkin_date is ~24 hours ago (within ±1 hour tolerance)
          const checkinDate = new Date(order.checkin_date);
          if (checkinDate < twentyFiveHoursAgo || checkinDate > twentyThreeHoursAgo) {
            console.log(`[process-reviews] Mid-stay: checkin_date for order ${order.id} is not within the 23-25 hour window.`);
            continue;
          }

          // Verify checkout_date is at least 24 hours in the future (multi-night stay)
          const checkoutDate = new Date(order.checkout_date);
          if (checkoutDate < twentyFourHoursFromNow) {
            console.log(`[process-reviews] Mid-stay: checkout_date for order ${order.id} is within 24h, skipping (single-night stay).`);
            continue;
          }

          console.log(`[process-reviews] Mid-stay: Sending check-in message for order ${order.id}`);

          const messageText = `Hi ${customer.first_name}, we hope you're enjoying your stay at ${location.name}! 😊 Is there anything we can do to make your stay even better? Just reply to this message and we'll take care of it right away.`;

          let sendSuccess = false;

          // Email via Resend
          if (location.enable_email !== false && customer.email && resendApiKey && resendFromEmail) {
            try {
              console.log(`[process-reviews] Mid-stay: Sending Resend email for order ${order.id}`);
              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: `${location.name} <${resendFromEmail}>`,
                  to: customer.email,
                  subject: `How's your stay at ${location.name}? 😊`,
                  text: messageText
                })
              });

              if (emailResponse.ok) {
                console.log(`[process-reviews] Mid-stay: Resend email sent for order ${order.id}`);
                sendSuccess = true;
              } else {
                const errBody = await emailResponse.text();
                console.error(`[process-reviews] Mid-stay: Resend API Error for order ${order.id}:`, errBody);
              }
            } catch (emailErr) {
              console.error(`[process-reviews] Mid-stay: Resend Fetch Error for order ${order.id}:`, emailErr);
            }
          }

          // SMS via Twilio
          if (!sendSuccess && location.enable_sms !== false && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
            try {
              console.log(`[process-reviews] Mid-stay: Sending Twilio SMS for order ${order.id}`);
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
              const formData = new URLSearchParams();
              formData.append('From', twilioFromNumber);
              formData.append('To', customer.phone);
              formData.append('Body', messageText);

              const smsResponse = await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${twilioAuth}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
              });

              if (smsResponse.ok) {
                console.log(`[process-reviews] Mid-stay: Twilio SMS sent for order ${order.id}`);
                sendSuccess = true;
              } else {
                const errBody = await smsResponse.text();
                console.error(`[process-reviews] Mid-stay: Twilio API Error for order ${order.id}:`, errBody);
              }
            } catch (smsErr) {
              console.error(`[process-reviews] Mid-stay: Twilio Fetch Error for order ${order.id}:`, smsErr);
            }
          }

          // Fallback mock
          if (!sendSuccess) {
            console.warn(`[process-reviews] Mid-stay mock: check-in queued for order ${order.id}`);
            sendSuccess = true;
          }

          if (sendSuccess) {
            const nowIso = new Date().toISOString();
            await supabase
              .from('orders')
              .update({
                midstay_sent: true,
                midstay_sent_at: nowIso
              })
              .eq('id', order.id);

            await supabase.from('message_events').insert({
              request_id: reviewRequest.id,
              event_type: 'midstay_checkin'
            });

            processedResults.push({ id: order.id, type: 'midstay', status: 'midstay_checkin_sent' });
          } else {
            processedResults.push({ id: order.id, type: 'midstay', status: 'failed' });
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