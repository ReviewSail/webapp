import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Navigate } from 'react-router-dom';

/**
 * Sign-in is the first thing anyone sees, and it was the one screen still
 * rendering Supabase's stock green — a different product's brand on the front
 * door. ThemeSupa takes variable overrides, so it can be given ReviewSail's
 * own palette instead of being left at defaults.
 */
const authAppearance = (dark: boolean) => ({
  theme: ThemeSupa,
  variables: {
    default: {
      colors: {
        brand: dark ? '#1E90E8' : '#0071C2',
        brandAccent: dark ? '#3AA5F5' : '#005AA0',
        brandButtonText: '#FFFFFF',
        inputBackground: dark ? '#141F2E' : '#FFFFFF',
        inputBorder: dark ? '#28374B' : '#E2E8F0',
        inputBorderHover: dark ? '#3A4D67' : '#A5CBEF',
        inputBorderFocus: dark ? '#1E90E8' : '#0071C2',
        inputText: dark ? '#E8EEF7' : '#0B1B33',
        inputLabelText: dark ? '#9BADC7' : '#5A6B85',
        inputPlaceholder: dark ? '#6B7C96' : '#8A99AD',
        messageText: dark ? '#9BADC7' : '#5A6B85',
        messageTextDanger: dark ? '#F08A80' : '#B42318',
        anchorTextColor: dark ? '#9BADC7' : '#5A6B85',
        anchorTextHoverColor: dark ? '#E8EEF7' : '#0B1B33',
      },
      radii: { borderRadiusButton: '0.5rem', inputBorderRadius: '0.5rem' },
      fonts: {
        bodyFontFamily: 'inherit',
        buttonFontFamily: 'inherit',
        inputFontFamily: 'inherit',
        labelFontFamily: 'inherit',
      },
    },
  },
});

export default function Login() {
  const { session, loading } = useAuth();
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-2.5 text-ink-muted">
          <span className="flex h-6 w-6 animate-pulse items-center justify-center rounded-md bg-brand-600 text-[13px] font-bold text-white">
            R
          </span>
          <span className="text-sm font-medium">Loading ReviewSail…</span>
        </div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 bg-card p-8 rounded-xl border border-line">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
              R
            </span>
            <span>ReviewSail</span>
          </span>
          <p className="mt-2 text-sm text-ink-muted">Sign in to manage your review invites</p>
        </div>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          redirectTo={window.location.origin + '/reset-password'}
          // key forces a remount when the theme flips; ThemeSupa reads its
          // variables once on mount and would otherwise keep the old palette.
          key={resolved}
          appearance={authAppearance(dark)}
          theme={dark ? 'dark' : 'light'}
        />
      </div>
    </div>
  );
}
