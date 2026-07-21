import { format } from 'date-fns';
import { Inbox } from 'lucide-react';
import { ReviewRequest, Order, Customer } from '../../context/MapRatedContext';

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
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Recent Review Requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">Showing the latest 10 dispatched or pending invitations.</p>
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
  );
}