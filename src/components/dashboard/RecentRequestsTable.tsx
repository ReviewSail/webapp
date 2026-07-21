import { useState } from 'react';
import { format } from 'date-fns';
import { Inbox, RefreshCw, Send, Eye, Check } from 'lucide-react';
import { ReviewRequest, Order, Customer, MessageEvent, useMapRated } from '../../context/MapRatedContext';
import { GuestDetailPanel } from './GuestDetailPanel';

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
  const { messageEvents, triggerSingleResend } = useMapRated();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const selectedRequest = recentRequests.find(r => r.id === selectedRequestId) || null;
  const selectedOrder = selectedRequest ? orders.find(o => o.id === selectedRequest.orderId) : null;
  const selectedCustomer = selectedOrder ? customers.find(c => c.id === selectedOrder.customerId) : null;
  const selectedEvents = selectedRequestId ? messageEvents.filter(e => e.requestId === selectedRequestId) : [];

  const handleRowClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    setIsDrawerOpen(true);
  };

  const handleResend = async (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation(); // Avoid opening drawer on button click
    setSendingId(requestId);
    setSuccessId(null);
    try {
      const res = await triggerSingleResend(requestId);
      if (res.success) {
        setSuccessId(requestId);
        setTimeout(() => setSuccessId(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Recent Review Requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">Showing the latest 10 dispatched or pending invitations. Click on any row to inspect guest delivery logs.</p>
        </div>
        <span className="text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg">
          {totalLogs} Total Logs
        </span>
      </div>
      
      {recentRequests.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center justify-center">
          <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 mb-4">
            <Inbox className="h-8 w-8" />
          </div>
          <h3 className="font-semibold text-slate-800 text-sm">No requests found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Head to the "Import Data" page to add guests manually or upload a CSV file to queue reviews.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/75">
              <tr>
                <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Guest</th>
                <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Checkout Date</th>
                <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date</th>
                <th className="px-6 py-4.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {recentRequests.map(request => {
                const order = orders.find(o => o.id === request.orderId);
                const customer = order ? customers.find(c => c.id === order.customerId) : null;
                
                return (
                  <tr 
                    key={request.id} 
                    className="hover:bg-slate-50/75 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(request.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                          {customer ? `${customer.firstName[0]}${customer.lastName[0]}` : '??'}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Guest'}
                          </div>
                          <div className="text-xs text-slate-400">{customer?.email || 'No email registered'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                      {order ? format(new Date(order.checkoutDate), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        request.status === 'sent' 
                          ? 'bg-blue-50 text-blue-700 border-blue-100' 
                          : request.status === 'clicked' 
                          ? 'bg-green-50 text-green-700 border-green-100' 
                          : request.status === 'opted_out' 
                          ? 'bg-red-50 text-red-700 border-red-100' 
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                          request.status === 'sent' 
                            ? 'bg-blue-500' 
                            : request.status === 'clicked' 
                            ? 'bg-green-500' 
                            : request.status === 'opted_out' 
                            ? 'bg-red-500' 
                            : 'bg-amber-500'
                        }`} />
                        {request.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {request.sentAt ? format(new Date(request.sentAt), 'MMM d, yyyy h:mm a') : (
                        <span className="text-slate-400 italic text-xs">Awaiting process run</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleRowClick(request.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          title="View Log Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => handleResend(e, request.id)}
                          disabled={sendingId === request.id}
                          className={`p-1.5 rounded-lg border transition-all flex items-center space-x-1 ${
                            successId === request.id 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100/50'
                          }`}
                          title="Trigger instant forced message dispatch"
                        >
                          {sendingId === request.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                          ) : successId === request.id ? (
                            <>
                              <Check className="h-4 w-4" />
                              <span className="text-[10px] font-bold">Dispatched</span>
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              <span className="text-[10px] font-bold">Resend</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over Side Drawer File details */}
      <GuestDetailPanel
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        request={selectedRequest}
        order={selectedOrder}
        customer={selectedCustomer}
        events={selectedEvents}
      />
    </div>
  );
}