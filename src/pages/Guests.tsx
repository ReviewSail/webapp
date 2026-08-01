import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReviewSail } from '../context/ReviewSailContext';
import { Search, User, Mail, Phone, Eye, FileUp } from 'lucide-react';
import { GuestDetailPanel } from '../components/dashboard/GuestDetailPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { format } from 'date-fns';

export default function Guests() {
  const { customers, reviewRequests, orders, messageEvents, triggerSingleResend } = useReviewSail();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
    const result = await triggerSingleResend(requestId);
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
      <PageHeader
        title="Guests"
        description="Everyone you've imported, and where their review invite got to."
        action={
          <Button icon={FileUp} onClick={() => navigate('/import')}>
            Import guests
          </Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line bg-card text-sm focus:border-brand-500 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-canvas">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Guest</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Last Request</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-ink-muted uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    {/* A failed search and an empty account are different
                        situations. Offering "Import guests" to someone who just
                        mistyped a name is noise; withholding it from someone
                        with no guests at all is the dead end this page had. */}
                    {search.trim() ? (
                      <EmptyState
                        icon={Search}
                        size="sm"
                        bare
                        title="No guests match that search"
                        description="Try part of a name, an email address, or a phone number."
                      />
                    ) : (
                      <EmptyState
                        icon={User}
                        size="sm"
                        bare
                        title="No guests yet"
                        description="Import a checkout report and ReviewSail invites each guest the day they leave."
                        action={
                          <Button icon={FileUp} onClick={() => navigate('/import')}>
                            Import guests
                          </Button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const latestRequest = customerRequestMap.get(customer.id);

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
                      case 'pending': return 'bg-caution-soft text-caution border-caution/20';
                      case 'sent': return 'bg-brand-50 text-brand-700 border-brand-200';
                      case 'clicked': return 'bg-positive-soft text-positive border-positive/20';
                      case 'opted_out': return 'bg-critical-soft text-critical border-critical/20';
                      case 'expired': return 'bg-canvas text-ink-muted border-line';
                      case 'already_reviewed': return 'bg-brand-50 text-brand-700 border-brand-200';
                      default: return 'bg-canvas text-ink-muted border-line';
                    }
                  };

                  return (
                    <tr key={customer.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-brand-50 text-brand-700 font-bold text-xs flex items-center justify-center">
                            {customer.firstName?.[0]}{customer.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ink">{customer.firstName} {customer.lastName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center space-x-1.5 text-xs text-ink-muted">
                              <Mail className="h-3 w-3" />
                              <span>{customer.email}</span>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center space-x-1.5 text-xs text-ink-muted">
                              <Phone className="h-3 w-3" />
                              <span>{customer.phone}</span>
                            </div>
                          )}
                          {!customer.email && !customer.phone && (
                            <span className="text-xs text-ink-faint">No contact info</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-muted">
                        {latestRequest?.sentAt ? format(new Date(latestRequest.sentAt), 'MMM d, h:mm a') : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {latestRequest ? (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(latestRequest.status)}`}>
                              {statusLabel(latestRequest.status)}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-faint">No requests</span>
                          )}
                          {latestRequest && (() => {
                            const order = orders.find(o => o.id === latestRequest.orderId);
                            if (order?.midstaySent) {
                              return (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-brand-50 text-brand-700 border-brand-200">
                                  🏨 Mid-Stay ✓
                                </span>
                              );
                            }
                            if (order && order.status === 'completed' && order.checkinDate) {
                              const checkin = new Date(order.checkinDate);
                              const checkout = new Date(order.checkoutDate);
                              const oneDayMs = 24 * 60 * 60 * 1000;
                              const now = Date.now();
                              if (checkin.getTime() < now - oneDayMs && checkout.getTime() > now + oneDayMs) {
                                return (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-brand-50 text-brand-500 border-brand-200">
                                    ⏳ Mid-Stay Pending
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {latestRequest && (
                          <button
                            onClick={() => handleOpenDrawer(latestRequest.id)}
                            className="p-1.5 hover:bg-muted rounded-lg text-ink-faint hover:text-ink-muted transition-colors"
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