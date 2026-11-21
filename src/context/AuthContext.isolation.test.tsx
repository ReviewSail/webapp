import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { ReviewSailProvider, useReviewSail } from './ReviewSailContext';
import { createTestQueryClient } from '../test/queryWrapper';

const mock = vi.hoisted(() => ({
  getSession: vi.fn(), from: vi.fn(),
  listeners: new Set<(event: AuthChangeEvent, session: Session | null) => void>(),
  currentUser: 'a', identityReads: [] as string[],
  identities: {} as Record<string, { role: string; account_id: string }>,
  heldIdentity: null as null | ((user: string) => Promise<unknown>),
  heldCustomers: null as null | Promise<unknown>, heldDigest: null as null | Promise<unknown>,
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mock.getSession, onAuthStateChange: (fn: (event: AuthChangeEvent, session: Session | null) => void) => {
    mock.listeners.add(fn); return { data: { subscription: { unsubscribe: () => mock.listeners.delete(fn) } } };
  } }, from: mock.from,
} }));
function session(user: string): Session { return { user: { id: user, email: `${user}@example.invalid` } } as Session; }
function deferred<T = unknown>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  mock.listeners.clear(); mock.from.mockReset(); mock.getSession.mockReset();
  mock.currentUser = 'a'; mock.identityReads = [];
  mock.identities = { a: { role: 'admin', account_id: 'account-a' }, b: { role: 'staff', account_id: 'account-b' } };
  mock.heldIdentity = null; mock.heldCustomers = null; mock.heldDigest = null;
  mock.getSession.mockResolvedValue({ data: { session: session('a') }, error: null });
  mock.from.mockImplementation((table: string) => {
    let user = mock.currentUser; let columns = ''; let write = false;
    const account = mock.identities[user]?.account_id;
    const result = async () => {
      if (table === 'users') {
        if (columns === 'role, account_id') {
          mock.identityReads.push(user);
          if (mock.heldIdentity) return mock.heldIdentity(user);
        }
        return { data: mock.identities[user], error: null };
      }
      if (table === 'accounts') return { data: { subscription_status: 'active' }, error: null };
      if (table === 'locations') return { data: [1, 2].map(n => ({ id: `${account}-location-${n}`, name: `House ${n}`, timezone: 'UTC' })), error: null };
      if (table === 'customers') return mock.heldCustomers ?? { data: [{ id: `guest-${account}`, first_name: account, last_name: 'Guest' }], error: null };
      if (table === 'digest_settings') return write && mock.heldDigest ? mock.heldDigest : { data: null, error: null };
      return { data: [], error: null };
    };
    const builder = {
      select: (value: string) => { columns = value; return builder; },
      eq: (key: string, value: string) => { if (table === 'users' && key === 'id') user = value; return builder; },
      abortSignal: () => builder, single: () => builder, maybeSingle: () => builder,
      order: () => builder, range: () => builder,
      insert: () => { write = true; return builder; }, update: () => { write = true; return builder; },
      upsert: () => { write = true; return builder; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
    };
    return builder;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function mount(strict = false) {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <QueryClientProvider client={client}><AuthProvider><ReviewSailProvider>{children}</ReviewSailProvider></AuthProvider></QueryClientProvider>;
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  const history: Array<{ user?: string; role: string | null; property: string | null; guests: string[] }> = [];
  const hook = renderHook(() => {
    const auth = useAuth(); const data = useReviewSail();
    history.push({ user: auth.user?.id, role: auth.role, property: data.activeLocationId, guests: data.customers.map(guest => guest.id) });
    return { auth, data };
  }, { wrapper });
  return { ...hook, client, history };
}
async function emit(event: AuthChangeEvent, user: string | null) {
  await act(async () => {
    if (user) mock.currentUser = user;
    mock.listeners.forEach(fn => fn(event, user ? session(user) : null));
  });
}
async function loaded(view: ReturnType<typeof mount>, account = 'account-a') {
  await waitFor(() => {
    expect(view.result.current.auth.loading).toBe(false);
    expect(view.result.current.data.activeLocationId).toBe(`${account}-location-1`);
  });
}

it('switches A directly to B without rendering A’s property, guests or admin role for B', async () => {
  const view = mount(); await loaded(view);
  act(() => view.result.current.data.setActiveLocationId('account-a-location-2'));
  await emit('SIGNED_IN', 'b'); await loaded(view, 'account-b');
  expect(view.result.current.auth.role).toBe('staff');
  for (const state of view.history.filter(state => state.user === 'b')) {
    expect(state.role).not.toBe('admin'); expect(state.property ?? '').not.toContain('account-a');
    expect(state.guests.join()).not.toContain('account-a');
  }
});
it('removes every private cache family on logout, preserves public data/theme and resets A’s selection on re-login', async () => {
  const view = mount(); await loaded(view);
  act(() => view.result.current.data.setActiveLocationId('account-a-location-2'));
  for (const root of ['inbox', 'owner-alerts', 'team', 'recognition-records']) view.client.setQueryData([root, 'a'], { private: true });
  view.client.setQueryData(['guestFeedbackContext', 'public'], { public: true });
  localStorage.setItem('theme-isolation-fixture', 'dark');
  await emit('SIGNED_OUT', null);
  expect(view.result.current.auth.role).toBeNull(); expect(view.result.current.data.activeLocationId).toBeNull();
  expect(view.result.current.data.customers).toEqual([]);
  expect(view.client.getQueryCache().getAll().filter(query => query.state.data && query.queryKey[0] !== 'guestFeedbackContext')).toEqual([]);
  expect(view.client.getQueryData(['guestFeedbackContext', 'public'])).toEqual({ public: true });
  expect(localStorage.getItem('theme-isolation-fixture')).toBe('dark'); localStorage.removeItem('theme-isolation-fixture');
  await emit('SIGNED_IN', 'a'); await loaded(view);
});
it('ignores a late initial session after logout', async () => {
  const boot = deferred<any>(); mock.getSession.mockReturnValue(boot.promise);
  const view = mount(); await emit('SIGNED_OUT', null);
  await act(async () => boot.resolve({ data: { session: session('a') }, error: null }));
  expect(view.result.current.auth.session).toBeNull(); expect(mock.identityReads).toEqual([]);
});
it('ignores an old admin lookup arriving after the staff user is verified', async () => {
  const old = deferred(); mock.heldIdentity = user => user === 'a' ? old.promise : Promise.resolve({ data: mock.identities.b, error: null });
  const view = mount(); await waitFor(() => expect(mock.identityReads).toContain('a'));
  await emit('SIGNED_IN', 'b'); await loaded(view, 'account-b');
  await act(async () => old.resolve({ data: { role: 'admin', account_id: 'account-a' }, error: null }));
  expect(view.result.current.auth.user?.id).toBe('b'); expect(view.result.current.auth.role).toBe('staff');
  expect(view.client.getQueryData(['auth-identity', 'a'])).toBeUndefined();
});
it('cancels/discards late guest reads even when the transport ignores cancellation', async () => {
  const guests = deferred(); mock.heldCustomers = guests.promise;
  const view = mount(); await waitFor(() => expect(view.result.current.auth.role).toBe('admin'));
  await waitFor(() => expect(view.client.getQueryState(['reviewsail', 'customers', 'a'])?.fetchStatus).toBe('fetching'));
  await emit('SIGNED_OUT', null);
  await act(async () => guests.resolve({ data: [{ id: 'private-old-guest', first_name: 'Old' }], error: null }));
  expect(view.client.getQueryData(['reviewsail', 'customers', 'a'])).toBeUndefined(); expect(view.result.current.data.customers).toEqual([]);
});
it('rejects foreign selection and falls back after a selected property disappears', async () => {
  const view = mount(); await loaded(view);
  act(() => view.result.current.data.setActiveLocationId('foreign-property'));
  expect(view.result.current.data.activeLocationId).toBe('account-a-location-1');
  act(() => view.result.current.data.setActiveLocationId('account-a-location-2'));
  act(() => view.client.setQueryData(['reviewsail', 'locations', 'a'], [{ id: 'account-a-location-1' }]));
  await waitFor(() => expect(view.result.current.data.activeLocationId).toBe('account-a-location-1'));
});
it('refreshes same-user account and role after team acceptance and clears every old private family', async () => {
  const view = mount(); await loaded(view);
  for (const root of ['team', 'recognition-records', 'inbox', 'owner-alerts']) view.client.setQueryData([root, 'a'], { oldAccount: true });
  act(() => view.result.current.data.setActiveLocationId('account-a-location-2'));
  mock.identities.a = { role: 'staff', account_id: 'joined-team' };
  await act(async () => view.result.current.auth.refreshIdentity());
  await loaded(view, 'joined-team');
  expect(view.result.current.auth.role).toBe('staff');
  for (const root of ['team', 'recognition-records', 'inbox', 'owner-alerts']) expect(view.client.getQueryData([root, 'a'])).toBeUndefined();
  expect(view.result.current.data.customers[0].id).toBe('guest-joined-team');
});
it.each([null, { role: 'unknown', account_id: 'account-a' }, { role: 'admin', account_id: null }])('fails closed for missing/malformed identity %j and supports retry', async identity => {
  mock.heldIdentity = () => Promise.resolve({ data: identity, error: null });
  const view = mount();
  await waitFor(() => expect(view.result.current.auth.error).toBeTruthy());
  expect(view.result.current.auth.role).toBeNull(); expect(view.result.current.data.customers).toEqual([]);
  expect(view.result.current.data.activeLocationId).toBeNull();
  mock.heldIdentity = null;
  await act(async () => view.result.current.auth.refreshIdentity()); await loaded(view);
});
it('does not reread identity on repeated token/focus events inside the five-minute window', async () => {
  const view = mount(); await loaded(view);
  await emit('SIGNED_IN', 'a'); await emit('TOKEN_REFRESHED', 'a');
  expect(mock.identityReads).toEqual(['a']);
});
it('rechecks permissions on an auth event after the five-minute cache window', async () => {
  const view = mount(); await loaded(view); mock.identities.a.role = 'staff';
  const later = Date.now() + 300_001; vi.spyOn(Date, 'now').mockReturnValue(later);
  await emit('TOKEN_REFRESHED', 'a');
  await waitFor(() => expect(view.result.current.auth.role).toBe('staff'));
  expect(mock.identityReads).toEqual(['a', 'a']);
});
it('ignores a late identity failure from the previous user', async () => {
  const old = deferred(); mock.heldIdentity = user => user === 'a' ? old.promise : Promise.resolve({ data: mock.identities.b, error: null });
  const view = mount(); await waitFor(() => expect(mock.identityReads).toContain('a'));
  await emit('SIGNED_IN', 'b'); await loaded(view, 'account-b');
  await act(async () => old.resolve({ data: null, error: { message: 'old request failed' } }));
  expect(view.result.current.auth.error).toBeNull(); expect(view.result.current.auth.role).toBe('staff');
});
it('does not leave old permissions or data usable when a role refresh fails', async () => {
  const view = mount(); await loaded(view);
  mock.heldIdentity = () => Promise.reject(new Error('offline'));
  await act(async () => { await expect(view.result.current.auth.refreshIdentity()).rejects.toThrow('Could not verify'); });
  expect(view.result.current.auth.role).toBeNull(); expect(view.result.current.data.activeLocationId).toBeNull();
  expect(view.result.current.data.customers).toEqual([]);
});
it('rechecks a role change on USER_UPDATED even within the cache window', async () => {
  const view = mount(); await loaded(view); mock.identities.a.role = 'staff';
  await emit('USER_UPDATED', 'a');
  await waitFor(() => expect(view.result.current.auth.role).toBe('staff'));
  expect(mock.identityReads).toEqual(['a', 'a']);
});
it('does not recreate an old digest cache from a write completing after logout', async () => {
  const view = mount(); await loaded(view); const saved = deferred(); mock.heldDigest = saved.promise;
  let write!: Promise<void>;
  act(() => { write = view.result.current.data.updateDigestSetting('weekly', true); });
  await emit('SIGNED_OUT', null);
  await act(async () => { saved.resolve({ data: { id: 'digest-a', user_id: 'a', account_id: 'account-a', frequency: 'weekly', enabled: true }, error: null }); await write; });
  expect(view.client.getQueryData(['reviewsail', 'digest_settings', 'a'])).toBeUndefined();
});
it('cleans subscriptions during StrictMode replay and unmount', async () => {
  const view = mount(true); await loaded(view); expect(mock.listeners.size).toBe(1);
  view.unmount(); expect(mock.listeners.size).toBe(0);
});
