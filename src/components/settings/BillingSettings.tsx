import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle, Sparkles, RefreshCw, Zap, AlertTriangle, CreditCard, ExternalLink } from 'lucide-react';
import { useReviewSail } from '../../context/ReviewSailContext';
import { useToast } from '../ui/Toast';

const PLAN_PRICE = '$49/mo';
const DEFAULT_PLAN_NAME = 'Premium Pro';

const INCLUDED = [
  'Automated review invites by email and SMS',
  'Mid-stay check-ins and reminders',
  'Private feedback inbox and service recovery',
  'Full reporting and weekly digests',
];

const formatDate = (iso: string | null) => (iso ? format(new Date(iso), 'MMM d, yyyy') : null);

export function BillingSettings() {
  const {
    subscriptionStatus,
    planName,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    subscribe,
    openBillingPortal,
  } = useReviewSail();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const plan = planName || DEFAULT_PLAN_NAME;
  const periodEnd = formatDate(currentPeriodEnd);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await subscribe();
      if (result.success && result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.error || "Couldn't start checkout. Try again in a moment.");
    } finally {
      setUpgrading(false);
    }
  };

  const handleManage = async () => {
    setOpeningPortal(true);
    try {
      const result = await openBillingPortal();
      if (result.success && result.url) {
        window.location.href = result.url;
        return;
      }
      // The account has no Stripe customer yet, so there is nothing to manage.
      if (result.error === 'no_customer') {
        toast.info('There is no active subscription to manage yet. Upgrade to get started.');
        return;
      }
      toast.error(result.error || "Couldn't open the billing portal. Try again in a moment.");
    } finally {
      setOpeningPortal(false);
    }
  };

  const upgradeButton = (
    <button
      onClick={handleUpgrade}
      disabled={upgrading}
      className="inline-flex items-center space-x-2 bg-indigo-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
    >
      {upgrading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
      <span>{upgrading ? 'Connecting…' : `Upgrade to ${plan} — ${PLAN_PRICE}`}</span>
    </button>
  );

  const manageButton = (
    <button
      onClick={handleManage}
      disabled={openingPortal}
      className="inline-flex items-center space-x-2 bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
    >
      {openingPortal ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      <span>{openingPortal ? 'Opening…' : 'Manage subscription'}</span>
    </button>
  );

  // Payment failed. This is the one state that costs the customer something if
  // they miss it, so it leads with what to do about it.
  if (subscriptionStatus === 'past_due') {
    return (
      <StatusCard
        tone="red"
        icon={AlertTriangle}
        title="Payment failed"
        body="Update your payment method to keep invites running. Stripe will retry automatically until then."
        action={manageButton}
      />
    );
  }

  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    if (cancelAtPeriodEnd) {
      return (
        <StatusCard
          tone="amber"
          icon={AlertTriangle}
          title={periodEnd ? `${plan} ends ${periodEnd}` : `${plan} is scheduled to end`}
          body={
            periodEnd
              ? `Your plan stays active until ${periodEnd}. After that, automated invites stop sending. You can resume it from the billing portal.`
              : 'Your plan stays active until the end of the current period. You can resume it from the billing portal.'
          }
          action={manageButton}
        />
      );
    }

    return (
      <StatusCard
        tone="emerald"
        icon={CheckCircle}
        title={`${plan} · Active`}
        body={
          periodEnd
            ? `Renews ${periodEnd} · ${PLAN_PRICE}. Cancel, switch payment method, or download invoices in the billing portal.`
            : `${PLAN_PRICE}. Cancel, switch payment method, or download invoices in the billing portal.`
        }
        action={manageButton}
      />
    );
  }

  const endedOn = subscriptionStatus === 'canceled' ? periodEnd : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
      <div className="flex items-start space-x-4">
        <div className="flex items-center justify-center h-12 w-12 shrink-0 rounded-full bg-indigo-100 text-indigo-600">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900">
            {endedOn ? `${plan} ended ${endedOn}` : `${plan} — ${PLAN_PRICE}`}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {endedOn
              ? 'Automated invites are paused. Restart your plan to pick up where you left off.'
              : 'Everything you need to turn happy guests into public reviews.'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-start space-x-2.5 text-sm text-slate-600">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {upgradeButton}
        {subscriptionStatus === 'canceled' && manageButton}
      </div>

      <p className="flex items-center space-x-1.5 text-xs text-slate-400">
        <CreditCard className="h-3.5 w-3.5" />
        <span>Payments and invoices are handled by Stripe. Cancel any time.</span>
      </p>
    </div>
  );
}

const tones = {
  emerald: { chip: 'bg-emerald-100 text-emerald-600', border: 'border-slate-200' },
  amber: { chip: 'bg-amber-100 text-amber-600', border: 'border-amber-200' },
  red: { chip: 'bg-red-100 text-red-600', border: 'border-red-200' },
};

function StatusCard({
  tone,
  icon: Icon,
  title,
  body,
  action,
}: {
  tone: keyof typeof tones;
  icon: typeof CheckCircle;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const t = tones[tone];
  return (
    <div className={`bg-white rounded-2xl border ${t.border} shadow-sm p-8 space-y-5`}>
      <div className="flex items-start space-x-4">
        <div className={`flex items-center justify-center h-12 w-12 shrink-0 rounded-full ${t.chip}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{body}</p>
        </div>
      </div>
      <div>{action}</div>
    </div>
  );
}
