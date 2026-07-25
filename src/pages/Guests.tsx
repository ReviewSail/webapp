import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Search, User, Mail, Phone, Calendar, Eye } from 'lucide-react';
import { GuestDetailPanel } from '../components/dashboard/GuestDetailPanel';
import { format } from 'date-fns';

export default function Guests() {
  const { customers, reviewRequests, orders, messageEvents, triggerSingleResend } = useMapRated();
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const selectedRequest = reviewRequests.find(r => r.id === selectedRequestId) || null;
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

  // Build a map: customerId -> latest request
  const customerRequestMap = new Map<string, typeof reviewRequests[0]>();
  reviewRequests.forEach(r => {
    const order = orders.find(o => o.id === r.orderId);
    if (order) {
      const existing = customerRequestMap.get(order.customerId);
      if (!existing || new Date(r.sentAt || 0) > new Date(existing.sentAt || 0)) {
        customerRequestMap.set(order.customerId, r);
      }
    }
  });

  const filteredCustomers = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Guests</h1>
        <p className="text-sm text-slate-500 mt-1">All customer records and their latest review request status.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Guest</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Last Request</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <User className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No guests found</p>
                    <p className="text-xs text-slate-400 mt-1">Import or add guests to see them here.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const latestRequest = customerRequestMap.get(customer.id);
                  const order = latestRequest ? orders.find(o => o.id === latestRequest.orderId) : null;

                  const statusLabel = (status: string) => {
                    switch (status) {
                      case 'pending': return 'Pending';
                      case 'sent': return 'Sent';
                      case 'clicked': return 'Clicked';
                      case 'opted_out': return 'Opted Out';
                      case 'expired': return 'Expired';
                      case 'already_reviewed': return 'Reviewed';
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
                      default: return 'bg-slate-50 text-slate-600 border-slate-200';
                    }
                  };

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                            {customer.firstName?.[0]}{customer.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{customer.firstName} {customer.lastName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                              <Mail className="h-3 w-3" />
                              <span>{customer.email}</span>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                              <Phone className="h-3 w-3" />
                              <span>{customer.phone}</span>
                            </div>
                          )}
                          {!customer.email && !customer.phone && (
                            <span className="text-xs text-slate-400">No contact info</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {latestRequest?.sentAt ? format(new Date(latestRequest.sentAt), 'MMM d, h:mm a') : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {latestRequest ? (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(latestRequest.status)}`}>
                            {statusLabel(latestRequest.status)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">No requests</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {latestRequest && (
                          <button
                            onClick={() => handleOpenDrawer(latestRequest.id)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
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
    </div>
  );
}