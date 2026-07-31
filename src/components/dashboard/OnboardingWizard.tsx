import { useState, useMemo } from 'react';
import { Sparkles, Building2, MapPin, RefreshCw, AlertCircle, FileUp, ShieldCheck, ChevronDown, ChevronUp, Map, CheckCircle2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReviewSail } from '../../context/ReviewSailContext';
import { assessGoogleReviewUrl } from '../../lib/googleReviewUrl';

export function OnboardingWizard() {
  const { locations, updateLocationSettings, completeOnboarding } = useReviewSail();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  const [googleUrl, setGoogleUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const activeLoc = locations.find(l => l.id);

  // Assessed live so the manager sees what guests will get before saving.
  const assessment = useMemo(() => assessGoogleReviewUrl(googleUrl), [googleUrl]);

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

  const handleCompleteOnboarding = async () => {
    if (!activeLoc) return;
    setSaving(true);
    try {
      await completeOnboarding(activeLoc.id);
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
    } finally {
      setSaving(false);
    }
  };

  if (activeLoc?.onboardingComplete) return null;

  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-lg overflow-hidden">
      <div className="p-6 bg-gradient-to-r from-indigo-600 to-indigo-700">
        <div className="flex items-center space-x-2.5 text-white">
          <Sparkles className="h-6 w-6 text-indigo-200" />
          <h2 className="text-lg font-bold">Setup Wizard</h2>
        </div>
        <div className="flex items-center space-x-2 mt-3">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-white' : 'bg-indigo-400/40'}`} />
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Building2 className="h-8 w-8 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Welcome to ReviewSail!</h3>
              <p className="text-sm text-slate-500 mt-1">Let's get your property set up in just a few steps.</p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: Google Place URL */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl">
                <MapPin className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Link Your Google Maps Listing</h3>
                <p className="text-xs text-slate-500">We'll direct happy guests to your Google review page.</p>
              </div>
            </div>

            <button
              onClick={() => setShowGoogleHelp(!showGoogleHelp)}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
            >
              <Map className="h-3.5 w-3.5" />
              <span>{showGoogleHelp ? 'Hide instructions' : 'How to find your Google Place URL'}</span>
              {showGoogleHelp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showGoogleHelp && (
              <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 space-y-1.5 border border-slate-100">
                <p className="font-semibold text-slate-700">Best — a direct review link:</p>
                <p>1. Open <strong>Google Business Profile</strong> and select your property</p>
                <p>2. Click <strong>Ask for reviews</strong> — Google gives you a short link</p>
                <p>3. Paste it below</p>
                <p className="pt-1.5 text-slate-400">
                  A link from Google Maps' <strong>Share</strong> button also works, but it drops guests on your
                  profile instead of the review box, so fewer of them finish.
                </p>
              </div>
            )}

            <input
              type="text"
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/.../review"
              className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
            />

            {googleUrl.trim() && assessment.message && (
              <div
                className={`text-xs p-2.5 rounded-lg flex items-start space-x-1.5 ${
                  assessment.opensReviewComposer
                    ? 'text-emerald-700 bg-emerald-50'
                    : assessment.kind === 'listing-link'
                      ? 'text-amber-700 bg-amber-50'
                      : 'text-red-600 bg-red-50'
                }`}
              >
                {assessment.opensReviewComposer
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                <span>{assessment.message}</span>
              </div>
            )}

            {/* The only honest verification: let them see the real destination. */}
            {assessment.normalized && assessment.kind !== 'invalid' && (
              <a
                href={assessment.normalized}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center space-x-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Preview what guests see</span>
              </a>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-lg">✓ Google Place URL saved!</div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSaveGoogleUrl}
                disabled={saving}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'Save & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Import Guests */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <FileUp className="h-8 w-8 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Import Your First Guests</h3>
              <p className="text-sm text-slate-500 mt-1">
                Upload a CSV checkout report or add guests manually to start sending review invites.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => navigate('/import')}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Go to Sync Guests
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Final */}
        {step === 4 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">You're All Set!</h3>
              <p className="text-sm text-slate-500 mt-1">
                Your property is ready to start collecting guest feedback and reviews.
              </p>
            </div>
            <button
              onClick={handleCompleteOnboarding}
              disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'Finish Setup'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}