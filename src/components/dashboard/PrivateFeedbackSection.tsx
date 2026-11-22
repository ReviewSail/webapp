import { Star, MessageSquare, Download } from 'lucide-react';
import { InternalFeedbackNote } from './InternalFeedbackNote';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { format } from 'date-fns';

interface PrivateFeedbackSectionProps {
  feedbacks: any[];
  reviewRequests: any[];
  orders: any[];
  customers: any[];
  onSaveNote: (id: string, note: string) => Promise<void>;
}

export function PrivateFeedbackSection({
  feedbacks,
  reviewRequests,
  orders,
  customers,
  onSaveNote
}: PrivateFeedbackSectionProps) {

  const handleExportFeedbackCSV = () => {
    if (feedbacks.length === 0) return;

    const headers = ['Guest Name', 'Star Rating', 'Private Comment', 'Submission Date', 'Internal Note (not sent to guest)'];

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
          <h2 className="text-[15px] font-semibold text-ink">Private feedback and internal notes</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Notes saved here are not sent to guests and do not mark an issue as resolved.
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

                <InternalFeedbackNote id={fb.id} savedNote={fb.managerResponse ?? null} onSaveNote={onSaveNote} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
