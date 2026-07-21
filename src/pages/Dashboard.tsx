import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { TrialBanner } from '../components/dashboard/TrialBanner';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';

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
  const [error, setError] = useState('');

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
      <OnboardingWizard
        addLocation={addLocation}
        updateLocationSettings={updateLocationSettings}
        addCustomer={addCustomer}
        addOrder={addOrder}
        addReviewRequest={addReviewRequest}
        refreshData={refreshData}
      />
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
      <TrialBanner
        isPremium={isPremium}
        onUpgrade={handleUpgrade}
        upgrading={upgrading}
      />

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
      <StatsGrid
        totalSent={totalSent}
        totalPending={totalPending}
        deliveryRate={deliveryRate}
        clickRate={clickRate}
        totalClicked={totalClicked}
        totalOptedOut={totalOptedOut}
      />

      {/* Recent Requests Table Section */}
      <RecentRequestsTable
        recentRequests={recentRequests}
        orders={orders}
        customers={customers}
        totalLogs={locationRequests.length}
      />
    </div>
  );
}