import { useState } from 'react';
import { Star, MessageSquare, Eye, Check, Search, RefreshCw } from 'lucide-react';
import { useInboxFeed } from '../../hooks/useInboxFeed';
import { useAuth } from '../../context/AuthContext';
import type { InboxCursor, InboxRow } from '../../lib/inboxFeed';
import { EmptyState } from '../ui/EmptyState';
import { format } from 'date-fns';

export function PrivateFeedbackInbox() {
  const { session } = useAuth();
  // Reset page/search/expanded state on identity changes as well as the feed cache.
  return <InboxContents key={session?.user.id ?? 'signed-out'} />;
}

function InboxContents() {
  const [cursor, setCursor] = useState<InboxCursor | null>(null);
  const feed = useInboxFeed(cursor);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [readError, setReadError] = useState('');
  const [readingId, setReadingId] = useState<string | null>(null);

  const handleMarkRead = async (id: string) => {
    setReadError('');
    setReadingId(id);
    try { await feed.markRead(id); }
    catch { setReadError('Could not mark feedback as read. Please try again.'); }
    finally { setReadingId(null); }
  };

  const handleView = (fb: InboxRow) => {
    setExpandedId(expandedId === fb.id ? null : fb.id);
    if (!fb.isRead) {
      void handleMarkRead(fb.id);
    }
  };

  // Filter and sort
  const filteredFeedbacks = (feed.data?.rows ?? []).filter(fb => {
    // Private messages at any rating belong here; a high score must not hide text.
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = fb.guestName.toLowerCase();
    const location = (fb.locationName ?? '').toLowerCase();
    const text = (fb.feedbackText || '').toLowerCase();
    const email = (fb.guestEmail || '').toLowerCase();
    return name.includes(q) || location.includes(q) || text.includes(q) || email.includes(q);
  });

  const sortedFeedbacks = [...filteredFeedbacks].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (!feed.signedIn) return <p role="alert">Sign in to view feedback.</p>;

  if (feed.isPending) {
    return (
      <div className="bg-card rounded-2xl border border-line shadow-sm p-12 text-center">
        {feed.fetchStatus === 'paused' && <p role="alert" className="mb-4 text-sm text-caution">You appear to be offline. The inbox will load when the connection returns.</p>}
        <div role="status" aria-label="Loading inbox" className="animate-pulse flex flex-col items-center space-y-2">
          <div className="h-8 w-8 bg-line rounded-full"></div>
          <div className="h-4 w-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ink-muted">
          {feed.isFetching ? 'Checking for feedback…' : feed.dataUpdatedAt && !feed.data?.denied
            ? `Last checked ${format(new Date(feed.dataUpdatedAt), 'h:mm:ss a')}.` : 'Inbox not yet checked.'}
          {' '}{cursor ? 'Viewing older feedback; choose Newest for automatic updates.' : 'Checks every 30 seconds while this page is visible.'}
        </p>
        <button onClick={() => void feed.refetch()} disabled={feed.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm">
          <RefreshCw size={16} aria-hidden="true" /> Refresh inbox
        </button>
      </div>
      {(feed.isError || feed.data?.denied) && <p role="alert" className="rounded-lg bg-critical-soft p-3 text-sm text-critical">
        {feed.data?.denied ? 'Your account access could not be verified. Sign in again or retry.'
          : 'Could not refresh the inbox. Any messages below are from the last successful check, not a confirmed current list. Try Refresh inbox.'}
      </p>}
      {feed.fetchStatus === 'paused' && <p role="alert" className="text-sm text-caution">You appear to be offline. Automatic checks will resume when the connection returns.</p>}
      {readError && <p role="alert" className="text-sm text-critical">{readError}</p>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
        <input
          type="text"
          aria-label="Search this page of feedback"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this page by guest, location, or text..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line bg-card text-sm focus:border-brand-500 focus:ring-brand-500"
        />
      </div>

      {sortedFeedbacks.length === 0 && !feed.isError && !feed.data?.denied ? (
        <EmptyState
          icon={MessageSquare}
          size="sm"
          title={search.trim() ? 'No matching feedback on this page' : 'No private feedback on this page'}
          description="Private ratings and messages appear here, regardless of the guest’s rating."
        />
      ) : sortedFeedbacks.length > 0 ? (
        <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-canvas">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider w-8"></th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Guest</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Feedback</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Received</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-ink-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sortedFeedbacks.map(fb => {
                  const isUnread = !fb.isRead;
                  const guestName = fb.guestName;
                  const locationName = fb.locationName || 'Unknown Location';
                  // Recovery messages carry no rating at all, hence the 0.
                  const starRating = fb.starRating ?? 0;
                  const feedbackText = fb.feedbackText ?? '';

                  return (
                    <tr key={fb.id} className={`hover:bg-canvas/50 transition-colors ${isUnread ? 'bg-brand-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isUnread && (
                          <div className="h-2 w-2 rounded-full bg-brand-600" title="Unread" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-muted text-ink-muted font-bold text-xs flex items-center justify-center">
                            {guestName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ink">{guestName}</p>
                            {fb.guestEmail && (
                              <p className="text-xs text-ink-faint">{fb.guestEmail}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-muted">
                        {locationName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= starRating ? 'fill-star text-star' : 'text-line'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs text-ink-muted line-clamp-2">
                          {feedbackText || 'No text provided.'}
                        </p>
                        {feedbackText.length > 100 && (
                          <button
                            onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                            className="text-[10px] text-brand-600 hover:text-brand-800 font-semibold mt-1"
                          >
                            {expandedId === fb.id ? 'Show less' : 'Read more'}
                          </button>
                        )}
                        {expandedId === fb.id && (
                          <div className="mt-2 p-3 bg-canvas rounded-lg text-xs text-ink border border-line">
                            {feedbackText}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-muted">
                        {format(new Date(fb.createdAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleView(fb)}
                            disabled={readingId !== null}
                            className="p-1.5 hover:bg-muted rounded-lg text-ink-faint hover:text-ink-muted transition-colors"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {isUnread && (
                            <button
                              onClick={() => handleMarkRead(fb.id)}
                              disabled={readingId !== null}
                              className="p-1.5 hover:bg-positive-soft rounded-lg text-ink-faint hover:text-positive transition-colors"
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
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-muted">{cursor ? 'Older messages' : 'Newest messages'}, up to 50 per page, across your properties. Search applies to this page.</span>
        {cursor && <button className="min-h-11 rounded-lg border border-line px-3" onClick={() => { setCursor(null); setSearch(''); setExpandedId(null); }}>Newest</button>}
        {feed.data?.hasMore && <button disabled={feed.isFetching || feed.isError} className="min-h-11 rounded-lg border border-line px-3" onClick={() => {
          const last = feed.data?.rows.at(-1);
          if (last) { setCursor({ createdAt: last.createdAt, id: last.id }); setSearch(''); setExpandedId(null); }
        }}>Older feedback</button>}
      </div>
    </div>
  );
}
