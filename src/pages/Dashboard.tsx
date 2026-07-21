import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { format } from 'date-fns';
import { supabase } from '../integrations/supabase/client';
import { Link } from 'react-router-dom';
import { 
  Send, 
  CheckCircle, 
  MousePointerClick, 
  TrendingUp, 
  RefreshCw, 
  AlertCircle,
  Inbox,
  Clock,
  UserCheck,
  Sparkles,
  Zap,
  X,
  MapPin,
  Building2,
  ChevronRight,
  UserPlus
} from 'lucide-react';

export default function Dashboard() {
  const { 
    activeLocationId, 
    locations,
    reviewRequests, 
    orders, 
    customers, 
    messageEvents, 
    subscriptionStatus, 
    subscribe, 
    loading, 
    refreshData,
    addLocation,
    updateLocationSettings,
    addCustomer,
    addOrder,
    addReviewRequest
  } = useMapRated();
  
  const [upgrading, setUpgrading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [error, setError] = useState('');

  // Welcome Onboarding Stepper States
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [stepLoading, setStepLoading] = useState(false);
  const [wizardProperty, setWizardProperty] = useState('');
  const [wizardUrl, setWizardUrl] = useState('');
  const [wizardGuest, setWizardGuest] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [wizardCreatedLocId, setWizardCreatedLocId] = useState('');
  const [wizardError, setWizardError] = useState('');

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError('');
    try {
      const res = await subscribe();
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        throw new Error(res.error || "Failed to initiate subscription flow.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Billing gateway failed to initialize.');
    } finally {
      setUpgrading(false);
    }
  };

  // Stepper Submissions
  const handleWizardStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardProperty.trim()) {
      setWizardError('Please enter a property name.');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      const loc = await addLocation(wizardProperty.trim());
      if (loc) {
        setWizardCreatedLocId(loc.id);
        setOnboardingStep(2);
      } else {
        setWizardError('Failed to register property location. Please try again.');
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error occurred during registration.');
    } finally {
      setStepLoading(false);
    }
  };

  const handleWizardStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardUrl.trim() || (!wizardUrl.startsWith('http://') && !wizardUrl.startsWith('https://'))) {
      setWizardError('Google Review Link must start with http:// or https://');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      await updateLocationSettings(wizardCreatedLocId, { googlePlaceUrl: wizardUrl.trim() });
      setOnboardingStep(3);
    } catch (err: any) {
      setWizardError(err.message || 'Failed to save review link.');
    } finally {
      setStepLoading(false);
    }
  };

  const handleWizardStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardGuest.firstName.trim() || !wizardGuest.lastName.trim()) {
      setWizardError('First and last name are required.');
      return;
    }
    if (!wizardGuest.email.trim() && !wizardGuest.phone.trim()) {
      setWizardError('Please enter either email or phone to invite.');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      const customer = await addCustomer({
        firstName: wizardGuest.firstName.trim(),
        lastName: wizardGuest.lastName.trim(),
        email: wizardGuest.email.trim() || null,
        phone: wizardGuest.phone.trim() || null
      });

      if (customer) {
        const order = await addOrder({
          customerId: customer.id,
          locationId: wizardCreatedLocId,
          checkoutDate: new Date().toISOString(),
          status: 'completed'
        });

        if (order) {
          await addReviewRequest(order.id);
          // Complete Onboarding and refresh metrics
          await refreshData();
        } else {
          setWizardError('Created customer but failed to queue order.');
        }
      } else {
        setWizardError('Failed to create customer record.');
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error importing guest.');
    } finally {
      setStepLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading dashboard metrics...</p>
      </div>
    );
  }

  // Interactive Onboarding Welcoming Wizard
  if (locations.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-white border border-slate-200/80 shadow-md rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="h-6 w-6 text-indigo-200" />
            <h2 className="text-lg font-bold">Welcome to MapRated!</h2>
          </div>
          <p className="text-xs text-indigo-100 mt-1">Let's set up your property review automation in under 2 minutes.</p>
          
          {/* Visual Stepper Indicators */}
          <div className="flex items-center space-x-2 mt-6">
            <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 1 ? 'text-white' : 'text-indigo-300'}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 1 ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-indigo-100'}`}>1</span>
              <span>Property Name</span>
            </div>
            <ChevronRight className="h-3 w-3 text-indigo-400" />
            <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 2 ? 'text-white' : 'text-indigo-300'}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 2 ? 'bg-white text-indigo-700' : onboardingStep > 2 ? 'bg-indigo-500 text-indigo-100' : 'bg-indigo-700 text-indigo-300'}`}>2</span>
              <span>Review Link</span>
            </div>
            <ChevronRight className="h-3 w-3 text-indigo-400" />
            <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 3 ? 'text-white' : 'text-indigo-300'}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 3 ? 'bg-white text-indigo-700' : 'bg-indigo-700 text-indigo-300'}`}>3</span>
              <span>Add Guest</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {wizardError && (
            <div className="bg-red-50 text-red-800 p-3.5 rounded-xl border border-red-200 flex items-start space-x-2.5 mb-5 text-xs">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{wizardError}</span>
            </div>
          )}

          {/* STEP 1: Name Your Property */}
          {onboardingStep === 1 && (
            <form onSubmit={handleWizardStep1} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">What is the name of your property?</label>
                <p className="text-xs text-slate-500">This helps guests instantly recognize you (e.g., Beachside Resort, Grand Central Inn).</p>
                <div className="relative mt-2">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={wizardProperty}
                    onChange={e => setWizardProperty(e.target.value)}
                    placeholder="e.g., Beachfront Resort"
                    className="w-full text-sm rounded-lg border-slate-300 pl-10 pr-4 py-2.5 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={stepLoading}
                className="w-full flex items-center justify-center space-x-1 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm"
              >
                {stepLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Next: Add Review Link</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: Add Google Review Link */}
          {onboardingStep === 2 && (
            <form onSubmit={handleWizardStep2} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Add Your Google Review Link</label>
                <p className="text-xs text-slate-500">The direct URL where guests submit their reviews. Ensure it starts with http or https.</p>
                <div className="relative mt-2">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="url"
                    required
                    value={wizardUrl}
                    onChange={e => setWizardUrl(e.target.value)}
                    placeholder="https://g.page/r/your-review-url"
                    className="w-full text-sm rounded-lg border-slate-300 pl-10 pr-4 py-2.5 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={stepLoading}
                className="w-full flex items-center justify-center space-x-1 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm"
              >
                {stepLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Next: Add First Guest</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 3: Import Your First Guest */}
          {onboardingStep === 3 && (
            <form onSubmit={handleWizardStep3} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Queue Your First Guest Invitation</label>
                <p className="text-xs text-slate-500">Test the process with your own contact info to see how beautiful the invites look.</p>
                
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={wizardGuest.firstName}
                      onChange={e => setWizardGuest(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="Jane"
                      className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={wizardGuest.lastName}
                      onChange={e => setWizardGuest(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Doe"
                      className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Email Address</label>
                  <input
                    type="email"
                    value={wizardGuest.email}
                    onChange={e => setWizardGuest(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={wizardGuest.phone}
                    onChange={e => setWizardGuest(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+15551234567"
                    className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={stepLoading}
                className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-emerald-700 active:bg-emerald-800 transition-colors disabled:opacity-50 shadow-sm"
              >
                {stepLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Complete Stepper & Enter Dashboard</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Filter requests for the active location
  const locationOrders = orders.filter(o => o.locationId === activeLocationId);
  const locationOrderIds = new Set(locationOrders.map(o => o.id));
  const locationRequests = reviewRequests
    .filter(r => locationOrderIds.has(r.orderId));
  const locationRequestIds = new Set(locationRequests.map(r => r.id));

  // Sort latest first
  const sortedLocationRequests = [...locationRequests].sort((a, b) => {
    const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return dateB - dateA;
  });

  // Calculate live SaaS metrics
  const totalSent = locationRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
  const totalClicked = locationRequests.filter(r => r.status === 'clicked').length;
  const totalPending = locationRequests.filter(r => r.status === 'pending').length;
  const totalOptedOut = locationRequests.filter(r => r.status === 'opted_out').length;

  // Real Delivery Rate Calculation:
  const locationEvents = messageEvents.filter(e => locationRequestIds.has(e.requestId));
  const totalAttempts = locationEvents.filter(e => ['sent', 'reminder_sent', 'failed'].includes(e.eventType)).length;
  const successfulDeliveries = locationEvents.filter(e => ['sent', 'reminder_sent'].includes(e.eventType)).length;

  const deliveryRate = totalAttempts > 0 
    ? Math.round((successfulDeliveries / totalAttempts) * 1000) / 10 
    : (totalSent > 0 ? 100 : 0);

  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  // Limit to latest 10 requests for the feed table
  const recentRequests = sortedLocationRequests.slice(0, 10);

  // Show inline warning banner if subscription is inactive
  const isPremium = subscriptionStatus === 'active';

  return (
    <div className="space-y-8">
      {/* Dismissible Non-Intrusive Subscription Banner */}
      {!isPremium && !bannerDismissed && (
        <div className="relative bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white p-4.5 rounded-2xl shadow-md border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all">
          <div className="flex items-start space-x-3.5 pr-8">
            <div className="p-2 bg-indigo-500/30 text-indigo-100 rounded-xl mt-0.5 md:mt-0 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm tracking-wide">Your account is on a free trial</h4>
              <p className="text-xs text-indigo-100 mt-0.5">
                Upgrade to Premium Pro for unlimited feedback invite automation, custom message templates, and automatic follow-up reminders.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3 shrink-0 w-full md:w-auto">
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full md:w-auto text-center bg-white text-indigo-700 hover:bg-indigo-50 active:bg-indigo-100 text-xs font-semibold py-2 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-1 shrink-0"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{upgrading ? 'Connecting...' : 'Upgrade Account'}</span>
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors"
              title="Dismiss warning"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl text-sm border border-red-200 flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Welcome / Trigger Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time performance analytics for guest reviews (fully automated background outbox processing active).</p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Hands-Free Hourly Scheduler Active</span>
        </div>
      </div>
      
      {/* Analytical Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Sent */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
            <Send className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invites Sent</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{totalSent}</span>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" />
            {totalPending} requests currently in outbox queue
          </p>
        </div>

        {/* Card 2: Delivery Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <CheckCircle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Delivery Rate</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {deliveryRate}%
            </span>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <AlertCircle className="h-3.5 w-3.5 mr-1 text-slate-400" />
            Strict automated unsubscribe screening active
          </p>
        </div>

        {/* Card 3: Click Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-violet-50 text-violet-600 rounded-xl group-hover:scale-110 transition-transform">
            <MousePointerClick className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review Link Click Rate</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{clickRate}%</span>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {totalClicked} clicks
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <UserCheck className="h-3.5 w-3.5 mr-1 text-slate-400" />
            {totalOptedOut} customers opted out / unsubscribed
          </p>
        </div>
      </div>

      {/* Recent Requests Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent Review Requests</h2>
            <p className="text-xs text-slate-500 mt-0.5">Showing the latest 10 dispatched or pending invitations.</p>
          </div>
          <span className="text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg">
            {locationRequests.length} Total Logs
          </span>
        </div>
        
        {recentRequests.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 mb-4">
              <Inbox className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">No requests found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Head to the "Import Data" page to add guests manually or upload a CSV file to queue reviews.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/75">
                <tr>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Guest</th>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Checkout Date</th>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {recentRequests.map(request => {
                  const order = orders.find(o => o.id === request.orderId);
                  const customer = order ? customers.find(c => c.id === order.customerId) : null;
                  
                  return (
                    <tr key={request.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                            {customer ? `${customer.firstName[0]}${customer.lastName[0]}` : '??'}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">
                              {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Guest'}
                            </div>
                            <div className="text-xs text-slate-400">{customer?.email || 'No email registered'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                        {order ? format(new Date(order.checkoutDate), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          request.status === 'sent' 
                            ? 'bg-blue-50 text-blue-700 border-blue-100' 
                            : request.status === 'clicked' 
                            ? 'bg-green-50 text-green-700 border-green-100' 
                            : request.status === 'opted_out' 
                            ? 'bg-red-50 text-red-700 border-red-100' 
                            : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                            request.status === 'sent' 
                              ? 'bg-blue-500' 
                              : request.status === 'clicked' 
                              ? 'bg-green-500' 
                              : request.status === 'opted_out' 
                              ? 'bg-red-500' 
                              : 'bg-amber-500'
                          }`} />
                          {request.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {request.sentAt ? format(new Date(request.sentAt), 'MMM d, yyyy h:mm a') : (
                          <span className="text-slate-400 italic text-xs">Awaiting process run</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}