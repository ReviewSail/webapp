import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { useReviewSail } from '../context/ReviewSailContext';

/**
 * Messages are keyed off the exceptions raised by public.accept_invitation().
 * Each one says what happened and what the reader can do next.
 */
const ERRORS: Record<string, string> = {
  invite_invalid:
    'This invite link has expired or has already been used. Ask your administrator to send a new one.',
  invite_email_mismatch:
    'This invite was sent to a different email address. Sign in with that address to accept it.',
  invite_account_has_data:
    "This account already has guests and locations of its own, so it can't be merged into another team. Accept the invite from an email address that isn't already using ReviewSail.",
  not_authenticated: 'Sign in to accept this invite.',
};

const messageFor = (raw: string) => {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "Couldn't accept the invite. Try the link again, or ask for a new one.";
};

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const { refreshData } = useReviewSail();

  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'idle' | 'redeeming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const redeemed = useRef(false);

  useEffect(() => {
    if (!token || !session || redeemed.current) return;
    redeemed.current = true;

    (async () => {
      setStatus('redeeming');
      const { error: rpcError } = await supabase.rpc('accept_invitation', { p_token: token });

      if (rpcError) {
        setError(messageFor(rpcError.message || ''));
        setStatus('error');
        return;
      }

      // The user's account_id just changed, so every cached row is stale.
      await refreshData();
      setStatus('done');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    })();
  }, [token, session, refreshData, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center">
          <span className="inline-flex items-center space-x-1.5 text-xl font-bold text-slate-900 tracking-tight">
            <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-sm font-black">R</span>
            <span>ReviewSail</span>
          </span>
        </div>

        {!token ? (
          <Panel
            tone="error"
            title="This link is incomplete"
            body="The invite link is missing its token. Open the link from your invitation email again, or ask your administrator to resend it."
          />
        ) : status === 'error' ? (
          <>
            <Panel tone="error" title="Invite not accepted" body={error || ''} />
            <Link
              to="/dashboard"
              className="block text-center text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Go to ReviewSail
            </Link>
          </>
        ) : status === 'done' ? (
          <Panel
            tone="success"
            title="You're on the team"
            body="Taking you to the dashboard…"
          />
        ) : authLoading || status === 'redeeming' || session ? (
          <div className="flex flex-col items-center py-6 space-y-3 text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <p className="text-sm">Accepting your invite…</p>
          </div>
        ) : (
          <>
            <p className="text-center text-sm text-slate-600">
              Sign in or create your account to accept this invite. Use the email address the
              invitation was sent to.
            </p>
            <Auth
              supabaseClient={supabase}
              providers={[]}
              // Bring email-confirmation links back here with the token intact.
              redirectTo={`${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`}
              appearance={{ theme: ThemeSupa }}
              theme="light"
            />
          </>
        )}
      </div>
    </div>
  );
}

function Panel({ tone, title, body }: { tone: 'success' | 'error'; title: string; body: string }) {
  const isError = tone === 'error';
  return (
    <div
      className={`p-4 rounded-xl border flex items-start space-x-2.5 text-sm ${
        isError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      {isError ? (
        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
      ) : (
        <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
      )}
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5">{body}</p>
      </div>
    </div>
  );
}
