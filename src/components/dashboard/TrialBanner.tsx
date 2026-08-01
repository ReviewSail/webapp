import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Notice } from '../ui/Notice';
import { Button } from '../ui/Button';
import type { SubscriptionStatus } from '../../context/ReviewSailContext';

interface TrialBannerProps {
  status: SubscriptionStatus;
  onUpgrade: () => Promise<void>;
  upgrading: boolean;
}

const DISMISS_KEY = 'reviewsail:upgrade-banner-dismissed';

/**
 * The upgrade prompt on the dashboard. It used to say "free trial" for every
 * non-active status, including cancelled accounts — and no trial has ever
 * existed. Each state now says what is actually true.
 *
 * It also used to be a full-bleed gradient block sitting directly above the
 * setup wizard's own gradient block, which meant the first screen of a new
 * account was two competing slabs of colour and no data. It is a quiet notice
 * now: the upsell is real information, but it is not the most important thing
 * on the page.
 */
export function TrialBanner({ status, onUpgrade, upgrading }: TrialBannerProps) {
  // status is nullable before billing state has loaded.
  const statusKey = status ?? 'unknown';

  const [dismissed, setDismissed] = useState(() => {
    // Dismissal used to be component state, so the banner came back on every
    // reload — the click never meant anything.
    try {
      return localStorage.getItem(DISMISS_KEY) === statusKey;
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    // Keyed by status so a change in billing state re-surfaces the message.
    try {
      localStorage.setItem(DISMISS_KEY, statusKey);
    } catch {
      /* private browsing — dismissing for the session is good enough */
    }
    setDismissed(true);
  };

  // past_due has its own card on the Billing tab; two competing messages about
  // the same problem is worse than one.
  if (status === 'active' || status === 'trialing' || status === 'past_due' || dismissed) {
    return null;
  }

  const isCanceled = status === 'canceled';

  return (
    <Notice
      tone="info"
      icon={Zap}
      title={isCanceled ? 'Your Premium Pro plan has ended' : 'Automated invites are switched off'}
      onDismiss={dismiss}
      action={
        <Button size="sm" onClick={onUpgrade} loading={upgrading}>
          {upgrading ? 'Connecting…' : isCanceled ? 'Restart Premium Pro' : 'Upgrade'}
        </Button>
      }
    >
      {isCanceled
        ? 'Restart Premium Pro to resume automated invites, reminders, and mid-stay check-ins.'
        : 'Premium Pro sends invites automatically, adds custom message templates, and follows up for you.'}
    </Notice>
  );
}
