import { useState } from 'react';
import { Inbox, RefreshCw, Send, Eye, Check } from 'lucide-react';
import { ReviewRequest, Order, Customer, useReviewSail } from '../../context/ReviewSailContext';
import { GuestDetailPanel } from './GuestDetailPanel';
import { format } from 'date-fns';

interface RecentRequestsTableProps {
  recentRequests: ReviewRequest[];
  orders: Order[];
  customers: Customer[];
  totalLogs: number;
}

export function RecentRequestsTable({
  recentRequests,
  orders,
  customers,
  totalLogs
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

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'sent': return 'Sent';
      case 'clicked': return 'Clicked';
      case 'opted_out': return 'Opted Out';
      case 'expired': return 'Expired';
      case 'already_reviewed': return 'Reviewed';
      case 'private_feedback': return 'Private Feedback';
      default: return status;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'sent': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'clicked': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'opted_out': return 'bg-red-50 text-red-600 border-red-200';
      case 'expired': return 'bg-slate-50 text-slate-500 border-slate-200';
      case 'already_reviewed': return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'private_feedback': return 'bg-slate-50 text-slate-600 border-slate-300';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  if (recentRequests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">No requests yet</h3>
        <p className="text-sm text-slate-400 mt-1">Import guests to start sending review invites.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <Send className="h-5 w-5 mr-2 text-indigo-600" />
            <span>Recent Requests</span>
          </h2>
          <span className="text-xs text-slate-400">{totalLogs} total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Guest</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Sent</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentRequests.map((req) => {
                const order = orders.find(o => o.id === req.orderId);
                const customer = order ? customers.find(c => c.id === order.customerId) : null;
                const isSending = sendingId === req.id;
                const isSuccess = successId === req.id;

                return (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                          {customer ? `${customer.firstName?.[0]}${customer.lastName?.[0]}` : '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Guest'}
                          </p>
                          {customer?.email && (
                            <p className="text-xs text-slate-400">{customer.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(req.status)}`}>
                        {statusLabel(req.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {req.sentAt ? format(new Date(req.sentAt), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenDrawer(req.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {req.status !== 'private_feedback' && req.status !== 'clicked' && (
                          <button
                            onClick={() => handleResend(req.id)}
                            disabled={isSending || isSuccess}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                            title="Resend invite"
                          >
                            {isSending ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : isSuccess ? (
                              <Check className="h-4 w-4 text-emerald-500" />
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