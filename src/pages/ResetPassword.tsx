import { useState, useRef, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { passwordRecovery } from '../integrations/supabase/passwordRecovery';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const recovery = useSyncExternalStore(passwordRecovery.subscribe, passwordRecovery.getSnapshot);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || recovery.status !== 'ready') return;
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      // EGRESS-COST: low — validate the recovery account once per explicit submission.
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || data.user?.id !== recovery.userId || passwordRecovery.getSnapshot() !== recovery) {
        passwordRecovery.clear();
        return;
      }
      // EGRESS-COST: low — one authenticated password update, no table reads.
      const { data: updated, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403 || updateError.code === 'session_not_found') {
          passwordRecovery.clear();
        } else {
          setError(updateError.code === 'weak_password'
            ? 'Choose a stronger password that meets the account password policy.'
            : updateError.code === 'same_password'
              ? 'Choose a password different from your current password.'
              : 'We could not confirm the password change. Try again, or request a fresh reset link.');
        }
        return;
      }
      if (updated.user?.id !== recovery.userId) {
        setError('We could not confirm the password change. Please request a fresh reset link.');
        return;
      }

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      passwordRecovery.clear();
    } catch {
      setError('We could not confirm the password change. Check your connection and try again, or request a fresh reset link.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const finish = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      // EGRESS-COST: low — end this browser session only, after a confirmed password change.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      navigate('/login', { replace: true });
    } catch {
      setError('Your password was changed, but we could not sign you out. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (recovery.status === 'checking' && !success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p role="status" className="text-ink-muted">Checking your password reset link…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-card p-8 rounded-2xl shadow-md border border-line text-center">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-positive-soft text-positive">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-ink">Password Updated!</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Your password has been changed successfully. Sign out of this browser and return to sign in with your new password.
          </p>
          {error && <p role="alert" className="text-critical text-sm">{error}</p>}
          <button type="button" disabled={submitting} onClick={() => { void finish(); }} className="text-brand-600 underline disabled:opacity-50">
            {submitting ? 'Signing out…' : 'Return to sign in'}
          </button>
        </div>
      </div>
    );
  }

  if (recovery.status !== 'ready') return <RequestPasswordReset />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-card p-10 rounded-xl shadow-sm border border-line">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-brand-100 text-brand-600 mb-4">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-ink tracking-tight">
            Set New Password
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Enter your new password{recovery.email ? ` for ${recovery.email}` : ''} below.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="bg-critical-soft text-critical p-3.5 rounded-xl text-xs border border-critical/20 flex items-start space-x-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-xs font-bold text-ink mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  disabled={submitting}
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="appearance-none rounded-md relative block w-full px-3 py-2.5 border border-line placeholder-slate-500 text-ink focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm pr-10"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-faint hover:text-ink-muted"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-bold text-ink mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                disabled={submitting}
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2.5 border border-line placeholder-slate-500 text-ink focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm"
                placeholder="Re-enter your new password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting || !newPassword || !confirmPassword}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-md text-white bg-ink hover:bg-ink focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-line disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <span>Updating password…</span>
              ) : (
                'Update Password'
              )}
            </button>
          </div>
        </form>
        <button type="button" disabled={submitting} onClick={() => passwordRecovery.clear()} className="text-brand-600 underline text-sm">
          Request a fresh reset link
        </button>
      </div>
    </div>
  );
}

function RequestPasswordReset() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || sent || !email.trim()) return;
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      // EGRESS-COST: low — explicit recovery email request; never send automatically on load.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch {
      setError('We could not request a reset link. Please try again shortly.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas py-12 px-4">
      <div className="w-full max-w-md space-y-6 bg-card p-8 rounded-xl border border-line">
        <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
        <p className="text-sm text-ink-muted">Request a new link below. If a previous link expired, was already used, or this page was reloaded, use the latest email to start again.</p>
        {sent ? <p role="status" className="text-sm text-ink">If an account exists for that email, you will receive a password reset link. Check your inbox and spam folder.</p> : (
          <form onSubmit={request} className="space-y-4">
            <label htmlFor="reset-email" className="block text-sm text-ink">Account email</label>
            <input id="reset-email" type="email" autoComplete="email" required disabled={submitting} value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-md border border-line bg-card px-3 py-2 text-ink" />
            {error && <p role="alert" className="text-sm text-critical">{error}</p>}
            <button type="submit" disabled={submitting || !email.trim()} className="w-full rounded-md bg-ink text-white px-4 py-2 disabled:opacity-50">
              {submitting ? 'Requesting link…' : 'Send reset link'}
            </button>
          </form>
        )}
        <Link to="/login" className="block text-sm text-brand-600 underline">Back to sign in</Link>
      </div>
    </div>
  );
}
