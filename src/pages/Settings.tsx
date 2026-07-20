import { useState, useEffect } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Settings as SettingsIcon, Mail, Phone, ToggleLeft, ToggleRight, Save } from 'lucide-react';

export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings } = useMapRated();
  const [loading, setLoading] = useState(false);
  
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
    if (!activeLocationId) return;

    setLoading(true);
    try {
      await updateLocationSettings(activeLocationId, formData);
      alert('Location settings saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save location settings.');
    } finally {
      setLoading(false);
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
      
      {/* Location Specific Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-4 mb-6">
            <SettingsIcon className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Location Configuration</h2>
          </div>
          
          {!activeLocationId && (
            <p className="text-amber-600 mb-4 bg-amber-50 p-3 rounded-md border border-amber-200">
              No location selected or available. Please add a location first.
            </p>
          )}

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
                    <p className="text-xs text-slate-500">Send invites using our shared Resend gateway</p>
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
                    <p className="text-xs text-slate-500">Send texts using our shared Twilio gateway</p>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Google Maps Review URL</label>
              <input 
                type="url" 
                value={formData.googlePlaceUrl}
                onChange={e => setFormData(prev => ({ ...prev, googlePlaceUrl: e.target.value }))}
                className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                placeholder="https://g.page/r/..."
                disabled={!activeLocationId}
              />
              <p className="mt-1 text-xs text-slate-400">The direct link to leave a review for this location.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
              <textarea 
                rows={4}
                value={formData.templateText}
                onChange={e => setFormData(prev => ({ ...prev, templateText: e.target.value }))}
                className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                placeholder="Hi {firstName}, thanks for staying with us..."
                disabled={!activeLocationId}
              />
              <p className="mt-1 text-xs text-slate-400">Available variables: {`{firstName}, {lastName}, {reviewLink}`}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <select 
                value={formData.timezone}
                onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300"
                disabled={!activeLocationId}
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
              </select>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end">
            <button 
              type="submit"
              disabled={loading || !activeLocationId}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{loading ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}