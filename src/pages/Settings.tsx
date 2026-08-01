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
  User as UserIcon,
  Settings2,
  Info,
  Hotel,
  BarChart3,
  Send,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { isStaff, isAdmin } from '../lib/roles';
import { TabNav } from '../components/ui/TabNav';
import { useToast } from '../components/ui/Toast';
import { BillingSettings } from '../components/settings/BillingSettings';
import { TeamSettings } from '../components/settings/TeamSettings';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
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
      toast.success('Location deleted.');
    } catch (err: any) {
      // Was console.error only, so a refused delete looked like nothing had
      // happened — the row simply stayed on screen with no explanation.
      toast.error(err.message || "Couldn't delete that location. Try again.");
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
    const previous = { enabled: digestEnabled, frequency: digestFrequency };
    setDigestEnabled(enabled);
    setDigestFrequency(f);
    try {
      await updateDigestSetting(f, enabled);
    } catch (err: any) {
      // This used to console.error only, so a failed write left the toggle
      // showing the new value and the database holding the old one.
      setDigestEnabled(previous.enabled);
      setDigestFrequency(previous.frequency);
      toast.error(err.message || "Couldn't save your digest preference. Try again.");
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
    // Merge rather than replace: passing a bare object dropped every other
    // query parameter, so switching tabs discarded things like ?access_denied.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted mt-1">Manage locations, templates, and account settings.</p>
      </div>

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
          {/* Add new location */}
          <form onSubmit={handleAddLocation} className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-brand-50 rounded-xl">
                <MapPin className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Add New Location</h2>
                <p className="text-xs text-ink-muted">Create a new property under your account.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Location Name</label>
                <input
                  type="text"
                  required
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Oceanview Villa"
                  className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Google Place URL (optional)</label>
                <input
                  type="text"
                  value={newLocationUrl}
                  onChange={(e) => setNewLocationUrl(e.target.value)}
                  placeholder="https://g.page/..."
                  className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingLocation || !newLocationName.trim()}
              className="flex items-center space-x-2 bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
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
          <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-line bg-canvas/50">
              <h2 className="text-lg font-bold text-ink">Your Locations</h2>
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
              <div className="divide-y divide-line">
                {locations.map((loc) => (
                  <div key={loc.id} className="px-6 py-4 flex items-center justify-between hover:bg-canvas/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-brand-50 rounded-lg">
                        <Hotel className="h-4 w-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">{loc.name}</p>
                        <p className="text-xs text-ink-faint">{loc.googlePlaceUrl || 'No Google URL set'}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {loc.id === activeLocationId && (
                        <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold border border-brand-200">
                          Active
                        </span>
                      )}
                      {loc.id !== activeLocationId && (
                        <button
                          onClick={() => setActiveLocationId(loc.id)}
                          className="text-xs text-brand-600 hover:text-brand-800 font-semibold"
                        >
                          Switch
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteLocation(loc.id)}
                        className="p-1.5 hover:bg-critical-soft rounded-lg text-ink-faint hover:text-critical transition-colors"
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

          {/* Per-location configuration.

              This lived under the Templates tab, which is why the dashboard
              banner that says "add your review link" pointed at the wrong
              place: the tab was named for message copy but held every
              setting a location has. Templates is now only templates. */}
          {activeLocationId && (
            <div className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-5">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-50 rounded-xl">
                  <Globe className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    {activeLoc?.name || 'Location'} settings
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Review link, timezone, send time, and channels for the active location.
                  </p>
                </div>
              </div>
            <div>
              <label className="block text-xs font-bold text-ink mb-1">Google Review Link</label>
              <input
                type="text"
                value={googleUrl}
                onChange={(e) => setGoogleUrl(e.target.value)}
                placeholder="https://g.page/r/.../review"
                className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card"
              />
              {googleUrl.trim() && googleAssessment.message && (
                <div
                  className={`mt-2 text-xs p-2.5 rounded-lg flex items-start space-x-1.5 ${
                    googleAssessment.opensReviewComposer
                      ? 'text-positive bg-positive-soft'
                      : googleAssessment.kind === 'listing-link'
                        ? 'text-caution bg-caution-soft'
                        : 'text-critical bg-critical-soft'
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
                  className="mt-2 text-xs text-brand-600 hover:text-brand-700 inline-flex items-center space-x-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Preview what guests see</span>
                </a>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Property Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <p className="text-[10px] text-ink-faint mt-1">
                Review requests are sent at the local time of the property.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
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
              <div className="flex justify-between text-[10px] text-ink-faint mt-1">
                <span>00:00</span>
                <span>12:00</span>
                <span>23:00</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-canvas rounded-xl border border-line">
                <div className="flex items-center space-x-2">
                  {enableEmail ? <Send className="h-4 w-4 text-brand-500" /> : <BellOff className="h-4 w-4 text-ink-faint" />}
                  <span className="text-sm font-semibold text-ink">Email</span>
                </div>
                <button
                  onClick={() => setEnableEmail(!enableEmail)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    enableEmail ? 'bg-brand-600' : 'bg-line'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform ${
                    enableEmail ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-canvas rounded-xl border border-line">
                <div className="flex items-center space-x-2">
                  {enableSms ? <MessageCircle className="h-4 w-4 text-brand-500" /> : <BellOff className="h-4 w-4 text-ink-faint" />}
                  <span className="text-sm font-semibold text-ink">SMS</span>
                </div>
                <button
                  onClick={() => setEnableSms(!enableSms)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    enableSms ? 'bg-brand-600' : 'bg-line'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform ${
                    enableSms ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Recovery Email (for unhappy guests)</label>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="manager@myhotel.com"
                className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card"
              />
              <p className="text-[11px] text-ink-faint mt-1">Shown to unhappy guests as a direct contact option.</p>
            </div>

            <div className="p-3 bg-canvas rounded-xl border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-ink">Mid-stay Check-in</span>
                  <p className="text-xs text-ink-faint mt-0.5">Catch problems while there is still time to fix them</p>
                </div>
                <button
                  onClick={() => setMidstayEnabled(!midstayEnabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    midstayEnabled ? 'bg-brand-600' : 'bg-line'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform ${
                    midstayEnabled ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>

              {/* The hour is deliberately not a second control — it reuses the
                  send hour set above, so there is only one number to choose. */}
              {midstayEnabled && (
                <div className="pt-3 border-t border-line">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <span>Send on</span>
                    <select
                      value={midstayDay}
                      onChange={(e) => setMidstayDay(Number(e.target.value))}
                      className="rounded-lg border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-1.5 px-2 border bg-card font-semibold"
                    >
                      {[2, 3, 4, 5, 6, 7].map((day) => (
                        <option key={day} value={day}>Day {day}</option>
                      ))}
                    </select>
                    <span>of the stay, at {formatHourInZone(sendHour)} local</span>
                  </div>
                  <p className="text-[11px] text-ink-faint mt-1.5">
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
                className="bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-brand-700 transition-colors flex items-center space-x-2"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Save Settings</span>
              </button>

              {/* Proves the whole loop — template, sender, links — in one click. */}
              <button
                onClick={handleTestSend}
                disabled={testSending}
                className="bg-card text-ink font-semibold py-2.5 px-4 rounded-xl border border-line hover:bg-canvas transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {testSending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4 text-brand-500" />}
                <span>{testSending ? 'Sending…' : 'Send a test to myself'}</span>
              </button>
            </div>
            <p className="text-[10px] text-ink-faint -mt-2">
              Sends one real review request to {session?.user?.email} using this location's template, then
              removes the test guest. Nothing appears in your guest list or stats.
            </p>
            </div>
          )}
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
            <div className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-50 rounded-xl">
                  <MessageSquare className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">Message Templates</h2>
                  <p className="text-xs text-ink-muted">Customize the invitation message for email and SMS.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Email Template</label>
                  <textarea
                    rows={4}
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card resize-y"
                  />
                  <p className="text-[11px] text-ink-faint mt-1">
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{locationName}'}, {'{reviewLink}'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">SMS Template</label>
                  <textarea
                    rows={3}
                    value={smsTemplateText}
                    onChange={(e) => setSmsTemplateText(e.target.value)}
                    className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card resize-y"
                  />
                  <SmsMeter template={smsTemplateText} locationName={activeLoc?.name} />
                  <p className="text-[11px] text-ink-faint mt-1">
                    Variables: {'{firstName}'}, {'{lastName}'}, {'{locationName}'}, {'{reviewLink}'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">SMS Reminder Template</label>
                  <textarea
                    rows={3}
                    value={smsReminderText}
                    onChange={(e) => setSmsReminderText(e.target.value)}
                    className="w-full rounded-xl border-line shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2.5 px-3 border bg-card resize-y"
                  />
                  <SmsMeter template={smsReminderText} locationName={activeLoc?.name} />
                  <p className="text-[11px] text-ink-faint mt-1">
                    Sent 3 days later if the guest hasn't responded.
                  </p>
                </div>
                <button
                  onClick={handleSaveTemplate}
                  className="bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-brand-700 transition-colors flex items-center space-x-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Save Templates</span>
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Digest Tab */}
      {activeTab === 'digest' && (
        <div className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-50 rounded-xl">
              <BarChart3 className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Digest Settings</h2>
              <p className="text-xs text-ink-muted">Receive regular email summaries of your review performance.</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-line">
            <div>
              <span className="text-sm font-semibold text-ink">Digest Enabled</span>
              <p className="text-xs text-ink-faint mt-0.5">
                {digestEnabled ? 'You will receive digest emails.' : 'Digest emails are disabled.'}
              </p>
            </div>
            <button
              onClick={() => handleDigestChange(!digestEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                digestEnabled ? 'bg-brand-600' : 'bg-line'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform ${
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
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-card text-ink-muted border-line hover:bg-canvas'
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
          <AppearanceSettings />

          {/*
            This card used to be headed "Sign Out" with a button also labelled
            "Sign Out" — the same two words either side of a sentence that added
            nothing. The section is about who is signed in on this device; the
            button is the only thing that needs to say "Sign out".
          */}
          <div className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-brand-50 rounded-xl">
                <UserIcon className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink">Signed in</h2>
                <p className="text-xs text-ink-muted truncate">
                  {session?.user?.email ?? 'This device'}
                  {role ? ` · ${isAdmin(role) ? 'Administrator' : 'Staff'}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/login', { replace: true });
              }}
              className="bg-muted text-ink font-semibold py-2.5 px-4 rounded-xl hover:bg-line transition-colors flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>

          {!isStaff(role) && (
            <div className="bg-card rounded-2xl border border-critical/20 shadow-sm p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-critical-soft rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-critical" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-critical">Danger Zone</h2>
                  <p className="text-xs text-ink-muted">Permanently delete your account and all data.</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="bg-critical text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-critical transition-colors flex items-center space-x-2"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl border border-line flex flex-col overflow-hidden">
            <div className="p-6 border-b border-line flex items-center space-x-3 bg-critical-soft">
              <div className="p-2 bg-critical-soft rounded-xl">
                <AlertTriangle className="h-5 w-5 text-critical" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink">Delete Account</h3>
                <p className="text-xs text-critical">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-ink-muted">
                All your locations, guests, review requests, and feedback data will be permanently deleted.
              </p>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Type <span className="text-critical font-extrabold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-xl border-line shadow-sm focus:border-critical focus:ring-critical text-sm py-2.5 px-3 border bg-card"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 bg-muted text-ink font-semibold py-2.5 px-4 rounded-xl hover:bg-line transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  className="flex-1 bg-critical text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-critical transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
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
  const tone = offendingCharacter || overOneSegment ? 'text-caution' : 'text-ink-faint';

  return (
    <div className={`text-[11px] mt-1 ${tone}`}>
      <span className="font-semibold">
        {units} characters &middot; {segments} SMS segment{segments === 1 ? '' : 's'}
      </span>
      {!overOneSegment && !offendingCharacter && (
        <span className="text-ink-faint"> &middot; {remaining} left before a second segment</span>
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
