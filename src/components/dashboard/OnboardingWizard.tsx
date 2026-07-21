import { useState } from 'react';
import { Sparkles, ChevronRight, Building2, MapPin, CheckCircle, RefreshCw, AlertCircle, FileUp, ShieldCheck, HelpCircle, ChevronDown, ChevronUp, Map, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface OnboardingWizardProps {
  addLocation: (name: string, googleUrl?: string) => Promise<any>;
  completeOnboarding: (locationId: string) => Promise<any>;
  refreshData: () => Promise<any>;
}

export function OnboardingWizard({
  addLocation,
  completeOnboarding,
  refreshData
}: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [propertyName, setPropertyName] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLocId, setCreatedLocId] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!propertyName.trim()) {
      setError('Please provide a valid property or resort name.');
      return;
    }

    const cleanUrl = googleUrl.trim();
    if (!cleanUrl) {
      setError('Please provide your Google Review Link.');
      return;
    }

    const isValidGoogleLink = cleanUrl.includes('google.com/maps') || cleanUrl.includes('g.page');
    if (!isValidGoogleLink) {
      setError('Google Review URL must be valid and contain either "google.com/maps" or "g.page" to trigger direct reviews.');
      return;
    }

    setLoading(true);
    try {
      // REQUIREMENT 6: Immediately save the location name and Google URL to Supabase before proceeding
      const location = await addLocation(propertyName.trim(), cleanUrl);
      if (location && location.id) {
        setCreatedLocId(location.id);
        setStep(2);
      } else {
        setError('Failed to configure location parameters. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error occurred while saving location settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipToStep3 = async () => {
    setError('');
    setLoading(true);
    try {
      // Mark onboarding as complete on the backend
      await completeOnboarding(createdLocId);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToImport = async () => {
    setError('');
    setLoading(true);
    try {
      // Mark onboarding as complete first, then redirect to import page
      await completeOnboarding(createdLocId);
      await refreshData();
      navigate('/import');
    } catch (err: any) {
      setError(err?.message || 'Failed to navigate to import.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setError('');
    setLoading(true);
    try {
      await refreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col justify-center items-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 flex flex-col">
        
        {/* Colorful Gradient Bar */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-8 text-white relative">
          <div className="absolute top-6 right-6">
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full text-indigo-100">
              Step {step} of 3
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-2xl text-white">
              <Sparkles className="h-6 w-6 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Setup MapRated Review Engine</h2>
              <p className="text-xs text-indigo-100 mt-1">Configure automated hands-free guest review collections in seconds.</p>
            </div>
          </div>

          {/* Graphical Stepper */}
          <div className="flex items-center space-x-4 mt-8">
            <div className="flex items-center space-x-2">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black ${step >= 1 ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-indigo-100'}`}>1</span>
              <span className="text-xs font-semibold">Location Details</span>
            </div>
            <div className="flex-1 h-0.5 bg-indigo-500/35" />
            <div className="flex items-center space-x-2">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black ${step >= 2 ? 'bg-white text-indigo-700' : 'bg-indigo-700 text-indigo-300'}`}>2</span>
              {/* REQUIREMENT: Rename Step 2 label to "Sync Your Guests" */}
              <span className="text-xs font-semibold">Sync Your Guests</span>
            </div>
            <div className="flex-1 h-0.5 bg-indigo-500/35" />
            <div className="flex items-center space-x-2">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black ${step >= 3 ? 'bg-white text-indigo-700' : 'bg-indigo-700 text-indigo-300'}`}>3</span>
              <span className="text-xs font-semibold">You’re Live 🎉</span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 flex-1">
          {error && (
            <div className="bg-red-50 text-red-800 p-4 rounded-2xl border border-red-200 flex items-start space-x-3 mb-6 text-xs">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center space-x-2">
                    <Building2 className="h-4.5 w-4.5 text-indigo-500" />
                    <span>Property Name</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-2">How should guests recognize your business in review requests?</p>
                  <input
                    type="text"
                    required
                    value={propertyName}
                    onChange={e => setPropertyName(e.target.value)}
                    placeholder="e.g., Beachside Resort & Spa"
                    className="w-full text-sm rounded-xl border-slate-200 pl-4 pr-4 py-3 border bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center space-x-2">
                    <MapPin className="h-4.5 w-4.5 text-indigo-500" />
                    <span>Direct Google Review URL</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-2">The direct link for submitting Google Maps reviews. Must contain <strong className="text-slate-800">google.com/maps</strong> or <strong className="text-slate-800">g.page</strong>.</p>
                  <input
                    type="url"
                    required
                    value={googleUrl}
                    onChange={e => setGoogleUrl(e.target.value)}
                    placeholder="https://g.page/r/your-google-place-id/review"
                    className="w-full text-sm rounded-xl border-slate-200 pl-4 pr-4 py-3 border bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  />

                  {/* REQUIREMENT 4: Reassurance caption */}
                  <p className="mt-1 text-[11px] text-slate-400">
                    We’ll send guests a friendly review invitation after checkout — fully automated. You can customize the message anytime in Settings.
                  </p>

                  {/* REQUIREMENT 1: Collapsible 'How do I find this?' help section */}
                  <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setIsHelpOpen(!isHelpOpen)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left text-xs font-bold text-slate-700"
                    >
                      <span className="flex items-center space-x-2">
                        <Map className="h-4 w-4 text-emerald-600" />
                        <span>How do I find this?</span>
                      </span>
                      {isHelpOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {isHelpOpen && (
                      <div className="p-3 bg-white border-t border-slate-100 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                        <p className="font-semibold text-slate-700">Follow these 3 simple steps:</p>
                        <ol className="list-decimal list-inside space-y-1 pl-1">
                          <li>Open Google Maps and search for your business.</li>
                          <li>Click the <strong>Write a Review</strong> button on your listing.</li>
                          <li>Copy the full URL from your browser’s address bar and paste it here stay.</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                {/* REQUIREMENT 3: Change button text to 'Save & Continue →' */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white font-bold text-sm py-3 px-6 rounded-2xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Save & Continue →</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-6 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="mx-auto h-16 w-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                  <FileUp className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">Queue Your First Guest Review Requests</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  We've successfully registered your property. Next, upload a CSV list of guests or enter checkouts manually to kickstart direct review generations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto pt-4">
                <button
                  onClick={handleGoToImport}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 px-6 rounded-2xl flex items-center justify-center space-x-1.5 transition-all shadow-md"
                >
                  <FileUp className="h-4.5 w-4.5" />
                  <span>Sync Guests Now</span>
                </button>
                <button
                  onClick={handleSkipToStep3}
                  disabled={loading}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-3 px-6 rounded-2xl transition-all"
                >
                  <span>Skip for now</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="mx-auto h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-4">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-extrabold text-emerald-800">You're live and ready!</h3>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  MapRated will automatically send review requests every hour.
                </p>
                <p className="text-xs text-slate-400">
                  We have fully set up your hourly cron jobs and direct integration portals. Sit back and watch your property's review scores skyrocket!
                </p>

                {/* REQUIREMENT 5: Visual mockup preview card of invitation email */}
                <div className="text-left border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-inner space-y-2 mt-4 max-w-sm mx-auto">
                  <div className="flex items-center space-x-2 text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Mock Email Preview</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 text-[11px] leading-relaxed text-slate-600 shadow-sm">
                    <p className="font-semibold text-slate-800 mb-1 border-b border-slate-100 pb-1.5">
                      Subject: Review your stay at {propertyName || 'Your Property'}
                    </p>
                    <p className="mt-1.5">Hi Alex,</p>
                    <p className="mt-1">
                      Thanks for your visit! Please leave us a review on Google Maps to share your experience with other travelers:
                    </p>
                    <p className="mt-2 text-indigo-600 underline font-semibold break-all text-[10px]">
                      {googleUrl || 'https://g.page/r/placeholder-review-url'}
                    </p>
                    <p className="mt-3 border-t border-slate-100 pt-2 text-[9px] text-slate-400 leading-normal">
                      Alternatively, you can share private feedback with us directly. If you'd like to unsubscribe, click here.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 max-w-xs mx-auto">
                <button
                  onClick={handleFinishOnboarding}
                  disabled={loading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 px-6 rounded-2xl transition-all shadow-md"
                >
                  <span>Enter My Dashboard</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}