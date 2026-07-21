import { useState } from 'react';
import { Sparkles, ChevronRight, Building2, MapPin, UserPlus, RefreshCw, AlertCircle } from 'lucide-react';

interface OnboardingWizardProps {
  addLocation: (name: string) => Promise<any>;
  updateLocationSettings: (id: string, settings: any) => Promise<any>;
  addCustomer: (customer: any) => Promise<any>;
  addOrder: (order: any) => Promise<any>;
  addReviewRequest: (orderId: string) => Promise<any>;
  refreshData: () => Promise<any>;
}

export function OnboardingWizard({
  addLocation,
  updateLocationSettings,
  addCustomer,
  addOrder,
  addReviewRequest,
  refreshData
}: OnboardingWizardProps) {
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [stepLoading, setStepLoading] = useState(false);
  const [wizardProperty, setWizardProperty] = useState('');
  const [wizardUrl, setWizardUrl] = useState('');
  const [wizardGuest, setWizardGuest] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [wizardCreatedLocId, setWizardCreatedLocId] = useState('');
  const [wizardError, setWizardError] = useState('');

  const handleWizardStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardProperty.trim()) {
      setWizardError('Please enter a property name.');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      const loc = await addLocation(wizardProperty.trim());
      if (loc) {
        setWizardCreatedLocId(loc.id);
        setOnboardingStep(2);
      } else {
        setWizardError('Failed to register property location. Please try again.');
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error occurred during registration.');
    } finally {
      setStepLoading(false);
    }
  };

  const handleWizardStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardUrl.trim() || (!wizardUrl.startsWith('http://') && !wizardUrl.startsWith('https://'))) {
      setWizardError('Google Review Link must start with http:// or https://');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      await updateLocationSettings(wizardCreatedLocId, { googlePlaceUrl: wizardUrl.trim() });
      setOnboardingStep(3);
    } catch (err: any) {
      setWizardError(err.message || 'Failed to save review link.');
    } finally {
      setStepLoading(false);
    }
  };

  const handleWizardStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardGuest.firstName.trim() || !wizardGuest.lastName.trim()) {
      setWizardError('First and last name are required.');
      return;
    }
    if (!wizardGuest.email.trim() && !wizardGuest.phone.trim()) {
      setWizardError('Please enter either email or phone to invite.');
      return;
    }
    setWizardError('');
    setStepLoading(true);
    try {
      const customer = await addCustomer({
        firstName: wizardGuest.firstName.trim(),
        lastName: wizardGuest.lastName.trim(),
        email: wizardGuest.email.trim() || null,
        phone: wizardGuest.phone.trim() || null
      });

      if (customer) {
        const order = await addOrder({
          customerId: customer.id,
          locationId: wizardCreatedLocId,
          checkoutDate: new Date().toISOString(),
          status: 'completed'
        });

        if (order) {
          await addReviewRequest(order.id);
          await refreshData();
        } else {
          setWizardError('Created customer but failed to queue order.');
        }
      } else {
        setWizardError('Failed to create customer record.');
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error importing guest.');
    } finally {
      setStepLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-8 bg-white border border-slate-200/80 shadow-md rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white">
        <div className="flex items-center space-x-2.5">
          <Sparkles className="h-6 w-6 text-indigo-200" />
          <h2 className="text-lg font-bold">Welcome to MapRated!</h2>
        </div>
        <p className="text-xs text-indigo-100 mt-1">Let's set up your property review automation in under 2 minutes.</p>
        
        {/* Visual Stepper Indicators */}
        <div className="flex items-center space-x-2 mt-6">
          <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 1 ? 'text-white' : 'text-indigo-300'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 1 ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-indigo-100'}`}>1</span>
            <span>Property Name</span>
          </div>
          <ChevronRight className="h-3 w-3 text-indigo-400" />
          <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 2 ? 'text-white' : 'text-indigo-300'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 2 ? 'bg-white text-indigo-700' : onboardingStep > 2 ? 'bg-indigo-500 text-indigo-100' : 'bg-indigo-700 text-indigo-300'}`}>2</span>
            <span>Review Link</span>
          </div>
          <ChevronRight className="h-3 w-3 text-indigo-400" />
          <div className={`flex items-center space-x-1.5 text-xs font-semibold ${onboardingStep >= 3 ? 'text-white' : 'text-indigo-300'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${onboardingStep === 3 ? 'bg-white text-indigo-700' : 'bg-indigo-700 text-indigo-300'}`}>3</span>
            <span>Add Guest</span>
          </div>
        </div>
      </div>

      <div className="p-6">
        {wizardError && (
          <div className="bg-red-50 text-red-800 p-3.5 rounded-xl border border-red-200 flex items-start space-x-2.5 mb-5 text-xs">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{wizardError}</span>
          </div>
        )}

        {/* STEP 1: Name Your Property */}
        {onboardingStep === 1 && (
          <form onSubmit={handleWizardStep1} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">What is the name of your property?</label>
              <p className="text-xs text-slate-500">This helps guests instantly recognize you (e.g., Beachside Resort, Grand Central Inn).</p>
              <div className="relative mt-2">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={wizardProperty}
                  onChange={e => setWizardProperty(e.target.value)}
                  placeholder="e.g., Beachfront Resort"
                  className="w-full text-sm rounded-lg border-slate-300 pl-10 pr-4 py-2.5 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={stepLoading}
              className="w-full flex items-center justify-center space-x-1 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm"
            >
              {stepLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Next: Add Review Link</span>
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: Add Google Review Link */}
        {onboardingStep === 2 && (
          <form onSubmit={handleWizardStep2} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Add Your Google Review Link</label>
              <p className="text-xs text-slate-500">The direct URL where guests submit their reviews. Ensure it starts with http or https.</p>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="url"
                  required
                  value={wizardUrl}
                  onChange={e => setWizardUrl(e.target.value)}
                  placeholder="https://g.page/r/your-review-url"
                  className="w-full text-sm rounded-lg border-slate-300 pl-10 pr-4 py-2.5 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={stepLoading}
              className="w-full flex items-center justify-center space-x-1 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm"
            >
              {stepLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Next: Add First Guest</span>
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 3: Import Your First Guest */}
        {onboardingStep === 3 && (
          <form onSubmit={handleWizardStep3} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Queue Your First Guest Invitation</label>
              <p className="text-xs text-slate-500">Test the process with your own contact info to see how beautiful the invites look.</p>
              
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={wizardGuest.firstName}
                    onChange={e => setWizardGuest(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Jane"
                    className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={wizardGuest.lastName}
                    onChange={e => setWizardGuest(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                    className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Email Address</label>
                <input
                  type="email"
                  value={wizardGuest.email}
                  onChange={e => setWizardGuest(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  value={wizardGuest.phone}
                  onChange={e => setWizardGuest(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+15551234567"
                  className="w-full text-sm rounded-lg border-slate-300 px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={stepLoading}
              className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-emerald-700 active:bg-emerald-800 transition-colors disabled:opacity-50 shadow-sm"
            >
              {stepLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>Complete Stepper & Enter Dashboard</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}