import { useState } from 'react';
import { Sparkles, ChevronRight, Building2, MapPin, CheckCircle, RefreshCw, AlertCircle, FileUp, ShieldCheck } from 'lucide-react';
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
              <span className="text-xs font-semibold">Import Guests</span>
            </div>
            <div className="flex-1 h-0.5 bg-indigo-500/35" />
            <div className="flex items-center space-x-2">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black ${step >= 3 ? 'bg-white text-indigo-700' : 'bg-indigo-700 text-indigo-300'}`}>3</span>
              <span className="text-xs font-semibold">All Done!</span>
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
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white font-bold text-sm py-3 px-6 rounded-2xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Next: Queue Invites</span>
                      <ChevronRight className="h-4.5 w-4.5" />
                    </>
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
                  <span>Import Guests Now</span>
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
                <h3 className="text-lg font-extrabold text-emerald-800">You're all set!</h3>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  MapRated will automatically send review requests every hour.
                </p>
                <p className="text-xs text-slate-400">
                  We have fully set up your hourly cron jobs and direct integration portals. Sit back and watch your property's review scores skyrocket!
                </p>
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