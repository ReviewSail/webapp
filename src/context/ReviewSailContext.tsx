import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { DigestSetting } from '../types/reviewSail';

export type { DigestSetting } from '../types/reviewSail';

export type Location = {
  id: string;
  name: string;
  googlePlaceUrl: string;
  templateText?: string;
  smsTemplateText?: string;
  smsReminderText?: string;
  timezone: string;
  enableEmail: boolean;
  enableSms: boolean;
  midstayEnabled: boolean;
  /** Day of the stay the check-in goes out on; day 1 is the arrival day. */
  midstayDay: number;
  onboardingComplete: boolean;
  preferredSendHour: number;
  recoveryEmail: string;
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
  checkinDate?: string;
  midstaySent?: boolean;
  midstaySentAt?: string;
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

/**
 * One row of guest_feedback. This used to be two tables — `feedback` for happy
 * guests and `private_feedback` for complaints — behind a single type whose
 * optional fields were exactly "the columns the other table lacks". They are
 * now one table, so every field here is present on every row.
 */
export type GuestFeedback = {
  id: string;
  requestId: string | null;
  locationId: string;
  /**
   * rating    happy guest who tapped through to Google
   * complaint 1-3 stars, caught by the gate before it reached Google
   * recovery  follow-up message from the thank-you screen, no rating
   */
  kind: 'rating' | 'complaint' | 'recovery';
  /** Null only for recovery messages, which carry no rating at all. */
  starRating: number | null;
  feedbackText: string | null;
  guestName: string | null;
  guestEmail: string | null;
  managerResponse: string | null;
  isRead: boolean;
  createdAt: string;
};

export type BulkImportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  /** Date-only ISO string, e.g. "2026-07-30". */
  checkoutDate: string;
  checkinDate?: string | null;
};

export type BulkImportResult = {
  success: boolean;
  imported: number;
  skippedDuplicates: number;
  error?: string;
};

/**
 * Feedback that belongs in the manager's action queue: unhappy guests (1-3
 * stars) and recovery messages, which carry no star rating at all.
 *
 * Happy guests are recorded too — the dashboard average would be stuck below 3
 * otherwise — but they need no follow-up, so the private-feedback surfaces
 * filter them out while Analytics counts them. That test used to be
 * `stars <= 3`, which needed a 0 sentinel to catch ratingless recovery
 * messages; `kind` says it directly.
 */
export const isActionableFeedback = (feedback: Pick<GuestFeedback, 'kind'>): boolean =>
  feedback.kind !== 'rating';

/** Written only by supabase/functions/stripe-webhook. */
export type SubscriptionStatus = 'active' | 'trialing' | 'inactive' | 'past_due' | 'canceled' | null;

type ReviewSailState = {
  locations: Location[];
  customers: Customer[];
  orders: Order[];
  reviewRequests: ReviewRequest[];
  optOuts: OptOut[];
  messageEvents: MessageEvent[];
  feedbacks: GuestFeedback[];
  activeLocationId: string | null;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  planName: string | null;
  /** When the current paid period ends — the renewal date, or the end date once cancelled. */
  currentPeriodEnd: string | null;
  /** Cancelled, but still paid up until currentPeriodEnd. */
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  unreadPrivateFeedbackCount: number;
  digestSetting: DigestSetting | null;
};

type ReviewSailContextType = ReviewSailState & {
  setActiveLocationId: (id: string) => void;
  addLocation: (name: string, googleUrl?: string) => Promise<Location | null>;
  deleteLocation: (id: string) => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  addOrder: (order: Omit<Order, 'id'>) => Promise<Order | null>;
  addOptOut: (email: string) => Promise<void>;
  addReviewRequest: (orderId: string) => Promise<void>;
  updateLocationSettings: (id: string, settings: Partial<Location>) => Promise<void>;
  respondToFeedback: (id: string, text: string) => Promise<void>;
  markPrivateFeedbackRead: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  bulkImport: (rows: BulkImportRow[]) => Promise<BulkImportResult>;
  fetchExistingImportKeys: () => Promise<Set<string>>;
  sendTestReviewRequest: () => Promise<{ success: boolean; error?: string }>;
  subscribe: () => Promise<{ success: boolean; url?: string; error?: string }>;
  /** Opens Stripe's hosted portal, which owns cancel, resume, payment method and invoices. */
  openBillingPortal: () => Promise<{ success: boolean; url?: string; error?: string }>;
  completeOnboarding: (locationId: string) => Promise<void>;
  triggerSingleResend: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  updateDigestSetting: (frequency: 'weekly' | 'monthly', enabled: boolean) => Promise<void>;
};

const initialState: ReviewSailState = {
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
  planName: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,
  unreadPrivateFeedbackCount: 0,
  digestSetting: null,
};

/**
 * Kept in step with the seeds in supabase/migrations/0021_sms_templates.sql and
 * the fallbacks in supabase/functions/process-reviews. The SMS copy is GSM-7
 * clean and single-segment on purpose: one emoji or curly apostrophe forces
 * UCS-2 and cuts each segment from 160 characters to 70.
 */
export const DEFAULT_TEMPLATES = {
  email: "Hi {firstName}, thanks for staying at {locationName}! If you have a moment, we'd love to hear how it went: {reviewLink}",
  sms: 'Hi {firstName}, thanks for staying at {locationName}! How did we do? {reviewLink} Reply STOP to opt out',
  sms_reminder: 'Hi {firstName}, still keen to hear how your stay at {locationName} went: {reviewLink} Reply STOP to opt out',
} as const;

const ReviewSailContext = createContext<ReviewSailContextType | undefined>(undefined);

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [state, setState] = useState<ReviewSailState>(initialState);

  const refreshData = async () => {
    if (!session?.user) return;
    setState(prev => ({ ...prev, loading: true }));

    try {
      // Local-only shortcut for working without Stripe keys. Vite strips this
      // from production builds — shipped, it let any admin activate a paid plan
      // by visiting /dashboard?mock_checkout_success=true&account_id=<their id>.
      if (import.meta.env.DEV) {
        const urlParams = new URLSearchParams(window.location.search);
        const isMockSuccess = urlParams.get('mock_checkout_success') === 'true';
        const mockAccountId = urlParams.get('account_id');

        if (isMockSuccess && mockAccountId) {
          await supabase
            .from('accounts')
            .update({ subscription_status: 'active', plan_name: 'Premium Pro' })
            .eq('id', mockAccountId);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      let subscriptionStatus: SubscriptionStatus = 'inactive';
      let stripeCustomerId = null;
      let planName: string | null = null;
      let currentPeriodEnd: string | null = null;
      let cancelAtPeriodEnd = false;

      if (userData?.account_id) {
        const { data: accData } = await supabase
          .from('accounts')
          .select('subscription_status, stripe_customer_id, plan_name, current_period_end, cancel_at_period_end')
          .eq('id', userData.account_id)
          .single();
        if (accData) {
          subscriptionStatus = (accData.subscription_status as any) || 'inactive';
          stripeCustomerId = accData.stripe_customer_id || null;
          planName = accData.plan_name || null;
          currentPeriodEnd = accData.current_period_end || null;
          cancelAtPeriodEnd = accData.cancel_at_period_end === true;
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
        midstayEnabled: l.midstay_enabled !== false,
        midstayDay: l.midstay_day != null ? l.midstay_day : 2,
        onboardingComplete: l.onboarding_complete === true,
        preferredSendHour: l.preferred_send_hour != null ? l.preferred_send_hour : 10,
        recoveryEmail: l.recovery_email || '',
      }));

      const { data: templatesData } = await supabase.from('message_templates').select('*');
      const locations = parsedLocations.map(loc => {
        const emailTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'email');
        const smsTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'sms');
        const smsReminder = templatesData?.find(t => t.location_id === loc.id && t.type === 'sms_reminder');
        return {
          ...loc,
          templateText: emailTemplate?.template_text || DEFAULT_TEMPLATES.email,
          smsTemplateText: smsTemplate?.template_text || DEFAULT_TEMPLATES.sms,
          smsReminderText: smsReminder?.template_text || DEFAULT_TEMPLATES.sms_reminder,
        };
      });

      const { data: custData } = await supabase.from('customers').select('*');
      const customers: Customer[] = (custData || []).map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
      }));

      const { data: orderData } = await supabase.from('orders').select('*');
      const orders: Order[] = (orderData || []).map(o => ({
        id: o.id,
        customerId: o.customer_id,
        locationId: o.location_id,
        checkoutDate: o.checkout_date,
        checkinDate: o.checkin_date || undefined,
        midstaySent: o.midstay_sent === true,
        midstaySentAt: o.midstay_sent_at || undefined,
        status: o.status as 'pending' | 'completed' | 'cancelled',
      }));

      // Newest first, so the dashboard's "Recent Requests" (which just takes the
      // first 20) actually shows the most recent ones. Unordered, Postgres
      // returned an arbitrary 20 rows under a "Recent" heading.
      const { data: rrData } = await supabase
        .from('review_requests')
        .select('*')
        .order('created_at', { ascending: false });
      const reviewRequests: ReviewRequest[] = (rrData || []).map(r => ({
        id: r.id,
        orderId: r.order_id,
        status: r.status as ReviewRequest['status'],
        sentAt: r.sent_at,
      }));

      const { data: optData } = await supabase.from('opt_outs').select('*');
      const optOuts: OptOut[] = (optData || []).map(o => ({
        id: o.id,
        email: o.email,
        phone: o.phone,
        optOutDate: o.opt_out_date,
      }));

      const { data: eventData } = await supabase.from('message_events').select('*');
      const messageEvents: MessageEvent[] = (eventData || []).map(e => ({
        id: e.id,
        requestId: e.request_id,
        eventType: e.event_type,
        createdAt: e.created_at,
      }));

      let digestSetting: DigestSetting | null = null;
      try {
        const { data: dsData } = await supabase
          .from('digest_settings')
          .select('*')
          .eq('user_id', session?.user.id)
          .maybeSingle();
        if (dsData) {
          digestSetting = {
            id: dsData.id,
            userId: dsData.user_id,
            accountId: dsData.account_id,
            frequency: dsData.frequency as 'weekly' | 'monthly',
            enabled: dsData.enabled,
          };
        }
      } catch (_) {}

      let feedbacks: GuestFeedback[] = [];
      try {
        const { data: fbData } = await supabase.from('guest_feedback').select('*');
        if (fbData) {
          feedbacks = fbData.map((f: any) => ({
            id: f.id,
            requestId: f.request_id,
            locationId: f.location_id,
            kind: f.kind,
            starRating: f.star_rating,
            feedbackText: f.feedback_text,
            guestName: f.guest_name,
            guestEmail: f.guest_email,
            managerResponse: f.manager_response,
            isRead: f.is_read,
            createdAt: f.created_at,
          }));
        }
      } catch (_) {}

      // Happy ratings are never "unread" — nothing about them needs action, and
      // counting them left a badge the manager could not clear.
      const unreadCount = feedbacks.filter(f => !f.isRead && isActionableFeedback(f)).length;

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
        planName,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        digestSetting,
        activeLocationId: prev.activeLocationId || (locations.length > 0 ? locations[0].id : null),
        unreadPrivateFeedbackCount: unreadCount,
        loading: false,
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
    setState(prev => ({ ...prev, activeLocationId: id }));
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
      midstay_enabled: true,
      midstay_day: 2,
      onboarding_complete: false,
      preferred_send_hour: 10,
      recovery_email: '',
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    await supabase.from('message_templates').insert([
      { location_id: data.id, type: 'email', template_text: DEFAULT_TEMPLATES.email },
      { location_id: data.id, type: 'sms', template_text: DEFAULT_TEMPLATES.sms },
      { location_id: data.id, type: 'sms_reminder', template_text: DEFAULT_TEMPLATES.sms_reminder },
    ]);

    await refreshData();
    return {
      id: data.id,
      name: data.name,
      googlePlaceUrl: data.google_place_url || '',
      timezone: 'UTC',
      enableEmail: true,
      enableSms: true,
      midstayEnabled: true,
      midstayDay: 2,
      onboardingComplete: false,
      preferredSendHour: 10,
      recoveryEmail: '',
    };
  };

  const deleteLocation = async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) throw error;
    setState(prev => {
      const filtered = prev.locations.filter(l => l.id !== id);
      return {
        ...prev,
        locations: filtered,
        activeLocationId: prev.activeLocationId === id ? (filtered.length > 0 ? filtered[0].id : null) : prev.activeLocationId,
      };
    });
    await refreshData();
  };

  const addCustomer = async (customer: Omit<Customer, 'id'>) => {
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
    if (!userData) return null;

    const { data, error } = await supabase.from('customers').insert({
      account_id: userData.account_id,
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    await refreshData();
    return { id: data.id, firstName: data.first_name, lastName: data.last_name, email: data.email, phone: data.phone };
  };

  const addOrder = async (order: Omit<Order, 'id'>) => {
    const { data, error } = await supabase.from('orders').insert({
      location_id: order.locationId,
      customer_id: order.customerId,
      checkout_date: order.checkoutDate,
      // Without this, mid-stay check-ins can never fire: process-reviews
      // Phase 3 only considers orders where checkin_date is not null.
      checkin_date: order.checkinDate || null,
      status: order.status,
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
      checkinDate: data.checkin_date || undefined,
      midstaySent: data.midstay_sent === true,
      midstaySentAt: data.midstay_sent_at || undefined,
      status: data.status as 'pending' | 'completed' | 'cancelled',
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
    await supabase.from('review_requests').insert({ order_id: orderId, status });
    await refreshData();
  };

  const completeOnboarding = async (locationId: string) => {
    const { error } = await supabase.from('locations').update({ onboarding_complete: true }).eq('id', locationId);
    if (error) throw error;
    await refreshData();
  };

  const triggerSingleResend = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('process-reviews', { body: { review_request_id: requestId } });
      if (error) throw error;
      await refreshData();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Resend process failed' };
    }
  };

  /**
   * Identity keys for stays already in this account, so the import wizard can
   * flag re-imported guests before creating a second review request. Mirrors
   * dedupeKey() in src/lib/csvImport.ts.
   */
  const fetchExistingImportKeys = async (): Promise<Set<string>> => {
    const keys = new Set<string>();
    // RLS scopes orders to the caller's account.
    const { data, error } = await supabase
      .from('orders')
      .select('checkout_date, customers ( email, phone )');

    if (error) {
      console.error('Failed to load existing guests for duplicate check:', error);
      return keys;
    }

    for (const order of data || []) {
      if (!order.checkout_date) continue;
      const customer = order.customers as any;
      const contact =
        customer?.email?.trim().toLowerCase() ||
        customer?.phone?.replace(/\D/g, '') ||
        '';
      if (!contact) continue;
      keys.add(`${contact}|${String(order.checkout_date).slice(0, 10)}`);
    }

    return keys;
  };

  /**
   * Runs one real review request end to end against the admin's own address,
   * then removes the rows. Deleting the customer cascades to the order and
   * review request, so the test leaves no trace in the guest list or stats.
   *
   * This is the only way to find out whether sending actually works without
   * waiting for the hourly cron and burning a real guest.
   */
  const sendTestReviewRequest = async (): Promise<{ success: boolean; error?: string }> => {
    if (!session?.user?.email) return { success: false, error: 'No signed-in email address' };
    if (!state.activeLocationId) return { success: false, error: 'No active location selected' };

    let customerId: string | null = null;
    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
      if (!userData?.account_id) return { success: false, error: 'No user account linked' };

      const { data: customer, error: custError } = await supabase
        .from('customers')
        .insert({
          account_id: userData.account_id,
          first_name: 'Test',
          last_name: 'Send',
          email: session.user.email,
          phone: null,
        })
        .select()
        .single();
      if (custError || !customer) throw custError || new Error('Could not create the test guest');
      customerId = customer.id;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          location_id: state.activeLocationId,
          customer_id: customer.id,
          checkout_date: new Date().toISOString(),
          status: 'completed',
        })
        .select()
        .single();
      if (orderError || !order) throw orderError || new Error('Could not create the test stay');

      const { data: request, error: rrError } = await supabase
        .from('review_requests')
        .insert({ order_id: order.id, status: 'pending' })
        .select()
        .single();
      if (rrError || !request) throw rrError || new Error('Could not create the test request');

      // The single-request path bypasses the send-hour window, so this fires now.
      const { error: fnError } = await supabase.functions.invoke('process-reviews', {
        body: { review_request_id: request.id },
      });
      if (fnError) throw fnError;

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Test send failed' };
    } finally {
      if (customerId) {
        await supabase.from('customers').delete().eq('id', customerId);
        await refreshData();
      }
    }
  };

  const bulkImport = async (rows: BulkImportRow[]) => {
    if (!state.activeLocationId) {
      return { success: false, imported: 0, skippedDuplicates: 0, error: 'No active location selected' };
    }

    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      if (!userData) {
        return { success: false, imported: 0, skippedDuplicates: 0, error: 'No user account linked' };
      }
      const accountId = userData.account_id;
      const locationId = state.activeLocationId;

      // Re-check duplicates here as well as in the wizard: the two are seconds
      // apart, and a second tab could have imported in between.
      const existingKeys = await fetchExistingImportKeys();
      const seenInThisFile = new Set<string>();
      const toImport: BulkImportRow[] = [];
      let skippedDuplicates = 0;

      for (const row of rows) {
        const contact = row.email?.trim().toLowerCase() || row.phone?.replace(/\D/g, '') || '';
        const key = contact && row.checkoutDate ? `${contact}|${row.checkoutDate}` : null;
        if (key && (existingKeys.has(key) || seenInThisFile.has(key))) {
          skippedDuplicates++;
          continue;
        }
        if (key) seenInThisFile.add(key);
        toImport.push(row);
      }

      const { data: optOuts } = await supabase.from('opt_outs').select('email');
      const optedOutEmails = new Set((optOuts || []).map(o => o.email?.toLowerCase()).filter(Boolean));

      // Natural key for pairing inserted customer rows back to their source
      // row. Correlating by array index would assume INSERT ... RETURNING
      // preserves input order, which Postgres does not guarantee and which
      // breaks outright once the insert is chunked.
      const naturalKey = (r: { firstName: string; lastName: string; email: string | null; phone?: string | null }) =>
        `${r.firstName} ${r.lastName} ${r.email ?? ''} ${r.phone ?? ''}`;

      const BATCH_SIZE = 200;
      let imported = 0;

      for (let offset = 0; offset < toImport.length; offset += BATCH_SIZE) {
        const batch = toImport.slice(offset, offset + BATCH_SIZE);

        const { data: insertedCustomers, error: custError } = await supabase
          .from('customers')
          .insert(batch.map(r => ({
            account_id: accountId,
            first_name: r.firstName,
            last_name: r.lastName,
            email: r.email,
            phone: r.phone || null,
          })))
          .select();

        if (custError || !insertedCustomers) {
          throw custError || new Error('Failed to insert guests');
        }

        // Queue source rows per natural key; identical rows are interchangeable.
        const rowsByKey = new Map<string, BulkImportRow[]>();
        for (const r of batch) {
          const key = naturalKey(r);
          const queue = rowsByKey.get(key) || [];
          queue.push(r);
          rowsByKey.set(key, queue);
        }

        const customerIds = insertedCustomers.map(c => c.id);

        try {
          const ordersToInsert = insertedCustomers.map(cust => {
            const source = rowsByKey.get(naturalKey({
              firstName: cust.first_name,
              lastName: cust.last_name,
              email: cust.email,
              phone: cust.phone,
            }))?.shift();

            return {
              location_id: locationId,
              customer_id: cust.id,
              checkout_date: source?.checkoutDate
                ? new Date(`${source.checkoutDate}T12:00:00Z`).toISOString()
                : new Date().toISOString(),
              // Previously dropped entirely, which is why mid-stay check-ins
              // could never fire.
              checkin_date: source?.checkinDate
                ? new Date(`${source.checkinDate}T12:00:00Z`).toISOString()
                : null,
              status: 'completed' as const,
            };
          });

          const { data: insertedOrders, error: orderError } = await supabase
            .from('orders')
            .insert(ordersToInsert)
            .select();

          if (orderError || !insertedOrders) {
            throw orderError || new Error('Failed to create guest stays');
          }

          const customerById = new Map(insertedCustomers.map(c => [c.id, c]));
          const requestsToInsert = insertedOrders.map(order => {
            const customer = customerById.get(order.customer_id);
            const isOptedOut = !!customer?.email && optedOutEmails.has(customer.email.toLowerCase());
            return { order_id: order.id, status: isOptedOut ? 'opted_out' : 'pending' };
          });

          const { error: rrError } = await supabase.from('review_requests').insert(requestsToInsert);
          if (rrError) throw rrError;

          imported += batch.length;
        } catch (batchError) {
          // Roll the batch back by hand — without this a failure here leaves
          // orphan customers with no stay and no review request.
          await supabase.from('customers').delete().in('id', customerIds);
          throw batchError;
        }
      }

      await refreshData();
      return { success: true, imported, skippedDuplicates };
    } catch (e: any) {
      console.error(e);
      return {
        success: false,
        imported: 0,
        skippedDuplicates: 0,
        error: e.message || 'Failed to import guests',
      };
    }
  };

  const updateLocationSettings = async (id: string, settings: Partial<Location>) => {
    const updateData: any = {};
    if (settings.name !== undefined) updateData.name = settings.name;
    if (settings.googlePlaceUrl !== undefined) updateData.google_place_url = settings.googlePlaceUrl;
    if (settings.timezone !== undefined) updateData.timezone = settings.timezone;
    if (settings.enableEmail !== undefined) updateData.enable_email = settings.enableEmail;
    if (settings.enableSms !== undefined) updateData.enable_sms = settings.enableSms;
    if (settings.midstayEnabled !== undefined) updateData.midstay_enabled = settings.midstayEnabled;
    if (settings.midstayDay !== undefined) updateData.midstay_day = settings.midstayDay;
    if (settings.preferredSendHour !== undefined) updateData.preferred_send_hour = settings.preferredSendHour;
    if (settings.recoveryEmail !== undefined) updateData.recovery_email = settings.recoveryEmail;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase.from('locations').update(updateData).eq('id', id);
      if (error) throw error;
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

    if (settings.smsReminderText !== undefined) {
      const { data: existing } = await supabase.from('message_templates').select('id').eq('location_id', id).eq('type', 'sms_reminder').maybeSingle();
      if (existing) {
        await supabase.from('message_templates').update({ template_text: settings.smsReminderText }).eq('id', existing.id);
      } else {
        await supabase.from('message_templates').insert({ location_id: id, template_text: settings.smsReminderText, type: 'sms_reminder' });
      }
    }

    await refreshData();
  };

  // Both of these used to target whichever of the two tables the name implied,
  // which was wrong in opposite directions: replies always went to `feedback`
  // even though the ids came from `private_feedback` (so they matched nothing),
  // and the read-flag write hit a table `authenticated` held no UPDATE grant on
  // (so it failed 42501 and the badge never cleared). One table, one target.
  const respondToFeedback = async (id: string, text: string) => {
    const { error } = await supabase.from('guest_feedback').update({ manager_response: text }).eq('id', id);
    if (error) throw error;
    await refreshData();
  };

  const markPrivateFeedbackRead = async (id: string) => {
    const { error } = await supabase.from('guest_feedback').update({ is_read: true }).eq('id', id);
    if (error) throw error;
    await refreshData();
  };

  const subscribe = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session');
      if (error) throw error;
      if (data && data.url) {
        return { success: true, url: data.url };
      }
      return { success: false, error: 'No checkout session URL returned' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to initiate subscription' };
    }
  };

  const openBillingPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session');
      if (error) throw error;
      if (data?.error === 'no_customer') {
        return { success: false, error: 'no_customer' };
      }
      if (data?.url) {
        return { success: true, url: data.url as string };
      }
      return { success: false, error: 'No billing portal URL returned' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to open the billing portal' };
    }
  };

  const updateDigestSetting = async (frequency: 'weekly' | 'monthly', enabled: boolean) => {
    if (!session?.user) return;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
    if (!userData?.account_id) return;

    const existing = state.digestSetting;
    if (existing) {
      const { error } = await supabase
        .from('digest_settings')
        .update({ frequency, enabled, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('digest_settings')
        .insert({ user_id: session.user.id, account_id: userData.account_id, frequency, enabled });
      if (error) throw error;
    }

    setState(prev => ({
      ...prev,
      digestSetting: { id: existing?.id || '', userId: session.user.id, accountId: userData.account_id, frequency, enabled },
    }));
  };

  return (
    <ReviewSailContext.Provider
      value={{
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
        markPrivateFeedbackRead,
        refreshData,
        bulkImport,
        fetchExistingImportKeys,
        sendTestReviewRequest,
        subscribe,
        openBillingPortal,
        completeOnboarding,
        triggerSingleResend,
        updateDigestSetting,
      }}
    >
      {children}
    </ReviewSailContext.Provider>
  );
};

export const useReviewSail = () => {
  const context = useContext(ReviewSailContext);
  if (context === undefined) {
    throw new Error('useReviewSail must be used within a ReviewSailProvider');
  }
  return context;
};
