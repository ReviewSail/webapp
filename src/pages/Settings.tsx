import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import {
  MapPin,
  Plus,
  Trash2,
  Globe,
  MessageSquare,
  Clock,
  Bell,
  BellOff,
  UserPlus,
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Zap,
  MessageCircle,
  Key,
  EyeOff,
  Eye,
  LogOut,
  Settings2,
  Info,
  Hotel,
  BarChart3,
  Send,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { isStaff } from '../lib/roles';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const {
    locations,
    orders,
    customers,
    reviewRequests,
    feedbacks,
    activeLocationId,
    setActiveLocationId,
    addLocation,
    deleteLocation,
    updateLocationSettings,
    subscribe,
    subscriptionStatus,
    digestSetting,
    updateDigestSetting,
  } = useReviewSail();
  const [searchParams, setSearchParams] = useSearchParams();
  const [upgrading, setUpgrading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeTab = searchParams.get('tab') || 'locations';
  const isPremium = subscriptionStatus === 'active';
  const activeLoc = locations.find(l => l.id === activeLocationId) || null;

  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationUrl, setNewLocationUrl] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  const [templateText, setTemplateText] = useState(activeLoc?.templateText || '');
  const [smsTemplateText, setSmsTemplateText] = useState(activeLoc?.smsTemplateText || '');
  const [googleUrl, setGoogleUrl] = useState(activeLoc?.googlePlaceUrl || '');
  const [sendHour, setSendHour] = useState(activeLoc?.preferredSendHour ?? 10);
  const [enableEmail, setEnableEmail] = useState(activeLoc?.enableEmail ?? true);
  const [enableSms, setEnableSms] = useState(activeLoc?.enableSms ?? true);
  const [midstayEnabled, setMidstayEnabled] = useState(activeLoc?.midstayEnabled ?? true);
  const [recoveryEmail, setRecoveryEmail] = useState(activeLoc?.recoveryEmail ?? '');

  const [digestEnabled, setDigestEnabled] = useState(digestSetting?.enabled ?? true);
  const [digestFrequency, setDigestFrequency] = useState<'weekly' | 'monthly'>(digestSetting?.frequency ?? 'weekly');

  // Delete account states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (activeLoc) {
      setTemplateText(activeLoc.templateText || '');
      setSmsTemplateText(activeLoc.smsTemplateText || '');
      setGoogleUrl(activeLoc.googlePlaceUrl || '');
      setSendHour(activeLoc.preferredSendHour ?? 10);
      setEnableEmail(activeLoc.enableEmail ?? true);
      setEnableSms(activeLoc.enableSms ?? true);
      setMidstayEnabled(activeLoc.midstayEnabled ?? true);
      setRecoveryEmail(activeLoc.recoveryEmail ?? '');
    }
  }, [activeLoc]);

  useEffect(() => {
    setDigestEnabled(digestSetting?.enabled ?? true);
    setDigestFrequency(digestSetting?.frequency ?? 'weekly');
  }, [digestSetting]);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;
    setAddingLocation(true);
    const newLoc = await addLocation(newLocationName.trim(), newLocationUrl.trim() || undefined);
    if (newLoc) {
      setNewLocationName('');
      setNewLocationUrl('');
      setActiveLocationId(newLoc.id);
    }
    setAddingLocation(false);
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await deleteLocation(id);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveTemplate = async () => {
    if (!activeLocationId) return;
    try {
      await updateLocationSettings(activeLocationId, { templateText, smsTemplateText });
      setFeedback({ type: 'success', message: 'Templates updated successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update templates.' });
    }
  };

  const handleSaveGeneral = async () => {
    if (!activeLocationId) return;
    try {
      await updateLocationSettings(activeLocationId, {
        googlePlaceUrl: googleUrl,
        preferredSendHour: sendHour,
        enableEmail,
        enableSms,
        midstayEnabled,
        recoveryEmail,
      });
      setFeedback({ type: 'success', message: 'Location settings updated.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update settings.' });
    }
  };

  const handleDigestChange = async (enabled: boolean, freq?: 'weekly' | 'monthly') => {
    const f = freq || digestFrequency;
    setDigestEnabled(enabled);
    setDigestFrequency(f);
    try {
      await updateDigestSetting(f, enabled);
    } catch (err) {
      console.error('Failed to update digest setting', err);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    const result = await subscribe();
    if (result.success && result.url) {
      window.location.href = result.url;
    }
    setUpgrading(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete account' });
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  const tabs = [
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'templates', label: 'Templates', icon: MessageSquare },
    { key: 'digest', label: 'Digest', icon: BarChart3 },
    { key: 'billing', label: 'Billing', icon: Zap },
    { key: 'account', label: 'Account', icon: Shield },
  ];

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage locations, templates, and account settings.</p>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl border flex items-start space-x-2.5 shadow-sm text-sm ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
     </div>

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
          {/* Add new location */}
          <form onSubmit={handleAddLocation} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <MapPin className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add New Location</h2>
                <p className="text-xs text-slate-500">Create a new property under your account.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Location Name</label>
                <input
                  type="text"
                  required
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Oceanview Villa"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Google Place URL (optional)</label>
                <input
                  type="text"
                  value={newLocationUrl}
                  onChange={(e) => setNewLocationUrl(e.target.value)}
                  placeholder="https://g.page/..."
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingLocation || !newLocationName.trim()}
              className="flex items-center space-x-2 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {addingLocation ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{addingLocation ? 'Creating...' : 'Add Location'}</span>
            </button>
          </form>

          {/* Location list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-900">Your Locations</h2>
            </div>
            {locations.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400">
                <MapPin className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No locations created yet</p>
                <p className="text-xs text-slate-400 mt-1">Add your first property above.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {locations.map((loc) => (
                  <div key={loc.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <Hotel className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{loc.name}</p>
                        <p className="text-xs text-slate-400">{loc.googlePlaceUrl || 'No Google URL set'}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {loc.id === activeLocationId && (
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-200">
                          Active
                        </span>
                      )}
                      {loc.id !== activeLocationId && (
                        <button
                          onClick={() => setActiveLocationId(loc.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          Switch
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteLocation(loc.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete location"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {!activeLocationId ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700">Select a location first</h3>
              <p className="text-xs text-slate-400 mt-1">Choose a location from the Locations tab to manage its templates.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <MessageSquare className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Message Templates</h2>
                  <p className="text-xs text-slate-500">Customize the invitation message for email and SMS.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Template</label>
                  <textarea
                    rows={4}
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{reviewLink}'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">SMS Template</label>
                  <textarea
                    rows={3}
                    value={smsTemplateText}
                    onChange={(e) => setSmsTemplateText(e.target.value)}
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{reviewLink}'}
                  </p>
                </div>
                <button
                  onClick={handleSaveTemplate}
                  className="bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Save Templates</span>
                </button>
              </div>

              {/* General Location Settings */}
              <div className="border-t border-slate-100 pt-6 space-y-5">
                <h3 className="text-sm font-bold text-slate-800">General Settings</h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Google Place URL</label>
                  <input
                    type="text"
                    value={googleUrl}
                    onChange={(e) => setGoogleUrl(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Send Hour (UTC) – {sendHour}:00</label>
                  <input
                    type="range"
                    min={0}
                    max={23}
                    value={sendHour}
                    onChange={(e) => setSendHour(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>0:00</span>
                    <span>12:00</span>
                    <span>23:00</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2">
                      {enableEmail ? <Send className="h-4 w-4 text-indigo-500" /> : <BellOff className="h-4 w-4 text-slate-400" />}
                      <span className="text-sm font-semibold text-slate-700">Email</span>
                    </div>
                    <button
                      onClick={() => setEnableEmail(!enableEmail)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        enableEmail ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        enableEmail ? 'translate-x-4' : ''
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2">
                      {enableSms ? <MessageCircle className="h-4 w-4 text-indigo-500" /> : <BellOff className="h-4 w-4 text-slate-400" />}
                      <span className="text-sm font-semibold text-slate-700">SMS</span>
                    </div>
                    <button
                      onClick={() => setEnableSms(!enableSms)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        enableSms ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        enableSms ? 'translate-x-4' : ''
                      }`} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recovery Email (for unhappy guests)</label>
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="manager@myhotel.com"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Shown to unhappy guests as a direct contact option.</p>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-sm font-semibold text-slate-700">Mid-stay Check-in</span>
                    <p className="text-xs text-slate-400 mt-0.5">Send a check-in message 24 hours after arrival</p>
                  </div>
                  <button
                    onClick={() => setMidstayEnabled(!midstayEnabled)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      midstayEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                      midstayEnabled ? 'translate-x-4' : ''
                    }`} />
                  </button>
                </div>

                <button
                  onClick={handleSaveGeneral}
                  className="bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Digest Tab */}
      {activeTab === 'digest' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Digest Settings</h2>
              <p className="text-xs text-slate-500">Receive regular email summaries of your review performance.</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <span className="text-sm font-semibold text-slate-700">Digest Enabled</span>
              <p className="text-xs text-slate-400 mt-0.5">
                {digestEnabled ? 'You will receive digest emails.' : 'Digest emails are disabled.'}
              </p>
            </div>
            <button
              onClick={() => handleDigestChange(!digestEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                digestEnabled ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                digestEnabled ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>

          {digestEnabled && (
            <div className="flex space-x-2">
              {(['weekly', 'monthly'] as const).map((freq) => (
                <button
                  key={freq}
                  onClick={() => handleDigestChange(true, freq)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-colors ${
                    digestFrequency === freq
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {freq === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {isPremium ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Premium Pro Active</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Your account has full access to all review automation features.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 text-indigo-600">
                <Sparkles className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Upgrade to Premium Pro</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Unlock unlimited review automation, email/SMS invites, and full reporting.
                </p>
              </div>
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="inline-flex items-center space-x-2 bg-indigo-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {upgrading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                <span>{upgrading ? 'Connecting...' : 'Upgrade Now — $49/mo'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Account Tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <LogOut className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sign Out</h2>
                <p className="text-xs text-slate-500">Sign out of your current session.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/login', { replace: true });
              }}
              className="bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-colors flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>

          {!isStaff(role) && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-50 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
                  <p className="text-xs text-slate-500">Permanently delete your account and all data.</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="bg-red-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Account</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center space-x-3 bg-red-50">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Account</h3>
                <p className="text-xs text-red-600">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                All your locations, guests, review requests, and feedback data will be permanently deleted.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type <span className="text-red-600 font-extrabold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm py-2.5 px-3 border bg-white"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  className="flex-1 bg-red-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {deletingAccount ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span>{deletingAccount ? 'Deleting...' : 'Delete Account'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}