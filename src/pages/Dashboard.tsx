import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileUp, MessageSquare, PauseCircle } from 'lucide-react';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/roles';
import { dashboardSummary } from '../lib/dashboardSummary';
import { friendlyTimezone, friendlySendHour } from '../lib/timezones';
import { isUsableReviewUrl } from '../lib/googleReviewUrl';
import { useToast } from '../components/ui/Toast';
import { Notice } from '../components/ui/Notice';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';

export default function Dashboard() {
  const { role } = useAuth();
  const { activeLocationId, locations, reviewRequests, orders, customers, feedbacks, subscriptionStatus, subscribe, messageEvents, loading, dashboardLoading, dashboardError, refreshData } = useReviewSail();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const [upgrading, setUpgrading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const activeLoc = locations.find(location => location.id === activeLocationId);
  const admin = isAdmin(role);
  const ready = !!activeLoc?.onboardingComplete;
  const paid = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const channelsEnabled = !!activeLoc && (activeLoc.enableEmail || activeLoc.enableSms);
  const busy = loading || dashboardLoading;
  const summary = useMemo(() => activeLoc ? dashboardSummary({
    locationId: activeLoc.id, timezone: activeLoc.timezone || 'UTC', orders, requests: reviewRequests,
    events: messageEvents, feedbacks, customers, enableEmail: activeLoc.enableEmail, enableSms: activeLoc.enableSms, now,
  }) : null, [activeLoc, orders, reviewRequests, messageEvents, feedbacks, customers, now]);
  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await subscribe();
      if (result.success && result.url) { window.location.href = result.url; return; }
      toast.error(result.error || 'Couldn’t start checkout. Please try again.');
    } catch { toast.error('Couldn’t start checkout. Please try again.'); }
    finally { setUpgrading(false); }
  };
  const retry = async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  };
  if (searchParams.get('tab') === 'feedback') return <Navigate to="/inbox" replace />;
  if (busy) return <div role="status" className="space-y-6"><span className="sr-only">Loading your overview…</span><div aria-hidden="true" className="animate-pulse space-y-6"><div className="h-8 w-48 rounded bg-line" /><div className="h-56 rounded-xl bg-line/50" /><div className="h-28 rounded-xl bg-line/30" /></div></div>;
  if (dashboardError) return <div className="space-y-6"><PageHeader title="Overview" /><Notice tone="critical" title="We couldn’t load your overview" action={<Button onClick={retry} loading={refreshing}>Try again</Button>}>Your saved information hasn’t changed. Refresh to try loading it again.</Notice></div>;
  if (!activeLoc || !summary) return <div className="space-y-6"><PageHeader title="Overview" /><Notice title="Choose a property to get started" action={admin ? <Button onClick={() => navigate('/settings?tab=locations')}>Manage properties</Button> : undefined}>Select a property from the header{admin ? ' or add one in Settings.' : ', or ask your administrator for access.'}</Notice></div>;

  const attention = [
    ...(summary.unread > 0 ? [{ title: `${summary.unread} unread guest ${summary.unread === 1 ? 'message' : 'messages'}`, description: 'Review private guest feedback and follow-up messages.', href: '/inbox', action: 'Review feedback' }] : []),
    ...(ready && !isUsableReviewUrl(activeLoc.googlePlaceUrl) ? [{ title: 'Your Google review link needs attention', description: 'Guests need a valid link to reach your review page.', href: admin ? '/settings?tab=locations' : '/inbox', action: admin ? 'Update review link' : 'Ask your administrator', adminOnlyAction: !admin }] : []),
    ...(ready && !channelsEnabled ? [{ title: 'Sending channels are switched off', description: 'Enable email or SMS before queued invites can be sent.', href: '/settings?tab=locations', action: admin ? 'Review sending settings' : 'Ask your administrator', adminOnlyAction: !admin }] : []),
    ...(ready && channelsEnabled && summary.missingContact > 0 ? [{ title: `${summary.missingContact} queued ${summary.missingContact === 1 ? 'invite needs' : 'invites need'} contact details`, description: 'These guests have no contact details for an enabled sending channel.', href: '/guests?filter=contact', action: 'Check guests' }] : []),
    ...(admin && subscriptionStatus === 'past_due' ? [{ title: 'Your payment needs attention', description: 'Review billing to check whether automated sending can continue.', href: '/settings?tab=billing', action: 'Review billing' }] : []),
  ];
  const status = !ready ? 'Finish setup to get your property ready.' : !channelsEnabled ? 'Automated invites paused · No sending channel enabled' : admin && !paid ? 'Automated invites require an active plan' : `${admin ? 'Automated invites on' : 'Sending configured'} · Scheduled from ${friendlySendHour(activeLoc.preferredSendHour ?? 10)} · ${friendlyTimezone(activeLoc.timezone || 'UTC')}`;
  return (
    <div className="space-y-6 sm:space-y-7">
      <PageHeader title={ready ? 'Overview' : 'Welcome to ReviewSail'} description={ready ? status : 'Let’s get your property ready for guest feedback.'} action={ready && summary.hasActivity ? <Button size="lg" icon={FileUp} onClick={() => navigate('/import')}>Add guests</Button> : undefined} />
      {searchParams.get('access_denied') === 'true' && <Notice tone="caution" title="Access restricted">Ask an administrator for access to that area.</Notice>}

      {attention.length > 0 ? <section className="rounded-xl border border-line bg-card px-5 sm:px-6" aria-labelledby="attention-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-5"><h2 id="attention-heading" className="text-lg font-semibold tracking-tight">Needs your attention</h2><span className="text-xs text-ink-muted">Current</span></div>
        <div className="divide-y divide-line">{attention.map(item => <div key={item.title} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4"><div><h3 className="text-sm font-medium text-ink">{item.title}</h3><p className="mt-1 text-sm text-ink-muted">{item.description}</p></div>{item.adminOnlyAction ? <span className="text-sm text-ink-muted">{item.action}</span> : <Link to={item.href} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">{item.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}</div>)}</div>
      </section> : ready && summary.hasActivity ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><CheckCircle2 className="h-4 w-4 text-positive" aria-hidden="true" /><span className="font-medium">No unread guest messages</span><Link to="/inbox" className="text-brand-700 hover:underline">View guest feedback</Link></div> : null}

      <OnboardingWizard />
      {!ready && admin && <p className="max-w-[660px] text-sm text-ink-muted">Automatic sending requires Premium Pro. <Link to="/settings?tab=billing" className="font-medium text-brand-700 hover:underline">View plan details</Link> before adding guests.</p>}

      {ready && !summary.hasActivity && <section className="max-w-[660px] rounded-xl border border-line bg-card p-6 sm:p-8">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><MessageSquare className="h-5 w-5" aria-hidden="true" /></div>
        <h2 className="text-2xl font-semibold tracking-tight">Start with your first guests</h2><p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">Add a checkout report or enter a guest by hand. Their invites and feedback will appear here.</p>
        <div className="my-5 rounded-lg bg-canvas p-4 text-sm text-ink-muted">Importing creates queued invites. With an active plan and an enabled channel, eligible invites enter the sending schedule automatically. Review your message and schedule before importing.</div>
        <div className="flex flex-wrap items-center gap-4"><Button size="lg" icon={FileUp} onClick={() => navigate('/import')}>Add your first guests</Button>{admin && <Link to="/settings?tab=locations" className="text-sm font-medium text-brand-700 hover:underline">Review sending settings</Link>}</div>
      </section>}

      {ready && summary.hasActivity && <>
        <section aria-labelledby="engagement-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="engagement-heading" className="text-lg font-semibold tracking-tight">Guest engagement</h2><span className="text-sm text-ink-muted">Last 30 days · Property time</span></div>
          <dl className="mt-5 grid grid-cols-3 gap-3 sm:gap-5">
            {[['Invites sent', summary.sent], ['Invites clicked', summary.clicked], ['Feedback received', summary.feedback]].map(([label, count]) => <div key={label} className="border-l-2 border-line pl-3 sm:pl-4"><dt className="min-h-10 text-sm text-ink-muted sm:min-h-0">{label}</dt><dd className="tnum mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{count.toLocaleString()}</dd></div>)}
          </dl>
          <details className="mt-4 text-xs text-ink-muted"><summary className="cursor-pointer py-1">What these numbers mean</summary><p className="mt-2 max-w-2xl leading-relaxed">Today and the previous 29 calendar days in your property’s timezone. Sent counts invites with a recorded send time, not confirmed delivery. Clicked counts each invite once, on its first recorded click; it does not confirm a posted review. Feedback includes private submissions from invite links and QR codes. The measures record activity in the period, not a conversion funnel.</p></details>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3 text-sm"><span className="flex items-center gap-2"><PauseCircle className="h-4 w-4 text-ink-muted" aria-hidden="true" /><strong className="tnum font-medium">{summary.queued.toLocaleString()} queued</strong><span className="text-ink-muted">Waiting to send</span></span><Link to="/analytics" className="font-medium text-brand-700 hover:underline">View analytics →</Link></div>
        {summary.latest.length > 0 && <RecentRequestsTable key={activeLocationId} recentRequests={summary.latest} orders={orders} customers={customers} totalLogs={summary.totalInvites} onViewAll={() => navigate('/guests')} timezone={activeLoc.timezone} />}
        {summary.recognition && <blockquote className="border-l-2 border-brand-300 pl-4 text-sm text-ink-muted"><p className="line-clamp-3 leading-relaxed">“{summary.recognition.feedbackText}”</p><footer className="mt-1 text-xs">Positive guest feedback · {summary.recognition.guestName || 'A guest'}</footer></blockquote>}
      </>}
      {ready && admin && !paid && subscriptionStatus !== 'past_due' && <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5"><div><h2 className="text-sm font-medium">{subscriptionStatus === 'canceled' ? 'Resume automated invites' : 'Ready for automated invites?'}</h2><p className="mt-1 text-sm text-ink-muted">Premium Pro includes automatic sending and follow-ups.</p></div><Button variant="secondary" onClick={handleUpgrade} loading={upgrading}>{subscriptionStatus === 'canceled' ? 'Restart Premium Pro' : 'Set up Premium Pro'}</Button></div>}
    </div>
  );
}
