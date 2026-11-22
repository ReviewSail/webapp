import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { readInboxPage, type InboxCursor, type InboxPage } from '../lib/inboxFeed';

export const INBOX_CHECK_MS = 30_000;

export function useInboxFeed(cursor: InboxCursor | null) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  const key = ['inbox', userId, cursor?.createdAt ?? null, cursor?.id ?? null] as const;
  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    // This route-local, conditional 50-row read is the explicit exception to
    // the five-minute global cache floor. No guest-history tables are polled.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: cursor ? false : INBOX_CHECK_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    queryFn: async ({ signal }): Promise<InboxPage> => {
      const previous = client.getQueryData<InboxPage>(key);
      // EGRESS-COST: low unchanged (validator only); medium changed (at most
      // 50 feedback rows). Runs only on the mounted inbox, never whole history.
      const { data, error } = await supabase.rpc('get_inbox_page_v1', {
        p_known_version: previous?.denied ? null : previous?.version ?? null,
        p_before_created: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
      }).abortSignal(signal);
      if (error?.code === '42501' || error?.code === 'PGRST301' || error?.code === 'PGRST303') {
        return { accountId: '', version: '', rows: [], hasMore: false, denied: true };
      }
      if (error) throw new Error('Inbox refresh failed');
      return readInboxPage(data, previous);
    },
  });

  async function markRead(id: string) {
    if (!userId) throw new Error('Sign in to mark feedback as read');
    // EGRESS-COST: low — verify one affected row, never silently accept zero.
    const { data, error } = await supabase.from('guest_feedback').update({ is_read: true })
      .eq('id', id).select('id, is_read').maybeSingle();
    if (error || data?.id !== id || data?.is_read !== true) throw new Error('Could not mark feedback as read');
    // Keep the existing badge cache consistent without refetching its history.
    client.setQueryData<Array<{ id: string; isRead: boolean }>>(['reviewsail', 'guest_feedback', userId], rows =>
      rows?.map(row => row.id === id ? { ...row, isRead: true } : row));
    await client.invalidateQueries({ queryKey: ['inbox', userId] });
  }

  return { ...query, data: userId ? query.data : undefined, signedIn: !!userId, markRead };
}
