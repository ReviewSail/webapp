import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { format } from 'date-fns';
import { supabase } from '../integrations/supabase/client';
import { 
  Send, 
  CheckCircle, 
  MousePointerClick, 
  TrendingUp, 
  RefreshCw, 
  AlertCircle,
  Inbox,
  Clock,
  UserCheck
} from 'lucide-react';

export default function Dashboard() {
  const { activeLocationId, reviewRequests, orders, customers, messageEvents, loading, refreshData } = useMapRated();
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading dashboard metrics...</p>
      </div>
    );
  }

  // Filter requests for the active location
  const locationOrders = orders.filter(o => o.locationId === activeLocationId);
  const locationOrderIds = new Set(locationOrders.map(o => o.id));
  const locationRequests = reviewRequests
    .filter(r => locationOrderIds.has(r.orderId));
  const locationRequestIds = new Set(locationRequests.map(r => r.id));

  // Sort latest first
  const sortedLocationRequests = [...locationRequests].sort((a, b) => {
    const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return dateB - dateA;
  });

  // Calculate live SaaS metrics
  const totalSent = locationRequests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
  const totalClicked = locationRequests.filter(r => r.status === 'clicked').length;
  const totalPending = locationRequests.filter(r => r.status === 'pending').length;
  const totalOptedOut = locationRequests.filter(r => r.status === 'opted_out').length;

  // Real Delivery Rate Calculation:
  // Count how many 'sent' or 'reminder_sent' events we have vs failures.
  // Since we also log events to 'message_events' whenever sent is successful, we can check events associated with location requests.
  const locationEvents = messageEvents.filter(e => locationRequestIds.has(e.requestId));
  const totalAttempts = locationEvents.filter(e => ['sent', 'reminder_sent', 'failed'].includes(e.eventType)).length;
  const successfulDeliveries = locationEvents.filter(e => ['sent', 'reminder_sent'].includes(e.eventType)).length;

  const deliveryRate = totalAttempts > 0 
    ? Math.round((successfulDeliveries / totalAttempts) * 1000) / 10 
    : (totalSent > 0 ? 100 : 0); // fallback to 100% if requests exist but event table is empty, or 0%

  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  // Limit to latest 10 requests for the feed table
  const recentRequests = sortedLocationRequests.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Top Welcome / Trigger Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time performance analytics for guest reviews.</p>
        </div>
        <button
          onClick={runProcessor}
          disabled={processing}
          className="flex items-center space-x-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-all shadow-sm shadow-indigo-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
          <span>{processing ? 'Processing Outbox...' : 'Run Review Processor'}</span>
        </button>
      </div>
      
      {/* Analytical Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Sent */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
            <Send className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invites Sent</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{totalSent}</span>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" />
            {totalPending} requests currently in outbox queue
          </p>
        </div>

        {/* Card 2: Delivery Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <CheckCircle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Delivery Rate</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {deliveryRate}%
            </span>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <AlertCircle className="h-3.5 w-3.5 mr-1 text-slate-400" />
            Strict automated unsubscribe screening active
          </p>
        </div>

        {/* Card 3: Click Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-violet-50 text-violet-600 rounded-xl group-hover:scale-110 transition-transform">
            <MousePointerClick className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review Link Click Rate</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{clickRate}%</span>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {totalClicked} clicks
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center">
            <UserCheck className="h-3.5 w-3.5 mr-1 text-slate-400" />
            {totalOptedOut} customers opted out / unsubscribed
          </p>
        </div>
      </div>

      {/* Recent Requests Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent Review Requests</h2>
            <p className="text-xs text-slate-500 mt-0.5">Showing the latest 10 dispatched or pending invitations.</p>
          </div>
          <span className="text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg">
            {locationRequests.length} Total Logs
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {recentRequests.map(request => {
                  const order = orders.find(o => o.id === request.orderId);
                  const customer = order ? customers.find(c => c.id === order.customerId) : null;
                  
                  return (
                    <tr key={request.id} className="hover:bg-slate-50/50 transition-colors">
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