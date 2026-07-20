import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { format } from 'date-fns';
import { supabase } from '../integrations/supabase/client';

export default function Dashboard() {
  const { activeLocationId, reviewRequests, orders, customers, loading, refreshData } = useMapRated();
  const [processing, setProcessing] = useState(false);

  const runProcessor = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-reviews');
      if (error) throw error;
      
      alert(`Processed ${data.processed} pending requests.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to run processor: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading dashboard data...</div>;
  }

  // Filter requests for the active location
  const locationOrders = orders.filter(o => o.locationId === activeLocationId);
  const locationOrderIds = new Set(locationOrders.map(o => o.id));
  const locationRequests = reviewRequests.filter(r => locationOrderIds.has(r.orderId));

  const totalSent = locationRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
  const totalClicked = locationRequests.filter(r => r.status === 'clicked').length;
  const totalOptedOut = locationRequests.filter(r => r.status === 'opted_out').length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <button
          onClick={runProcessor}
          disabled={processing}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Run Review Processor'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500 mb-1">Total Sent</h3>
          <p className="text-3xl font-bold text-slate-900">{totalSent}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500 mb-1">Clicked</h3>
          <p className="text-3xl font-bold text-slate-900">{totalClicked}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500 mb-1">Opted Out</h3>
          <p className="text-3xl font-bold text-slate-900">{totalOptedOut}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Recent Requests</h2>
        </div>
        
        {locationRequests.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <p>No review requests to display.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Guest</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Checkout Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sent At</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {locationRequests.map(request => {
                  const order = orders.find(o => o.id === request.orderId);
                  const customer = order ? customers.find(c => c.id === order.customerId) : null;
                  
                  return (
                    <tr key={request.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">
                          {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown'}
                        </div>
                        <div className="text-sm text-slate-500">{customer?.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {order ? format(new Date(order.checkoutDate), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${request.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                          ${request.status === 'clicked' ? 'bg-green-100 text-green-800' : ''}
                          ${request.status === 'opted_out' ? 'bg-red-100 text-red-800' : ''}
                          ${request.status === 'pending' ? 'bg-slate-100 text-slate-800' : ''}
                        `}>
                          {request.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {request.sentAt ? format(new Date(request.sentAt), 'MMM d, yyyy HH:mm') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}