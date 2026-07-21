import { useState, useMemo } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Search, Download, Users, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { GuestDetailPanel } from '../components/dashboard/GuestDetailPanel';

const ITEMS_PER_PAGE = 10;

export default function Guests() {
  const { 
    activeLocationId, 
    customers, 
    orders, 
    reviewRequests, 
    messageEvents 
  } = useMapRated();

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Drawer / Side Panel State
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filter orders for the active location
  const locationOrders = useMemo(() => {
    return orders.filter(o => o.locationId === activeLocationId);
  }, [orders, activeLocationId]);

  // Map customers who have orders at this location
  const locationGuestsData = useMemo(() => {
    if (!activeLocationId) return [];

    // Group orders by customerId
    const customerOrdersMap = new Map<string, typeof orders>();
    locationOrders.forEach(o => {
      const arr = customerOrdersMap.get(o.customerId) || [];
      arr.push(o);
      customerOrdersMap.set(o.customerId, arr);
    });

    const results = [];

    for (const [customerId, custOrders] of customerOrdersMap.entries()) {
      const customer = customers.find(c => c.id === customerId);
      if (!customer) continue;

      // Find last checkout order
      const sortedOrders = [...custOrders].sort((a, b) => 
        new Date(b.checkoutDate).getTime() - new Date(a.checkoutDate).getTime()
      );
      const lastOrder = sortedOrders[0];

      // Find all review requests for this customer's orders at this location
      const orderIds = new Set(custOrders.map(o => o.id));
      const guestRequests = reviewRequests.filter(r => orderIds.has(r.orderId));
      
      // Sort guest requests by sent date (latest first) or creation
      const sortedRequests = [...guestRequests].sort((a, b) => {
        const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return dateB - dateA;
      });

      const latestRequest = sortedRequests[0] || null;
      const totalRequestsSent = guestRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;

      results.push({
        customer,
        lastCheckoutDate: lastOrder ? lastOrder.checkoutDate : null,
        totalRequestsSent,
        latestRequest,
        // Keep a reference to the latest request ID for the side drawer click
        latestRequestId: latestRequest ? latestRequest.id : null,
        lastStatus: latestRequest ? latestRequest.status : 'pending',
        order: lastOrder
      });
    }

    return results;
  }, [activeLocationId, customers, locationOrders, reviewRequests]);

  // Filter guests based on search term (name, email, or phone)
  const filteredGuests = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return locationGuestsData;

    return locationGuestsData.filter(g => {
      const fullName = `${g.customer.firstName} ${g.customer.lastName}`.toLowerCase();
      const email = (g.customer.email || '').toLowerCase();
      const phone = (g.customer.phone || '').toLowerCase();

      return fullName.includes(term) || email.includes(term) || phone.includes(term);
    });
  }, [locationGuestsData, searchTerm]);

  // Paginated guests list
  const totalPages = Math.ceil(filteredGuests.length / ITEMS_PER_PAGE);
  const paginatedGuests = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGuests.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredGuests, currentPage]);

  const handleRowClick = (requestId: string | null) => {
    if (!requestId) return;
    setSelectedRequestId(requestId);
    setIsDrawerOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Export CSV of Guests (Requirement 2)
  const handleExportCSV = () => {
    if (filteredGuests.length === 0) return;

    // Headers
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Last Checkout Date', 'Requests Sent', 'Last Status'];
    
    // Rows mapping
    const rows = filteredGuests.map(g => [
      g.customer.firstName,
      g.customer.lastName,
      g.customer.email || '',
      g.customer.phone || '',
      g.lastCheckoutDate ? format(new Date(g.lastCheckoutDate), 'yyyy-MM-dd') : '',
      g.totalRequestsSent.toString(),
      g.lastStatus.replace('_', ' ')
    ]);

    // Create CSV String
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Trigger Browser Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `guests_export_${activeLocationId || 'all'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get active selected request objects for the Side Drawer
  const selectedRequest = reviewRequests.find(r => r.id === selectedRequestId) || null;
  const selectedOrder = selectedRequest ? orders.find(o => o.id === selectedRequest.orderId) : null;
  const selectedCustomer = selectedOrder ? customers.find(c => c.id === selectedOrder.customerId) : null;
  const selectedEvents = selectedRequestId ? messageEvents.filter(e => e.requestId === selectedRequestId) : [];

  return (
    <div className="space-y-6">
      
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="h-6 w-6 text-slate-700" />
            <span>Guests History</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Search guest files, checkout timelines, and review request deliverabilities.
          </p>
        </div>
        
        {filteredGuests.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all shadow-sm"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3 max-w-lg">
        <Search className="h-5 w-5 text-slate-400 shrink-0" />
        <input 
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reset page on filter change
          }}
          placeholder="Search guests by name, email, or phone number..."
          className="bg-transparent border-none text-slate-800 text-sm focus:ring-0 w-full p-0"
        />
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filteredGuests.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 mb-4">
              <Inbox className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">No guests matched</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Try refining your search terms or verify that guests are registered under this selected location. Use the 'Sync Guests' page to register stays manually or upload checkout reports.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/75">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Checkout</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sent</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {paginatedGuests.map(g => (
                  <tr 
                    key={g.customer.id} 
                    className={`hover:bg-slate-50/75 transition-colors ${g.latestRequestId ? 'cursor-pointer' : 'opacity-85'}`}
                    onClick={() => handleRowClick(g.latestRequestId)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-indigo-700">
                          {g.customer.firstName[0]}{g.customer.lastName[0]}
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {g.customer.firstName} {g.customer.lastName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {g.customer.email || <span className="text-slate-400 italic">No email</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {g.customer.phone || <span className="text-slate-400 italic">No phone</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                      {g.lastCheckoutDate ? format(new Date(g.lastCheckoutDate), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">
                      {g.totalRequestsSent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        g.lastStatus === 'sent' 
                          ? 'bg-blue-50 text-blue-700 border-blue-100' 
                          : g.lastStatus === 'clicked' 
                          ? 'bg-green-50 text-green-700 border-green-100' 
                          : g.lastStatus === 'opted_out' 
                          ? 'bg-red-50 text-red-700 border-red-100' 
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                          g.lastStatus === 'sent' 
                            ? 'bg-blue-500' 
                            : g.lastStatus === 'clicked' 
                            ? 'bg-green-500' 
                            : g.lastStatus === 'opted_out' 
                            ? 'bg-red-500' 
                            : 'bg-amber-500'
                        }`} />
                        {g.lastStatus.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredGuests.length} total guests)
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Shared Guest Slide-Over details Panel */}
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