import { useState } from 'react';
import { Star, MessageSquare, Reply, CornerDownRight, CheckCircle, Download } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { format } from 'date-fns';

interface PrivateFeedbackSectionProps {
  feedbacks: any[];
  reviewRequests: any[];
  orders: any[];
  customers: any[];
  onRespond: (id: string, response: string) => Promise<void>;
}

export function PrivateFeedbackSection({
  feedbacks,
  reviewRequests,
  orders,
  customers,
  onRespond
}: PrivateFeedbackSectionProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSendResponse = async (id: string) => {
    if (!responseText.trim()) return;
    setSubmitting(true);
    try {
      await onRespond(id, responseText.trim());
      setSuccessId(id);
      setResponseText('');
      setActiveReplyId(null);
      setTimeout(() => setSuccessId(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportFeedbackCSV = () => {
    if (feedbacks.length === 0) return;

    const headers = ['Guest Name', 'Star Rating', 'Private Comment', 'Submission Date', 'Manager Response'];

    const rows = feedbacks.map((fb: any) => {
      const request = reviewRequests.find((r: any) => r.id === fb.requestId);
      const order = request ? orders.find((o: any) => o.id === request.orderId) : null;
      const customer = order ? customers.find((c: any) => c.id === order.customerId) : null;
      const guestName = customer ? `${customer.firstName} ${customer.lastName}` : 'Confidential Guest';

      return [
        guestName,
        // Recovery messages have no rating; the old `fb.rating.toString()`
        // relied on a 0 sentinel that no longer exists.
        fb.starRating != null ? fb.starRating.toString() : '',
        fb.feedbackText || '',
        fb.createdAt ? format(new Date(fb.createdAt), 'yyyy-MM-dd HH:mm') : '',
        fb.managerResponse || ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `private_feedback_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Guests waiting on a reply</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Private ratings sent straight to you, not to Google.
          </p>
        </div>

        {feedbacks.length > 0 && (
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportFeedbackCSV}>
            Export CSV
          </Button>
        )}
      </div>

      {feedbacks.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          size="sm"
          bare
          title="Nothing waiting on you"
          description="Private ratings from guests will land here as invites go out."
        />
      ) : (
        <div className="divide-y divide-line">
          {feedbacks.map((fb: any) => {
            const request = reviewRequests.find((r: any) => r.id === fb.requestId);
            const order = request ? orders.find((o: any) => o.id === request.orderId) : null;
            const customer = order ? customers.find((c: any) => c.id === order.customerId) : null;

            return (
              <div key={fb.id} className="space-y-3 p-5 transition-colors hover:bg-canvas/60">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                      {fb.guestName ? fb.guestName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : customer ? `${customer.firstName[0]}${customer.lastName[0]}` : '??'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-ink">
                        {fb.guestName || (customer ? `${customer.firstName} ${customer.lastName}` : 'Confidential guest')}
                      </h4>
                      <p className="truncate text-xs text-ink-muted">
                        {fb.guestEmail || customer?.email || 'No email on file'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {fb.starRating == null ? (
                      <span className="inline-flex items-center rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                        Recovery message
                      </span>
                    ) : (
                      [1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= fb.starRating ? 'fill-star text-star' : 'text-line'
                          }`}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-canvas p-3.5 text-[13px] leading-relaxed text-ink">
                  <p>{fb.feedbackText || 'No written message.'}</p>
                </div>

                {fb.managerResponse ? (
                  <div className="flex items-start gap-2.5 pl-5">
                    <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    <div className="flex-1 rounded-lg border border-brand-100 bg-brand-50 p-3.5 text-[13px] text-ink">
                      <span className="mb-1 block text-xs font-medium text-brand-800">You replied</span>
                      <p className="text-ink-muted">{fb.managerResponse}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end">
                    {activeReplyId === fb.id ? (
                      <div className="w-full space-y-2">
                        <textarea
                          rows={2}
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Write your private reply…"
                          aria-label="Private reply to guest"
                          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveReplyId(null);
                              setResponseText('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            icon={Reply}
                            loading={submitting}
                            disabled={!responseText.trim()}
                            onClick={() => handleSendResponse(fb.id)}
                          >
                            Send reply
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {successId === fb.id && (
                          <span className="flex items-center gap-1 text-xs font-medium text-positive">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Reply sent
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Reply}
                          onClick={() => {
                            setActiveReplyId(fb.id);
                            setResponseText('');
                          }}
                        >
                          Reply to guest
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}