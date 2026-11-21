import { PageHeader } from '../components/ui/PageHeader';
import { PrivateFeedbackInbox } from '../components/dashboard/PrivateFeedbackInbox';
import { OwnerFeedbackAlerts } from '../components/dashboard/OwnerFeedbackAlerts';

/**
 * Private feedback used to live behind a tab on the Dashboard while also being
 * a sidebar item — the same content reachable two ways, with the sidebar unable
 * to tell the two apart. It is a place of its own now.
 */
export default function Inbox() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Private feedback"
        description="Private ratings and messages from guests. These are not public Google reviews."
      />
      <OwnerFeedbackAlerts />
      <PrivateFeedbackInbox />
    </div>
  );
}
