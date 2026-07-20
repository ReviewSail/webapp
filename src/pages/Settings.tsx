import { useState, useEffect } from 'react';
import { useMapRated } from '../context/MapRatedContext';

export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings } = useMapRated();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    googlePlaceUrl: '',
    templateText: '',
    timezone: 'UTC',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLocationId) return;

    setLoading(true);
    try {
      await updateLocationSettings(activeLocationId, formData);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Location Configuration</h2>
          
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
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                placeholder="https://g.page/r/..."
                disabled={!activeLocationId}
              />
              <p className="mt-1 text-sm text-slate-500">The direct link to leave a review for this location.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
              <textarea 
                rows={4}
                value={formData.templateText}
                onChange={e => setFormData(prev => ({ ...prev, templateText: e.target.value }))}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                placeholder="Hi {firstName}, thanks for staying with us..."
                disabled={!activeLocationId}
              />
              <p className="mt-1 text-sm text-slate-500">Available variables: {`{firstName}, {lastName}, {reviewLink}`}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <select 
                value={formData.timezone}
                onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}