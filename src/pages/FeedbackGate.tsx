import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Star, CheckCircle2, MapPin, ExternalLink } from 'lucide-react';
import { decodeShortId } from '../lib/shortLink';
import { cn } from '../lib/utils';
import { readFeedbackOutcome, safeReviewUrl, type FeedbackDraft } from '../lib/feedbackSubmission';

type GateMode = 'request' | 'property';
type GateContext = { location_id: string; location_name: string | null; google_place_url: string | null; recovery_email: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function FeedbackGate({ mode = 'request' }: { mode?: GateMode }) {
  const [searchParams] = useSearchParams();
  const { code } = useParams<{ code?: string }>();
  const targetId = mode === 'property' ? (code ? decodeShortId(code) : null)
    : searchParams.get('request_id') ?? (code ? decodeShortId(code) : null);
  const demo = targetId === 'demo';
  const valid = !!targetId && UUID.test(targetId);
  const context = useQuery({
    queryKey: ['guestFeedbackContext', mode, targetId],
    enabled: valid && !demo,
    queryFn: async (): Promise<GateContext | null> => {
      // EGRESS-COST: low — one public metadata row, no guest data or polling.
      const { data, error } = await supabase.rpc('get_guest_feedback_context_v2', {
        p_mode: mode, p_target_id: targetId,
      }).maybeSingle();
      if (error) throw new Error('Unable to load feedback details.');
      return data as GateContext | null;
    },
  });
  const location = demo ? { location_id: 'demo', location_name: 'The Grand Hotel', google_place_url: null, recovery_email: null } : context.data;

  return <main className="min-h-screen bg-canvas px-4 py-10 sm:py-14">
    <div className="mx-auto w-full max-w-lg space-y-5">
      {!valid && !demo ? <p role="alert">This link is not valid.</p>
        : !demo && context.isPending ? <p role="status">Loading feedback details…</p>
          : !location ? <div className="space-y-3">
            <p role="alert">{context.isError ? 'Unable to load feedback details. Please try again.' : 'This feedback link is unavailable or expired.'}</p>
            <button onClick={() => void context.refetch()} disabled={context.isFetching} className="btn-primary">Try loading again</button>
          </div>
            : <GuestFeedbackJourney key={mode + ':' + targetId} mode={mode} targetId={targetId!} location={location} demo={demo} />}
    </div>
  </main>;
}

function GuestFeedbackJourney({ mode, targetId, location, demo }: {
  mode: GateMode; targetId: string; location: GateContext; demo: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [followupSaved, setFollowupSaved] = useState(false);
  const googleUrl = safeReviewUrl(location.google_place_url);
  return <>
    {demo && <p className="rounded-lg bg-caution-soft p-3 text-sm">Preview mode — nothing is saved or delivered.</p>}
    <header className="text-center space-y-2">
      <MapPin className="mx-auto h-7 w-7 text-brand-600" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-ink">How was your stay?</h1>
      <p className="text-ink-muted">{location.location_name || 'Our Property'}</p>
    </header>

    {/* Identical invitation before rating, during errors and after every rating.
        It never navigates the saving tab or claims that a review was posted. */}
    {googleUrl && <section className="rounded-xl border border-line bg-card text-card-foreground p-5 space-y-3">
      <h2 className="font-semibold text-ink">Share your experience publicly</h2>
      <p className="text-sm text-ink-muted">A Google review is optional. You can leave one with or without sending private feedback.</p>
      <a href={googleUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 underline">
        Write a Google review <ExternalLink size={16} aria-hidden="true" />
      </a>
      <p className="text-xs text-ink-muted">Opens in a new tab. Any private message below stays on this page.</p>
    </section>}

    {!saved ? <FeedbackForm mode={mode} targetId={targetId} demo={demo} onSaved={() => setSaved(true)} />
      : <>
        <section role="status" className="rounded-xl border border-line bg-card text-card-foreground p-6 space-y-2">
          <CheckCircle2 className="h-7 w-7 text-positive" aria-hidden="true" />
          <h2 className="text-xl font-semibold">{demo ? 'Preview complete' : 'Feedback saved'}</h2>
          <p className="text-sm text-ink-muted">{demo ? 'No feedback was saved in preview mode.' : 'Your feedback is saved for the property to review. This does not post a Google review.'}</p>
        </section>
        {!followupSaved ? <FeedbackForm mode={mode} targetId={targetId} demo={demo} followup onSaved={() => setFollowupSaved(true)} />
          : <p role="status" className="rounded-xl border border-line bg-card text-card-foreground p-5">{demo ? 'Follow-up preview complete; nothing saved.' : 'Follow-up saved for the property to review. A response is not guaranteed.'}</p>}
      </>}
  </>;
}

function FeedbackForm({ mode, targetId, demo, followup = false, onSaved }: {
  mode: GateMode; targetId: string; demo: boolean; followup?: boolean; onSaved: () => void;
}) {
  const [star, setStar] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<{ id: string; draft: FeedbackDraft } | null>(null);
  const prefix = followup ? 'followup' : 'feedback';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || (!followup && star === null) || (followup && !text.trim())) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (demo) { onSaved(); return; }
      // An uncertain attempt freezes this exact payload and key until its
      // acknowledgement is recovered. No auto-retry or fresh key on timeout.
      attempt.current ??= { id: crypto.randomUUID(), draft: { star: followup ? null : star, text: text.trim(), name: name.trim(), email: email.trim() } };
      const current = attempt.current;
      // EGRESS-COST: low — one idempotent save, one small outcome; no global refresh.
      const { data, error: saveError } = await supabase.rpc('submit_guest_feedback_v2', {
        p_mode: mode, p_target_id: targetId, p_submission_id: current.id,
        p_star_rating: current.draft.star, p_feedback_text: current.draft.text || null,
        p_guest_name: current.draft.name || null, p_guest_email: current.draft.email || null,
      });
      const outcome = readFeedbackOutcome(saveError ? null : data, current.id);
      if (outcome.saved) { onSaved(); return; }
      setUncertain(outcome.uncertain);
      setError(outcome.error || 'Could not save feedback.');
      if (!outcome.uncertain) attempt.current = null;
    } catch {
      setUncertain(true);
      setError(readFeedbackOutcome(null, attempt.current?.id || '').error!);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-line bg-card text-card-foreground p-5 sm:p-6 space-y-4">
    <h2 className="text-lg font-semibold text-ink">{followup ? 'Add a private follow-up (optional)' : 'Send private feedback (optional)'}</h2>
    <p className="text-sm text-ink-muted">Private feedback is saved for the property to review, not published on Google.</p>
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {!followup && <fieldset disabled={busy || uncertain} className="space-y-2">
        <legend className="text-sm font-medium">Your rating</legend>
        <div className="flex gap-1" role="group" aria-label="Choose a rating">
          {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={'Rate ' + value + ' star' + (value === 1 ? '' : 's')}
            aria-pressed={star === value} onClick={() => setStar(value)}
            className="min-h-11 min-w-11 rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <Star aria-hidden="true" className={cn('h-7 w-7', value <= (star ?? 0) ? 'fill-star text-star' : 'text-ink-muted')} />
          </button>)}
        </div>
      </fieldset>}
      <div>
        <label htmlFor={prefix + '-text'} className="text-sm font-medium">{followup ? 'Follow-up message' : 'Your message (optional)'}</label>
        <textarea id={prefix + '-text'} rows={4} maxLength={4000} required={followup} readOnly={busy || uncertain}
          value={text} onChange={event => setText(event.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-background p-3 text-sm" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={prefix + '-name'} className="text-sm font-medium">Your name (optional)</label>
          <input id={prefix + '-name'} maxLength={200} readOnly={busy || uncertain} value={name} onChange={event => setName(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 text-sm" /></div>
        <div><label htmlFor={prefix + '-email'} className="text-sm font-medium">Email (optional)</label>
          <input id={prefix + '-email'} type="email" maxLength={320} readOnly={busy || uncertain} value={email} onChange={event => setEmail(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 text-sm" /></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-critical-soft p-3 text-sm text-critical">{error}</p>}
      {uncertain && <p className="text-sm text-ink-muted">Your text is kept here unchanged while we check the original submission. Keep this tab open.</p>}
      <button type="submit" disabled={busy || (!followup && star === null) || (followup && !text.trim())}
        className="min-h-11 w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white disabled:opacity-50">
        {busy ? 'Saving…' : uncertain ? 'Retry same submission' : followup ? 'Save follow-up' : 'Save private feedback'}
      </button>
    </form>
  </section>;
}
