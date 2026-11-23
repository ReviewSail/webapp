import { StayIssueInbox } from '../components/dashboard/StayIssueInbox';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { PrivateFeedbackInbox } from '../components/dashboard/PrivateFeedbackInbox';
import { OwnerFeedbackAlerts } from '../components/dashboard/OwnerFeedbackAlerts';

/**
 * Private feedback used to live behind a tab on the Dashboard while also being
 * a sidebar item — the same content reachable two ways, with the sidebar unable
 * to tell the two apart. It is a place of its own now.
 */
export default function Inbox() {
  const {role}=useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest inbox"
        description="Guest reports and private feedback for your property team."
      />
      <StayIssueInbox />
      {role==='admin' && <OwnerFeedbackAlerts />}
      <section aria-labelledby="private-feedback-heading" className="space-y-4">
        <h2 id="private-feedback-heading" className="text-lg font-semibold">All private feedback</h2>
        <PrivateFeedbackInbox />
      </section>
    </div>
  );
}
