import { useState } from 'react';
import { useReviewSail, isActionableFeedback, isOutboundRequest } from '../context/ReviewSailContext';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { Notice } from '../components/ui/Notice';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { TrialBanner } from '../components/dashboard/TrialBanner';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { ResultsHero } from '../components/dashboard/ResultsHero';
import { InvitePipeline } from '../components/dashboard/InvitePipeline';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';
import { PrivateFeedbackSection } from '../components/dashboard/PrivateFeedbackSection';
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
    messageEvents,
    loading
  } = useReviewSail();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);

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
  //
  // The funnel counts outbound invites only. A QR submission creates a request
  // row with status 'clicked' and nothing was ever sent, so including them
  // reported invites that never went out and pushed the click rate toward 100%
  // for any property that leans on posters. Feedback totals are unaffected —
  // they come from guest_feedback, which is where a scan legitimately lands.
  const outboundRequests = activeLocRequests.filter(isOutboundRequest);
  const totalSent = outboundRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
  const totalPending = outboundRequests.filter(r => r.status === 'pending').length;
  const totalClicked = outboundRequests.filter(r => r.status === 'clicked').length;
  const totalOptedOut = outboundRequests.filter(r => r.status === 'opted_out').length;

  // Reads 0, not 100, when nothing has gone out. The old form returned 100 for
  // an account with ten pending invites and none sent, which is the exact
  // moment the number most needs to be honest.
  const totalQueued = totalSent + totalPending;
  const deliveryRate = totalQueued > 0 ? Math.round((totalSent / totalQueued) * 100) : 0;
  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  const recentRequests = activeLocRequests.slice(0, 20);
  const totalLogs = activeLocRequests.length;

  const accessDenied = searchParams.get('access_denied') === 'true';

  // An unset review link means every 5-star guest hits a dead end, silently.
  // Worth shouting about, since nothing else surfaces it.
  const activeLoc = locations.find(l => l.id === activeLocationId) || null;
  const missingReviewUrl = !!activeLoc && !activeLoc.googlePlaceUrl?.trim();

  // Private feedback moved to its own route. Bookmarks and old links survive.
  if (searchParams.get('tab') === 'feedback') {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <div className="space-y-6">
      {/* No description here: the hero directly below names the property and
          states the result, so a subtitle would only repeat it. */}
      <PageHeader title="Dashboard" />

      {accessDenied && (
        <Notice tone="caution" title="Access restricted">
          You don't have permission to open that area. Ask an administrator if you need it.
        </Notice>
      )}

      {missingReviewUrl && activeLoc?.onboardingComplete && (
        <Notice
          tone="caution"
          title={`No Google review link for ${activeLoc.name}`}
          action={
            // Locations is where the review-link field actually lives now. This
            // link was briefly pointed at Templates to match where the field had
            // drifted to; moving the field back fixed the cause.
            <Button size="sm" onClick={() => navigate('/settings?tab=locations')}>
              Add review link
            </Button>
          }
        >
          Guests who rate you 4 or 5 stars have nowhere to post their review, so every one of them is lost.
        </Notice>
      )}

      {/* Admins only. RLS keeps the accounts row unreadable to staff, so their
          subscriptionStatus always resolves to 'inactive' — which would tell a
          staff member on a paid account that invites are switched off, and
          offer them an upgrade button that billing then refuses (403). */}
      {isAdmin(role) && (
        <TrialBanner status={subscriptionStatus} onUpgrade={handleUpgrade} upgrading={upgrading} />
      )}

      <OnboardingWizard />

      {/* One opening statement at a time. While setup is unfinished the wizard
          is the page's lead; the hero takes over the moment it's done, which is
          also when its "import your first guests" nudge starts being the right
          next step rather than a duplicate of wizard step 3. */}
      {activeLoc?.onboardingComplete && (
        <ResultsHero
          locationName={activeLoc.name}
          requests={activeLocRequests}
          events={messageEvents}
          totalClicked={totalClicked}
          loading={loading}
          onImportGuests={() => navigate('/import')}
        />
      )}

      <InvitePipeline
        totalSent={totalSent}
        totalPending={totalPending}
        deliveryRate={deliveryRate}
        clickRate={clickRate}
        totalClicked={totalClicked}
        totalOptedOut={totalOptedOut}
        loading={loading}
      />

      <RecentRequestsTable
        recentRequests={recentRequests}
        orders={orders}
        customers={customers}
        totalLogs={totalLogs}
        loading={loading}
      />

      <PrivateFeedbackSection
        feedbacks={actionableFeedback}
        reviewRequests={reviewRequests}
        orders={orders}
        customers={customers}
        onRespond={respondToFeedback}
      />

      {isAdmin(role) && <TeamRecognitionCard />}
    </div>
  );
}
