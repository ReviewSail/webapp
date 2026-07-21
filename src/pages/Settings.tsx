import { useState, useEffect } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Settings as SettingsIcon, Mail, Phone, ToggleLeft, ToggleRight, Save, Plus, Home, MapPin, CheckCircle, AlertCircle } from 'lucide-react';

export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings, addLocation } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [uiError, setUiError] = useState('');
  const [uiSuccess, setUiSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    googlePlaceUrl: '',
    templateText: '',
    timezone: 'UTC',
    enableEmail: true,
    enableSms: true,
  });

  useEffect(() => {
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc) {
      setFormData({
        googlePlaceUrl: loc.googlePlaceUrl || '',
        templateText: loc.templateText || '',
        timezone: loc.timezone || 'UTC',
        enableEmail: loc.enableEmail,
        enableSms: loc.enableSms,
      });
    } else {
      setFormData({
        googlePlaceUrl: '',
        templateText: '',
        timezone: 'UTC',
        enableEmail: true,
        enableSms: true,
      });
    }
  }, [activeLocationId, locations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLocationId) {
      setUiError('Please select or create a location first.');
      return;
    }

    setUiError('');
    setUiSuccess('');

    // URL validation
    if (formData.googlePlaceUrl && !formData.googlePlaceUrl.startsWith('http://') && !formData.googlePlaceUrl.startsWith('https://')) {
      setUiError('Google Review Link must start with http:// or https://');
      return;
    }

    setLoading(true);
    try {
      await updateLocationSettings(activeLocationId, formData);
      setUiSuccess('Location settings saved successfully!');
      setTimeout(() => setUiSuccess(''), 4000);
    } catch (error: any) {
      console.error(error);
      setUiError(error.message || 'Failed to save location settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) {
      setUiError('Please enter a valid location name.');
      return;
    }

    setUiError('');
    setUiSuccess('');
    setAdding(true);

    try {
      const added = await addLocation(newLocationName.trim());
      if (added) {
        setUiSuccess(`Location "${added.name}" added successfully!`);
        setNewLocationName('');
        setTimeout(() => setUiSuccess(''), 4000);
      } else {
        setUiError('Could not add location. Check your credentials and try again.');
      }
    } catch (err: any) {
      setUiError(err.message || 'An error occurred while creating your location.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center">
          <SettingsIcon className="mr-2 h-6 w-6 text-slate-700" />
          Settings
        </h1>
        <p className="text-sm text-slate-500">Configure your property specifics and communication channels.</p>
      </div>

      {uiError && (
        <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 flex items-start space-x-2.5 shadow-sm text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <span>{uiError}</span>
        </div>
      )}

      {uiSuccess && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-200 flex items-start space-x-2.5 shadow-sm text-sm animate-fade-in">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>{uiSuccess}</span>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column: Location Settings */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
          {locations.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                <Home className="h-10 w-10" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-800">No properties registered</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  To start tracking reviews and importing guests, add your first physical property location using the form on the right.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-4 mb-6">
                <MapPin className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Location Settings</h2>
              </div>

              <div className="space-y-6">
                {/* Delivery Channel Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Email Requests</h4>
                        <p className="text-xs text-slate-500">Send invites via Resend</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, enableEmail: !prev.enableEmail }))}
                      className="text-slate-600 hover:text-slate-900 transition-colors"
                      disabled={!activeLocationId}
                    >
                      {formData.enableEmail ? (
                        <ToggleRight className="h-10 w-10 text-indigo-600" />
                      ) : (
                        <ToggleLeft className="h-10 w-10 text-slate-300" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">SMS Requests</h4>
                        <p className="text-xs text-slate-500">Send texts via Twilio</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, enableSms: !prev.enableSms }))}
                      className="text-slate-600 hover:text-slate-900 transition-colors"
                      disabled={!activeLocationId}
                    >
                      {formData.enableSms ? (
                        <ToggleRight className="h-10 w-10 text-indigo-600" />
                      ) : (
                        <ToggleLeft className="h-10 w-10 text-slate-300" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Google Maps Review URL</label>
                  <input 
                    type="url" 
                    value={formData.googlePlaceUrl}
                    onChange={e => setFormData(prev => ({ ...prev, googlePlaceUrl: e.target.value }))}
                    className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300 bg-white" 
                    placeholder="https://g.page/r/..."
                    disabled={!activeLocationId}
                  />
                  <p className="mt-1 text-xs text-slate-400">The direct link customers use to write a review on Google.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Message Template</label>
                  <textarea 
                    rows={4}
                    value={formData.templateText}
                    onChange={e => setFormData(prev => ({ ...prev, templateText: e.target.value }))}
                    className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300 bg-white" 
                    placeholder="Hi {firstName}, thanks for staying with us..."
                    disabled={!activeLocationId}
                  />
                  <p className="mt-1 text-xs text-slate-400 font-medium">Available tags: <code className="text-indigo-600">{`{firstName}, {lastName}, {reviewLink}`}</code></p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Property Timezone</label>
                  <select 
                    value={formData.timezone}
                    onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300 bg-white"
                    disabled={!activeLocationId}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
                <button 
                  type="submit"
                  disabled={loading || !activeLocationId}
                  className="bg-indigo-600 text-white text-sm font-semibold px-4.5 py-2.5 rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center space-x-2 shadow-sm"
                >
                  <Save className="h-4.5 w-4.5" />
                  <span>{loading ? 'Saving Changes...' : 'Save Settings'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Add Location */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 h-fit">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-4 mb-4">
            <Plus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Add Property</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Register an additional hotel, vacation home, or retail office to your account.</p>
          
          <form onSubmit={handleAddLocation} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Property/Location Name</label>
              <input 
                type="text"
                required
                value={newLocationName}
                onChange={e => setNewLocationName(e.target.value)}
                placeholder="e.g., Beachfront Resort"
                className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300 bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="w-full flex items-center justify-center space-x-2 bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <Plus className="h-4.5 w-4.5" />
              <span>{adding ? 'Creating Location...' : 'Create Property'}</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}