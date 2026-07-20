import { useState, useEffect } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Settings as SettingsIcon, Mail, Phone, Key, ShieldCheck } from 'lucide-react';

export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings, accountSettings, updateAccountSettings } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  
  const [formData, setFormData] = useState({
    googlePlaceUrl: '',
    templateText: '',
    timezone: 'UTC',
  });

  const [accountForm, setAccountForm] = useState({
    resendApiKey: '',
    resendFromEmail: '',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromNumber: '',
  });

  useEffect(() => {
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc) {
      setFormData({
        googlePlaceUrl: loc.googlePlaceUrl || '',
        templateText: loc.templateText || '',
        timezone: loc.timezone || 'UTC',
      });
    } else {
      setFormData({
        googlePlaceUrl: '',
        templateText: '',
        timezone: 'UTC',
      });
    }
  }, [activeLocationId, locations]);

  useEffect(() => {
    if (accountSettings) {
      setAccountForm({
        resendApiKey: accountSettings.resendApiKey || '',
        resendFromEmail: accountSettings.resendFromEmail || '',
        twilioAccountSid: accountSettings.twilioAccountSid || '',
        twilioAuthToken: accountSettings.twilioAuthToken || '',
        twilioFromNumber: accountSettings.twilioFromNumber || '',
      });
    }
  }, [accountSettings]);

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

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      await updateAccountSettings(accountForm);
      alert('API integrations saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save API integration settings.');
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center">
          <SettingsIcon className="mr-2 h-6 w-6 text-slate-700" />
          Settings
        </h1>
        <p className="text-sm text-slate-500">Configure your property specifics and API communication gateways.</p>
      </div>

      {/* Global Communication Credentials */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <form onSubmit={handleAccountSubmit} className="p-6">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-4 mb-6">
            <Key className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Integration Credentials</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Resend Segment */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700">Resend (Emails)</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Resend API Key</label>
                <input 
                  type="password" 
                  value={accountForm.resendApiKey}
                  onChange={e => setAccountForm(prev => ({ ...prev, resendApiKey: e.target.value }))}
                  className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                  placeholder="re_..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From Email Address</label>
                <input 
                  type="email" 
                  value={accountForm.resendFromEmail}
                  onChange={e => setAccountForm(prev => ({ ...prev, resendFromEmail: e.target.value }))}
                  className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                  placeholder="reviews@yourdomain.com"
                />
                <p className="mt-1 text-xs text-slate-400">Must be a verified domain in your Resend Dashboard.</p>
              </div>
            </div>

            {/* Twilio Segment */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700">Twilio (SMS)</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Twilio Account SID</label>
                <input 
                  type="text" 
                  value={accountForm.twilioAccountSid}
                  onChange={e => setAccountForm(prev => ({ ...prev, twilioAccountSid: e.target.value }))}
                  className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                  placeholder="AC..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Twilio Auth Token</label>
                  <input 
                    type="password" 
                    value={accountForm.twilioAuthToken}
                    onChange={e => setAccountForm(prev => ({ ...prev, twilioAuthToken: e.target.value }))}
                    className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                    placeholder="auth_token"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Twilio From Number</label>
                  <input 
                    type="text" 
                    value={accountForm.twilioFromNumber}
                    onChange={e => setAccountForm(prev => ({ ...prev, twilioFromNumber: e.target.value }))}
                    className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border border-slate-300" 
                    placeholder="+15550000000"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
            <button 
              type="submit"
              disabled={savingAccount}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {savingAccount ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>
        </form>
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
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}