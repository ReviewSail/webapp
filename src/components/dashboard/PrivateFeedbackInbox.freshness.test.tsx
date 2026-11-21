import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { PrivateFeedbackInbox } from './PrivateFeedbackInbox';
import type { InboxRow } from '../../lib/inboxFeed';

const mocks = vi.hoisted(() => ({ user: 'user-a' as string | null, rpc: vi.fn(), update: vi.fn(), signals: [] as AbortSignal[] }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ session: mocks.user ? { user: { id: mocks.user } } : null }) }));
vi.mock('../../integrations/supabase/client', () => ({ supabase: {
  rpc: (...args: unknown[]) => ({ abortSignal: (signal: AbortSignal) => { mocks.signals.push(signal); return mocks.rpc(...args); } }),
  from: (table: string) => ({ update: (patch: unknown) => ({ eq: (_field: string, id: string) => ({
    select: () => ({ maybeSingle: () => mocks.update(table,patch,id) }),
  }) }) }),
} }));
const row = (extra: Partial<InboxRow> = {}): InboxRow => ({ id: 'first', requestId: null, locationId: 'house-a', locationName: 'Synthetic House',
  kind: 'complaint', starRating: 2, feedbackText: 'Original private message', guestName: 'Synthetic Guest', guestEmail: null,
  isRead: false, createdAt: '2026-09-14T12:00:00Z', ...extra });
const page = (version = 'v1', rows: InboxRow[] | null = [row()], hasMore = false, accountId = 'account-a') =>
  ({ data: { accountId, version, hasMore, rows }, error: null });
const clients: QueryClient[] = [];
async function flush(ms = 5) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry:false } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><PrivateFeedbackInbox /></QueryClientProvider>);
  await flush(); return { ...view, client };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
  mocks.user = 'user-a'; mocks.rpc.mockReset().mockResolvedValue(page()); mocks.update.mockReset(); mocks.signals.length=0;
  focusManager.setFocused(true); onlineManager.setOnline(true);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c=>c.clear()); vi.useRealTimers(); focusManager.setFocused(undefined); });

describe('inbox freshness through real React and TanStack Query', () => {
  it('loads only the dedicated feed and shows the last successful check', async () => {
    await mount(); expect(screen.getByText('Original private message')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('get_inbox_page_v1', {p_known_version:null,p_before_created:null,p_before_id:null});
    expect(screen.getByRole('status')).toHaveTextContent('Last checked'); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('shows a new submission in the already-open inbox at the next 30-second check', async () => {
    await mount(); mocks.rpc.mockResolvedValue(page('v2',[row({id:'new',feedbackText:'Newly saved guest message'}),row()]));
    await flush(30_000);
    expect(screen.getByText('Newly saved guest message')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_inbox_page_v1',expect.objectContaining({p_known_version:'v1'}));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('keeps rows on a matching unchanged response and advances last checked', async () => {
    await mount(); const initial=screen.getByRole('status').textContent;
    mocks.rpc.mockResolvedValue(page('v1',null)); await flush(30_000);
    expect(screen.getByText('Original private message')).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).not.toBe(initial);
  });
  it('pauses background polling and checks immediately when focus returns', async () => {
    await mount(); act(()=>focusManager.setFocused(false)); await flush(90_000);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue(page('v2',[row({feedbackText:'Arrived while hidden'})]));
    act(()=>focusManager.setFocused(true)); await flush();
    expect(screen.getByText('Arrived while hidden')).toBeInTheDocument(); expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('checks on reconnect after offline time', async () => {
    await mount(); act(()=>onlineManager.setOnline(false)); await flush(30_000);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue(page('v2',[row({feedbackText:'Arrived while offline'})]));
    act(()=>onlineManager.setOnline(true)); await flush();
    expect(screen.getByText('Arrived while offline')).toBeInTheDocument();
  });
  it('explains an initially offline inbox instead of showing an empty result', async () => {
    onlineManager.setOnline(false); await mount();
    expect(screen.getByRole('alert')).toHaveTextContent('offline'); expect(mocks.rpc).not.toHaveBeenCalled();
    act(()=>onlineManager.setOnline(true)); await flush();
    expect(screen.getByText('Original private message')).toBeInTheDocument();
  });
  it('preserves old rows and the successful timestamp on failure, then recovers', async () => {
    await mount(); const before = screen.getByRole('status').textContent;
    mocks.rpc.mockResolvedValue({data:null,error:{code:'network'}}); await flush(30_000);
    expect(screen.getByRole('alert')).toHaveTextContent('last successful check');
    expect(screen.getByText('Original private message')).toBeInTheDocument(); expect(screen.getByRole('status').textContent).toBe(before);
    mocks.rpc.mockResolvedValue(page('v2',[row({feedbackText:'Recovered message'})]));
    fireEvent.click(screen.getByRole('button',{name:'Refresh inbox'})); await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByText('Recovered message')).toBeInTheDocument();
  });
  it('initial failure is not displayed as an empty successful inbox', async () => {
    mocks.rpc.mockResolvedValue({data:null,error:{code:'network'}}); await mount();
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.queryByText('No private feedback on this page')).not.toBeInTheDocument();
  });
  it('rejects an unmatched unchanged response instead of hiding existing rows', async () => {
    await mount(); mocks.rpc.mockResolvedValue(page('unknown',null)); await flush(30_000);
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.getByText('Original private message')).toBeInTheDocument();
  });
  it('clears retained data on an explicit access-denial response', async () => {
    await mount(); mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}}); await flush(30_000);
    expect(screen.getByRole('alert')).toHaveTextContent('account access'); expect(screen.queryByText('Original private message')).not.toBeInTheDocument();
  });
  it('does not show an old user’s rows or accept their late response after switching user', async () => {
    let finish!: (v:unknown)=>void;
    mocks.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=await mount(); mocks.user='user-b'; mocks.rpc.mockResolvedValue(page('b',[],false,'account-b'));
    view.rerender(<QueryClientProvider client={view.client}><PrivateFeedbackInbox /></QueryClientProvider>); await flush();
    finish(page()); await flush();
    expect(mocks.signals[0].aborted).toBe(true); expect(screen.queryByText('Original private message')).not.toBeInTheDocument();
  });
  it('hides rows immediately on logout and stops checking', async () => {
    const view=await mount(); mocks.user=null;
    view.rerender(<QueryClientProvider client={view.client}><PrivateFeedbackInbox /></QueryClientProvider>); await flush(60_000);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in'); expect(screen.queryByText('Original private message')).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('stops polling on unmount and rechecks on route reentry', async () => {
    const view=await mount(); view.unmount(); await flush(60_000); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue(page('v2',[row({feedbackText:'Arrived off route'})])); await mount();
    expect(screen.getByText('Arrived off route')).toBeInTheDocument();
  });
  it('shows high-rating private messages and explains page-local search', async () => {
    mocks.rpc.mockResolvedValue(page('v1',[row({kind:'rating',starRating:5,feedbackText:'Positive private message'})])); await mount();
    expect(screen.getByText('Positive private message')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search this page of feedback'),{target:{value:'unmatched'}});
    expect(screen.getByText('No matching feedback on this page')).toBeInTheDocument();
  });
  it('uses a stable older cursor and resumes automatic checking on Newest', async () => {
    mocks.rpc.mockResolvedValue(page('v1',[row()],true)); await mount();
    mocks.rpc.mockResolvedValue(page('older',[row({id:'older',feedbackText:'Older message'})]));
    fireEvent.click(screen.getByRole('button',{name:'Older feedback'})); await flush();
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_inbox_page_v1',expect.objectContaining({p_before_created:row().createdAt,p_before_id:'first'}));
    expect(screen.getByRole('status')).toHaveTextContent('Viewing older'); await flush(60_000); expect(mocks.rpc).toHaveBeenCalledTimes(2);
    mocks.rpc.mockResolvedValue(page('new',[row({feedbackText:'Latest message'})]));
    fireEvent.click(screen.getByRole('button',{name:'Newest'})); await flush(); expect(screen.getByText('Latest message')).toBeInTheDocument();
    await flush(30_000); expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });
  it('verifies a read mutation and refreshes only the inbox', async () => {
    const view=await mount(); view.client.setQueryData(['reviewsail','guest_feedback','user-a'],[{id:'first',isRead:false}]);
    mocks.update.mockResolvedValue({data:{id:'first',is_read:true},error:null});
    mocks.rpc.mockResolvedValue(page('v2',[row({isRead:true})]));
    fireEvent.click(screen.getByRole('button',{name:'Mark as read'})); await flush();
    expect(mocks.update).toHaveBeenCalledWith('guest_feedback',{is_read:true},'first');
    expect(screen.queryByRole('button',{name:'Mark as read'})).not.toBeInTheDocument();
    expect(view.client.getQueryData(['reviewsail','guest_feedback','user-a'])).toEqual([{id:'first',isRead:true}]);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not report a zero-row read mutation as success', async () => {
    await mount(); mocks.update.mockResolvedValue({data:null,error:null});
    fireEvent.click(screen.getByRole('button',{name:'Mark as read'})); await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not mark');
    expect(screen.getByRole('button',{name:'Mark as read'})).toBeInTheDocument(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
