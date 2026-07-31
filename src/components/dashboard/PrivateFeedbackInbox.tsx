import { useState } from 'react';
import { useReviewSail, isActionableFeedback } from '../../context/ReviewSailContext';
import { Star, MessageSquare, Eye, Check, Search } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { format } from 'date-fns';

export function PrivateFeedbackInbox() {
  const { feedbacks, reviewRequests, orders, customers, locations, markPrivateFeedbackRead, loading } = useReviewSail();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleMarkRead = async (id: string) => {
    await markPrivateFeedbackRead(id);
  };

  const handleView = (fb: any) => {
    if (!fb.isRead) {
      handleMarkRead(fb.id);
    }
  };

  const getLocationName = (locId: string | null) => {
    const loc = locations.find(l => l.id === locId);
    return loc?.name || 'Unknown Location';
  };

  const getGuestName = (fb: any) => {
    if (fb.guestName) return fb.guestName;
    const req = reviewRequests.find(r => r.id === fb.requestId);
    if (req) {
      const order = orders.find(o => o.id === req.orderId);
      if (order) {
        const customer = customers.find(c => c.id === order.customerId);
        if (customer) return `${customer.firstName} ${customer.lastName}`;
      }
    }
    return 'Anonymous';
  };

  // Filter and sort
  const filteredFeedbacks = (feedbacks || []).filter(fb => {
    // Happy guests are recorded for the dashboard average but need no reply.
    if (!isActionableFeedback(fb)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = getGuestName(fb).toLowerCase();
    const location = getLocationName(fb.locationId).toLowerCase();
    const text = (fb.feedbackText || '').toLowerCase();
    const email = (fb.guestEmail || '').toLowerCase();
    return name.includes(q) || location.includes(q) || text.includes(q) || email.includes(q);
  });

  const sortedFeedbacks = [...filteredFeedbacks].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="animate-pulse flex flex-col items-center space-y-2">
          <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
          <div className="h-4 w-48 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feedback by guest, location, or text..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      {sortedFeedbacks.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          size="sm"
          title="No private feedback received"
          description="Unhappy guests who select 1–3 stars will land in this inbox."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-8"></th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Guest</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Feedback</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Received</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedFeedbacks.map((fb: any) => {
                  const isUnread = !fb.isRead;
                  const guestName = getGuestName(fb);
                  const locationName = getLocationName(fb.locationId);
                  // Recovery messages carry no rating at all, hence the 0.
                  const starRating = fb.starRating ?? 0;
                  const feedbackText = fb.feedbackText ?? '';

                  return (
                    <tr key={fb.id} className={`hover:bg-slate-50/50 transition-colors ${isUnread ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isUnread && (
                          <div className="h-2 w-2 rounded-full bg-indigo-600" title="Unread" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                            {guestName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{guestName}</p>
                            {fb.guestEmail && (
                              <p className="text-xs text-slate-400">{fb.guestEmail}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {locationName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= starRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {feedbackText || 'No text provided.'}
                        </p>
                        {feedbackText.length > 100 && (
                          <button
                            onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold mt-1"
                          >
                            {expandedId === fb.id ? 'Show less' : 'Read more'}
                          </button>
                        )}
                        {expandedId === fb.id && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-100">
                            {feedbackText}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {format(new Date(fb.createdAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleView(fb)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {isUnread && (
                            <button
                              onClick={() => handleMarkRead(fb.id)}
                              className="p-1.5 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
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
      )}
    </div>
  );
}