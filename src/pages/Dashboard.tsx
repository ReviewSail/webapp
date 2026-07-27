import { useState } from 'react';
import { useReviewSail } from '../context/ReviewSailContext';
import { AlertCircle, MessageSquare, BarChart3 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
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
  const [upgrading, setUpgrading] = useState(false);

  const activeTab = searchParams.get('tab') || 'overview';
  const isPremium = subscriptionStatus === 'active';

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await subscribe();
      if (result.success && result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error('Upgrade failed:', err);
    } finally {
      setUpgrading(false);
    }
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

      <TrialBanner isPremium={isPremium} onUpgrade={handleUpgrade} upgrading={upgrading} />

      <OnboardingWizard />

      {/* Dashboard Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 relative',
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white min-w-[18px] h-4">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

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
            feedbacks={activeLocFeedback}
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