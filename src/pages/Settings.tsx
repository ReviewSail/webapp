export default function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Location Configuration</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Google Maps Review URL</label>
              <input 
                type="url" 
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                placeholder="https://g.page/r/..."
              />
              <p className="mt-1 text-sm text-slate-500">The direct link to leave a review for this location.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
              <textarea 
                rows={4}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                placeholder="Hi {firstName}, thanks for staying with us..."
              />
              <p className="mt-1 text-sm text-slate-500">Available variables: {`{firstName}, {lastName}, {reviewLink}`}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <select className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
              </select>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-200 flex justify-end">
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}