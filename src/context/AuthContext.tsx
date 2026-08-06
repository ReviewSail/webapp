import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: 'admin' | 'staff' | null;
  loading: boolean;
  error: Error | null;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
  error: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /** The user whose role we already hold, so a token refresh doesn't re-read it. */
  const roleLoadedFor = useRef<string | null>(null);

  const fetchUserRole = async (userId: string) => {
    // EGRESS-COST: low — one narrow row, and only when the signed-in user
    // actually changes. onAuthStateChange fires on every token refresh and on
    // every tab refocus; this read used to go out each time.
    if (roleLoadedFor.current === userId) return;
    roleLoadedFor.current = userId;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setRole(data.role as 'admin' | 'staff');
      } else {
        // Fail closed. This used to default to 'admin', so any hiccup reading
        // the users row handed a staff member the Settings tab, billing, and
        // the delete-account button. RLS would still refuse the writes, but the
        // UI should not offer them in the first place.
        console.warn('[AuthContext] Could not read user role; defaulting to staff:', error);
        setRole('staff');
        // Let the next auth event try again rather than sticking on the guess.
        roleLoadedFor.current = null;
      }
    } catch (err) {
      console.error('[AuthContext] fetchUserRole failed:', err);
      setRole('staff');
      roleLoadedFor.current = null;
    }
  };

  const initializeAuth = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      setSession(session);
      setUser(session?.user ?? null);
      setError(null);

      if (session?.user) {
        await fetchUserRole(session.user.id);
      } else {
        setRole(null);
        roleLoadedFor.current = null;
      }
    } catch (err) {
      console.error('[AuthContext] initializeAuth failed:', err);
      setError(err instanceof Error ? err : new Error('Failed to initialize authentication'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        setError(null);

        if (session?.user) {
          await fetchUserRole(session.user.id);
        } else {
          setRole(null);
          roleLoadedFor.current = null;
        }
      } catch (err) {
        console.error('[AuthContext] authStateChange failed:', err);
        setError(err instanceof Error ? err : new Error('Authentication state change error'));
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, role, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);