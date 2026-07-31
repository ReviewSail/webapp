import { useState } from 'react';
import { useReviewSail, isActionableFeedback } from '../context/ReviewSailContext';
import { AlertCircle, MessageSquare, BarChart3 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TabNav } from '../components/ui/TabNav';
import { useToast } from '../components/ui/Toast';
import { TrialBanner } from '../components/dashboard/TrialBanner';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';
import { PrivateFeedbackSection } from '../components/dashboard/PrivateFeedbackSection';
import { PrivateFeedbackInbox } from '../components/dashboard/PrivateFeedbackInbox';
import { TeamRecognitionCard } from '../components/dashboard/TeamRecognitionCard';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/roles';

export default function Dashboard() {
  const { role } = useAuth();
  const {
    activeLocationId,
    locations,
    reviewRequests,
    orders,
    customers,
    feedbacks,
    subscriptionStatus,
    subscribe,
    respondToFeedback,
    unreadPrivateFeedbackCount
  } = useReviewSail();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);

  const activeTab = searchParams.get('tab') || 'overview';

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await subscribe();
      if (result.success && result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.error || "Couldn't start checkout. Try again in a moment.");
    } catch (err) {
      console.error('Upgrade failed:', err);
      toast.error("Couldn't start checkout. Try again in a moment.");
    } finally {
      setUpgrading(false);
    }
  };

  // Filter for active location
  const activeLocOrders = orders.filter(o => o.locationId === activeLocationId);
  const activeLocOrderIds = new Set(activeLocOrders.map(o => o.id));
  const activeLocRequests = reviewRequests.filter(r => activeLocOrderIds.has(r.orderId));
  // guest_feedback carries location_id directly, so this no longer has to walk
  // request -> order to find the tenant — and no longer silently drops rows
  // whose request has since been deleted.
  const activeLocFeedback = feedbacks.filter(f => f.locationId === activeLocationId);
  // The private-feedback panel is an action queue, so it shows only guests who
  // need a reply. Analytics still averages every rating, happy ones included.
  const actionableFeedback = activeLocFeedback.filter(isActionableFeedback);

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

  // An unset review link means every 5-star guest hits a dead end, silently.
  // Worth shouting about, since nothing else surfaces it.
  const activeLoc = locations.find(l => l.id === activeLocationId) || null;
  const missingReviewUrl = !!activeLoc && !activeLoc.googlePlaceUrl?.trim();

  const tabs = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'feedback', label: 'Private Feedback', icon: MessageSquare, badge: unreadPrivateFeedbackCount },
  ];

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

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

      {missingReviewUrl && activeLoc?.onboardingComplete && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3 text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">No Google review link for {activeLoc.name}</h4>
            <p className="text-xs mt-0.5">
              Guests who rate you 4 or 5 stars currently have nowhere to post their review — every one of them is
              being lost.{' '}
              <button
                onClick={() => navigate('/settings?tab=locations')}
                className="underline font-semibold hover:text-amber-900"
              >
                Add your review link
              </button>
            </p>
          </div>
        </div>
      )}

      <TrialBanner status={subscriptionStatus} onUpgrade={handleUpgrade} upgrading={upgrading} />

      <OnboardingWizard />

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="space-y-8">
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
            feedbacks={actionableFeedback}
            reviewRequests={reviewRequests}
            orders={orders}
            customers={customers}
            onRespond={respondToFeedback}
          />

          {isAdmin(role) && (
            <div className="mt-8">
              <TeamRecognitionCard />
            </div>
          )}
        </div>
      )}

      {activeTab === 'feedback' && (
        <PrivateFeedbackInbox />
      )}
    </div>
  );
}