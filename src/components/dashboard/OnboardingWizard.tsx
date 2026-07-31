import { useState, useMemo, useEffect } from 'react';
import { Building2, MapPin, AlertCircle, FileUp, ChevronDown, ChevronUp, Map, CheckCircle2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReviewSail } from '../../context/ReviewSailContext';
import { assessGoogleReviewUrl } from '../../lib/googleReviewUrl';
import { TIMEZONES, browserTimezone, describeSendTime } from '../../lib/timezones';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

/*
 * Three steps, not four.
 *
 * There used to be a fourth "You're all set!" screen, and it was unreachable:
 * the only thing that advanced to it was completeOnboarding(), which was only
 * ever called by a button on that same screen. Step 3 navigated away to the
 * import page instead. The consequence was that onboarding could never be
 * finished, so this wizard sat permanently at the top of every dashboard.
 *
 * Step 3 now completes onboarding itself. The confirmation screen is not
 * missed — the wizard disappearing is the confirmation.
 */
const STEPS = ['Your property', 'Review link', 'Guests'];

export function OnboardingWizard() {
  const { locations, activeLocationId, updateLocationSettings, completeOnboarding } = useReviewSail();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  const [googleUrl, setGoogleUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Was `locations.find(l => l.id)` — a predicate every location satisfies, so
  // it returned the first one regardless of which property the header had
  // selected. On a multi-property account the wizard read and wrote the wrong
  // location, including its Google review link.
  const activeLoc = locations.find(l => l.id === activeLocationId) ?? null;

  // Signup creates the location as "Main Location" on UTC and nothing ever
  // asked otherwise, so new accounts introduced themselves to guests by the
  // wrong name and mailed them at 10:00 UTC — the small hours in the Americas.
  const [name, setName] = useState('');
  // Seeded from the browser rather than '', so the field and the "invites go
  // out at…" line below it never disagree about which zone is in play.
  const [timezone, setTimezone] = useState(browserTimezone);
  const [editingTimezone, setEditingTimezone] = useState(false);

  // Seed from the location once it arrives, without clobbering typing.
  useEffect(() => {
    if (!activeLoc) return;
    setName(prev => (prev ? prev : activeLoc.name === 'Main Location' ? '' : activeLoc.name));
    setTimezone(prev => prev || activeLoc.timezone || browserTimezone());
  }, [activeLoc?.id]);

  // Assessed live so the manager sees what guests will get before saving.
  const assessment = useMemo(() => assessGoogleReviewUrl(googleUrl), [googleUrl]);

  const handleSaveProperty = async () => {
    if (!activeLoc) return;
    if (!name.trim()) {
      setError('Give the property a name — guests see it in every message.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateLocationSettings(activeLoc.id, {
        name: name.trim(),
        timezone: timezone || browserTimezone(),
      });
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Could not save your property details.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGoogleUrl = async () => {
    if (!activeLoc) return;
    if (assessment.kind === 'empty') {
      setError('A review link is required — without it, every happy guest is a lost review.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Store the normalized form so a pasted Place ID becomes a usable link.
      await updateLocationSettings(activeLoc.id, { googlePlaceUrl: assessment.normalized });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setStep(3);
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save Google Place URL');
    } finally {
      setSaving(false);
    }
  };

  /** Marks setup done, then optionally hands off to the import flow. */
  const handleCompleteOnboarding = async (thenImport: boolean) => {
    if (!activeLoc) return;
    setSaving(true);
    try {
      await completeOnboarding(activeLoc.id);
      if (thenImport) navigate('/import');
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
    } finally {
      setSaving(false);
    }
  };

  if (activeLoc?.onboardingComplete) return null;

  const inputClass =
    'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    // Flat navy header, not a gradient: the invite pipeline below owns the one
    // gradient this screen gets. Two of them and neither reads as the point.
    <section className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="bg-brand-900 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-white">Finish setting up</h2>
          <span className="tnum shrink-0 text-xs text-white/60">
            Step {step} of {STEPS.length} · {STEPS[step - 1]}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={cn('h-1 flex-1 rounded-full transition-colors', i < step ? 'bg-brand-300' : 'bg-white/15')}
            />
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* Step 1: Name and timezone. This replaced a welcome screen that
            carried no information and cost a click to get past. */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <Building2 className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">What should guests call your property?</h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  This name appears in every message, and the timezone decides when they arrive.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="onboarding-name" className="block text-xs font-medium text-ink-muted">
                  Property name
                </label>
                <input
                  id="onboarding-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="The Harbour Inn"
                  className={inputClass}
                />
              </div>
              {/* The browser already knows the answer, and it is right almost
                  every time. Showing the detected zone as a fact with a way to
                  correct it beats making every new owner hunt through 400-odd
                  entries — and keeps them out of the DOM until asked for. */}
              <div className="space-y-1.5">
                <label htmlFor="onboarding-tz" className="block text-xs font-medium text-ink-muted">
                  Timezone
                </label>
                {editingTimezone ? (
                  <select
                    id="onboarding-tz"
                    autoFocus
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value);
                      setEditingTimezone(false);
                    }}
                    className={inputClass}
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-[38px] items-center justify-between gap-2 rounded-lg border border-line bg-card px-3">
                    <span className="truncate text-sm text-ink">
                      {(timezone || browserTimezone()).replace(/_/g, ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingTimezone(true)}
                      className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-ink-muted">
              Invites go out at {describeSendTime(timezone || 'UTC', 10)}. You can change that later in Settings.
            </p>

            {error && (
              <div className="flex items-center gap-1.5 rounded-lg bg-critical-soft p-2.5 text-xs text-critical">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button onClick={handleSaveProperty} loading={saving} block>
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Google Place URL */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <MapPin className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">Link your Google Maps listing</h3>
                <p className="mt-0.5 text-sm text-ink-muted">We'll send happy guests straight to your review page.</p>
              </div>
            </div>

            <input
              type="text"
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/.../review"
              aria-label="Google review link"
              className={inputClass}
            />

            {googleUrl.trim() && assessment.message && (
              <div
                className={cn(
                  'flex items-start gap-1.5 rounded-lg p-2.5 text-xs',
                  assessment.opensReviewComposer
                    ? 'bg-positive-soft text-positive'
                    : assessment.kind === 'listing-link'
                      ? 'bg-caution-soft text-caution'
                      : 'bg-critical-soft text-critical'
                )}
              >
                {assessment.opensReviewComposer
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{assessment.message}</span>
              </div>
            )}

            {/* The only honest verification: let them see the real destination. */}
            {assessment.normalized && assessment.kind !== 'invalid' && (
              <a
                href={assessment.normalized}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Preview what guests see</span>
              </a>
            )}

            <button
              onClick={() => setShowGoogleHelp(!showGoogleHelp)}
              className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
            >
              <Map className="h-3.5 w-3.5" />
              <span>{showGoogleHelp ? 'Hide instructions' : 'How do I find my review link?'}</span>
              {showGoogleHelp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showGoogleHelp && (
              <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-4 text-xs text-ink-muted">
                <p className="font-semibold text-ink">Best — a direct review link:</p>
                <p>1. Open <strong>Google Business Profile</strong> and select your property</p>
                <p>2. Click <strong>Ask for reviews</strong> — Google gives you a short link</p>
                <p>3. Paste it above</p>
                <p className="pt-1.5 text-ink-faint">
                  A link from Google Maps' <strong>Share</strong> button also works, but it drops guests on your
                  profile instead of the review box, so fewer of them finish.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 rounded-lg bg-critical-soft p-2.5 text-xs text-critical">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="rounded-lg bg-positive-soft p-2.5 text-xs text-positive">Review link saved</div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleSaveGoogleUrl} loading={saving} className="flex-1">
                Save and continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Import Guests */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <FileUp className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">Bring in your guests</h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Upload a checkout report or add guests by hand. Invites start from there.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => handleCompleteOnboarding(true)} loading={saving} className="flex-1">
                Finish and add guests
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleCompleteOnboarding(false)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                I'll add them later
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
