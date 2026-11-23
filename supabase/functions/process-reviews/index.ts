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

    /**
     * Has the guest actually left?
     *
     * Every OTA export is forward-looking — a Booking.com or Airbnb reservations
     * download is mostly stays that have not happened yet. Phase 1 only ever
     * asked whether a stay was *too old* (>14 days) and treated everything else
     * as ready, so the first import an owner ever did sent "thanks for staying"
     * to guests who had not arrived. Phase 3 learned this in migration 0022 and
     * compares calendar days at the property; Phases 1 and 2 now do the same.
     *
     * Compared as calendar days, not instants: checkout_date holds midnight UTC
     * of the date the host typed. Automatic messages start the next local day;
     * explicit manual initial sends can still be made on checkout day.
     */
    const hasCheckedOut = (order: any, location: any, manual = false): boolean => {
      const checkoutDay = utcDateOnly(order?.checkout_date);
      // Missing checkout dates cannot establish that the stay has finished.
      if (!checkoutDay) return false;
      const localDay = localDateFor(location?.timezone);
      return manual ? checkoutDay <= localDay : checkoutDay < localDay;
    };

    // Manual calls check one account. Automatic selection and every channel's
    // claim check billing in SQL, avoiding a truncated global account allowlist.
    const canSend = async (location: any): Promise<boolean> => {
      // EGRESS-COST: low — one owning account, only for a manual send.
      const { data, error } = await supabase.from('accounts').select('id')
        .eq('id', location?.account_id).in('subscription_status', ['active', 'trialing']).limit(1);
      if (error) throw error;
      return !!data?.some(account => account.id === location?.account_id);
    };

    const dueCandidates = async (phase: 'initial' | 'reminder' | 'midstay' | 'arrival'):
      Promise<{ request_id: string; order_id: string }[]> => {
      // EGRESS-COST: low — fixed work batch, at most 50 IDs, not a guest-list
      // pagination loop. Eligibility/fairness are evaluated BEFORE the limit.
      const { data, error } = await supabase.rpc('select_due_guest_messages', {
        p_phase: phase, p_email_ready: !!resendApiKey && !!resendFromEmail,
        p_sms_ready: !!twilioAccountSid && !!twilioAuthToken && !!twilioFromNumber, p_limit: 50,
      });
      if (error) throw error; // Never fall back to the old unfiltered first page.
      if (!Array.isArray(data) || data.length > 50 || data.some(row =>
        typeof row?.request_id !== 'string' || typeof row?.order_id !== 'string')) {
        throw new Error('Invalid scheduled candidate response; sending stopped.');
      }
      return data;
    };


    type ChannelOutcome = {
      status: 'accepted' | 'failed' | 'skipped' | 'configuration_error';
      reason?: string;
      providerId?: string;
      reused?: boolean;
      recordingFailed?: boolean;
    };

    // Every phase uses the same acceptance rules. HTTP success is not delivery:
    // retain the provider ID and expose per-channel outcomes to manual callers.
    const sendChannels = async (
      orderId: string, requestId: string, phase: 'initial' | 'reminder' | 'midstay' | 'arrival',
      location: any, customer: any, subject: string, emailText: string, smsText: string,
      emailFrom: string = resendFromEmail,
    ): Promise<{ email: ChannelOutcome; sms: ChannelOutcome }> => {
      const sendChannel = async (channel: 'email' | 'sms'): Promise<ChannelOutcome> => {
        const enabled = channel === 'email' ? location.enable_email !== false : location.enable_sms !== false;
        const destination = channel === 'email' ? customer.email?.trim() : customer.phone?.trim();
        if (!enabled) return { status: 'skipped', reason: 'channel_disabled' };
        if (!destination) return { status: 'skipped', reason: 'missing_destination' };
        if (channel === 'sms' && optedOutPhones.has(phoneKey(destination))) {
          return { status: 'skipped', reason: 'phone_opted_out' };
        }
        const configured = channel === 'email'
          ? !!resendApiKey && !!resendFromEmail
          : !!twilioAccountSid && !!twilioAuthToken && !!twilioFromNumber;
        if (!configured) return { status: 'configuration_error', reason: 'missing_credentials' };

        // Durable, non-expiring guard, shared by manual sends and cron workers.
        // A lost claim response must fail closed too: the claim may have committed.
        const claimToken = crypto.randomUUID();
        try {
          // EGRESS-COST: low — one stay/channel claim and a bounded JSON result.
          const { data: claim, error } = await supabase.rpc('claim_message_send', {
            p_order_id: orderId, p_request_id: requestId, p_phase: phase, p_channel: channel,
            p_claim_token: claimToken, p_destination: destination, p_manual: !!specificRequestId,
          });
          if (error || !claim || typeof claim.claimed !== 'boolean') {
            return { status: 'failed', reason: 'claim_unavailable' };
          }
          if (!claim.claimed) {
            if (claim.state === 'accepted' && typeof claim.providerId === 'string' && claim.providerId.trim()) {
              return { status: 'accepted', providerId: claim.providerId, reused: true, reason: 'already_accepted' };
            }
            return { status: 'failed', reason: claim.reason || 'previous_attempt_requires_review' };
          }
        } catch {
          return { status: 'failed', reason: 'claim_unavailable' };
        }

        let outcome: ChannelOutcome;
        try {
          let response: Response;
          if (channel === 'email') {
            response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json',
                // Provider-side defense in depth; the durable DB guard outlives
                // Resend's 24-hour key retention. Never rely on the key alone.
                'Idempotency-Key': `reviewsail/${orderId}/${phase}/${channel}`,
              },
              signal: AbortSignal.timeout(15000),
              body: JSON.stringify({ from: emailFrom, to: destination, subject, text: emailText }),
            });
          } else {
            response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ From: twilioFromNumber!, To: destination, Body: smsText }).toString(),
              signal: AbortSignal.timeout(15000),
            });
          }
          if (!response.ok) {
            console.error(`[process-reviews] ${channel} provider rejected request: HTTP ${response.status}`);
            // 5xx/408 can follow provider-side acceptance, so treat as unknown.
            outcome = { status: 'failed', reason: response.status >= 500 || response.status === 408
              ? 'outcome_unknown' : 'provider_rejected' };
          } else {
            const payload = await response.json();
            const providerId = channel === 'email' ? payload?.id : payload?.sid;
            if (channel === 'sms' && ['failed', 'undelivered', 'canceled'].includes(payload?.status)) {
              outcome = { status: 'failed', reason: 'provider_rejected' };
            } else if (typeof providerId !== 'string' || !providerId.trim()) {
              outcome = { status: 'failed', reason: 'outcome_unknown' };
            } else {
              outcome = { status: 'accepted', providerId };
            }
          }
        } catch {
          // A timeout/malformed response can follow acceptance. Never claim
          // delivery or suggest immediate repeated clicks in this case.
          outcome = { status: 'failed', reason: 'outcome_unknown' };
        }

        try {
          // EGRESS-COST: low — acceptance, request state and one phase event
          // commit atomically. A failure retains the original no-retry claim.
          const { data: recorded, error } = await supabase.rpc('finish_message_send', {
            p_order_id: orderId, p_phase: phase, p_channel: channel, p_claim_token: claimToken,
            p_state: outcome.status === 'accepted' ? 'accepted'
              : outcome.reason === 'provider_rejected' ? 'rejected' : 'unknown',
            p_provider_id: outcome.providerId ?? null, p_reason: outcome.reason ?? null,
          });
          if (error || recorded !== true) return { ...outcome, recordingFailed: true };
        } catch {
          return { ...outcome, recordingFailed: true };
        }
        return outcome;
      };
      // Each channel has its own guard. A partial result never re-sends an
      // accepted channel, even if another worker selected this stay earlier.
      return { email: await sendChannel('email'), sms: await sendChannel('sms') };
    };

    const hasAcceptance = (channels: { email: ChannelOutcome; sms: ChannelOutcome }) =>
      Object.values(channels).some(channel => channel.status === 'accepted');
    const hasNewAcceptance = (channels: { email: ChannelOutcome; sms: ChannelOutcome }) =>
      Object.values(channels).some(channel => channel.status === 'accepted' && !channel.reused);
    const unsuccessfulStatus = (channels: { email: ChannelOutcome; sms: ChannelOutcome }) =>
      Object.values(channels).some(channel => channel.recordingFailed) ? 'recording_failed'
        : Object.values(channels).some(channel => ['claim_unavailable', 'previous_attempt_requires_review',
          'historical_send_requires_review'].includes(channel.reason || '')) ? 'send_held'
        : Object.values(channels).some(channel => channel.reason === 'not_eligible') ? 'eligibility_changed'
        : Object.values(channels).some(channel => channel.status === 'failed') ? 'send_failed'
        : Object.values(channels).some(channel => channel.status === 'configuration_error') ? 'configuration_error'
        : 'send_skipped';

    // --- PHASE 1: PROCESS PENDING REVIEW REQUESTS ---
    let query = supabase
      .from('review_requests')
      .select(`
        id,
        orders (
          id,
          checkout_date,
          source,
          locations (
            id,
            account_id,
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

    /**
     * Statuses a manual resend may target. Mirrors RESENDABLE_STATUSES in
     * src/context/ReviewSailContext.tsx — keep the two in step.
     *
     * Single-request mode previously applied no status filter at all, so the
     * dashboard's resend button would re-send to a guest who had clicked
     * "Already left us a review? We won't contact you again", and flip the row
     * back to 'sent'. `opted_out` was caught further down by the opt-out table
     * check, but `already_reviewed` was not caught anywhere.
     */
    const RESENDABLE_STATUSES = ['pending', 'sent'];

    if (specificRequestId) {
      query = query.eq('id', specificRequestId).in('status', RESENDABLE_STATUSES);
    } else {
      const candidates = await dueCandidates('initial');
      query = query.eq('status', 'pending').in('id', candidates.map(row => row.request_id)).order('id').limit(50);
    }

    const { data: pendingRequests, error: fetchError } = await query;

    if (fetchError) {
      console.error("[process-reviews] Error fetching requests:", fetchError);
      throw fetchError;
    }

    // Ownership was already verified above, so an empty result here means the
    // row exists but is not resendable. Say so plainly — reporting a no-op as a
    // successful send is what put a tick next to "resent" on guests who had
    // opted out.
    if (specificRequestId && (!pendingRequests || pendingRequests.length === 0)) {
      console.log(`[process-reviews] Refusing resend of ${specificRequestId}: not in a resendable state.`);
      return new Response(JSON.stringify({
        error: "This guest has already responded or opted out, so the invite can't be sent again.",
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
          if (specificRequestId) processedResults.push({ id: request.id, status: 'incomplete_data' });
          continue;
        }

        if (!specificRequestId && order.source === 'reviewsail_test') continue;

        if (order.checkout_date) {
          const checkoutDate = utcDateOnly(order.checkout_date);
          const fourteenDaysAgo = addDays(localDateFor(location.timezone), -14);

          if (checkoutDate && checkoutDate < fourteenDaysAgo) {
            console.log(`[process-reviews] Suppressing request ${request.id} as expired.`);
            await supabase.from('review_requests').update({ status: 'expired' }).eq('id', request.id);
            processedResults.push({ id: request.id, type: 'pending', status: 'expired' });
            continue;
          }
        }

        // Stay is still ahead of the guest. Leave it pending — it becomes
        // sendable automatically the local day after checkout. An explicit
        // manual initial send may still be made on checkout day.
        if (!hasCheckedOut(order, location, !!specificRequestId)) {
          if (specificRequestId) processedResults.push({ id: request.id, status: 'not_due' });
          console.log(`[process-reviews] Request ${request.id} checks out ${utcDateOnly(order.checkout_date)}; holding until after checkout.`);
          continue;
        }

        // A manual resend from the dashboard still respects billing — the
        // button is only reachable by an account that can see the dashboard,
        // but the plan is what authorises the send.
        if (specificRequestId && !await canSend(location)) {
          if (specificRequestId) processedResults.push({ id: request.id, status: 'billing_blocked' });
          console.log(`[process-reviews] Request ${request.id} held: account ${location.account_id} has no active plan.`);
          continue;
        }

        if (!specificRequestId) {
          const preferredHour = location.preferred_send_hour ?? 10;
          const localHour = localHourFor(location.timezone);
          if (localHour < preferredHour || localHour >= Math.min(preferredHour + 4, 24)) {
            console.log(`[process-reviews] Skipping request ${request.id} for location "${location.name}". Local hour (${localHour} in ${location.timezone || 'UTC'}) is outside the send window starting at ${preferredHour}.`);
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
        console.log(`[process-reviews] Request ${request.id} composed | EMAIL(${emailMessage.length}) | SMS(${smsMessage.length})`);

        const channels = await sendChannels(
          order.id, request.id, 'initial',
          location, customer, `Help us improve! Review your stay at ${location.name}`, emailMessage, smsMessage,
        );
        if (!hasAcceptance(channels) || Object.values(channels).some(channel => channel.recordingFailed)) {
          processedResults.push({ id: request.id, type: 'pending', status: unsuccessfulStatus(channels), channels });
          continue;
        }

        // Status/events were committed by the per-channel completion RPC.
        processedResults.push({
          id: request.id,
          type: 'pending',
          status: hasNewAcceptance(channels) ? 'sent' : 'already_sent',
          channels,
          // Single-request mode is the "send a test to myself" path, so hand
          // back exactly what was composed. Omitted for the bulk cron sweep,
          // which would otherwise dump every guest's message into the log.
          ...(specificRequestId
            ? {
                emailPreview: channels.email.status === 'accepted' ? emailMessage : null,
                // Suppressed rather than composed-and-sent, so the caller can
                // tell an opt-out apart from a missing Twilio credential.
                smsPreview: channels.sms.status === 'accepted' ? smsMessage : null,
                smsSuppressedReason: channels.sms.reason ?? null,
              }
            : {}),
        });
      }
    }

    // --- PHASE 2: SEND REMINDERS ---
    if (!specificRequestId) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const reminderKeys = await dueCandidates('reminder');

      const { data: sentRequests, error: fetchSentError } = await supabase
        .from('review_requests')
        .select(`
          id,
          sent_at,
          orders (
            id,
            checkout_date,
            source,
            locations (
              id,
              account_id,
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
        .lt('sent_at', threeDaysAgo)
        .in('id', reminderKeys.map(row => row.request_id)).order('id').limit(50);

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

              if (!order || !location || !customer || order.source === 'reviewsail_test') continue;

              if (order.checkout_date) {
                const checkoutDate = utcDateOnly(order.checkout_date);
                const fourteenDaysAgo = addDays(localDateFor(location.timezone), -14);
                if (checkoutDate && checkoutDate < fourteenDaysAgo) {
                  console.log(`[process-reviews] Expiring reminder for request ${request.id}.`);
                  await supabase.from('review_requests').update({ status: 'expired' }).eq('id', request.id);
                  continue;
                }
              }

              // Same gate as Phase 1: never chase a review for a stay that has
              // not finished.
              if (!hasCheckedOut(order, location)) continue;

              const preferredHour = location.preferred_send_hour ?? 10;
              const reminderHour = localHourFor(location.timezone);
              if (reminderHour < preferredHour || reminderHour >= Math.min(preferredHour + 4, 24)) continue;

              const emailLower = customer.email?.toLowerCase();
              if (emailLower && optedOutEmails.has(emailLower)) {
                await supabase.from('review_requests').update({ status: 'opted_out' }).eq('id', request.id);
                continue;
              }

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

              const channels = await sendChannels(
                order.id, request.id, 'reminder',
                location, customer, `Reminder: Help us improve! Review your stay at ${location.name}`, emailMessage, smsMessage,
              );
              if (!hasAcceptance(channels) || Object.values(channels).some(channel => channel.recordingFailed)) {
                processedResults.push({ id: request.id, type: 'reminder', status: unsuccessfulStatus(channels), channels });
                continue;
              }

              processedResults.push({ id: request.id, type: 'reminder', status: 'reminder_sent', channels });
            }
          }
        }
      }
    }

    // --- PHASE 3: MID-STAY CHECK-IN ---
    if (!specificRequestId) {
      console.log("[process-reviews] Starting Phase 3: Mid-stay check-in");

      // SQL filters local timing, cancellation, suppression and existing claims
      // before choosing a fair, fixed-size batch. Fetch details only for it.
      for (const phase of ['arrival', 'midstay'] as const) {
        const midstayKeys = await dueCandidates(phase);
        if (!midstayKeys.length) continue;

        const { data: midstayCandidates, error: midstayFetchError } = await supabase
          .from('orders')
          .select(`
            id,
            checkin_date,
            source,
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
              account_id,
              name,
              midstay_enabled,
              midstay_day,
              checkin_schedule,
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
          .not('checkin_date', 'is', null)
          .in('id', midstayKeys.map(row => row.order_id)).order('id').limit(50);

        if (midstayFetchError) {
          console.error("[process-reviews] Error fetching mid-stay candidates:", midstayFetchError);
        } else if (midstayCandidates && midstayCandidates.length > 0) {
          console.log(`[process-reviews] Found ${midstayCandidates.length} mid-stay candidates to evaluate.`);

          for (const order of midstayCandidates) {
            if ((order as any).source === 'reviewsail_test') continue;
            const customer = (order as any).customers;
            const location = (order as any).locations;
            const reviewRequests = (order as any).review_requests;

            if (!customer || !location) {
              console.warn(`[process-reviews] Mid-stay: Incomplete data for order ${order.id}, skipping.`);
              continue;
            }

            const selectedRequestId = midstayKeys.find(row => row.order_id === order.id)?.request_id;
            const reviewRequest = Array.isArray(reviewRequests)
              ? reviewRequests.find((row: { id: string }) => row.id === selectedRequestId)
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

            // The SQL selector and locked send claim share the property-local schedule.
            const helpLink = `${appUrl}/help/stay/${shortCode(reviewRequest.id)}`;
            const prompt = phase === 'arrival' ? "How are you settling in?" : "How was your first night?";
            const wording = location.checkin_schedule ? prompt : "How is your stay going?";
            const midstayEmailText = `Hi ${customer.first_name || 'there'}, ${wording} If you need anything at ${location.name}, you can reach your host here: ${helpLink}`;
            const midstaySmsText = `${midstayEmailText} Reply STOP to opt out.`;

            // For the new schedules, pick one available channel per check-in.
            const canText = Boolean(location.enable_sms !== false && customer.phone?.trim()
              && twilioAccountSid && twilioAuthToken && twilioFromNumber
              && !optedOutPhones.has(phoneKey(customer.phone)));
            const checkinChannels = location.checkin_schedule
              ? { ...location, enable_sms: canText, enable_email: !canText && location.enable_email !== false }
              : location;
            const channels = await sendChannels(
              order.id, reviewRequest.id, phase,
              checkinChannels, customer, `How's your stay at ${location.name}? 😊`, midstayEmailText, midstaySmsText,
              `${location.name} <${resendFromEmail}>`,
            );
            if (!hasAcceptance(channels) || Object.values(channels).some(channel => channel.recordingFailed)) {
              processedResults.push({ id: order.id, type: phase, status: unsuccessfulStatus(channels), channels });
              continue;
            }

            processedResults.push({ id: order.id, type: phase, status: phase === 'arrival' ? 'arrival_sent' : 'midstay_checkin_sent', channels });
          }
        }
      }
    }

    console.log(`[process-reviews] Successfully completed processing. Total actions logged: ${processedResults.length}`);

    const singleResult = specificRequestId ? processedResults.find(result => result.id === specificRequestId) : null;
    const singleSuccess = singleResult?.status === 'sent';
    const errors: Record<string, string> = {
      recording_failed: 'A provider may have accepted the message, but recording the result failed. Do not resend; check the provider logs.',
      already_sent: 'This invite was already accepted by a provider. No duplicate was sent. Delivery is not yet confirmed.',
      send_held: 'Sending is paused because a previous attempt may already have sent this message, or its safety record is unavailable. Check the provider logs. Recorded attempts are never automatically retried.',
      eligibility_changed: 'Nothing more was sent: this stay, account, channel or guest is no longer eligible. Refresh the page.',
      configuration_error: 'Sending is not configured for the available contact channels.',
      send_skipped: 'Nothing was sent: channels are disabled, contact details are missing, or the phone has opted out.',
      send_failed: 'Provider acceptance could not be confirmed. Check the provider logs before retrying.',
      billing_blocked: 'Nothing was sent: this account needs an active plan.',
      not_due: 'Nothing was sent: this stay has not checked out yet.',
      expired: 'Nothing was sent: this request is outside the sending window.',
      opted_out_skipped: 'Nothing was sent: this guest has opted out.',
      incomplete_data: 'Nothing was sent: this request has incomplete stay or guest data.',
    };
    return new Response(JSON.stringify({
      success: specificRequestId ? singleSuccess : true,
      ...(specificRequestId && !singleSuccess ? { error: errors[singleResult?.status ?? ''] || 'No message was accepted for sending.' } : {}),
      processed: processedResults.length,
      results: processedResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: specificRequestId && !singleSuccess ? 409 : 200,
    });

  } catch (error: any) {
    console.error("[process-reviews] Unexpected error processing requests:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
