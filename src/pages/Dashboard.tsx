import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { RefreshCw, AlertCircle, FileUp, Sparkles, Send } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { TrialBanner } from '../components/dashboard/TrialBanner';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';
import { PrivateFeedbackSection } from '../components/dashboard/PrivateFeedbackSection';

export default function Dashboard() {
  const { 
    activeLocationId, 
    locations,
    reviewRequests, 
    orders, 
    customers, 
    messageEvents, 
    feedbacks,
    subscriptionStatus, 
    subscribe, 
    loading, 
    refreshData,
    addLocation,
    completeOnboarding,
    respondToFeedback
  } = useMapRated();
  
  const [searchParams] = useSearchParams();
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');

  const showAccessDenied = searchParams.get('access_denied') === 'true';

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

  const activeLoc = locations.find(l => l.id === activeLocationId);

  // Requirement 1: If zero locations OR if the active location has not completed onboarding, show full screen onboarding wizard
  const showWizard = locations.length === 0 || (activeLoc && !activeLoc.onboardingComplete);

  if (showWizard) {
    return (
      <OnboardingWizard
        addLocation={addLocation}
        completeOnboarding={completeOnboarding}
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

  // Filter feedbacks for the active location
  const activeLocationFeedbacks = feedbacks.filter(fb => {
    const req = reviewRequests.find(r => r.id === fb.requestId);
    const order = req ? orders.find(o => o.id === req.orderId) : null;
    return order?.locationId === activeLocationId;
  });

  // Show inline warning banner if subscription is inactive
  const isPremium = subscriptionStatus === 'active';

  return (
    <div className="space-y-8">
      {/* Access Denied Warning Alert */}
      {showAccessDenied && (
        <div className="bg-red-50 text-red-800 p-4.5 rounded-2xl border border-red-200 flex items-start space-x-3.5 shadow-sm text-xs animate-fade-in">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-extrabold text-sm text-red-900 mb-1">Access Denied</h4>
            <p>You do not have the required permissions to view Settings. Only Admin users can manage team members or configure property settings.</p>
          </div>
        </div>
      )}

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
      
      {/* Requirement 2: Friendly Empty State Card if totalSent is 0 */}
      {totalSent === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-5 shadow-sm max-w-xl mx-auto my-8">
          <div className="h-16 w-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-2">
            <Send className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-extrabold text-slate-900">No review requests sent yet</h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
              Sync your first guests or add stays manually to trigger instant multi-channel emails, text messages, and direct Google rating generation.
            </p>
          </div>
          <Link
            to="/import"
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all"
          >
            <FileUp className="h-4 w-4" />
            <span>Sync Your First Guests</span>
          </Link>
        </div>
      ) : (
        /* Analytical Cards Grid */
        <StatsGrid
          totalSent={totalSent}
          totalPending={totalPending}
          deliveryRate={deliveryRate}
          clickRate={clickRate}
          totalClicked={totalClicked}
          totalOptedOut={totalOptedOut}
        />
      )}

      {/* Private Feedback Manager Portal Feed */}
      <PrivateFeedbackSection
        feedbacks={activeLocationFeedbacks}
        reviewRequests={reviewRequests}
        orders={orders}
        customers={customers}
        onRespond={respondToFeedback}
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