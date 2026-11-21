import type { SupabaseClient } from '@supabase/supabase-js';

export type RecoveryState =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'ready'; userId: string; email?: string };

/** Capture before React mounts: the SDK removes the hash before emitting recovery. */
export function createPasswordRecovery(auth: SupabaseClient['auth'], url: URL, cleanUrl: () => void) {
  const params = new URLSearchParams(url.hash.slice(1));
  const isRecovery = url.pathname === '/reset-password' && params.get('type') === 'recovery' &&
    !!params.get('access_token') && !!params.get('refresh_token') &&
    !params.has('error') && !params.has('error_code') && !params.has('error_description');
  let expectedToken = isRecovery ? params.get('access_token') : null;
  let state: RecoveryState = { status: isRecovery ? 'checking' : 'unavailable' };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const publish = (next: RecoveryState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const clear = () => {
    expectedToken = null;
    clearTimeout(timer);
    publish({ status: 'unavailable' });
  };
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    // Synchronous callback: never await another auth operation inside a listener.
    if (event === 'PASSWORD_RECOVERY' && expectedToken && session?.access_token === expectedToken) {
      expectedToken = null;
      clearTimeout(timer);
      cleanUrl();
      publish({ status: 'ready', userId: session.user.id, email: session.user.email });
    } else if (event === 'SIGNED_OUT' || (state.status === 'ready' &&
      (event === 'SIGNED_IN' || (session && session.user.id !== state.userId)))) {
      clear();
    }
  });
  if (isRecovery) {
    // A failed/slow initialization must never leave a spinner indefinitely.
    timer = setTimeout(() => { cleanUrl(); clear(); }, 15_000);
  }
  // Reuses the SDK's existing initialization promise; does not exchange tokens twice.
  // Only PASSWORD_RECOVERY enables the form, never an ordinary stored session.
  void auth.initialize().then(({ error }) => {
    if (disposed) return;
    if (error || !isRecovery) {
      if (url.pathname === '/reset-password') cleanUrl();
      clear();
    }
  }).catch(() => {
    if (!disposed) { if (url.pathname === '/reset-password') cleanUrl(); clear(); }
  });
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear,
    dispose: () => { disposed = true; expectedToken = null; clearTimeout(timer); subscription.unsubscribe(); listeners.clear(); },
  };
}
