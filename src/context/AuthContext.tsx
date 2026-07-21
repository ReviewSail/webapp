import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: 'admin' | 'staff' | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [loading, setLoading] = useState(true);

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
        setRole('admin'); // Fallback default
      }
    } catch (err) {
      console.warn('Failed to load user role:', err);
      setRole('admin');
    }
  };

  const handleInviteJoin = async (userId: string, email: string, userMetadata: any) => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteAccountId = urlParams.get('invite_account_id');
    
    if (inviteAccountId) {
      try {
        // Check if user record already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (!existingUser) {
          console.log('[AuthContext] Auto-joining user to invited account:', inviteAccountId);
          await supabase.from('users').insert({
            id: userId,
            account_id: inviteAccountId,
            role: 'staff',
            email: email,
            full_name: userMetadata?.full_name || 'New Member'
          });
        }
      } catch (err) {
        console.error('[AuthContext] Failed to auto-join invited user:', err);
      } finally {
        // Strip the URL parameter to prevent replay loops
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await handleInviteJoin(session.user.id, session.user.email || '', session.user.user_metadata);
        await fetchUserRole(session.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await handleInviteJoin(session.user.id, session.user.email || '', session.user.user_metadata);
        await fetchUserRole(session.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);