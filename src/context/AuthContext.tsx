import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { STALE_TIME_MS } from '../lib/queryClient';
import { clearPrivateQueries } from '../lib/privateQueries';

type AuthState = {
  session: Session | null;
  role: 'admin' | 'staff' | null;
  accountId: string | null;
  scopeVersion: number;
  loading: boolean;
  error: Error | null;
};
const initial: AuthState = { session: null, role: null, accountId: null, scopeVersion: 0, loading: true, error: null };
const AuthContext = createContext({ ...initial, user: null as Session['user'] | null, refreshIdentity: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient();
  const [state, setState] = useState<AuthState>(initial);
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let disposed = false;
    let current: AuthState = initial;
    let generation = 0;
    let events = 0;
    let pending: Promise<void> | null = null;
    let verifiedAt = 0;
    const publish = (next: Partial<AuthState>) => {
      current = { ...current, ...next };
      if (!disposed) setState(current);
    };
    const readIdentity = (force = false): Promise<void> => {
      if (disposed || !current.session) return Promise.resolve();
      if (!force && pending) return pending;
      if (!force && current.role && Date.now() - verifiedAt < STALE_TIME_MS) return Promise.resolve();
      const userId = current.session.user.id;
      const request = ++generation;
      const previous = { accountId: current.accountId, role: current.role };
      if (force) {
        clearPrivateQueries(client);
        publish({ scopeVersion: current.scopeVersion + 1 });
      }
      publish({ role: null, loading: true, error: null });
      const work = (async () => {
        try {
          const identity = await client.fetchQuery({
            queryKey: ['auth-identity', userId],
            staleTime: STALE_TIME_MS,
            retry: false,
            queryFn: async ({ signal }) => {
              // EGRESS-COST: low — one narrow row, cached for five minutes;
              // explicit membership changes force a check, never full-table polling.
              const { data, error } = await supabase.from('users').select('role, account_id')
                .eq('id', userId).abortSignal(signal).single();
              if (error || !data?.account_id || !['admin', 'staff'].includes(data.role)) {
                throw new Error('Could not verify account access. Please retry.');
              }
              return { role: data.role as 'admin' | 'staff', accountId: data.account_id as string };
            },
          });
          if (disposed || request !== generation) return;
          if (previous.accountId && (previous.accountId !== identity.accountId || previous.role !== identity.role)) {
            clearPrivateQueries(client, false);
            publish({ scopeVersion: current.scopeVersion + 1 });
          }
          verifiedAt = Date.now();
          publish({ ...identity, loading: false, error: null });
        } catch {
          if (disposed || request !== generation) return;
          verifiedAt = 0;
          clearPrivateQueries(client);
          publish({ role: null, accountId: null, loading: false, error: new Error('Could not verify account access. Please retry.'), scopeVersion: current.scopeVersion + 1 });
          throw current.error;
        } finally {
          if (request === generation) pending = null;
        }
      })();
      pending = work;
      return work;
    };
    const acceptSession = (session: Session | null, force = false) => {
      if (disposed) return;
      if (current.session?.user.id !== session?.user.id || !session) {
        ++generation;
        pending = null;
        verifiedAt = 0;
        clearPrivateQueries(client);
        publish({ session, role: null, accountId: null, loading: !!session, error: null, scopeVersion: current.scopeVersion + 1 });
      } else publish({ session });
      // Never await an auth-backed read inside the SDK notification callback.
      if (session) void Promise.resolve().then(() => readIdentity(force)).catch(() => {});
    };
    refresh.current = () => readIdentity(true);
    // Subscribe first. A late getSession result must not resurrect a signed-out user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      ++events;
      acceptSession(session, event === 'USER_UPDATED');
    });
    const initialEvents = events;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (disposed || events !== initialEvents) return;
      if (error) throw error;
      acceptSession(data.session);
    }).catch(() => {
      if (disposed || events !== initialEvents) return;
      acceptSession(null);
      publish({ error: new Error('Could not restore your session. Please sign in again.') });
    });
    return () => { disposed = true; ++generation; subscription.unsubscribe(); refresh.current = async () => {}; };
  }, [client]);

  const refreshIdentity = useCallback(() => refresh.current(), []);
  return <AuthContext.Provider value={{ ...state, user: state.session?.user ?? null, refreshIdentity }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
