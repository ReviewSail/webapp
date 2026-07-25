import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { RefreshCw, AlertCircle, FileUp, Send } from 'lucide-react';
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
    respondToFeedback
  } = useMapRated();

  const [searchParams] = useSearchParams();
  const [upgrading, setUpgrading] = useState(false);

  const isPremium = subscriptionStatus === 'active';

  const handleUpgrade = async () => {
    setUpgrading(true);
    const result = await subscribe();
    if (result.success && result.url) {
      window.location.href = result.url;
    }
    setUpgrading(false);
  };

  // Filter for active location
  const activeLocOrders = orders.filter(o => o.locationId === activeLocationId);
  const activeLocOrderIds = new Set(activeLocOrders.map(o => o.id));
  const activeLocRequests = reviewRequests.filter(r => activeLocOrderIds.has(r.orderId));
  const activeLocFeedback = feedbacks.filter(f => {
    if (!f.requestId) return false;
    const req = reviewRequests.find(r => r.id === f.requestId);
    return req && activeLocOrderIds.has(req.orderId);
  });

  // Stats
  const totalSent = activeLocRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
  const totalPending = activeLocRequests.filter(r => r.status === 'pending').length;
  const totalClicked = activeLocRequests.filter(r => r.status === 'clicked').length;
  const totalOptedOut = activeLocRequests.filter(r => r.status === 'opted_out').length;

  const deliveryRate = totalSent > 0 ? Math.round(((totalSent) / (totalSent + totalPending || 1)) * 100) : 100;
  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  const recentRequests = activeLocRequests.slice(0, 20);
  const totalLogs = activeLocRequests.length;

  const accessDenied = searchParams.get('access_denied') === 'true';

  return (
    <div className="space-y-8">
      {accessDenied && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3 text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Access Restricted</h4>
            <p className="text-xs mt-0.5">You don't have permission to access that area. Contact your administrator for details.</p>
          </div>
        </div>
      )}

      <TrialBanner isPremium={isPremium} onUpgrade={handleUpgrade} upgrading={upgrading} />

      <OnboardingWizard />

      <StatsGrid
        totalSent={totalSent}
        totalPending={totalPending}
        deliveryRate={deliveryRate}
        clickRate={clickRate}
        totalClicked={totalClicked}
        totalOptedOut={totalOptedOut}
      />

      <RecentRequestsTable
        recentRequests={recentRequests}
        orders={orders}
        customers={customers}
        totalLogs={totalLogs}
      />

      <PrivateFeedbackSection
        feedbacks={activeLocFeedback}
        reviewRequests={reviewRequests}
        orders={orders}
        customers={customers}
        onRespond={respondToFeedback}
      />
    </div>
  );
}