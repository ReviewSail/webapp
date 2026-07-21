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
  status: 'pending' | 'sent' | 'clicked' | 'opted_out';
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
};

type MapRatedContextType = MapRatedState & {
  setActiveLocationId: (id: string) => void;
  addLocation: (name: string) => Promise<Location | null>;
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
};

const MapRatedContext = createContext<MapRatedContextType | undefined>(undefined);

export const MapRatedProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [state, setState] = useState<MapRatedState>(initialState);

  const refreshData = async () => {
    if (!session?.user) return;
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      // Detect mock subscription parameters in URL
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
          // Remove query params from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // Trigger database schema migration in the background so it never blocks key queries
      supabase.functions.invoke('setup-db').catch((err) => {
        console.warn('DB setup background invocation skipped or failed:', err);
      });

      // Fetch user account info
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

      // Fetch locations
      const { data: locData } = await supabase.from('locations').select('*');
      
      const parsedLocations: Location[] = (locData || []).map(l => ({
        id: l.id,
        name: l.name,
        googlePlaceUrl: l.google_place_url || '',
        timezone: l.timezone || 'UTC',
        enableEmail: l.enable_email !== false, // Default to true if null
        enableSms: l.enable_sms !== false      // Default to true if null
      }));

      // Fetch message templates for the locations to merge templateText and smsTemplateText
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

      // Fetch customers
      const { data: custData } = await supabase.from('customers').select('*');
      const customers: Customer[] = (custData || []).map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone
      }));

      // Fetch orders
      const { data: orderData } = await supabase.from('orders').select('*');
      const orders: Order[] = (orderData || []).map(o => ({
        id: o.id,
        customerId: o.customer_id,
        locationId: o.location_id,
        checkoutDate: o.checkout_date,
        status: o.status as 'pending' | 'completed' | 'cancelled'
      }));

      // Fetch review requests
      const { data: rrData } = await supabase.from('review_requests').select('*');
      const reviewRequests: ReviewRequest[] = (rrData || []).map(r => ({
        id: r.id,
        orderId: r.order_id,
        status: r.status as 'pending' | 'sent' | 'clicked' | 'opted_out',
        sentAt: r.sent_at
      }));
      
      // Fetch optouts
      const { data: optData } = await supabase.from('opt_outs').select('*');
      const optOuts: OptOut[] = (optData || []).map(o => ({
        id: o.id,
        email: o.email,
        phone: o.phone,
        optOutDate: o.opt_out_date
      }));

      // Fetch message events
      const { data: eventData } = await supabase.from('message_events').select('*');
      const messageEvents: MessageEvent[] = (eventData || []).map(e => ({
        id: e.id,
        requestId: e.request_id,
        eventType: e.event_type,
        createdAt: e.created_at
      }));

      // Fetch private feedbacks
      const { data: fbData } = await supabase.from('feedback').select('*');
      const feedbacks: PrivateFeedback[] = (fbData || []).map(f => ({
        id: f.id,
        requestId: f.request_id,
        rating: f.rating,
        comment: f.comment,
        managerResponse: f.manager_response,
        createdAt: f.created_at
      }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user]);

  const setActiveLocationId = (id: string) => {
    setState((prev) => ({ ...prev, activeLocationId: id }));
  };

  const addLocation = async (name: string) => {
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
    if (!userData) return null;

    const { data, error } = await supabase.from('locations').insert({
      account_id: userData.account_id,
      name,
      timezone: 'UTC',
      enable_email: true,
      enable_sms: true
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    // Create a default email template
    await supabase.from('message_templates').insert({
      location_id: data.id,
      type: 'email',
      template_text: 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}'
    });

    // Create a default SMS template
    await supabase.from('message_templates').insert({
      location_id: data.id,
      type: 'sms',
      template_text: 'Hi {firstName}, please share your experience with us at {reviewLink}'
    });

    await refreshData();
    return {
      id: data.id,
      name: data.name,
      googlePlaceUrl: '',
      timezone: 'UTC',
      enableEmail: true,
      enableSms: true
    };
  };

  const deleteLocation = async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) {
      console.error(error);
      throw error;
    }
    // Switch active property if active was deleted
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

      // 1. Bulk insert customers
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

      // 2. Bulk insert orders
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

      // 3. Bulk insert review requests
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

    if (Object.keys(updateData).length > 0) {
      await supabase.from('locations').update(updateData).eq('id', id);
    }
    
    // Save email template
    if (settings.templateText !== undefined) {
      const { data: existing } = await supabase.from('message_templates').select('id').eq('location_id', id).eq('type', 'email').maybeSingle();
      if (existing) {
        await supabase.from('message_templates').update({ template_text: settings.templateText }).eq('id', existing.id);
      } else {
        await supabase.from('message_templates').insert({ location_id: id, template_text: settings.templateText, type: 'email' });
      }
    }

    // Save SMS template
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
      subscribe
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