import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setRole(data.role as 'admin' | 'staff');
      } else {
        console.warn('[AuthContext] Using fallback role, failed to fetch user role:', error);
        setRole('admin');
      }
    } catch (err) {
      console.error('[AuthContext] fetchUserRole failed:', err);
      setRole('admin');
    }
  };

  const handleInviteJoin = async (userId: string, email: string, userMetadata: any) => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteAccountId = urlParams.get('invite_account_id');
    
    if (inviteAccountId) {
      try {
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (checkError) throw checkError;

        if (!existingUser) {
          console.log('[AuthContext] Auto-joining user to invited account:', inviteAccountId);
          const { error: joinError } = await supabase.from('users').insert({
            id: userId,
            account_id: inviteAccountId,
            role: 'staff',
            email: email,
            full_name: userMetadata?.full_name || 'New Member'
          });
          if (joinError) throw joinError;
        }
      } catch (err) {
        console.error('[AuthContext] Failed to auto-join invited user:', err);
        setError(new Error('Failed to process account invitation'));
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
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
        await Promise.all([
          handleInviteJoin(session.user.id, session.user.email || '', session.user.user_metadata),
          fetchUserRole(session.user.id),
        ]);
      } else {
        setRole(null);
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
          await Promise.all([
            handleInviteJoin(session.user.id, session.user.email || '', session.user.user_metadata),
            fetchUserRole(session.user.id),
          ]);
        } else {
          setRole(null);
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