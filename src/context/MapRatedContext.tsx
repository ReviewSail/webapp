import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';

export type Location = {
  id: string;
  name: string;
  googlePlaceUrl: string;
  templateText?: string;
  timezone: string;
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

type MapRatedState = {
  locations: Location[];
  customers: Customer[];
  orders: Order[];
  reviewRequests: ReviewRequest[];
  optOuts: OptOut[];
  activeLocationId: string | null;
  loading: boolean;
};

type MapRatedContextType = MapRatedState & {
  setActiveLocationId: (id: string) => void;
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  addOrder: (order: Omit<Order, 'id'>) => Promise<Order | null>;
  addOptOut: (email: string) => Promise<void>;
  addReviewRequest: (orderId: string) => Promise<void>;
  updateLocationSettings: (id: string, settings: Partial<Location>) => Promise<void>;
  refreshData: () => Promise<void>;
  bulkImport: (rows: Array<{ firstName: string, lastName: string, email: string | null, phone?: string | null, checkoutDate: string }>) => Promise<{ success: boolean, count: number, error?: string }>;
};

const initialState: MapRatedState = {
  locations: [],
  customers: [],
  orders: [],
  reviewRequests: [],
  optOuts: [],
  activeLocationId: null,
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
      // Fetch locations
      const { data: locData } = await supabase.from('locations').select('*');
      
      const parsedLocations: Location[] = (locData || []).map(l => ({
        id: l.id,
        name: l.name,
        googlePlaceUrl: l.google_place_url || '',
        timezone: l.timezone || 'UTC'
      }));

      // Fetch message templates for the locations to merge templateText
      const { data: templatesData } = await supabase.from('message_templates').select('*');
      
      const locations = parsedLocations.map(loc => {
        const t = templatesData?.find(t => t.location_id === loc.id);
        return { ...loc, templateText: t?.template_text || '' };
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

      setState(prev => ({
        ...prev,
        locations,
        customers,
        orders,
        reviewRequests,
        optOuts,
        activeLocationId: prev.activeLocationId || (locations.length > 0 ? locations[0].id : null),
        loading: false
      }));

    } catch (e) {
      console.error('Failed to fetch from supabase', e);
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

  const addCustomer = async (customer: Omit<Customer, 'id'>) => {
    // Note: requires account_id logic, assuming handled by trigger or we fetch it
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
    if (!userData) return null;

    const { data, error } = await supabase.from('customers').insert({
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
    // Check for opt-out first (compliance)
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
        .from('review_requests')
        .insert(requestsToInsert);

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
    if (settings.name || settings.googlePlaceUrl || settings.timezone) {
      await supabase.from('locations').update({
        name: settings.name,
        google_place_url: settings.googlePlaceUrl,
        timezone: settings.timezone
      }).eq('id', id);
    }
    
    if (settings.templateText !== undefined) {
      const { data: existing } = await supabase.from('message_templates').select('id').eq('location_id', id).single();
      if (existing) {
        await supabase.from('message_templates').update({ template_text: settings.templateText }).eq('id', existing.id);
      } else {
        await supabase.from('message_templates').insert({ location_id: id, template_text: settings.templateText, type: 'email' });
      }
    }
    
    await refreshData();
  };

  return (
    <MapRatedContext.Provider value={{
      ...state,
      setActiveLocationId,
      addCustomer,
      addOrder,
      addOptOut,
      addReviewRequest,
      updateLocationSettings,
      refreshData,
      bulkImport
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