import { useState, useEffect } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { Settings as SettingsIcon, Mail, Phone, ToggleLeft, ToggleRight, Save, Plus, Home, MapPin, CheckCircle, AlertCircle, Eye, Trash2, X, RefreshCw } from 'lucide-react';

export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings, addLocation, deleteLocation } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [uiError, setUiError] = useState('');
  const [uiSuccess, setUiSuccess] = useState('');
  
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    googlePlaceUrl: '',
    templateText: '',
    smsTemplateText: '',
    timezone: 'UTC',
    enableEmail: true,
    enableSms: true,
  });

  useEffect(() => {
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc) {
      setFormData({
        googlePlaceUrl: loc.googlePlaceUrl || '',
        templateText: loc.templateText || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}',
        smsTemplateText: loc.smsTemplateText || 'Hi {firstName}, please share your experience at {reviewLink}',
        timezone: loc.timezone || 'UTC',
        enableEmail: loc.enableEmail,
        enableSms: loc.enableSms,
      });
    } else {
      setFormData({
        googlePlaceUrl: '',
        templateText: 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}',
        smsTemplateText: 'Hi {firstName}, please share your experience at {reviewLink}',
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
      setUiSuccess('Location settings and custom templates saved successfully!');
      setTimeout(() => setUiSuccess(''), 4000);
    } catch (error: any) {
      console.error(error);
      setUiError(error.message || 'Failed to save settings. Please try again.');
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

  const handleDeleteLocation = async () => {
    if (!activeLocationId) return;
    setUiError('');
    setUiSuccess('');
    setDeleting(true);
    try {
      await deleteLocation(activeLocationId);
      setUiSuccess('Property deleted successfully!');
      setIsDeleteModalOpen(false);
      setTimeout(() => setUiSuccess(''), 4000);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete property. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleInsertToken = (token: string) => {
    if (activeTab === 'email') {
      setFormData(prev => ({ ...prev, templateText: prev.templateText + ` ${token}` }));
    } else {
      setFormData(prev => ({ ...prev, smsTemplateText: prev.smsTemplateText + ` ${token}` }));
    }
  };

  const renderPreview = (text: string) => {
    const mockLink = formData.googlePlaceUrl || 'https://g.page/r/mock-review-url';
    let baseText = text
      .replace(/{firstName}/g, 'Alex')
      .replace(/{lastName}/g, 'Davis')
      .replace(/{reviewLink}/g, mockLink);

    // Append compliant dual CTA mock content
    baseText += `\n\nAlternatively, you can share private feedback with us directly here: https://maprated.com/feedback?request_id=mock-request-id`;
    baseText += `\n\nTo unsubscribe from future requests, please click here: https://maprated.com/unsubscribe?email=alex@example.com`;
    return baseText;
  };

  const activeLoc = locations.find(l => l.id === activeLocationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center">
          <SettingsIcon className="mr-2 h-6 w-6 text-slate-700" />
          Settings
        </h1>
        <p className="text-sm text-slate-500">Configure your property specifics, notification variables, and templates.</p>
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
        <div className="lg:col-span-2 space-y-6">
          {locations.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center flex flex-col items-center justify-center space-y-4">
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
            <div className="space-y-6">
              <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-4">
                  <MapPin className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-slate-800">Location & Channel Settings</h2>
                </div>

                {/* Delivery Channel Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3.5 bg-slate-50/50 rounded-xl border border-slate-200">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Email Despatches</h4>
                        <p className="text-xs text-slate-500">Enable automated Resend emails</p>
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

                  <div className="flex items-center justify-between p-3.5 bg-slate-50/50 rounded-xl border border-slate-200">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">SMS Invites</h4>
                        <p className="text-xs text-slate-500">Enable automated Twilio texts</p>
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

                {/* URL & Timezone details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Google Review Link</label>
                    <input 
                      type="url" 
                      value={formData.googlePlaceUrl}
                      onChange={e => setFormData(prev => ({ ...prev, googlePlaceUrl: e.target.value }))}
                      className="w-full text-sm rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border bg-white" 
                      placeholder="https://g.page/r/..."
                      disabled={!activeLocationId}
                    />
                    <p className="mt-1 text-xs text-slate-400">Direct write link for Google Maps.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Property Timezone</label>
                    <select 
                      value={formData.timezone}
                      onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full text-sm rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 border bg-white"
                      disabled={!activeLocationId}
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-400">Timezone used for reminders scheduling.</p>
                  </div>
                </div>

                {/* Rich template editor with side-by-side previews */}
                <div className="border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-md font-semibold text-slate-800">Message Templates</h3>
                      <p className="text-xs text-slate-500">Draft rich communication content templates.</p>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setActiveTab('email')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                          activeTab === 'email' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        Email Channel
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('sms')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                          activeTab === 'sms' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        SMS Channel
                      </button>
                    </div>
                  </div>

                  {/* Variable inserter pills */}
                  <div className="bg-slate-50/50 p-3 rounded-lg mb-3 flex items-center flex-wrap gap-2 border border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Insert Tag:</span>
                    <button
                      type="button"
                      onClick={() => handleInsertToken('{firstName}')}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 font-semibold px-2.5 py-1 rounded-md border border-indigo-100 transition-colors"
                    >
                      {`{firstName}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertToken('{lastName}')}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 font-semibold px-2.5 py-1 rounded-md border border-indigo-100 transition-colors"
                    >
                      {`{lastName}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertToken('{reviewLink}')}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 font-semibold px-2.5 py-1 rounded-md border border-indigo-100 transition-colors"
                    >
                      {`{reviewLink}`}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Editor Box */}
                    <div>
                      {activeTab === 'email' ? (
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email Body Template</label>
                          <textarea
                            rows={6}
                            value={formData.templateText}
                            onChange={e => setFormData(prev => ({ ...prev, templateText: e.target.value }))}
                            className="w-full text-sm font-medium rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 px-3 border bg-white"
                            placeholder="Write custom email text..."
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">SMS Body Template</label>
                          <textarea
                            rows={6}
                            value={formData.smsTemplateText}
                            onChange={e => setFormData(prev => ({ ...prev, smsTemplateText: e.target.value }))}
                            className="w-full text-sm font-medium rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 px-3 border bg-white"
                            placeholder="Write custom SMS copy..."
                          />
                        </div>
                      )}
                    </div>

                    {/* Mock Handset / Email client Preview card */}
                    <div className="bg-slate-50 rounded-xl p-4.5 border border-slate-200/80 shadow-inner flex flex-col h-full min-h-[180px]">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mb-2.5">
                        <Eye className="h-4 w-4 text-slate-400" />
                        <span>Live Guest Preview</span>
                      </div>

                      {activeTab === 'email' ? (
                        <div className="bg-white p-4.5 rounded-lg border border-slate-200 flex-1 shadow-sm text-xs">
                          <div className="border-b border-slate-100 pb-2 mb-2">
                            <p className="text-slate-400">Subject: <span className="text-slate-800 font-semibold">Help us improve! Review your stay at property</span></p>
                          </div>
                          <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                            {renderPreview(formData.templateText)}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-indigo-950/95 text-white p-3 rounded-2xl flex-1 flex flex-col justify-end max-w-[280px] mx-auto shadow-md">
                          <div className="bg-indigo-900/60 p-2.5 rounded-xl text-[11px] leading-relaxed max-w-[90%] text-slate-100 self-start shadow-sm border border-indigo-800/40">
                            <p className="whitespace-pre-wrap">{renderPreview(formData.smsTemplateText)}</p>
                          </div>
                          <span className="text-[9px] text-indigo-400/80 self-start mt-1.5 ml-2">iMessage • Today</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex justify-end">
                  <button 
                    type="submit"
                    disabled={loading || !activeLocationId}
                    className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center space-x-2 shadow-sm shadow-indigo-100"
                  >
                    <Save className="h-4.5 w-4.5" />
                    <span>{loading ? 'Saving Layouts...' : 'Save Settings'}</span>
                  </button>
                </div>
              </form>

              {/* Danger Zone: Delete Location */}
              <div className="bg-white rounded-xl border border-red-200 p-6 space-y-4">
                <div className="flex items-center space-x-2 text-red-700 border-b border-red-100 pb-3">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Danger Zone</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Deleting the property <strong className="text-slate-800">"{activeLoc?.name}"</strong> is irreversible. This will purge all associated customer logs, order records, and review feedback requests from the database forever.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100/80 text-sm font-semibold py-2 px-4.5 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete This Property</span>
                  </button>
                </div>
              </div>
            </div>
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
                className="w-full text-sm rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 px-3 border bg-white"
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

      {/* Interactive Delete Confirmation Dialog Overlay */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 p-6 space-y-4 relative">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">Are you absolutely sure?</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              You are about to delete <strong className="text-slate-800">"{activeLoc?.name}"</strong>. This action cannot be undone. All invitations, historical click rates, and guest logs related to this location will be immediately deleted.
            </p>

            <div className="flex items-center space-x-3 pt-3 justify-end">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2 px-4.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLocation}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2 px-4.5 rounded-lg transition-all flex items-center space-x-1.5 shadow-sm shadow-red-100 disabled:opacity-50"
              >
                {deleting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Yes, Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}