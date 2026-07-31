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

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@reviewsail.com';
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- AUTHENTICATION ---
    // Deployed with verify_jwt=false so pg_cron can reach it, so this function
    // must authenticate callers itself. Two legitimate callers:
    //   1. pg_cron, bearing CRON_SECRET  -> may run the full sweep.
    //   2. A signed-in user via triggerSingleResend -> single request they own.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronCaller = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronCaller) {
      if (!authHeader) {
        console.error("[process-reviews] Rejected unauthenticated invocation.");
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // A user JWT only ever authorizes the single-request resend path.
      if (!specificRequestId) {
        console.error("[process-reviews] Rejected user-initiated full sweep.");
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        console.error("[process-reviews] Rejected invalid user session.");
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // The service-role client below bypasses RLS, so ownership must be
      // checked explicitly — otherwise any signed-in user could resend any
      // other tenant's review request.
      const { data: ownedRequest } = await userClient
        .from('review_requests')
        .select('id')
        .eq('id', specificRequestId)
        .maybeSingle();

      if (!ownedRequest) {
        console.error(`[process-reviews] User ${user.id} is not permitted to resend request ${specificRequestId}.`);
        return new Response(JSON.stringify({ error: "Not found." }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log("[process-reviews] Starting to process pending review requests & reminders");

    const currentUTCHour = new Date().getUTCHours();
    console.log(`[process-reviews] Current UTC Hour is: ${currentUTCHour}`);

    /**
     * The send hour is the property's LOCAL hour. Comparing it against UTC — as
     * this used to — meant a host in Los Angeles who chose 10:00 had guests
     * emailed at 03:00 their time.
     */
    const localHourFor = (timezone: string | null | undefined): number => {
      if (!timezone) return new Date().getUTCHours();
      try {
        return Number(
          new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
          }).format(new Date()),
        ) % 24;
      } catch (_) {
        console.warn(`[process-reviews] Unknown timezone "${timezone}", falling back to UTC.`);
        return new Date().getUTCHours();
      }
    };

    /**
     * Today's calendar date at the property, as YYYY-MM-DD. 'en-CA' formats in
     * ISO order, so this needs no reassembly. Mid-stay scheduling compares
     * calendar days rather than instants, which is the only comparison that
     * survives a date-only checkin_date.
     */
    const localDateFor = (timezone: string | null | undefined): string => {
      const utcToday = new Date().toISOString().slice(0, 10);
      if (!timezone) return utcToday;
      try {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
      } catch (_) {
        console.warn(`[process-reviews] Unknown timezone "${timezone}", falling back to UTC.`);
        return utcToday;
      }
    };

    /**
     * checkin_date and checkout_date are timestamptz columns that only ever
     * hold midnight UTC of the date the host typed. They must be read back in
     * UTC: rendering them in a negative-offset zone would move every stay a day
     * earlier.
     */
    const utcDateOnly = (value: string | null | undefined): string | null => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    };

    /** Calendar arithmetic on a YYYY-MM-DD string, via UTC so DST cannot shift it. */
    const addDays = (dateStr: string, days: number): string => {
      const shifted = new Date(`${dateStr}T00:00:00Z`);
      shifted.setUTCDate(shifted.getUTCDate() + days);
      return shifted.toISOString().slice(0, 10);
    };

    // Guest-facing links must point at the web app, not the Supabase API host.
    const appUrl = (Deno.env.get('APP_URL') || supabaseUrl).replace(/\/+$/, '');

    /**
     * Base64url of the request UUID's 16 raw bytes: 36 hex characters become 22,
     * taking the link from 97 characters to 60. Mirrors src/lib/shortLink.ts —
     * keep the two in step or the links resolve to nothing.
     */
    const shortCode = (uuid: string): string | null => {
      const hex = uuid.replace(/-/g, '');
      if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
      let binary = '';
      for (let i = 0; i < 32; i += 2) {
        binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const DEFAULT_EMAIL_TEMPLATE =
      "Hi {firstName}, thanks for staying at {locationName}! If you have a moment, we'd love to hear how it went: {reviewLink}";
    // GSM-7 only, and short enough to bill as a single segment. An em-dash,
    // curly apostrophe or emoji here would force UCS-2 and halve capacity.
    const DEFAULT_SMS_TEMPLATE =
      'Hi {firstName}, thanks for staying at {locationName}! How did we do? {reviewLink} Reply STOP to opt out';
    const DEFAULT_SMS_REMINDER_TEMPLATE =
      'Hi {firstName}, still keen to hear how your stay at {locationName} went: {reviewLink} Reply STOP to opt out';

    type TemplateType = 'email' | 'sms' | 'sms_reminder';

    const TEMPLATE_FALLBACKS: Record<TemplateType, string> = {
      email: DEFAULT_EMAIL_TEMPLATE,
      sms: DEFAULT_SMS_TEMPLATE,
      sms_reminder: DEFAULT_SMS_REMINDER_TEMPLATE,
    };

    /** Picks the template for a channel; falls back when no row exists yet. */
    const templateFor = (location: any, type: TemplateType): string => {
      const rows = Array.isArray(location?.message_templates) ? location.message_templates : [];
      const match = rows.find((t: any) => t?.type === type);
      if (match?.template_text) return match.template_text;
      // A location that never customized its reminder still gets reminder copy
      // rather than the invite wording.
      return TEMPLATE_FALLBACKS[type];
    };

    const fillTemplate = (
      template: string,
      customer: any,
      location: any,
      reviewLink: string,
    ): string =>
      template
        .replace(/{firstName}/g, customer?.first_name || '')
        .replace(/{lastName}/g, customer?.last_name || '')
        .replace(/{locationName}/g, location?.name || '')
        .replace(/{reviewLink}/g, reviewLink);

    /** Digits-only phone key, so +1 (555) 010-0 and +15550100 match. */
    const phoneKey = (phone: string | null | undefined): string =>
      (phone || '').replace(/\D/g, '');

    const { data: optOuts, error: optOutError } = await supabase
      .from('opt_outs')
      .select('email, phone');

    if (optOutError) {
      console.error("[process-reviews] Error fetching opt-outs:", optOutError);
      throw optOutError;
    }

    const optedOutEmails = new Set(
      (optOuts || []).map(o => o.email?.toLowerCase()).filter(Boolean),
    );
    // Phone opt-outs were previously loaded but never checked, so guests who
    // unsubscribed kept receiving SMS.
    const optedOutPhones = new Set(
      (optOuts || []).map(o => phoneKey(o.phone)).filter(p => p.length > 0),
    );
    console.log(`[process-reviews] Loaded ${optedOutEmails.size} opted-out emails, ${optedOutPhones.size} opted-out phones.`);

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
            timezone,
            message_templates ( type, template_text )
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
          const localHour = localHourFor(location.timezone);
          if (localHour !== preferredHour) {
            console.log(`[process-reviews] Skipping request ${request.id} for location "${location.name}". Local hour (${localHour} in ${location.timezone || 'UTC'}) does not match preferred send hour (${preferredHour}).`);
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

        const cleanEmail = customer.email || '';
        // Carries the request, not the address. The address used to travel in
        // the query string, which meant anyone could unsubscribe anyone simply
        // by editing the link.
        const unsubUrl = `${appUrl}/unsubscribe?request_id=${request.id}`;
        const feedbackUrl = `${appUrl}/feedback?request_id=${request.id}`;
        const alreadyReviewedUrl = `${appUrl}/already-reviewed?request_id=${request.id}`;
        const feedbackGateUrl = `${appUrl}/feedback-gate?request_id=${request.id}`;
        const code = shortCode(request.id);
        const smsReviewLink = code ? `${appUrl}/r/${code}` : feedbackGateUrl;

        // Email can afford the extra links; SMS cannot. Previously both shared
        // one body, so every text carried four URLs and billed five segments.
        let emailMessage = fillTemplate(templateFor(location, 'email'), customer, location, feedbackGateUrl);
        emailMessage += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
        emailMessage += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
        emailMessage += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

        // The gate already offers the private-feedback path, so one link is
        // enough. STOP is the SMS-native opt-out and what A2P 10DLC expects.
        const smsMessage = fillTemplate(templateFor(location, 'sms'), customer, location, smsReviewLink);

        // SMS bills per 160-character segment, so length is a cost signal worth
        // having in the logs.
        console.log(`[process-reviews] Request ${request.id} composed | EMAIL(${emailMessage.length}): ${emailMessage.slice(0, 90)} | SMS(${smsMessage.length}): ${smsMessage}`);

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
                text: emailMessage
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
        const smsOptedOut = optedOutPhones.has(phoneKey(customer.phone));
        if (smsOptedOut && customer.phone) {
          console.log(`[process-reviews] Skipping SMS for request ${request.id} — phone opted out.`);
        }

        if (!smsOptedOut && isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
          try {
            console.log(`[process-reviews] Sending Twilio SMS for request ${request.id} (${smsMessage.length} chars)`);
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
            const formData = new URLSearchParams();
            formData.append('From', twilioFromNumber);
            formData.append('To', customer.phone);
            formData.append('Body', smsMessage);

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

          processedResults.push({
            id: request.id,
            type: 'pending',
            status: 'sent',
            // Single-request mode is the "send a test to myself" path, so hand
            // back exactly what was composed. Omitted for the bulk cron sweep,
            // which would otherwise dump every guest's message into the log.
            ...(specificRequestId
              ? {
                  emailPreview: emailMessage,
                  // Suppressed rather than composed-and-sent, so the caller can
                  // tell an opt-out apart from a missing Twilio credential.
                  smsPreview: smsOptedOut ? null : smsMessage,
                  smsSuppressedReason: smsOptedOut ? 'phone_opted_out' : null,
                }
              : {}),
          });
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
              timezone,
              message_templates ( type, template_text )
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
              if (localHourFor(location.timezone) !== preferredHour) continue;

              const emailLower = customer.email?.toLowerCase();
              if (emailLower && optedOutEmails.has(emailLower)) {
                await supabase.from('review_requests').update({ status: 'opted_out' }).eq('id', request.id);
                continue;
              }

              const isEmailEnabled = location.enable_email !== false;
              const isSmsEnabled = location.enable_sms !== false;

              const cleanEmail = customer.email || '';
              const unsubUrl = `${appUrl}/unsubscribe?request_id=${request.id}`;
              const feedbackUrl = `${appUrl}/feedback?request_id=${request.id}`;
              const alreadyReviewedUrl = `${appUrl}/already-reviewed?request_id=${request.id}`;
              const feedbackGateUrl = `${appUrl}/feedback-gate?request_id=${request.id}`;
              const code = shortCode(request.id);
              const smsReviewLink = code ? `${appUrl}/r/${code}` : feedbackGateUrl;

              let emailMessage = `[Reminder] ` + fillTemplate(
                templateFor(location, 'email'), customer, location, feedbackGateUrl,
              );
              emailMessage += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
              emailMessage += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
              emailMessage += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

              // No "[Reminder]" prefix on SMS — it wastes 11 of 160 characters
              // and reads oddly in a text. The reminder template says it in prose.
              const smsMessage = fillTemplate(
                templateFor(location, 'sms_reminder'), customer, location, smsReviewLink,
              );

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
                      text: emailMessage
                    })
                  });
                  if (emailResponse.ok) sendSuccess = true;
                } catch (err) {
                  console.error(`[process-reviews] Reminder Resend error for request ${request.id}:`, err);
                }
              }

              const reminderSmsOptedOut = optedOutPhones.has(phoneKey(customer.phone));
              if (reminderSmsOptedOut && customer.phone) {
                console.log(`[process-reviews] Skipping reminder SMS for request ${request.id} — phone opted out.`);
              }

              if (!sendSuccess && !reminderSmsOptedOut && isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
                try {
                  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
                  const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
                  const formData = new URLSearchParams();
                  formData.append('From', twilioFromNumber);
                  formData.append('To', customer.phone);
                  formData.append('Body', smsMessage);

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

      /**
       * Day 1 of a stay is the arrival day, so the furthest a check-in can be
       * scheduled is 6 days after arrival (midstay_day 7). One extra day either
       * side covers timezones running behind or ahead of UTC. Anything outside
       * this range can never become eligible, and previously the query dragged
       * all of it back every hour: no bound, no limit, no index, and rows that
       * age out keep midstay_sent = false forever.
       */
      const oneDayMs = 24 * 60 * 60 * 1000;
      const earliestCheckin = new Date(Date.now() - 9 * oneDayMs).toISOString();
      const latestCheckin = new Date(Date.now() + oneDayMs).toISOString();

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
            midstay_day,
            preferred_send_hour,
            timezone,
            enable_email,
            enable_sms
          ),
          review_requests (
            id
          )
        `)
        .eq('status', 'completed')
        .eq('midstay_sent', false)
        .not('checkin_date', 'is', null)
        .gte('checkin_date', earliestCheckin)
        .lte('checkin_date', latestCheckin)
        .limit(200);

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

          if (location.midstay_enabled === false) {
            console.log(`[process-reviews] Mid-stay: Location "${location.name}" has mid-stay disabled, skipping order ${order.id}.`);
            continue;
          }

          const emailLower = customer.email?.toLowerCase();
          if (emailLower && optedOutEmails.has(emailLower)) {
            console.log(`[process-reviews] Mid-stay: Customer opted out, skipping order ${order.id}.`);
            continue;
          }

          const checkinDay = utcDateOnly(order.checkin_date);
          if (!checkinDay) {
            console.warn(`[process-reviews] Mid-stay: Unreadable checkin_date for order ${order.id}, skipping.`);
            continue;
          }

          // Day 1 is the arrival day, so day N is (N - 1) days after it.
          const midstayDay = location.midstay_day ?? 2;
          const sendDay = addDays(checkinDay, midstayDay - 1);

          // A check-in the guest cannot act on is worse than none: they need at
          // least the night after it to see something put right. This replaces
          // the old "checkout within 24h" guard, which measured from the sweep
          // rather than from the day the message actually goes out.
          const checkoutDay = utcDateOnly(order.checkout_date);
          if (checkoutDay && checkoutDay <= sendDay) {
            console.log(`[process-reviews] Mid-stay: order ${order.id} checks out ${checkoutDay}, on or before its day-${midstayDay} send date (${sendDay}). Skipping.`);
            continue;
          }

          const localDate = localDateFor(location.timezone);
          if (localDate !== sendDay) {
            console.log(`[process-reviews] Mid-stay: order ${order.id} sends on ${sendDay} (day ${midstayDay} of the stay); it is ${localDate} at "${location.name}". Skipping.`);
            continue;
          }

          /**
           * At or past the hour, not exactly on it. An exact match would drop
           * the guest entirely if one hourly sweep failed; this catches up for
           * the rest of the local day and still guarantees nothing goes out
           * before the property's chosen hour — which is what keeps mid-stay
           * SMS off a guest's phone at 3am.
           */
          const preferredHour = location.preferred_send_hour ?? 10;
          const localHour = localHourFor(location.timezone);
          if (localHour < preferredHour) {
            console.log(`[process-reviews] Mid-stay: order ${order.id} is due today but it is only ${localHour}:00 at "${location.name}" (sends from ${preferredHour}:00). Skipping.`);
            continue;
          }

          console.log(`[process-reviews] Mid-stay: Sending check-in message for order ${order.id}`);

          // Email can carry the emoji and the longer prose; SMS cannot. A single
          // emoji forces UCS-2, cutting a segment from 160 characters to 70 —
          // this message used to bill 3 segments for 186 characters.
          const midstayEmailText = `Hi ${customer.first_name}, we hope you're enjoying your stay at ${location.name}! 😊 Is there anything we can do to make your stay even better? Just reply to this message and we'll take care of it right away.`;
          const midstaySmsText = `Hi ${customer.first_name}, hope your stay at ${location.name} is going well! Anything we can do to improve it? Just reply. Reply STOP to opt out`;

          let sendSuccess = false;

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
                  text: midstayEmailText
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

          const midstaySmsOptedOut = optedOutPhones.has(phoneKey(customer.phone));
          if (midstaySmsOptedOut && customer.phone) {
            console.log(`[process-reviews] Mid-stay: Skipping SMS for order ${order.id} — phone opted out.`);
          }

          if (!sendSuccess && !midstaySmsOptedOut && location.enable_sms !== false && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
            try {
              console.log(`[process-reviews] Mid-stay: Sending Twilio SMS for order ${order.id} (${midstaySmsText.length} chars)`);
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
              const formData = new URLSearchParams();
              formData.append('From', twilioFromNumber);
              formData.append('To', customer.phone);
              formData.append('Body', midstaySmsText);

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