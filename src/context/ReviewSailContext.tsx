import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';
import { readFunctionError } from '../lib/functionError';
import { fetchAllPages } from '../lib/pagedFetch';
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
  /** Booking origin. Null on stays recorded before the column existed. */
  source?: string | null;
  status: 'pending' | 'completed' | 'cancelled';
};

export type ReviewRequest = {
  id: string;
  orderId: string;
  status: 'pending' | 'sent' | 'clicked' | 'opted_out' | 'expired' | 'already_reviewed' | 'private_feedback';
  sentAt?: string;
  /**
   * How the guest reached the gate. 'qr' rows were never sent anything — the
   * guest scanned a poster and the stay was created on submit. Null on rows
   * predating the column.
   */
  origin?: 'email' | 'sms' | 'qr' | null;
};

/**
 * Was an invite actually delivered to this guest?
 *
 * QR submissions land as 'clicked' or 'private_feedback' with no send behind
 * them, so counting them in the funnel reported invites that were never sent
 * and drove the click rate toward 100% for any property that leans on posters.
 * The funnel measures outbound messaging; QR belongs in the feedback totals,
 * which key off guest_feedback rather than review_requests.
 */
export const isOutboundRequest = (request: Pick<ReviewRequest, 'origin'>): boolean =>
  request.origin !== 'qr';

/**
 * Can this request be sent again?
 *
 * Only where the guest has not yet answered. Every other status is either the
 * guest having acted — `clicked`, `private_feedback`, `already_reviewed` and
 * `opted_out` are all "stop contacting me about this stay", two of them
 * explicitly — or `expired`, which Phase 1 of process-reviews would simply
 * re-expire on the next sweep.
 *
 * This is a courtesy check, not the control: process-reviews enforces the same
 * rule server-side, since the dashboard is not the only thing that can call it.
 * Keep the two in step.
 */
export const RESENDABLE_STATUSES: ReadonlyArray<ReviewRequest['status']> = ['pending', 'sent'];

export const canResendRequest = (status: ReviewRequest['status']): boolean =>
  RESENDABLE_STATUSES.includes(status);

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
  source?: string | null;
};

export type BulkImportResult = {
  success: boolean;
  imported: number;
  skippedDuplicates: number;
  /**
   * Rows we tried to write and couldn't. Distinct from rows rejected before
   * the attempt (validation errors) and from rows skipped as duplicates — the
   * owner needs to know which of the three happened.
   */
  failed: number;
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

/**
 * Every column this app actually reads, named explicitly.
 *
 * These reads used to be `select('*')`, which shipped whole rows — including
 * columns no screen renders — on every load and after every write. Anything
 * added here should be something a component genuinely consumes; if a mapper
 * below stops reading a field, drop it from the list too.
 */
const COLUMNS = {
  accounts: 'subscription_status, stripe_customer_id, plan_name, current_period_end, cancel_at_period_end',
  locations:
    'id, name, google_place_url, timezone, enable_email, enable_sms, midstay_enabled, midstay_day, onboarding_complete, preferred_send_hour, recovery_email',
  messageTemplates: 'location_id, type, template_text',
  customers: 'id, first_name, last_name, email, phone',
  orders: 'id, customer_id, location_id, checkout_date, checkin_date, midstay_sent, midstay_sent_at, source, status',
  reviewRequests: 'id, order_id, status, sent_at, origin',
  optOuts: 'id, email, phone, opt_out_date',
  messageEvents: 'id, request_id, event_type, created_at',
  digestSettings: 'id, user_id, account_id, frequency, enabled',
  guestFeedback:
    'id, request_id, location_id, kind, star_rating, feedback_text, guest_name, guest_email, manager_response, is_read, created_at',
} as const;

/**
 * Query keys, one per table.
 *
 * The point of the split is that a write touching one row invalidates one
 * table. This all used to be a single `refreshData()` that re-read eight
 * tables in full, and every mutation called it — marking a single piece of
 * feedback as read re-downloaded the entire account.
 */
const keys = {
  all: ['reviewsail'] as const,
  account: (userId?: string) => ['reviewsail', 'account', userId] as const,
  locations: (userId?: string) => ['reviewsail', 'locations', userId] as const,
  customers: (userId?: string) => ['reviewsail', 'customers', userId] as const,
  orders: (userId?: string) => ['reviewsail', 'orders', userId] as const,
  reviewRequests: (userId?: string) => ['reviewsail', 'review_requests', userId] as const,
  optOuts: (userId?: string) => ['reviewsail', 'opt_outs', userId] as const,
  messageEvents: (userId?: string) => ['reviewsail', 'message_events', userId] as const,
  feedbacks: (userId?: string) => ['reviewsail', 'guest_feedback', userId] as const,
  digestSetting: (userId?: string) => ['reviewsail', 'digest_settings', userId] as const,
};

type AccountSummary = {
  accountId: string | null;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;
  const enabled = !!userId;

  // Local UI state. Not remote data, so it has no business in a query cache.
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Every read below is RLS-scoped to the caller's account, paged through
  // `.range()`, and cached for the durations set in src/lib/queryClient.ts.

  // EGRESS-COST: low — two single-row reads, once per session.
  const accountQuery = useQuery({
    queryKey: keys.account(userId),
    enabled,
    queryFn: async (): Promise<AccountSummary> => {
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

      const { data: userData } = await supabase
        .from('users')
        .select('account_id')
        .eq('id', userId)
        .single();

      const empty: AccountSummary = {
        accountId: userData?.account_id ?? null,
        subscriptionStatus: 'inactive',
        stripeCustomerId: null,
        planName: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
      if (!userData?.account_id) return empty;

      const { data: accData } = await supabase
        .from('accounts')
        .select(COLUMNS.accounts)
        .eq('id', userData.account_id)
        .single();
      if (!accData) return empty;

      return {
        accountId: userData.account_id,
        subscriptionStatus: (accData.subscription_status as SubscriptionStatus) || 'inactive',
        stripeCustomerId: accData.stripe_customer_id || null,
        planName: accData.plan_name || null,
        currentPeriodEnd: accData.current_period_end || null,
        cancelAtPeriodEnd: accData.cancel_at_period_end === true,
      };
    },
  });

  // EGRESS-COST: low — one page in practice; an account has a handful of
  // properties and three templates apiece.
  const locationsQuery = useQuery({
    queryKey: keys.locations(userId),
    enabled,
    queryFn: async (): Promise<Location[]> => {
      const [locData, templatesData] = await Promise.all([
        fetchAllPages<any>('locations', () =>
          supabase.from('locations').select(COLUMNS.locations).order('id'),
        ),
        fetchAllPages<any>('message_templates', () =>
          supabase.from('message_templates').select(COLUMNS.messageTemplates).order('location_id'),
        ),
      ]);

      return locData.map(l => {
        const templateFor = (type: string) =>
          templatesData.find(t => t.location_id === l.id && t.type === type)?.template_text;
        return {
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
          templateText: templateFor('email') || DEFAULT_TEMPLATES.email,
          smsTemplateText: templateFor('sms') || DEFAULT_TEMPLATES.sms,
          smsReminderText: templateFor('sms_reminder') || DEFAULT_TEMPLATES.sms_reminder,
        };
      });
    },
  });

  // EGRESS-COST: high — grows with the guest list. Guests searches this array
  // client-side, so it cannot stop at the first page.
  const customersQuery = useQuery({
    queryKey: keys.customers(userId),
    enabled,
    queryFn: async (): Promise<Customer[]> => {
      const rows = await fetchAllPages<any>('customers', () =>
        supabase.from('customers').select(COLUMNS.customers).order('id'),
      );
      return rows.map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
      }));
    },
  });

  // EGRESS-COST: high — one row per stay, joined to customers in the browser
  // by Analytics.
  const ordersQuery = useQuery({
    queryKey: keys.orders(userId),
    enabled,
    queryFn: async (): Promise<Order[]> => {
      const rows = await fetchAllPages<any>('orders', () =>
        supabase.from('orders').select(COLUMNS.orders).order('id'),
      );
      return rows.map(o => ({
        id: o.id,
        customerId: o.customer_id,
        locationId: o.location_id,
        checkoutDate: o.checkout_date,
        checkinDate: o.checkin_date || undefined,
        midstaySent: o.midstay_sent === true,
        midstaySentAt: o.midstay_sent_at || undefined,
        source: o.source ?? null,
        status: o.status as 'pending' | 'completed' | 'cancelled',
      }));
    },
  });

  // EGRESS-COST: high — one row per stay.
  const reviewRequestsQuery = useQuery({
    queryKey: keys.reviewRequests(userId),
    enabled,
    queryFn: async (): Promise<ReviewRequest[]> => {
      // Newest first, so the dashboard's "Recent Requests" (which just takes the
      // first 20) actually shows the most recent ones. Unordered, Postgres
      // returned an arbitrary 20 rows under a "Recent" heading. `id` breaks ties
      // so the `.range()` windows below cannot overlap or skip a row.
      const rows = await fetchAllPages<any>('review_requests', () =>
        supabase
          .from('review_requests')
          .select(COLUMNS.reviewRequests)
          .order('created_at', { ascending: false })
          .order('id'),
      );
      return rows.map(r => ({
        id: r.id,
        orderId: r.order_id,
        status: r.status as ReviewRequest['status'],
        sentAt: r.sent_at,
        origin: r.origin as ReviewRequest['origin'],
      }));
    },
  });

  // EGRESS-COST: medium — one row per guest who ever opted out.
  const optOutsQuery = useQuery({
    queryKey: keys.optOuts(userId),
    enabled,
    queryFn: async (): Promise<OptOut[]> => {
      const rows = await fetchAllPages<any>('opt_outs', () =>
        supabase.from('opt_outs').select(COLUMNS.optOuts).order('id'),
      );
      return rows.map(o => ({
        id: o.id,
        email: o.email,
        phone: o.phone,
        optOutDate: o.opt_out_date,
      }));
    },
  });

  // EGRESS-COST: high — several rows per request (sent, delivered, clicked).
  // The fastest-growing table in the schema.
  const messageEventsQuery = useQuery({
    queryKey: keys.messageEvents(userId),
    enabled,
    queryFn: async (): Promise<MessageEvent[]> => {
      const rows = await fetchAllPages<any>('message_events', () =>
        supabase.from('message_events').select(COLUMNS.messageEvents).order('id'),
      );
      return rows.map(e => ({
        id: e.id,
        requestId: e.request_id,
        eventType: e.event_type,
        createdAt: e.created_at,
      }));
    },
  });

  // EGRESS-COST: medium — carries free text, so rows are wide.
  const feedbacksQuery = useQuery({
    queryKey: keys.feedbacks(userId),
    enabled,
    queryFn: async (): Promise<GuestFeedback[]> => {
      const rows = await fetchAllPages<any>('guest_feedback', () =>
        supabase.from('guest_feedback').select(COLUMNS.guestFeedback).order('id'),
      );
      return rows.map((f: any) => ({
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
    },
  });

  // EGRESS-COST: low — at most one row.
  const digestSettingQuery = useQuery({
    queryKey: keys.digestSetting(userId),
    enabled,
    queryFn: async (): Promise<DigestSetting | null> => {
      const { data } = await supabase
        .from('digest_settings')
        .select(COLUMNS.digestSettings)
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        accountId: data.account_id,
        frequency: data.frequency as 'weekly' | 'monthly',
        enabled: data.enabled,
      };
    },
  });

  const locations = locationsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const reviewRequests = reviewRequestsQuery.data ?? [];
  const optOuts = optOutsQuery.data ?? [];
  const messageEvents = messageEventsQuery.data ?? [];
  const feedbacks = feedbacksQuery.data ?? [];

  // Happy ratings are never "unread" — nothing about them needs action, and
  // counting them left a badge the manager could not clear.
  const unreadPrivateFeedbackCount = useMemo(
    () => feedbacks.filter(f => !f.isRead && isActionableFeedback(f)).length,
    [feedbacks],
  );

  // Falls back to the first location until the user picks one, matching the
  // behaviour of the old reducer.
  const activeLocationId = selectedLocationId ?? (locations.length > 0 ? locations[0].id : null);

  const loading =
    enabled &&
    (accountQuery.isPending ||
      locationsQuery.isPending ||
      customersQuery.isPending ||
      ordersQuery.isPending ||
      reviewRequestsQuery.isPending);

  /** Invalidate one or more tables. Anything not named keeps its cached copy. */
  const invalidate = useCallback(
    async (...tables: Array<keyof typeof keys>) => {
      await Promise.all(
        tables.map(table => {
          const build = keys[table];
          if (typeof build !== 'function') return Promise.resolve();
          return queryClient.invalidateQueries({ queryKey: build(userId) });
        }),
      );
    },
    [queryClient, userId],
  );

  /**
   * Re-read everything. Still exported because a few callers legitimately want
   * a full resync, but prefer `invalidate('orders')` and friends: this drops
   * every cached table on the floor.
   */
  const refreshData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: keys.all });
  }, [queryClient]);

  const setActiveLocationId = (id: string) => setSelectedLocationId(id);

  const addLocation = async (name: string, googleUrl?: string) => {
    // EGRESS-COST: low — the account id is already cached; no second read.
    const accountId = accountQuery.data?.accountId;
    if (!accountId) return null;

    // EGRESS-COST: low — single row, and only the three columns read below.
    const { data, error } = await supabase.from('locations').insert({
      account_id: accountId,
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
    }).select('id, name, google_place_url').single();

    if (error) {
      console.error(error);
      return null;
    }

    await supabase.from('message_templates').insert([
      { location_id: data.id, type: 'email', template_text: DEFAULT_TEMPLATES.email },
      { location_id: data.id, type: 'sms', template_text: DEFAULT_TEMPLATES.sms },
      { location_id: data.id, type: 'sms_reminder', template_text: DEFAULT_TEMPLATES.sms_reminder },
    ]);

    await invalidate('locations');
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
    // Drop the selection if it pointed at the location that just went away;
    // activeLocationId then falls back to the first remaining one.
    setSelectedLocationId(prev => (prev === id ? null : prev));
    await invalidate('locations');
  };

  const addCustomer = async (customer: Omit<Customer, 'id'>) => {
    const accountId = accountQuery.data?.accountId;
    if (!accountId) return null;

    // EGRESS-COST: low — single row back, named columns only.
    const { data, error } = await supabase.from('customers').insert({
      account_id: accountId,
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    }).select(COLUMNS.customers).single();

    if (error) {
      console.error(error);
      return null;
    }

    await invalidate('customers');
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
      source: order.source || null,
      status: order.status,
    }).select(COLUMNS.orders).single();

    if (error) {
      console.error(error);
      return null;
    }

    await invalidate('orders');
    return {
      id: data.id,
      customerId: data.customer_id,
      locationId: data.location_id,
      checkoutDate: data.checkout_date,
      checkinDate: data.checkin_date || undefined,
      midstaySent: data.midstay_sent === true,
      midstaySentAt: data.midstay_sent_at || undefined,
      source: data.source ?? null,
      status: data.status as 'pending' | 'completed' | 'cancelled',
    };
  };

  const addOptOut = async (email: string) => {
    await supabase.from('opt_outs').insert({ email });
    await invalidate('optOuts');
  };

  const addReviewRequest = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const customer = order ? customers.find(c => c.id === order.customerId) : null;
    let status = 'pending';
    if (customer && optOuts.some(o => o.email === customer.email)) {
      status = 'opted_out';
    }
    await supabase.from('review_requests').insert({ order_id: orderId, status });
    await invalidate('reviewRequests');
  };

  const completeOnboarding = async (locationId: string) => {
    const { error } = await supabase.from('locations').update({ onboarding_complete: true }).eq('id', locationId);
    if (error) throw error;
    await invalidate('locations');
  };

  const triggerSingleResend = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('process-reviews', { body: { review_request_id: requestId } });
      // A non-2xx response arrives as a FunctionsHttpError whose real message
      // is in the response body, not err.message — which is how "this guest has
      // opted out" was surfacing as a bare "Edge Function returned a non-2xx
      // status code".
      if (error) throw new Error(await readFunctionError(error, 'Resend process failed'));
      await invalidate('reviewRequests', 'messageEvents');
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
    const dedupeKeys = new Set<string>();

    // EGRESS-COST: medium — three narrow columns per existing stay, read in
    // pages. Deliberately not cached: the whole point is to catch a duplicate
    // created seconds ago, possibly in another tab.
    let rows: any[];
    try {
      // RLS scopes orders to the caller's account.
      rows = await fetchAllPages<any>('orders (import dedupe)', () =>
        supabase.from('orders').select('checkout_date, customers ( email, phone )').order('id'),
      );
    } catch (error) {
      console.error('Failed to load existing guests for duplicate check:', error);
      return dedupeKeys;
    }

    for (const order of rows) {
      if (!order.checkout_date) continue;
      const customer = order.customers as any;
      const contact =
        customer?.email?.trim().toLowerCase() ||
        customer?.phone?.replace(/\D/g, '') ||
        '';
      if (!contact) continue;
      dedupeKeys.add(`${contact}|${String(order.checkout_date).slice(0, 10)}`);
    }

    return dedupeKeys;
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
    if (!activeLocationId) return { success: false, error: 'No active location selected' };

    let customerId: string | null = null;
    try {
      const accountId = accountQuery.data?.accountId;
      if (!accountId) return { success: false, error: 'No user account linked' };

      // EGRESS-COST: low — three inserts, each returning only the id we chain on.
      const { data: customer, error: custError } = await supabase
        .from('customers')
        .insert({
          account_id: accountId,
          first_name: 'Test',
          last_name: 'Send',
          email: session.user.email,
          phone: null,
        })
        .select('id')
        .single();
      if (custError || !customer) throw custError || new Error('Could not create the test guest');
      customerId = customer.id;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          location_id: activeLocationId,
          customer_id: customer.id,
          checkout_date: new Date().toISOString(),
          status: 'completed',
        })
        .select('id')
        .single();
      if (orderError || !order) throw orderError || new Error('Could not create the test stay');

      const { data: request, error: rrError } = await supabase
        .from('review_requests')
        .insert({ order_id: order.id, status: 'pending' })
        .select('id')
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
        // The delete cascades to the order and the review request.
        await supabase.from('customers').delete().eq('id', customerId);
        await invalidate('customers', 'orders', 'reviewRequests');
      }
    }
  };

  const bulkImport = async (rows: BulkImportRow[]) => {
    if (!activeLocationId) {
      return { success: false, imported: 0, skippedDuplicates: 0, failed: rows.length, error: 'No active location selected' };
    }

    try {
      const accountId = accountQuery.data?.accountId;
      if (!accountId) {
        return { success: false, imported: 0, skippedDuplicates: 0, failed: rows.length, error: 'No user account linked' };
      }
      const locationId = activeLocationId;

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

      // EGRESS-COST: medium — one column per opted-out guest, read in pages.
      const optOutRows = await fetchAllPages<any>('opt_outs (import)', () =>
        supabase.from('opt_outs').select('email').order('id'),
      );
      const optedOutEmails = new Set(optOutRows.map(o => o.email?.toLowerCase()).filter(Boolean));

      // Natural key for pairing inserted customer rows back to their source
      // row. Correlating by array index would assume INSERT ... RETURNING
      // preserves input order, which Postgres does not guarantee and which
      // breaks outright once the insert is chunked.
      // JSON rather than a delimited string: the separator has to be one no
      // name or address can contain. This used to join on a literal NUL, which
      // worked but made the whole file register as binary — `grep` skips it, so
      // every text-based audit of this file silently found nothing.
      const naturalKey = (r: { firstName: string; lastName: string; email: string | null; phone?: string | null }) =>
        JSON.stringify([r.firstName, r.lastName, r.email ?? '', r.phone ?? '']);

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
          // Named columns: the natural-key pairing below needs exactly these.
          .select(COLUMNS.customers);

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
              source: source?.source || null,
              status: 'completed' as const,
            };
          });

          const { data: insertedOrders, error: orderError } = await supabase
            .from('orders')
            .insert(ordersToInsert)
            // Only the id and the customer it belongs to are read below.
            .select('id, customer_id');

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

          // Count what Postgres actually returned, not what we sent — a short
          // insert would otherwise be reported to the owner as a full success.
          imported += insertedOrders.length;
        } catch (batchError) {
          // Roll the batch back by hand — without this a failure here leaves
          // orphan customers with no stay and no review request.
          await supabase.from('customers').delete().in('id', customerIds);
          throw batchError;
        }
      }

      await invalidate('customers', 'orders', 'reviewRequests');
      return { success: true, imported, skippedDuplicates, failed: toImport.length - imported };
    } catch (e: any) {
      console.error(e);
      return {
        success: false,
        imported: 0,
        skippedDuplicates: 0,
        failed: rows.length,
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

    await invalidate('locations');
  };

  // Both of these used to target whichever of the two tables the name implied,
  // which was wrong in opposite directions: replies always went to `feedback`
  // even though the ids came from `private_feedback` (so they matched nothing),
  // and the read-flag write hit a table `authenticated` held no UPDATE grant on
  // (so it failed 42501 and the badge never cleared). One table, one target.
  /**
   * Patch one cached feedback row in place.
   *
   * Both writes below change a single column on a single row we already hold,
   * so there is nothing to re-read. These used to call `refreshData()`, which
   * meant ticking one message as read re-downloaded every guest, stay, request
   * and event in the account.
   */
  const patchCachedFeedback = (id: string, changes: Partial<GuestFeedback>) => {
    queryClient.setQueryData<GuestFeedback[]>(keys.feedbacks(userId), prev =>
      (prev ?? []).map(f => (f.id === id ? { ...f, ...changes } : f)),
    );
  };

  const respondToFeedback = async (id: string, text: string) => {
    const { error } = await supabase.from('guest_feedback').update({ manager_response: text }).eq('id', id);
    if (error) throw error;
    patchCachedFeedback(id, { managerResponse: text });
  };

  const markPrivateFeedbackRead = async (id: string) => {
    const { error } = await supabase.from('guest_feedback').update({ is_read: true }).eq('id', id);
    if (error) throw error;
    patchCachedFeedback(id, { isRead: true });
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
    const accountId = accountQuery.data?.accountId;
    if (!accountId) return;

    // One row per user (digest_settings has UNIQUE(user_id)), so this is an
    // upsert rather than a branch on whether we happen to have seen the row.
    //
    // The insert branch this replaces never read the new row's id back and
    // stored '' instead. The next toggle in the same session then took the
    // update branch and issued `.eq('id', '')`, which Postgres rejects as an
    // invalid uuid — so the setting silently stopped saving after the first
    // change, and only a reload made it work again.
    const { data, error } = await supabase
      .from('digest_settings')
      .upsert(
        {
          user_id: session.user.id,
          account_id: accountId,
          frequency,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select(COLUMNS.digestSettings)
      .single();

    if (error) throw error;

    // The upsert already returned the saved row, so seed the cache with it
    // rather than reading it straight back.
    queryClient.setQueryData<DigestSetting>(keys.digestSetting(userId), {
      id: data.id,
      userId: data.user_id,
      accountId: data.account_id,
      frequency: data.frequency as 'weekly' | 'monthly',
      enabled: data.enabled,
    });
  };

  return (
    <ReviewSailContext.Provider
      value={{
        locations,
        customers,
        orders,
        reviewRequests,
        optOuts,
        messageEvents,
        feedbacks,
        activeLocationId,
        subscriptionStatus: accountQuery.data?.subscriptionStatus ?? 'inactive',
        stripeCustomerId: accountQuery.data?.stripeCustomerId ?? null,
        planName: accountQuery.data?.planName ?? null,
        currentPeriodEnd: accountQuery.data?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: accountQuery.data?.cancelAtPeriodEnd ?? false,
        loading,
        unreadPrivateFeedbackCount,
        digestSetting: digestSettingQuery.data ?? null,
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
