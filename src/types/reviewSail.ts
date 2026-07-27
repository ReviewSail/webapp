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

export type DigestSetting = {
  id: string;
  userId: string;
  accountId: string;
  frequency: 'weekly' | 'monthly';
  enabled: boolean;
};

export type ReviewSailState = {
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
  digestSetting: DigestSetting | null;
};

export type ReviewSailContextType = ReviewSailState & {
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
  bulkImport: (rows: Array<{ firstName: string; lastName: string; email: string | null; phone?: string | null; checkoutDate: string }>) => Promise<{ success: boolean; count: number; error?: string }>;
  subscribe: () => Promise<{ success: boolean; url?: string; error?: string }>;
  completeOnboarding: (locationId: string) => Promise<void>;
  triggerSingleResend: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  updateDigestSetting: (frequency: 'weekly' | 'monthly', enabled: boolean) => Promise<void>;
};