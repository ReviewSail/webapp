import { useState } from 'react';
import { Inbox, RefreshCw, Eye, Check } from 'lucide-react';
import { ReviewRequest, Order, Customer, useReviewSail } from '../../context/ReviewSailContext';
import { GuestDetailPanel } from './GuestDetailPanel';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { format } from 'date-fns';

interface RecentRequestsTableProps {
  recentRequests: ReviewRequest[];
  orders: Order[];
  customers: Customer[];
  totalLogs: number;
  loading?: boolean;
}

export function RecentRequestsTable({
  recentRequests,
  orders,
  customers,
  totalLogs,
  loading
}: RecentRequestsTableProps) {
  const { messageEvents, triggerSingleResend } = useReviewSail();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const selectedRequest = recentRequests.find(r => r.id === selectedRequestId) || null;
  const selectedOrder = selectedRequest ? (orders.find(o => o.id === selectedRequest.orderId) || null) : null;
  const selectedCustomer = selectedOrder ? (customers.find(c => c.id === selectedOrder.customerId) || null) : null;
  const selectedEvents = selectedRequestId ? messageEvents.filter(e => e.requestId === selectedRequestId) : [];

  const handleOpenDrawer = (requestId: string) => {
    setSelectedRequestId(requestId);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedRequestId(null);
  };

  const handleResend = async (requestId: string): Promise<boolean> => {
    setSendingId(requestId);
    const result = await triggerSingleResend(requestId);
    if (result.success) {
      setSuccessId(requestId);
      setTimeout(() => setSuccessId(null), 3000);
    }
    setSendingId(null);
    return result.success;
  };

  // "No requests yet" is a claim about the account, so don't make it until the
  // data has actually arrived.
  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-card p-5" aria-hidden="true">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-line" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-line/60" />
          ))}
        </div>
        <span className="sr-only">Loading recent requests…</span>
      </div>
    );
  }

  if (recentRequests.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No requests yet"
        description="Import guests to start sending review invites."
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Recent requests</h2>
          <span className="tnum text-xs text-ink-muted">{totalLogs.toLocaleString()} total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted">Guest</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted">Status</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted">Sent</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentRequests.map((req) => {
                const order = orders.find(o => o.id === req.orderId);
                const customer = order ? customers.find(c => c.id === order.customerId) : null;
                const isSending = sendingId === req.id;
                const isSuccess = successId === req.id;

                return (
                  <tr key={req.id} className="transition-colors hover:bg-canvas">
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                          {customer ? `${customer.firstName?.[0]}${customer.lastName?.[0]}` : '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown guest'}
                          </p>
                          {customer?.email && (
                            <p className="truncate text-xs text-ink-muted">{customer.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={req.status} />
                        {order?.midstaySent && (
                          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                            Mid-stay sent
                          </span>
                        )}
                        {order && !order.midstaySent && order.status === 'completed' && order.checkinDate && (() => {
                          const checkin = new Date(order.checkinDate);
                          const checkout = new Date(order.checkoutDate);
                          const oneDayMs = 24 * 60 * 60 * 1000;
                          const now = Date.now();
                          if (checkin.getTime() < now - oneDayMs && checkout.getTime() > now + oneDayMs) {
                            return (
                              <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                                Mid-stay due
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-sm text-ink-muted">
                      {req.sentAt ? format(new Date(req.sentAt), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenDrawer(req.id)}
                          className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-line/50 hover:text-ink"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {req.status !== 'private_feedback' && req.status !== 'clicked' && (
                          <button
                            onClick={() => handleResend(req.id)}
                            disabled={isSending || isSuccess}
                            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-line/50 hover:text-ink disabled:opacity-50"
                            title="Resend invite"
                          >
                            {isSending ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : isSuccess ? (
                              <Check className="h-4 w-4 text-positive" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && (
        <GuestDetailPanel
          request={selectedRequest}
          order={selectedOrder}
          customer={selectedCustomer}
          events={selectedEvents}
          onClose={handleCloseDrawer}
          onResend={handleResend}
        />
      )}
    </>
  );
}