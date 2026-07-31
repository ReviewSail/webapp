import { useState, useEffect, useMemo } from 'react';
import { assessGoogleReviewUrl } from '../lib/googleReviewUrl';
import { TIMEZONES, browserTimezone, formatHourInZone } from '../lib/timezones';
import { analyzeSms, previewSms } from '../lib/smsSegments';
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
  CheckCircle2,
  ExternalLink,
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
import { TabNav } from '../components/ui/TabNav';
import { useToast } from '../components/ui/Toast';
import { BillingSettings } from '../components/settings/BillingSettings';
import { TeamSettings } from '../components/settings/TeamSettings';
import { EmptyState } from '../components/ui/EmptyState';

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
    digestSetting,
    updateDigestSetting,
    sendTestReviewRequest,
  } = useReviewSail();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const activeTab = searchParams.get('tab') || 'locations';
  const activeLoc = locations.find(l => l.id === activeLocationId) || null;

  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationUrl, setNewLocationUrl] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  const [templateText, setTemplateText] = useState(activeLoc?.templateText || '');
  const [smsTemplateText, setSmsTemplateText] = useState(activeLoc?.smsTemplateText || '');
  const [smsReminderText, setSmsReminderText] = useState(activeLoc?.smsReminderText || '');
  const [googleUrl, setGoogleUrl] = useState(activeLoc?.googlePlaceUrl || '');
  const [sendHour, setSendHour] = useState(activeLoc?.preferredSendHour ?? 10);
  const [timezone, setTimezone] = useState(activeLoc?.timezone || browserTimezone());
  const [enableEmail, setEnableEmail] = useState(activeLoc?.enableEmail ?? true);
  const [enableSms, setEnableSms] = useState(activeLoc?.enableSms ?? true);
  const [midstayEnabled, setMidstayEnabled] = useState(activeLoc?.midstayEnabled ?? true);
  const [midstayDay, setMidstayDay] = useState(activeLoc?.midstayDay ?? 2);
  const [recoveryEmail, setRecoveryEmail] = useState(activeLoc?.recoveryEmail ?? '');

  // Assessed live so the manager sees where guests will land before saving.
  const googleAssessment = useMemo(() => assessGoogleReviewUrl(googleUrl), [googleUrl]);

  const [digestEnabled, setDigestEnabled] = useState(digestSetting?.enabled ?? true);
  const [digestFrequency, setDigestFrequency] = useState<'weekly' | 'monthly'>(digestSetting?.frequency ?? 'weekly');

  // Delete account states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    if (activeLoc) {
      setTemplateText(activeLoc.templateText || '');
      setSmsTemplateText(activeLoc.smsTemplateText || '');
      setSmsReminderText(activeLoc.smsReminderText || '');
      setGoogleUrl(activeLoc.googlePlaceUrl || '');
      setSendHour(activeLoc.preferredSendHour ?? 10);
      setTimezone(activeLoc.timezone || browserTimezone());
      setEnableEmail(activeLoc.enableEmail ?? true);
      setEnableSms(activeLoc.enableSms ?? true);
      setMidstayEnabled(activeLoc.midstayEnabled ?? true);
      setMidstayDay(activeLoc.midstayDay ?? 2);
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
      await updateLocationSettings(activeLocationId, { templateText, smsTemplateText, smsReminderText });
      toast.success('Templates saved.');
    } catch (err: any) {
      toast.error(err.message || "Couldn't save the templates. Try again.");
    }
  };

  const handleSaveGeneral = async () => {
    if (!activeLocationId) return;
    try {
      await updateLocationSettings(activeLocationId, {
        // Normalized so a pasted Place ID is stored as a usable review link.
        googlePlaceUrl: googleAssessment.normalized,
        preferredSendHour: sendHour,
        timezone,
        enableEmail,
        enableSms,
        midstayEnabled,
        midstayDay,
        recoveryEmail,
      });
      toast.success('Location settings saved.');
    } catch (err: any) {
      toast.error(err.message || "Couldn't save the settings. Try again.");
    }
  };

  const handleTestSend = async () => {
    setTestSending(true);
    const result = await sendTestReviewRequest();
    setTestSending(false);
    if (result.success) {
      toast.success(
        `Test request sent to ${session?.user?.email}. If it doesn't arrive, check that RESEND_API_KEY is set and the sender domain is verified.`,
        { duration: 8000 }
      );
    } else {
      toast.error(result.error || "Couldn't send the test request.");
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Couldn't delete the account. Try again.");
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  const tabs = [
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'templates', label: 'Templates', icon: MessageSquare },
    { key: 'digest', label: 'Digest', icon: BarChart3 },
    { key: 'team', label: 'Team', icon: UserPlus },
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

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

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
              <EmptyState
                icon={MapPin}
                size="sm"
                bare
                className="px-6 py-8"
                title="No locations created yet"
                description="Add your first property above."
              />
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
            <EmptyState
              icon={MessageSquare}
              size="sm"
              title="Select a location first"
              description="Choose a location from the Locations tab to manage its templates."
            />
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
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{locationName}'}, {'{reviewLink}'}
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
                  <SmsMeter template={smsTemplateText} locationName={activeLoc?.name} />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{locationName}'}, {'{reviewLink}'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">SMS Reminder Template</label>
                  <textarea
                    rows={3}
                    value={smsReminderText}
                    onChange={(e) => setSmsReminderText(e.target.value)}
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y"
                  />
                  <SmsMeter template={smsReminderText} locationName={activeLoc?.name} />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sent 3 days later if the guest hasn't responded.
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Google Review Link</label>
                  <input
                    type="text"
                    value={googleUrl}
                    onChange={(e) => setGoogleUrl(e.target.value)}
                    placeholder="https://g.page/r/.../review"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                  />
                  {googleUrl.trim() && googleAssessment.message && (
                    <div
                      className={`mt-2 text-xs p-2.5 rounded-lg flex items-start space-x-1.5 ${
                        googleAssessment.opensReviewComposer
                          ? 'text-emerald-700 bg-emerald-50'
                          : googleAssessment.kind === 'listing-link'
                            ? 'text-amber-700 bg-amber-50'
                            : 'text-red-600 bg-red-50'
                      }`}
                    >
                      {googleAssessment.opensReviewComposer
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                      <span>{googleAssessment.message}</span>
                    </div>
                  )}
                  {googleAssessment.normalized && googleAssessment.kind !== 'invalid' && (
                    <a
                      href={googleAssessment.normalized}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center space-x-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Preview what guests see</span>
                    </a>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Property Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Review requests are sent at the local time of the property.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Preferred Send Hour – {formatHourInZone(sendHour)} local
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={23}
                    value={sendHour}
                    onChange={(e) => setSendHour(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>00:00</span>
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

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-slate-700">Mid-stay Check-in</span>
                      <p className="text-xs text-slate-400 mt-0.5">Catch problems while there is still time to fix them</p>
                    </div>
                    <button
                      onClick={() => setMidstayEnabled(!midstayEnabled)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                        midstayEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        midstayEnabled ? 'translate-x-4' : ''
                      }`} />
                    </button>
                  </div>

                  {/* The hour is deliberately not a second control — it reuses the
                      send hour set above, so there is only one number to choose. */}
                  {midstayEnabled && (
                    <div className="pt-3 border-t border-slate-200">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span>Send on</span>
                        <select
                          value={midstayDay}
                          onChange={(e) => setMidstayDay(Number(e.target.value))}
                          className="rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5 px-2 border bg-white font-semibold"
                        >
                          {[2, 3, 4, 5, 6, 7].map((day) => (
                            <option key={day} value={day}>Day {day}</option>
                          ))}
                        </select>
                        <span>of the stay, at {formatHourInZone(sendHour)} local</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {midstayDay === 2
                          ? 'Day 1 is the arrival day, so Day 2 is the morning after they arrive.'
                          : `Day 1 is the arrival day, so Day ${midstayDay} is ${midstayDay - 1} days after they arrive.`}
                        {' '}Skipped for guests who check out on or before that day.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSaveGeneral}
                    className="bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>Save Settings</span>
                  </button>

                  {/* Proves the whole loop — template, sender, links — in one click. */}
                  <button
                    onClick={handleTestSend}
                    disabled={testSending}
                    className="bg-white text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center space-x-2 disabled:opacity-50"
                  >
                    {testSending
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4 text-indigo-500" />}
                    <span>{testSending ? 'Sending…' : 'Send a test to myself'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 -mt-2">
                  Sends one real review request to {session?.user?.email} using this location's template, then
                  removes the test guest. Nothing appears in your guest list or stats.
                </p>
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

      {/* Team Tab */}
      {activeTab === 'team' && <TeamSettings />}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <BillingSettings />
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
/**
 * SMS is billed per segment, and a single non-GSM-7 character (emoji, curly
 * apostrophe, em-dash) more than halves the segment size. Neither is visible
 * while typing, so show both live — measured against rendered values, since
 * {reviewLink} is 12 characters here but ~60 in the real message.
 */
function SmsMeter({ template, locationName }: { template: string; locationName?: string }) {
  const rendered = previewSms(template, { locationName: locationName || 'Seaside Inn' });
  const { encoding, units, segments, remaining, offendingCharacter } = analyzeSms(rendered);

  if (!template.trim()) return null;

  const overOneSegment = segments > 1;
  const tone = offendingCharacter || overOneSegment ? 'text-amber-600' : 'text-slate-400';

  return (
    <div className={`text-[11px] mt-1 ${tone}`}>
      <span className="font-semibold">
        {units} characters &middot; {segments} SMS segment{segments === 1 ? '' : 's'}
      </span>
      {!overOneSegment && !offendingCharacter && (
        <span className="text-slate-400"> &middot; {remaining} left before a second segment</span>
      )}
      {offendingCharacter && (
        <span> &middot; &ldquo;{offendingCharacter}&rdquo; forces {encoding}, cutting each segment from 160 to 70 characters</span>
      )}
      {overOneSegment && !offendingCharacter && (
        <span> &middot; costs {segments}x per send</span>
      )}
    </div>
  );
}
