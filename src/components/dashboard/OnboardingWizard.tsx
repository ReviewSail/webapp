import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReviewSail, type Location } from '../../context/ReviewSailContext';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../lib/roles';
import { assessGoogleReviewUrl } from '../../lib/googleReviewUrl';
import { TIMEZONES, browserTimezone, friendlyTimezone, friendlySendHour } from '../../lib/timezones';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { cn } from '../../lib/utils';

const STEPS = ['Property', 'Review link', 'Add guests'];
const progressKey = (id: string) => `reviewsail:setup:v1:${id}`;

function initialStep(location: Location): number {
  const hasProperty = !!location.name.trim() && location.name !== 'Main Location';
  const link = assessGoogleReviewUrl(location.googlePlaceUrl);
  const hasLink = link.kind !== 'empty' && link.kind !== 'invalid';
  const inferred = !hasProperty ? 1 : hasLink ? 3 : 2;
  try {
    const saved = Number(localStorage.getItem(progressKey(location.id)));
    return Number.isInteger(saved) && saved >= 1 && saved <= 3 ? Math.min(saved, inferred) : inferred;
  } catch { return inferred; }
}

export function OnboardingWizard() {
  const { locations, activeLocationId } = useReviewSail();
  const { role } = useAuth();
  const navigate = useNavigate();
  const selectedLocation = useRef(activeLocationId);
  selectedLocation.current = activeLocationId;
  const location = locations.find(item => item.id === activeLocationId);
  if (!location || location.onboardingComplete) return null;
  if (!isAdmin(role)) return <Notice tone="info" title="Your property is being set up">An administrator needs to finish setting up {location.name}. You can still review existing guest feedback.</Notice>;
  // A new property gets a new form instance; values and pending saves cannot
  // carry across to the property selected in the header.
  return <PropertySetup key={location.id} location={location} onAddGuests={() => {
    if (selectedLocation.current === location.id) navigate('/import');
  }} />;
}

function PropertySetup({ location, onAddGuests }: { location: Location; onAddGuests: () => void }) {
  const { updateLocationSettings, completeOnboarding } = useReviewSail();
  const [step, setStep] = useState(() => initialStep(location));
  const [name, setName] = useState(location.name === 'Main Location' ? '' : location.name);
  const [timezone, setTimezone] = useState(location.timezone || browserTimezone());
  const [googleUrl, setGoogleUrl] = useState(location.googlePlaceUrl || '');
  const [editingTimezone, setEditingTimezone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const assessment = assessGoogleReviewUrl(googleUrl);
  const moveTo = (next: number) => {
    if (!mounted.current) return;
    setError('');
    setStep(next);
    try { localStorage.setItem(progressKey(location.id), String(next)); } catch { /* Saved property fields still allow resuming. */ }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (step === 1 && !name.trim()) { setError('Enter the property name your guests will recognise.'); return; }
    if (step === 2 && ['empty', 'invalid'].includes(assessment.kind)) { setError('Enter a valid Google review link or Place ID.'); return; }
    setSaving(true);
    setError('');
    try {
      if (step === 1) {
        await updateLocationSettings(location.id, { name: name.trim(), timezone });
        moveTo(2);
      } else if (step === 2) {
        await updateLocationSettings(location.id, { googlePlaceUrl: assessment.normalized });
        moveTo(3);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'We couldn’t save your changes. Please try again.');
    } finally { if (mounted.current) setSaving(false); }
  };
  const finish = async (addGuests: boolean) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await completeOnboarding(location.id);
      try { localStorage.removeItem(progressKey(location.id)); } catch { /* Nonessential progress storage. */ }
      if (addGuests) onAddGuests();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Setup couldn’t be completed. Please try again.');
    } finally { if (mounted.current) setSaving(false); }
  };
  const inputClass = 'w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-faint';
  const labels = [
    ['Make it feel like you', 'Use the property name your guests will recognise.'],
    ['Connect your review page', 'Add the Google review link for this property.'],
    ['Bring in your first guests', 'Upload a checkout report or add a guest by hand.'],
  ];
  return (
    <section className="max-w-[660px] overflow-hidden rounded-xl border border-line bg-card" aria-label="Property setup">
      <ol className="grid grid-cols-3 gap-2 border-b border-line px-4 py-4 sm:px-6" aria-label="Setup progress">
        {STEPS.map((label, i) => <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={cn('flex items-center gap-1.5 text-xs sm:text-sm', step === i + 1 ? 'font-semibold text-brand-700' : 'text-ink-muted')}>
          {i + 1 < step ? <Check className="h-3.5 w-3.5 shrink-0" aria-label="Completed" /> : <span className="tnum">{i + 1}.</span>}{label}
        </li>)}
      </ol>
      <form onSubmit={save} className="p-5 sm:p-6" aria-busy={saving}>
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight text-ink">{labels[step - 1][0]}</h2>
        <p className="mt-1 text-sm text-ink-muted">{labels[step - 1][1]}</p>
        <fieldset disabled={saving} className="mt-5 min-w-0 space-y-5">
          {step === 1 && <>
            <div className="space-y-1.5">
              <label htmlFor="onboarding-name" className="block text-sm font-medium text-ink">Property name</label>
              <input id="onboarding-name" value={name} onChange={event => setName(event.target.value)} placeholder="The Harbour Inn" autoComplete="organization" aria-invalid={!!error} aria-describedby={error ? 'setup-error' : undefined} className={inputClass} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={editingTimezone ? 'onboarding-tz' : undefined} className="text-sm text-ink-muted">Property timezone</label>
              {editingTimezone ? <select id="onboarding-tz" value={timezone} onChange={event => { setTimezone(event.target.value); setEditingTimezone(false); }} className={inputClass}>
                {[...new Set([timezone, ...TIMEZONES])].map(zone => <option key={zone} value={zone}>{friendlyTimezone(zone)}</option>)}
              </select> : <button type="button" onClick={() => setEditingTimezone(true)} className="rounded-md py-1 text-left text-sm font-medium text-brand-700 hover:underline" aria-label={`Change property timezone: ${friendlyTimezone(timezone)}`}>{friendlyTimezone(timezone)} · Change</button>}
            </div>
            <div className="rounded-r-lg border-l-2 border-brand-700 bg-canvas px-4 py-3">
              <p className="text-xs font-medium text-ink-muted">Example guest message</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">Thank you for staying at <strong className="font-semibold">{name.trim() || 'your property'}</strong>. How was your stay?</p>
            </div>
          </>}
          {step === 2 && <>
            <div className="space-y-1.5"><label htmlFor="onboarding-google" className="block text-sm font-medium text-ink">Google review link</label><input id="onboarding-google" value={googleUrl} onChange={event => setGoogleUrl(event.target.value)} placeholder="https://g.page/r/…/review" className={inputClass} aria-invalid={assessment.kind === 'invalid' || !!error} aria-describedby={error ? 'setup-error' : undefined} /></div>
            {googleUrl.trim() && assessment.message && <p className={cn('text-sm', assessment.opensReviewComposer ? 'text-positive' : assessment.kind === 'invalid' ? 'text-critical' : 'text-ink-muted')}>{assessment.message}</p>}
            {assessment.normalized && !['empty', 'invalid'].includes(assessment.kind) && <a href={assessment.normalized} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">Preview what guests see <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
            <details className="text-sm text-ink-muted"><summary className="cursor-pointer font-medium text-ink">How do I find my review link?</summary><ol className="mt-3 list-decimal space-y-2 pl-5"><li>Open Google Business Profile and select your property.</li><li>Choose “Ask for reviews” and copy the link.</li><li>Paste the link above.</li></ol></details>
          </>}
          {step === 3 && <div className="rounded-lg bg-canvas p-4 text-sm leading-relaxed text-ink-muted"><h3 className="font-medium text-ink">What happens after you add guests</h3><p className="mt-2">Importing creates queued invites. With an active plan and a sending channel enabled, eligible invites are sent from {friendlySendHour(location.preferredSendHour ?? 10)} on the checkout date, in {friendlyTimezone(timezone)}. Past checkouts may be picked up on the next scheduled run.</p><p className="mt-2">Check your message and sending preferences in Settings before importing.</p></div>}
          {error && <p id="setup-error" role="alert" className="rounded-lg bg-critical-soft p-3 text-sm text-critical">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {step < 3 ? <Button type="submit" size="lg" loading={saving} icon={ArrowRight}>{step === 1 ? 'Continue to review link' : 'Save and continue'}</Button> : <Button type="button" size="lg" onClick={() => finish(true)} loading={saving} icon={ArrowRight}>Finish and add guests</Button>}
            {step > 1 && <Button type="button" variant="ghost" onClick={() => moveTo(step - 1)}>Back</Button>}
            {step === 3 && <Button type="button" variant="ghost" onClick={() => finish(false)}>I’ll add guests later</Button>}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
