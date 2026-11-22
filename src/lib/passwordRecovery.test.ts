import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createPasswordRecovery } from './passwordRecovery';

const link = 'https://app.example.invalid/reset-password#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer';
const session = { access_token: 'synthetic-access', user: { id: 'owner-a', email: 'owner@example.invalid' } } as Session;
const disposers: (() => void)[] = [];
function setup(url = link, initialization: Promise<{ error: unknown }> = Promise.resolve({ error: null })) {
  let callback: (event: AuthChangeEvent, session: Session | null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn(fn => { callback = fn; return { data: { subscription: { unsubscribe } } }; }),
    initialize: vi.fn(() => initialization),
  };
  const clean = vi.fn();
  const store = createPasswordRecovery(auth as unknown as SupabaseClient['auth'], new URL(url), clean);
  disposers.push(store.dispose);
  return { store, clean, auth, unsubscribe, emit: (event: AuthChangeEvent, value: Session | null = session) => callback(event, value) };
}
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); window.history.replaceState(null, '', '/'); });

describe('recovery capture', () => {
  it('retains the confirmed event before the page mounts, without re-setting a session', async () => {
    const { store, emit, clean, auth } = setup();
    expect(store.getSnapshot().status).toBe('checking');
    emit('INITIAL_SESSION');
    expect(store.getSnapshot().status).toBe('checking');
    emit('PASSWORD_RECOVERY');
    await Promise.resolve();
    expect(store.getSnapshot()).toEqual({ status: 'ready', userId: 'owner-a', email: 'owner@example.invalid' });
    expect(clean).toHaveBeenCalledOnce();
    expect(auth.initialize).toHaveBeenCalledOnce();
    const listener = vi.fn(); const off = store.subscribe(listener);
    off(); emit('SIGNED_OUT', null); expect(listener).not.toHaveBeenCalled();
  });
  it.each([
    'https://app.example.invalid/reset-password',
    link.replace('type=recovery', 'type=signup'),
    link.replace('&refresh_token=synthetic-refresh', ''),
    link + '&error_code=otp_expired',
    link.replace('/reset-password', '/login'),
    'https://app.example.invalid/reset-password?code=unsupported-pkce',
  ])('never treats an ordinary/invalid callback as recovery: %s', async url => {
    const { store, emit } = setup(url);
    emit('INITIAL_SESSION'); emit('SIGNED_IN'); emit('PASSWORD_RECOVERY');
    await Promise.resolve();
    expect(store.getSnapshot().status).toBe('unavailable');
  });
  it('ignores another tab’s recovery token', () => {
    const { store, emit } = setup();
    emit('PASSWORD_RECOVERY', { ...session, access_token: 'other-token' });
    expect(store.getSnapshot().status).toBe('checking');
  });
  it.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('invalidates on %s', event => {
    const { store, emit } = setup(); emit('PASSWORD_RECOVERY'); emit(event);
    expect(store.getSnapshot().status).toBe('unavailable');
    emit('PASSWORD_RECOVERY'); expect(store.getSnapshot().status).toBe('unavailable');
  });
  it('allows refresh for the recovery account but invalidates a different account', () => {
    const { store, emit } = setup(); emit('PASSWORD_RECOVERY'); emit('TOKEN_REFRESHED');
    expect(store.getSnapshot().status).toBe('ready');
    emit('TOKEN_REFRESHED', { ...session, user: { ...session.user, id: 'owner-b' } });
    expect(store.getSnapshot().status).toBe('unavailable');
  });
  it.each([false, true])('handles initialization failure (thrown=%s)', async thrown => {
    const { store, clean } = setup(link, thrown ? Promise.reject(new Error('offline')) : Promise.resolve({ error: { message: 'expired' } }));
    await waitFor(() => expect(store.getSnapshot().status).toBe('unavailable'));
    expect(clean).toHaveBeenCalled();
  });
  it('bounds a missing recovery event and rejects late events', async () => {
    vi.useFakeTimers();
    const { store, emit, clean } = setup();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.getSnapshot().status).toBe('unavailable'); expect(clean).toHaveBeenCalled();
    emit('PASSWORD_RECOVERY'); expect(store.getSnapshot().status).toBe('unavailable');
  });
  it('unsubscribes and clears pending timers on dispose', () => {
    vi.useFakeTimers(); const { store, unsubscribe } = setup(); store.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('installed Supabase SDK, entirely mocked transport', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/reset-password' + new URL(link).hash); });
  it.each([true, false])('auto-consumes the callback with valid user=%s without a second exchange', async valid => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/auth/v1/user')) throw new Error('Unexpected mocked endpoint');
      return new Response(JSON.stringify(valid ? { id: 'owner-a', email: 'owner@example.invalid' } : { msg: 'expired', code: 'bad_jwt' }), {
        status: valid ? 200 : 401, headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = createClient('https://isolated-auth.example.invalid', 'synthetic-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `isolated-recovery-${valid}` }, global: { fetch: fetchMock },
    });
    const store = createPasswordRecovery(client.auth, new URL(window.location.href), () => window.history.replaceState(null, '', '/reset-password'));
    disposers.push(() => { store.dispose(); void client.auth.stopAutoRefresh(); });
    await waitFor(() => expect(store.getSnapshot().status).toBe(valid ? 'ready' : 'unavailable'));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
  });
});
