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
    let specificRequestId: string | null = null;
    
    // Check if a specific review_request_id is passed in the request body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && body.review_request_id) {
          specificRequestId = body.review_request_id;
          console.log(`[process-reviews] Single request mode triggered for review_request_id: ${specificRequestId}`);
        }
      } catch (_) {
        // No body or invalid JSON, default to processing all
      }
    }

    console.log("[process-reviews] Starting to process pending review requests & reminders");
    
    // Get current UTC hour
    const currentUTCHour = new Date().getUTCHours();
    console.log(`[process-reviews] Current UTC Hour is: ${currentUTCHour}`);

    // Read secure API keys from master environment variables
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@maprated.com';
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    // Use the service role key to bypass RLS
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
          console.error(`[process-reviews] Incomplete data for request ${request.id}`, { request });
          continue;
        }

        // --- STALE SUPPRESSION CHECK ---
        if (order.checkout_date) {
          const checkoutDate = new Date(order.checkout_date);
          const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
          
          if (checkoutDate < fourteenDaysAgo) {
            console.log(`[process-reviews] Suppressing request ${request.id} as expired.`);
            await supabase
              .from('review_requests')
              .update({ status: 'expired' })
              .eq('id', request.id);
            processedResults.push({ id: request.id, type: 'pending', status: 'expired' });
            continue;
          }
        }

        // --- ENFORCE SCHEDULED SEND TIME ---
        if (!specificRequestId) {
          const preferredHour = location.preferred_send_hour !== null && location.preferred_send_hour !== undefined
            ? location.preferred_send_hour 
            : 10;
          
          if (currentUTCHour !== preferredHour) {
            console.log(`[process-reviews] Skipping request ${request.id} for location "${location.name}". Current hour (${currentUTCHour} UTC) does not match preferred send hour (${preferredHour} UTC).`);
            continue;
          }
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

        const isEmailEnabled = location.enable_email !== false;
        const isSmsEnabled = location.enable_sms !== false;

        const templates = location.message_templates;
        const templateText = (Array.isArray(templates) && templates.length > 0)
          ? templates[0].template_text 
          : 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';

        const cleanEmail = customer.email || '';
        const unsubUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
        const feedbackUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/feedback?request_id=${request.id}`;
        const alreadyReviewedUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/already-reviewed?request_id=${request.id}`;
        // NEW: Feedback gate URL
        const feedbackGateUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/feedback-gate?request_id=${request.id}`;
        
        // Replace {reviewLink} with the feedback gate URL instead of direct Google URL
        let message = templateText
          .replace(/{firstName}/g, customer.first_name || '')
          .replace(/{lastName}/g, customer.last_name || '')
          .replace(/{reviewLink}/g, feedbackGateUrl);
        
        // Append private feedback, self-suppression link, and unsubscribe compliance text
        message += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
        message += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
        message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

        let sendSuccess = false;

        // 1. Attempt sending Email via Resend
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

        // 2. Attempt sending SMS via Twilio
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

        // Fallback mock
        if (!sendSuccess) {
          console.warn(`[process-reviews] Warning: Mock mode triggered for request ${request.id}.`);
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

    // --- PHASE 2: SEND REMINDERS (unchanged, but also use feedbackGateUrl) ---
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
              const unsubUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;
              const feedbackUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/feedback?request_id=${request.id}`;
              const alreadyReviewedUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/already-reviewed?request_id=${request.id}`;
              const feedbackGateUrl = `https://vqjzscdlfhgzzqhmkchw.supabase.co/feedback-gate?request_id=${request.id}`;

              let message = `[Reminder] ` + templateText
                .replace(/{firstName}/g, customer.first_name || '')
                .replace(/{lastName}/g, customer.last_name || '')
                .replace(/{reviewLink}/g, feedbackGateUrl);
              
              message += `\n\nAlternatively, you can share private feedback with us directly here: ${feedbackUrl}`;
              message += `\n\nAlready left us a review? Click here and we won't contact you again: ${alreadyReviewedUrl}`;
              message += `\n\nTo unsubscribe from future requests, please click here: ${unsubUrl}`;

              let sendSuccess = false;
              // ... (same sending logic as above)
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
                } catch (err) { console.error(err); }
              }

              if (!sendSuccess && isSmsEnabled && customer.phone && twilioAccountSid && twilioAuthToken && twilioFromNumber) {
                try {
                  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
                  const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
                  const formData = new URLSearchParams();
                  formData.append('From', twilioFromNumber);
                 ```typescript
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
                  } else {
                    const errBody = await smsResponse.text();
                    console.error(`[process-reviews] Twilio API Error for ${customer.phone}:`, errBody);
                  }
                } catch (smsErr) {
                  console.error(`[process-reviews] Twilio Fetch Error:`, smsErr);
                }
              }

              // Fallback mock
              if (!sendSuccess) {
                console.log(`[process-reviews] =======================================`);
                console.log(`[process-reviews] MOCK SENDING REMINDER INVITE TO: ${customer.email || customer.phone}`);
                console.log(`[process-reviews] MESSAGE CONTENT:\n${message}`);
                console.log(`[process-reviews] =======================================`);
                sendSuccess = true;
              }

              if (sendSuccess) {
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
```

Now update the MapRatedContext to include private feedback data and an unread badge count. We'll add `privateFeedbacks` state and fetch it during `refreshData`, plus add a `markFeedbackRead` action. Also add the status `private_feedback` to the ReviewRequest type.

<dyad-write path="src/context/MapRatedContext.tsx" description="Add private feedback state, fetching, and status updates">
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';

export type Location = {
  id: string;
  name: string;
  googlePlaceUrl: string;
  templateText?: string;
  smsTemplateText?: string;
  timezone: string;
  enableEmail: boolean;
  enableSms: boolean;
  onboardingComplete: boolean;
  preferredSendHour: number;
};

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
};

export type Order = {
  id: string;
  customerId: string;
  locationId: string;
  checkoutDate: string;
  status: 'pending' | 'completed' | 'cancelled';
};

export type ReviewRequest = {
  id: string;
  orderId: string;
  status: 'pending' | 'sent' | 'clicked' | 'opted_out' | 'expired' | 'already_reviewed' | 'private_feedback';
  sentAt?: string;
};

export type OptOut = {
  id: string;
  email: string | null;
  phone?: string | null;
  optOutDate: string;
};

export type MessageEvent = {
  id: string;
  requestId: string;
  eventType: string;
  createdAt: string;
};

export type PrivateFeedback = {
  id: string;
  requestId: string | null;
  locationId: string | null;
  starRating: number;
  feedbackText: string | null;
  guestName: string | null;
  guestEmail: string | null;
  isRead: boolean;
  createdAt: string;
};

type MapRatedState = {
  locations: Location[];
  customers: Customer[];
  orders: Order[];
  reviewRequests: ReviewRequest[];
  optOuts: OptOut[];
  messageEvents: MessageEvent[];
  feedbacks: PrivateFeedback[];
  activeLocationId: string | null;
  subscriptionStatus: 'active' | 'trialing' | 'inactive' | 'canceled' | null;
  stripeCustomerId: string | null;
  loading: boolean;
  unreadPrivateFeedbackCount: number;
};

type MapRatedContextType = MapRatedState & {
  setActiveLocationId: (id: string) => void;
  addLocation: (name: string, googleUrl?: string) => Promise<Location | null>;
  deleteLocation: (id: string) => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  addOrder: (order: Omit<Order, 'id'>) => Promise<Order | null>;
  addOptOut: (email: string) => Promise<void>;
  addReviewRequest: (orderId: string) => Promise<void>;
  updateLocationSettings: (id: string, settings: Partial<Location>) => Promise<void>;
  respondToFeedback: (id: string, text: string) => Promise<void>;
  refreshData: () => Promise<void>;
  bulkImport: (rows: Array<{ firstName: string, lastName: string, email: string | null, phone?: string | null, checkoutDate: string }>) => Promise<{ success: boolean, count: number, error?: string }>;
  subscribe: () => Promise<{ success: boolean; url?: string; error?: string }>;
  completeOnboarding: (locationId: string) => Promise<void>;
  triggerSingleResend: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  markPrivateFeedbackRead: (id: string) => Promise<void>;
};

const initialState: MapRatedState = {
  locations: [],
  customers: [],
  orders: [],
  reviewRequests: [],
  optOuts: [],
  messageEvents: [],
  feedbacks: [],
  activeLocationId: null,
  subscriptionStatus: 'inactive',
  stripeCustomerId: null,
  loading: true,
  unreadPrivateFeedbackCount: 0,
};

const MapRatedContext = createContext<MapRatedContextType | undefined>(undefined);

export const MapRatedProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [state, setState] = useState<MapRatedState>(initialState);

  const refreshData = async () => {
    if (!session?.user) return;
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isMockSuccess = urlParams.get('mock_checkout_success') === 'true';
      const mockAccountId = urlParams.get('account_id');

      if (isMockSuccess && mockAccountId) {
        console.log('[MapRatedContext] Intercepted mock checkout success. Activating subscription...');
        const { error: mockUpdateError } = await supabase
          .from('accounts')
          .update({ subscription_status: 'active' })
          .eq('id', mockAccountId);
        
        if (mockUpdateError) {
          console.error('[MapRatedContext] Mock activation error:', mockUpdateError);
        } else {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      if (supabase && supabase.functions) {
        supabase.functions.invoke('setup-db').catch((err) => {
          console.warn('DB setup background invocation skipped or failed:', err);
        });
      }

      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      let subscriptionStatus: 'active' | 'trialing' | 'inactive' | 'canceled' | null = 'inactive';
      let stripeCustomerId = null;
      
      if (userData?.account_id) {
        const { data: accData } = await supabase.from('accounts').select('subscription_status, stripe_customer_id').eq('id', userData.account_id).single();
        if (accData) {
          subscriptionStatus = (accData.subscription_status as any) || 'inactive';
          stripeCustomerId = accData.stripe_customer_id || null;
        }
      }

      const { data: locData } = await supabase.from('locations').select('*');
      
      const parsedLocations: Location[] = (locData || []).map(l => ({
        id: l.id,
        name: l.name,
        googlePlaceUrl: l.google_place_url || '',
        timezone: l.timezone || 'UTC',
        enableEmail: l.enable_email !== false,
        enableSms: l.enable_sms !== false,
        onboardingComplete: l.onboarding_complete === true,
        preferredSendHour: l.preferred_send_hour !== null && l.preferred_send_hour !== undefined ? l.preferred_send_hour : 10
      }));

      const { data: templatesData } = await supabase.from('message_templates').select('*');
      
      const locations = parsedLocations.map(loc => {
        const emailTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'email');
        const smsTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'sms');
        return { 
          ...loc, 
          templateText: emailTemplate?.template_text || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}', 
          smsTemplateText: smsTemplate?.template_text || 'Hi {firstName}, please share your experience at {reviewLink}' 
        };
      });

      const { data: custData } = await supabase.from('customers').select('*');
      const customers: Customer[] = (custData || []).map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone
      }));

      const { data: orderData } = await supabase.from('orders').select('*');
      const orders: Order[] = (orderData || []).map(o => ({
        id: o.id,
        customerId: o.customer_id,
        locationId: o.location_id,
        checkoutDate: o.checkout_date,
        status: o.status as 'pending' | 'completed' | 'cancelled'
      }));

      const { data: rrData } = await supabase.from('review_requests').select('*');
      const reviewRequests: ReviewRequest[] = (rrData || []).map(r => ({
        id: r.id,
        orderId: r.order_id,
        status: r.status as ReviewRequest['status'],
        sentAt: r.sent_at
      }));
      
      const { data: optData } = await supabase.from('opt_outs').select('*');
      const optOuts: OptOut[] = (optData || []).map(o => ({
        id: o.id,
        email: o.email,
        phone: o.phone,
        optOutDate: o.opt_out_date
      }));

      const { data: eventData } = await supabase.from('message_events').select('*');
      const messageEvents: MessageEvent[] = (eventData || []).map(e => ({
        id: e.id,
        requestId: e.request_id,
        eventType: e.event_type,
        createdAt: e.created_at
      }));

      // Fetch private_feedback table (account-scoped via RLS)
      const { data: pfData } = await supabase.from('private_feedback').select('*');
      const feedbacks: PrivateFeedback[] = (pfData || []).map(f => ({
        id: f.id,
        requestId: f.request_id,
        locationId: f.location_id,
        starRating: f.star_rating,
        feedbackText: f.feedback_text,
        guestName: f.guest_name,
        guestEmail: f.guest_email,
        isRead: f.is_read || false,
        createdAt: f.created_at,
      }));

      const unreadPrivateFeedbackCount = feedbacks.filter(f => !f.isRead).length;

      setState(prev => ({
        ...prev,
        locations,
        customers,
        orders,
        reviewRequests,
        optOuts,
        messageEvents,
        feedbacks,
        subscriptionStatus,
        stripeCustomerId,
        unreadPrivateFeedbackCount,
        activeLocationId: prev.activeLocationId || (locations.length > 0 ? locations[0].id : null),
        loading: false
      }));

    } catch (e) {
      console.error('Failed to fetch from supabase:', e);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    refreshData();
  }, [session?.user]);

  const setActiveLocationId = (id: string) => {
    setState((prev) => ({ ...prev, activeLocationId: id }));
  };

  const addLocation = async (name: string, googleUrl?: string) => {
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
    if (!userData) return null;

    const { data, error } = await supabase.from('locations').insert({
      account_id: userData.account_id,
      name,
      google_place_url: googleUrl || '',
      timezone: 'UTC',
      enable_email: true,
      enable_sms: true,
      onboarding_complete: false,
      preferred_send_hour: 10
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    await supabase.from('message_templates').insert({
      location_id: data.id,
      type: 'email',
      template_text: 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}'
    });

    await supabase.from('message_templates').insert({
      location_id: data.id,
      type: 'sms',
      template_text: 'Hi {firstName}, please share your experience with us at {reviewLink}'
    });

    await refreshData();
    return {
      id: data.id,
      name: data.name,
      googlePlaceUrl: data.google_place_url || '',
      timezone: 'UTC',
      enableEmail: true,
      enableSms: true,
      onboardingComplete: false,
      preferredSendHour: 10
    };
  };

  const deleteLocation = async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) {
      console.error(error);
      throw error;
    }
    setState(prev => {
      const filtered = prev.locations.filter(l => l.id !== id);
      return {
        ...prev,
        locations: filtered,
        activeLocationId: prev.activeLocationId === id ? (filtered.length > 0 ? filtered[0].id : null) : prev.activeLocationId
      };
    });
    await refreshData();
  };

  const addCustomer = async (customer: Omit<Customer, 'id'>) => {
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
    if (!userData) return null;

    const { data, error = null } = await supabase.from('customers').insert({
      account_id: userData.account_id,
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone: customer.phone
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }
    
    await refreshData();
    
    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone
    };
  };

  const addOrder = async (order: Omit<Order, 'id'>) => {
    const { data, error } = await supabase.from('orders').insert({
      location_id: order.locationId,
      customer_id: order.customerId,
      checkout_date: order.checkoutDate,
      status: order.status
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }
    
    await refreshData();
    
    return {
      id: data.id,
      customerId: data.customer_id,
      locationId: data.location_id,
      checkoutDate: data.checkout_date,
      status: data.status as 'pending' | 'completed' | 'cancelled'
    };
  };

  const addOptOut = async (email: string) => {
    await supabase.from('opt_outs').insert({ email });
    await refreshData();
  };

  const addReviewRequest = async (orderId: string) => {
    const order = state.orders.find(o => o.id === orderId);
    const customer = order ? state.customers.find(c => c.id === order.customerId) : null;
    
    let status = 'pending';
    if (customer && state.optOuts.some(o => o.email === customer.email)) {
      status = 'opted_out';
    }

    await supabase.from('review_requests').insert({
      order_id: orderId,
      status
    });
    
    await refreshData();
  };

  const completeOnboarding = async (locationId: string) => {
    const { error } = await supabase
      .from('locations')
      .update({ onboarding_complete: true })
      .eq('id', locationId);
    if (error) {
      console.error('[MapRatedContext] completeOnboarding error:', error);
      throw error;
    }
    await refreshData();
  };

  const triggerSingleResend = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('process-reviews', {
        body: { review_request_id: requestId }
      });
      if (error) throw error;
      await refreshData();
      return { success: true };
    } catch (err: any) {
      console.error('[MapRatedContext] triggerSingleResend error:', err);
      return { success: false, error: err.message || 'Resend process failed' };
    }
  };

  const markPrivateFeedbackRead = async (id: string) => {
    const { error } = await supabase
      .from('private_feedback')
      .update({ is_read: true })
      .eq('id', id);
    if (error) {
      console.error('[MapRatedContext] markPrivateFeedbackRead error:', error);
      throw error;
    }
    await refreshData();
  };

  const bulkImport = async (rows: Array<{ firstName: string, lastName: string, email: string | null, phone?: string | null, checkoutDate: string }>) => {
    if (!state.activeLocationId) {
      return { success: false, count: 0, error: "No active location selected" };
    }

    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      if (!userData) {
        return { success: false, count: 0, error: "No user account linked" };
      }
      const accountId = userData.account_id;

      const { data: insertedCustomers, error: custError } = await supabase
        .from('customers')
        .insert(rows.map(r => ({
          account_id: accountId,
          first_name: r.firstName,
          last_name: r.lastName,
          email: r.email,
          phone: r.phone || null
        })))
        .select();

      if (custError || !insertedCustomers) {
        throw custError || new Error("Failed to bulk insert customers");
      }

      const ordersToInsert = insertedCustomers.map((cust, idx) => {
        const originalRow = rows[idx];
        return {
          location_id: state.activeLocationId,
          customer_id: cust.id,
          checkout_date: originalRow ? new Date(originalRow.checkoutDate).toISOString() : new Date().toISOString(),
          status: 'completed' as const
        };
      });

      const { data: insertedOrders, error: orderError } = await supabase
        .from('orders')
        .insert(ordersToInsert)
        .select();

      if (orderError || !insertedOrders) {
        throw orderError || new Error("Failed to bulk insert orders");
      }

      const { data: optOuts } = await supabase.from('opt_outs').select('email');
      const optedOutEmails = new Set((optOuts || []).map(o => o.email?.toLowerCase()));

      const requestsToInsert = insertedOrders.map(order => {
        const customer = insertedCustomers.find(c => c.id === order.customer_id);
        const isOptedOut = customer?.email && optedOutEmails.has(customer.email.toLowerCase());
        return {
          order_id: order.id,
          status: isOptedOut ? 'opted_out' : 'pending'
        };
      });

      const { error: rrError } = await supabase
        .from('review_requests').insert(requestsToInsert);

      if (rrError) {
        throw rrError;
      }

      await refreshData();
      return { success: true, count: rows.length };

    } catch (e: any) {
      console.error(e);
      return { success: false, count: 0, error: e.message || "Failed to bulk import data" };
    }
  };

  const updateLocationSettings = async (id: string, settings: Partial<Location>) => {
    const updateData: any = {};
    if (settings.name !== undefined) updateData.name = settings.name;
    if (settings.googlePlaceUrl !== undefined) updateData.google_place_url = settings.googlePlaceUrl;
    if (settings.timezone !== undefined) updateData.timezone = settings.timezone;
    if (settings.enableEmail !== undefined) updateData.enable_email = settings.enableEmail;
    if (settings.enableSms !== undefined) updateData.enable_sms = settings.enableSms;
    if (settings.preferredSendHour !== undefined) updateData.preferred_send_hour = settings.preferredSendHour;

    if (Object.keys(updateData).length > 0) {
      await supabase.from('locations').update(updateData).eq('id', id);
    }
    
    if (settings.templateText !== undefined) {
      const { data: existing } = await supabase.from('message_templates').select('id').eq('location_id', id).eq('type', 'email').maybeSingle();
      if (existing) {
        await supabase.from('message_templates').update({ template_text: settings.templateText }).eq('id', existing.id);
      } else {
        await supabase.from('message_templates').insert({ location_id: id, template_text: settings.templateText, type: 'email' });
      }
    }

    if (settings.smsTemplateText !== undefined) {
      const { data: existing } = await supabase.from('message_templates').select('id').eq('location_id', id).eq('type', 'sms').maybeSingle();
      if (existing) {
        await supabase.from('message_templates').update({ template_text: settings.smsTemplateText }).eq('id', existing.id);
      } else {
        await supabase.from('message_templates').insert({ location_id: id, template_text: settings.smsTemplateText, type: 'sms' });
      }
    }
    
    await refreshData();
  };

  const respondToFeedback = async (id: string, text: string) => {
    const { error } = await supabase
      .from('feedback')
      .update({ manager_response: text })
      .eq('id', id);

    if (error) {
      console.error(error);
      throw error;
    }
    await refreshData();
  };

  const subscribe = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session');
      if (error) throw error;
      if (data && data.url) {
        return { success: true, url: data.url };
      }
      return { success: false, error: "No checkout session URL returned" };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message || "Failed to initiate subscription" };
    }
  };

  return (
    <MapRatedContext.Provider value={{
      ...state,
      setActiveLocationId,
      addLocation,
      deleteLocation,
      addCustomer,
      addOrder,
      addOptOut,
      addReviewRequest,
      updateLocationSettings,
      respondToFeedback,
      refreshData,
      bulkImport,
      subscribe,
      completeOnboarding,
      triggerSingleResend,
      markPrivateFeedbackRead
    }}>
      {children}
    </MapRatedContext.Provider>
  );
};

export const useMapRated = () => {
  const context = useContext(MapRatedContext);
  if (context === undefined) {
    throw new Error('useMapRated must be used within a MapRatedProvider');
  }
  return context;
};