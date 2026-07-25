import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { MapRatedState, Location, Customer, Order, ReviewRequest, OptOut, MessageEvent, PrivateFeedback } from '../types/mapRated';

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
};

export function useMapRatedCore() {
  const { session } = useAuth();
  const [state, setState] = useState<MapRatedState>(initialState);

  const refreshData = useCallback(async () => {
    if (!session?.user) return;
    setState(prev => ({ ...prev, loading: true }));

    try {
      // Mock checkout success handling
      const urlParams = new URLSearchParams(window.location.search);
      const isMockSuccess = urlParams.get('mock_checkout_success') === 'true';
      const mockAccountId = urlParams.get('account_id');
      if (isMockSuccess && mockAccountId) {
        const { error: mockUpdateError } = await supabase
          .from('accounts')
          .update({ subscription_status: 'active' })
          .eq('id', mockAccountId);
        if (!mockUpdateError) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // Background DB setup
      if (supabase && supabase.functions) {
        supabase.functions.invoke('setup-db').catch((err) => {
          console.warn('DB setup background invocation skipped or failed:', err);
        });
      }

      // Fetch user account data
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      let subscriptionStatus: MapRatedState['subscriptionStatus'] = 'inactive';
      let stripeCustomerId = null;
      if (userData?.account_id) {
        const { data: accData } = await supabase.from('accounts')
          .select('subscription_status, stripe_customer_id')
          .eq('id', userData.account_id).single();
        if (accData) {
          subscriptionStatus = (accData.subscription_status as any) || 'inactive';
          stripeCustomerId = accData.stripe_customer_id || null;
        }
      }

      // Fetch locations
      const { data: locData } = await supabase.from('locations').select('*');
      const parsedLocations: Location[] = (locData || []).map(l => ({
        id: l.id,
        name: l.name,
        googlePlaceUrl: l.google_place_url || '',
        timezone: l.timezone || 'UTC',
        enableEmail: l.enable_email !== false,
        enableSms: l.enable_sms !== false,
        onboardingComplete: l.onboarding_complete === true,
        preferredSendHour: l.preferred_send_hour != null ? l.preferred_send_hour : 10,
      }));

      // Fetch message templates
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

      // Fetch other entities
      const { data: custData } = await supabase.from('customers').select('*');
      const customers: Customer[] = (custData || []).map(c => ({
        id: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone,
      }));

      const { data: orderData } = await supabase.from('orders').select('*');
      const orders: Order[] = (orderData || []).map(o => ({
        id: o.id, customerId: o.customer_id, locationId: o.location_id,
        checkoutDate: o.checkout_date, status: o.status as Order['status'],
      }));

      const { data: rrData } = await supabase.from('review_requests').select('*');
      const reviewRequests: ReviewRequest[] = (rrData || []).map(r => ({
        id: r.id, orderId: r.order_id,
        status: r.status as ReviewRequest['status'], sentAt: r.sent_at,
      }));

      const { data: optData } = await supabase.from('opt_outs').select('*');
      const optOuts: OptOut[] = (optData || []).map(o => ({
        id: o.id, email: o.email, phone: o.phone, optOutDate: o.opt_out_date,
      }));

      const { data: eventData } = await supabase.from('message_events').select('*');
      const messageEvents: MessageEvent[] = (eventData || []).map(e => ({
        id: e.id, requestId: e.request_id, eventType: e.event_type, createdAt: e.created_at,
      }));

      const { data: fbData } = await supabase.from('feedback').select('*');
      const feedbacks: PrivateFeedback[] = (fbData || []).map(f => ({
        id: f.id, requestId: f.request_id, rating: f.rating,
        comment: f.comment, managerResponse: f.manager_response, createdAt: f.created_at,
      }));

      setState(prev => ({
        ...prev,
        locations, customers, orders, reviewRequests, optOuts, messageEvents, feedbacks,
        subscriptionStatus, stripeCustomerId,
        activeLocationId: prev.activeLocationId || (locations.length > 0 ? locations[0].id : null),
        loading: false,
      }));
    } catch (e) {
      console.error('Failed to fetch from supabase:', e);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [session]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const setActiveLocationId = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeLocationId: id }));
  }, []);

  return { state, setState, refreshData, setActiveLocationId };
}