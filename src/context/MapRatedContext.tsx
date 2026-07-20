import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Location = {
  id: string;
  name: string;
  googlePlaceUrl: string;
  templateText: string;
  timezone: string;
};

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

export type Order = {
  id: string;
  customerId: string;
  locationId: string;
  checkoutDate: string;
  status: 'pending' | 'completed';
};

export type ReviewRequest = {
  id: string;
  orderId: string;
  status: 'pending' | 'sent' | 'clicked' | 'opted_out';
  sentAt?: string;
};

export type OptOut = {
  id: string;
  email: string;
  phone?: string;
  optOutDate: string;
};

type MapRatedState = {
  locations: Location[];
  customers: Customer[];
  orders: Order[];
  reviewRequests: ReviewRequest[];
  optOuts: OptOut[];
  activeLocationId: string | null;
};

type MapRatedContextType = MapRatedState & {
  setActiveLocationId: (id: string) => void;
  addCustomer: (customer: Omit<Customer, 'id'>) => Customer;
  addOrder: (order: Omit<Order, 'id'>) => Order;
  addOptOut: (email: string) => void;
  addReviewRequest: (orderId: string) => void;
  updateLocationSettings: (id: string, settings: Partial<Location>) => void;
};

const defaultLocations: Location[] = [
  {
    id: 'loc_1',
    name: 'Grand Plaza Hotel',
    googlePlaceUrl: 'https://g.page/r/example/review',
    templateText: 'Hi {firstName}, thanks for staying at Grand Plaza! We hope you had a great time. Could you take a moment to review us? {reviewLink}',
    timezone: 'America/New_York',
  },
  {
    id: 'loc_2',
    name: 'Seaside Resort',
    googlePlaceUrl: 'https://g.page/r/seaside/review',
    templateText: 'Hi {firstName}, thanks for choosing Seaside Resort! Please share your experience: {reviewLink}',
    timezone: 'America/Los_Angeles',
  }
];

const defaultCustomers: Customer[] = [
  { id: 'cus_1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
  { id: 'cus_2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' },
  { id: 'cus_3', firstName: 'Charlie', lastName: 'Brown', email: 'charlie@example.com' },
  { id: 'cus_4', firstName: 'Diana', lastName: 'Prince', email: 'diana@example.com' },
  { id: 'cus_5', firstName: 'Evan', lastName: 'Wright', email: 'evan@example.com' },
];

const defaultOrders: Order[] = [
  { id: 'ord_1', customerId: 'cus_1', locationId: 'loc_1', checkoutDate: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed' },
  { id: 'ord_2', customerId: 'cus_2', locationId: 'loc_1', checkoutDate: new Date(Date.now() - 86400000 * 1).toISOString(), status: 'completed' },
  { id: 'ord_3', customerId: 'cus_3', locationId: 'loc_1', checkoutDate: new Date().toISOString(), status: 'completed' },
  { id: 'ord_4', customerId: 'cus_4', locationId: 'loc_1', checkoutDate: new Date().toISOString(), status: 'pending' },
  { id: 'ord_5', customerId: 'cus_5', locationId: 'loc_1', checkoutDate: new Date(Date.now() + 86400000).toISOString(), status: 'pending' },
];

const defaultReviewRequests: ReviewRequest[] = [
  { id: 'req_1', orderId: 'ord_1', status: 'clicked', sentAt: new Date(Date.now() - 86400000 * 1.5).toISOString() },
  { id: 'req_2', orderId: 'ord_2', status: 'sent', sentAt: new Date(Date.now() - 86400000 * 0.5).toISOString() },
  { id: 'req_3', orderId: 'ord_3', status: 'pending' },
];

const initialState: MapRatedState = {
  locations: defaultLocations,
  customers: defaultCustomers,
  orders: defaultOrders,
  reviewRequests: defaultReviewRequests,
  optOuts: [],
  activeLocationId: defaultLocations[0].id,
};

const MapRatedContext = createContext<MapRatedContextType | undefined>(undefined);

export const MapRatedProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<MapRatedState>(() => {
    const saved = localStorage.getItem('maprated_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse state from localStorage", e);
      }
    }
    return initialState;
  });

  useEffect(() => {
    localStorage.setItem('maprated_state', JSON.stringify(state));
  }, [state]);

  const setActiveLocationId = (id: string) => {
    setState((prev) => ({ ...prev, activeLocationId: id }));
  };

  const addCustomer = (customer: Omit<Customer, 'id'>) => {
    const newCustomer: Customer = { ...customer, id: `cus_${Date.now()}` };
    setState((prev) => ({ ...prev, customers: [...prev.customers, newCustomer] }));
    return newCustomer;
  };

  const addOrder = (order: Omit<Order, 'id'>) => {
    const newOrder: Order = { ...order, id: `ord_${Date.now()}` };
    setState((prev) => ({ ...prev, orders: [...prev.orders, newOrder] }));
    return newOrder;
  };

  const addOptOut = (email: string) => {
    setState((prev) => {
      // Check if already opted out
      if (prev.optOuts.some(o => o.email === email)) return prev;
      
      const newOptOut: OptOut = {
        id: `opt_${Date.now()}`,
        email,
        optOutDate: new Date().toISOString(),
      };
      
      return { ...prev, optOuts: [...prev.optOuts, newOptOut] };
    });
  };

  const addReviewRequest = (orderId: string) => {
    setState((prev) => {
      // Check for opt-out first (compliance)
      const order = prev.orders.find(o => o.id === orderId);
      const customer = order ? prev.customers.find(c => c.id === order.customerId) : null;
      
      let status: ReviewRequest['status'] = 'pending';
      if (customer && prev.optOuts.some(o => o.email === customer.email)) {
        status = 'opted_out';
      }

      const newRequest: ReviewRequest = {
        id: `req_${Date.now()}`,
        orderId,
        status,
      };
      return { ...prev, reviewRequests: [...prev.reviewRequests, newRequest] };
    });
  };

  const updateLocationSettings = (id: string, settings: Partial<Location>) => {
    setState((prev) => ({
      ...prev,
      locations: prev.locations.map(loc => loc.id === id ? { ...loc, ...settings } : loc),
    }));
  };

  return (
    <MapRatedContext.Provider value={{
      ...state,
      setActiveLocationId,
      addCustomer,
      addOrder,
      addOptOut,
      addReviewRequest,
      updateLocationSettings
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
