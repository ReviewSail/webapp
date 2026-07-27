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
  timezone: string;
  enableEmail: boolean;
  enableSms: boolean;
  midstayEnabled: boolean;
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

export type PrivateFeedback = {
  id: string;
  requestId: string | null;
  rating: number;
  comment: string | null;
  managerResponse: string | null;
  createdAt: string;
  locationId?: string | null;
  feedbackText?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  isRead?: boolean;
  starRating?: number;
};

type ReviewSailState = {
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
  bulkImport: (rows: Array<{ firstName: string; lastName: string; email: string | null; phone?: string | null; checkoutDate: string }>) => Promise<{ success: boolean; count: number; error?: string }>;
  subscribe: () => Promise<{ success: boolean; url?: string; error?: string }>;
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
  loading: true,
  unreadPrivateFeedbackCount: 0,
  digestSetting: null,
};

const ReviewSailContext = createContext<ReviewSailContextType | undefined>(undefined);

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [state, setState] = useState<ReviewSailState>(initialState);

  const refreshData = async () => {
    if (!session?.user) return;
    setState(prev => ({ ...prev, loading: true }));

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isMockSuccess = urlParams.get('mock_checkout_success') === 'true';
      const mockAccountId = urlParams.get('account_id');

      if (isMockSuccess && mockAccountId) {
        await supabase.from('accounts').update({ subscription_status: 'active' }).eq('id', mockAccountId);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Note: setup-db is invoked only when needed (via admin functions), not on every refresh

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
        midstayEnabled: l.midstay_enabled !== false,
        onboardingComplete: l.onboarding_complete === true,
        preferredSendHour: l.preferred_send_hour != null ? l.preferred_send_hour : 10,
        recoveryEmail: l.recovery_email || '',
      }));

      const { data: templatesData } = await supabase.from('message_templates').select('*');
      const locations = parsedLocations.map(loc => {
        const emailTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'email');
        const smsTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'sms');
        return {
          ...loc,
          templateText: emailTemplate?.template_text || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}',
          smsTemplateText: smsTemplate?.template_text || 'Hi {firstName}, please share your experience at {reviewLink}',
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

      const { data: rrData } = await supabase.from('review_requests').select('*');
      const reviewRequests, continuing the `ReviewSailContext.tsx` file:

<dyad-write path="src/context/ReviewSailContext.tsx">
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
  timezone: string;
  enableEmail: boolean;
  enableSms: boolean;
  midstayEnabled: boolean;
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

export type PrivateFeedback = {
  id: string;
  requestId: string | null;
  rating: number;
  comment: string | null;
  managerResponse: string | null;
  createdAt: string;
  locationId?: string | null;
  feedbackText?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  isRead?: boolean;
  starRating?: number;
};

type ReviewSailState = {
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
  bulkImport: (rows: Array<{ firstName: string; lastName: string; email: string | null; phone?: string | null; checkoutDate: string }>) => Promise<{ success: boolean; count: number; error?: string }>;
  subscribe: () => Promise<{ success: boolean; url?: string; error?: string }>;
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
  loading: true,
  unreadPrivateFeedbackCount: 0,
  digestSetting: null,
};

const ReviewSailContext = createContext<ReviewSailContextType | undefined>(undefined);

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [state, setState] = useState<ReviewSailState>(initialState);

  const refreshData = async () => {
    if (!session?.user) return;
    setState(prev => ({ ...prev, loading: true }));

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isMockSuccess = urlParams.get('mock_checkout_success') === 'true';
      const mockAccountId = urlParams.get('account_id');

      if (isMockSuccess && mockAccountId) {
        await supabase.from('accounts').update({ subscription_status: 'active' }).eq('id', mockAccountId);
        window.history.replaceState({}, document.title, window.location.pathname);
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
        midstayEnabled: l.midstay_enabled !== false,
        onboardingComplete: l.onboarding_complete === true,
        preferredSendHour: l.preferred_send_hour != null ? l.preferred_send_hour : 10,
        recoveryEmail: l.recovery_email || '',
      }));

      const { data: templatesData } = await supabase.from('message_templates').select('*');
      const locations = parsedLocations.map(loc => {
        const emailTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'email');
        const smsTemplate = templatesData?.find(t => t.location_id === loc.id && t.type === 'sms');
        return {
          ...loc,
          templateText: emailTemplate?.template_text || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}',
          smsTemplateText: smsTemplate?.template_text || 'Hi {firstName}, please share your experience at {reviewLink}',
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

      const { data: rrData } = await supabase.from('review_requests').select('*');
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

      // Fetch digest settings for current user
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

      let feedbacks: PrivateFeedback[] = [];
      try {
        const { data: privateFbData } = await supabase.from('private_feedback').select('*');
        if (privateFbData) {
          feedbacks = privateFbData.map((f: any) => ({
            id: f.id,
            requestId: f.request_id,
            rating: f.star_rating ?? 0,
            comment: f.feedback_text ?? null,
            managerResponse: f.manager_response ?? null,
            createdAt: f.created_at,
            locationId: f.location_id,
            feedbackText: f.feedback_text,
            guestName: f.guest_name,
            guestEmail: f.guest_email,
            isRead: f.is_read ?? true,
            starRating: f.star_rating,
          }));
        }
      } catch (_) {}

      const { data: fbData } = await supabase.from('feedback').select('*');
      const publicFeedbacks: PrivateFeedback[] = (fbData || []).map(f => ({
        id: f.id,
        requestId: f.request_id,
        rating: f.rating,
        comment: f.comment,
        managerResponse: f.manager_response,
        createdAt: f.created_at,
      }));

      const mergedFeedbacks = [...feedbacks, ...publicFeedbacks.filter(pf => !feedbacks.some(f => f.id === pf.id))];
      const unreadCount = feedbacks.filter(f => f.isRead === false).length;

      setState(prev => ({
        ...prev,
        locations,
        customers,
        orders,
        reviewRequests,
        optOuts,
        messageEvents,
        feedbacks: mergedFeedbacks,
        subscriptionStatus,
        stripeCustomerId,
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
      onboarding_complete: false,
      preferred_send_hour: 10,
      recovery_email: '',
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    await supabase.from('message_templates').insert([
      { location_id: data.id, type: 'email', template_text: 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}' },
      { location_id: data.id, type: 'sms', template_text: 'Hi {firstName}, please share your experience with us at {reviewLink}' },
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

  const bulkImport = async (rows: Array<{ firstName: string; lastName: string; email: string | null; phone?: string | null; checkoutDate: string }>) => {
    if (!state.activeLocationId) {
      return { success: false, count: 0, error: 'No active location selected' };
    }

    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      if (!userData) {
        return { success: false, count: 0, error: 'No user account linked' };
      }
      const accountId = userData.account_id;

      const { data: insertedCustomers, error: custError } = await supabase
        .from('customers')
        .insert(rows.map(r => ({
          account_id: accountId,
          first_name: r.firstName,
          last_name: r.lastName,
          email: r.email,
          phone: r.phone || null,
        })))
        .select();

      if (custError || !insertedCustomers) {
        throw custError || new Error('Failed to bulk insert customers');
      }

      const ordersToInsert = insertedCustomers.map((cust, idx) => ({
        location_id: state.activeLocationId!,
        customer_id: cust.id,
        checkout_date: rows[idx] ? new Date(rows[idx].checkoutDate).toISOString() : new Date().toISOString(),
        status: 'completed' as const,
      }));

      const { data: insertedOrders, error: orderError } = await supabase.from('orders').insert(ordersToInsert).select();
      if (orderError || !insertedOrders) {
        throw orderError || new Error('Failed to bulk insert orders');
      }

      const { data: optOuts } = await supabase.from('opt_outs').select('email');
      const optedOutEmails = new Set((optOuts || []).map(o => o.email?.toLowerCase()));

      const requestsToInsert = insertedOrders.map(order => {
        const customer = insertedCustomers.find(c => c.id === order.customer_id);
        const isOptedOut = customer?.email && optedOutEmails.has(customer.email.toLowerCase());
        return { order_id: order.id, status: isOptedOut ? 'opted_out' : 'pending' };
      });

      const { error: rrError } = await supabase.from('review_requests').insert(requestsToInsert);
      if (rrError) throw rrError;

      await refreshData();
      return { success: true, count: rows.length };
    } catch (e: any) {
      console.error(e);
      return { success: false, count: 0, error: e.message || 'Failed to bulk import data' };
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

    await refreshData();
  };

  const respondToFeedback = async (id: string, text: string) => {
    const { error } = await supabase.from('feedback').update({ manager_response: text }).eq('id', id);
    if (error) throw error;
    await refreshData();
  };

  const markPrivateFeedbackRead = async (id: string) => {
    const { error } = await supabase.from('private_feedback').update({ is_read: true }).eq('id', id);
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
        subscribe,
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