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
  status: 'pending' | 'sent' | 'clicked' | 'opted_out' | 'expired' | 'already_reviewed';
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

export type MapRatedState = {
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

export type MapRatedContextType = MapRatedState & {
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
};