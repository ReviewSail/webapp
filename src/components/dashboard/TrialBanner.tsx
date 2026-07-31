import { useState } from 'react';
import { Sparkles, Zap, X } from 'lucide-react';
import type { SubscriptionStatus } from '../../context/ReviewSailContext';

interface TrialBannerProps {
  status: SubscriptionStatus;
  onUpgrade: () => Promise<void>;
  upgrading: boolean;
}

/**
 * The upgrade prompt on the dashboard. It used to say "free trial" for every
 * non-active status, including cancelled accounts — and no trial has ever
 * existed. Each state now says what is actually true.
 */
export function TrialBanner({ status, onUpgrade, upgrading }: TrialBannerProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // past_due has its own card on the Billing tab; two competing messages about
  // the same problem is worse than one.
  if (status === 'active' || status === 'trialing' || status === 'past_due' || bannerDismissed) {
    return null;
  }

  const isCanceled = status === 'canceled';

  return (
    <div className="relative bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white p-4.5 rounded-2xl shadow-md border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all animate-fade-in">
      <div className="flex items-start space-x-3.5 pr-8">
        <div className="p-2 bg-indigo-500/30 text-indigo-100 rounded-xl mt-0.5 md:mt-0 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-bold text-sm tracking-wide">
            {isCanceled ? 'Your Premium Pro plan has ended' : 'Automated invites are switched off'}
          </h4>
          <p className="text-xs text-indigo-100 mt-0.5">
            {isCanceled
              ? 'Restart Premium Pro to resume automated invites, reminders, and mid-stay check-ins.'
              : 'Upgrade to Premium Pro for unlimited feedback invite automation, custom message templates, and automatic follow-up reminders.'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3 shrink-0 w-full md:w-auto">
        <button
          onClick={onUpgrade}
          disabled={upgrading}
          className="w-full md:w-auto text-center bg-white text-indigo-700 hover:bg-indigo-50 active:bg-indigo-100 text-xs font-semibold py-2 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-1 shrink-0 disabled:opacity-60"
        >
          <Zap className="h-3.5 w-3.5" />
          <span>{upgrading ? 'Connecting…' : isCanceled ? 'Restart Premium Pro' : 'Upgrade Account'}</span>
        </button>
        <button
          onClick={() => setBannerDismissed(true)}
          className="p-2 hover:bg-white/10 active:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
