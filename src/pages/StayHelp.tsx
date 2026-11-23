import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { decodeShortId } from '../lib/shortLink';
import { readFeedbackOutcome } from '../lib/feedbackSubmission';
import { supabase } from '../integrations/supabase/client';

type Mode = 'property' | 'request';
export default function StayHelp({ mode }: { mode: Mode }) {
  const id = decodeShortId(useParams().code || '');
  const [params] = useSearchParams();
  const context = useQuery({
    queryKey: ['guestFeedbackContext', mode, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_guest_feedback_context_v2', { p_mode: mode, p_target_id: id })
        .maybeSingle();
      if (error) throw error;
      return data as { location_name: string; recovery_email: string | null } | null;
    },
  });
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:py-20">
      <div className="mx-auto max-w-md">
        {id && context.data ? (
          <ReportForm
            key={mode + id}
            mode={mode}
            id={id}
            name={context.data.location_name}
            contact={context.data.recovery_email}
            preview={params.get('preview') === '1'}
          />
        ) : (
          <p role="status">
            {context.isError ? (
              <button onClick={() => void context.refetch()}>
                Couldn’t load this property. Try again
              </button>
            ) : id && context.isPending ? (
              'Loading property…'
            ) : (
              'This help link is unavailable.'
            )}
          </p>
        )}
      </div>
    </main>
  );
}
function ReportForm({
  mode,
  id,
  name,
  contact,
  preview,
}: {
  mode: Mode;
  id: string;
  name: string;
  contact: string | null;
  preview: boolean;
}) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<string | null>(null);
  const sending = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current || !message.trim()) return;
    if (preview) {
      setSaved(true);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      attempt.current ??= crypto.randomUUID();
      const result = await supabase.rpc('report_stay_issue', {
        p_mode: mode,
        p_target_id: id,
        p_submission_id: attempt.current,
        p_message: message.trim(),
        p_email: email.trim() || null,
      });
      const outcome = readFeedbackOutcome(result.error ? null : result.data, attempt.current);
      setSaved(outcome.saved);
      setUncertain(outcome.uncertain);
      setError(outcome.error || '');
      if (!outcome.uncertain) attempt.current = null;
    } catch {
      setUncertain(true);
      setError('We couldn’t confirm receipt. Retry to check the same report.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
        <MessageSquare size={18} />
        {name}
      </p>
      {preview && (
        <p className="text-sm text-ink-muted">Guest preview · reports here are simulated.</p>
      )}
      {saved ? (
        <div role="status">
          <CheckCircle2 className="mb-3 text-positive" />
          <h1 className="text-2xl font-semibold">
            {preview ? 'Preview complete' : 'Your report was received'}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {preview
              ? 'Guests will see a confirmation here.'
              : 'Your property team can now see your message.'}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-2xl font-semibold">What can we help with?</h1>
          <label className="block text-sm font-medium">
            Your message
            <textarea
              required
              maxLength={4000}
              rows={5}
              readOnly={uncertain || busy}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-line bg-canvas p-3 text-base"
            />
          </label>
          {mode === 'property' && (
            <label className="block text-sm font-medium">
              Email where your host can reach you
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={320}
                readOnly={uncertain || busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-line bg-canvas p-3 text-base"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <button disabled={busy || !message.trim()} className="btn-primary min-h-11 w-full">
            {busy ? 'Sending…' : uncertain ? 'Retry same report' : 'Send to host'}
          </button>
        </form>
      )}
      {contact && (
        <p className="border-t border-line pt-4 text-sm">
          Need direct help?{' '}
          <a href={'mailto:' + contact} className="break-all text-brand-700 underline">
            {contact}
          </a>
        </p>
      )}
    </section>
  );
}
