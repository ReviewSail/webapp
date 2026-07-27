import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50">Loading...</div>;
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            ReviewSail
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Sign in to manage your review requests
          </p>
        </div>
        <div className="mt-8">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            redirectTo={window.location.origin + '/reset-password'}
            appearance={{ theme: ThemeSupa }}
            theme="light"
          />
        </div>
      </div>
    </div>
  );
}