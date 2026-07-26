import { useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { ReviewSailState, Location, Customer, Order } from '../types/reviewSail';

type ActionsDeps = {
  state: ReviewSailState;
  setState: React.Dispatch<React.SetStateAction<ReviewSailState>>;
  refreshData: () => Promise<void>;
};

export function useReviewSailActions({ state, setState, refreshData }: ActionsDeps) {
  const { session } = useAuth();

  const addLocation = useCallback(async (name: string, googleUrl?: string) => {
    if (!session?.user) return null;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
    if (!userData) return null;
    const { data, error } = await supabase.from('locations').insert({
      account_id: userData.account_id, name,
      google_place_url: googleUrl || '', timezone: 'UTC',
      enable_email: true, enable_sms: true, onboarding_complete: false, preferred_send_hour: 10,
      recovery_email: '',
    }).select().single();
    if (error) { console.error(error); return null; }
    await supabase.from('message_templates').insert([
      { location_id: data.id, type: 'email', template_text: 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}' },
      { location_id: data.id, type: 'sms', template_text: 'Hi {firstName}, please share your experience with us at {reviewLink}' },
    ]);
    await refreshData();
    return { id: data.id, name: data.name, googlePlaceUrl: data.google_place_url || '', timezone: 'UTC', enableEmail: true, enableSms: true, onboardingComplete: false, preferredSendHour: 10, recoveryEmail: '' };
  }, [session, refreshData]);

  const deleteLocation = useCallback(async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) throw error;
    setState(prev => ({
      ...prev,
      locations: prev.locations.filter(l => l.id !== id),
      activeLocationId: prev.activeLocationId === id ? (prev.locations.length > 1 ? prev.locations.find(l => l.id !== id)?.id || null : null) : prev.activeLocationId,
    }));
    await refreshData();
  }, [setState, refreshData]);

  const addCustomer = useCallback(async (customer: Omit<Customer, 'id'>) => {
    if (!session?.user) return null;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
    if (!userData) return null;
    const { data, error } = await supabase.from('customers').insert({
      account_id: userData.account_id,
      first_name: customer.firstName, last_name: customer.lastName,
      email: customer.email, phone: customer.phone,
    }).select().single();
    if (error) { console.error(error); return null; }
    await refreshData();
    return { id: data.id, firstName: data.first_name, lastName: data.last_name, email: data.email, phone: data.phone };
  }, [session, refreshData]);

  const addOrder = useCallback(async (order: Omit<Order, 'id'>) => {
    const { data, error } = await supabase.from('orders').insert({
      location_id: order.locationId, customer_id: order.customerId,
      checkout_date: order.checkoutDate, status: order.status,
    }).select().single();
    if (error) { console.error(error); return null; }
    await refreshData();
    return { id: data.id, customerId: data.customer_id, locationId: data.location_id, checkoutDate: data.checkout_date, status: data.status as Order['status'] };
  }, [refreshData]);

  const addOptOut = useCallback(async (email: string) => {
    await supabase.from('opt_outs').insert({ email });
    await refreshData();
  }, [refreshData]);

  const addReviewRequest = useCallback(async (orderId: string) => {
    const order = state.orders.find(o => o.id === orderId);
    const customer = order ? state.customers.find(c => c.id === order.customerId) : null;
    let status = 'pending';
    if (customer && state.optOuts.some(o => o.email === customer.email)) {
      status = 'opted_out';
    }
    await supabase.from('review_requests').insert({ order_id: orderId, status });
    await refreshData();
  }, [state.orders, state.customers, state.optOuts, refreshData]);

  const completeOnboarding = useCallback(async (locationId: string) => {
    const { error } = await supabase.from('locations').update({ onboarding_complete: true }).eq('id', locationId);
    if (error) throw error;
    await refreshData();
  }, [refreshData]);

  const triggerSingleResend = useCallback(async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('process-reviews', { body: { review_request_id: requestId } });
      if (error) throw error;
      await refreshData();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Resend process failed' };
    }
  }, [refreshData]);

  const bulkImport = useCallback(async (rows: Array<{ firstName: string; lastName: string; email: string | null; phone?: string | null; checkoutDate: string }>) => {
    if (!state.activeLocationId) return { success: false, count: 0, error: 'No active location selected' };
    if (!session?.user) return { success: false, count: 0, error: 'Not authenticated' };
    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
      if (!userData) return { success: false, count: 0, error: 'No user account linked' };
      const accountId = userData.account_id;
      const { data: insertedCustomers, error: custError } = await supabase
        .from('customers')
        .insert(rows.map(r => ({ account_id: accountId, first_name: r.firstName, last_name: r.lastName, email: r.email, phone: r.phone || null })))
        .select();
      if (custError || !insertedCustomers) throw custError || new Error('Failed to bulk insert customers');
      const ordersToInsert = insertedCustomers.map((cust: any, idx: number) => ({
        location_id: state.activeLocationId,
        customer_id: cust.id,
        checkout_date: rows[idx] ? new Date(rows[idx].checkoutDate).toISOString() : new Date().toISOString(),
        status: 'completed',
      }));
      const { data: insertedOrders, error: orderError } = await supabase.from('orders').insert(ordersToInsert).select();
      if (orderError || !insertedOrders) throw orderError || new Error('Failed to bulk insert orders');
      const { data: optOuts } = await supabase.from('opt_outs').select('email');
      const optedOutEmails = new Set((optOuts || []).map((o: any) => o.email?.toLowerCase()));
      const requestsToInsert = insertedOrders.map((order: any) => {
        const customer = insertedCustomers.find((c: any) => c.id === order.customer_id);
        const isOptedOut = customer?.email && optedOutEmails.has(customer.email.toLowerCase());
        return { order_id: order.id, status: isOptedOut ? 'opted_out' : 'pending' };
      });
      await supabase.from('review_requests').insert(requestsToInsert);
      await refreshData();
      return { success: true, count: rows.length };
    } catch (e: any) {
      console.error(e);
      return { success: false, count: 0, error: e.message || 'Failed to bulk import data' };
    }
  }, [state.activeLocationId, session, refreshData]);

  const updateLocationSettings = useCallback(async (id: string, settings: Partial<Location>) => {
    const updateData: Record<string, any> = {};
    if (settings.name !== undefined) updateData.name = settings.name;
    if (settings.googlePlaceUrl !== undefined) updateData.google_place_url = settings.googlePlaceUrl;
    if (settings.timezone !== undefined) updateData.timezone = settings.timezone;
    if (settings.enableEmail !== undefined) updateData.enable_email = settings.enableEmail;
    if (settings.enableSms !== undefined) updateData.enable_sms = settings.enableSms;
    if (settings.preferredSendHour !== undefined) updateData.preferred_send_hour = settings.preferredSendHour;
    if (settings.recoveryEmail !== undefined) updateData.recovery_email = settings.recoveryEmail;
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
  }, [refreshData]);

  const respondToFeedback = useCallback(async (id: string, text: string) => {
    const { error } = await supabase.from('feedback').update({ manager_response: text }).eq('id', id);
    if (error) throw error;
    await refreshData();
  }, [refreshData]);

  const subscribe = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session');
      if (error) throw error;
      if (data && data.url) return { success: true, url: data.url };
      return { success: false, error: 'No checkout session URL returned' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to initiate subscription' };
    }
  }, []);

  return {
    addLocation,
    deleteLocation,
    addCustomer,
    addOrder,
    addOptOut,
    addReviewRequest,
    completeOnboarding,
    triggerSingleResend,
    bulkImport,
    updateLocationSettings,
    respondToFeedback,
    subscribe,
  };
}
