import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import {
  MapPin, Plus, Trash2, Save, Mail, Users,
  UserPlus, RefreshCw, AlertCircle, CheckCircle, BedDouble,
  User, Lock, CreditCard, Building2, Smartphone, Clock, Settings2, Code, RotateCcw, Bell, UserCheck
} from 'lucide-react';

type TabId = 'property' | 'messaging' | 'staff' | 'subscription' | 'account' | 'digest' | 'recognition';

const TABS: { key: TabId; label: string; icon: typeof MapPin; description: string }[] = [
  { key: 'property', label: 'Property', icon: Building2, description: 'Manage your properties and configure their settings.' },
  { key: 'messaging', label: 'Messaging', icon: Mail, description: 'Customize email and SMS templates with live preview and placeholder insert.' },
  { key: 'staff', label: 'Staff', icon: Users, description: 'Invite and manage team members for account access.' },
  { key: 'subscription', label: 'Subscription', icon: CreditCard, description: 'View and manage your subscription plan and billing status.' },
  { key: 'account', label: 'Account', icon: User, description: 'Manage your profile, security, and account settings.' },
  { key: 'digest', label: 'Digest', icon: Bell, description: 'Configure automated owner digest emails — weekly or monthly performance summaries.' },
  { key: 'recognition', label: 'Team Recognition', icon: UserCheck, description: 'Add team members for positive mention recognition in guest feedback.' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTabInternal] = useState<TabId>(
    tabFromUrl && TABS.some(t => t.key === tabFromUrl) ? tabFromUrl : 'property'
  );

  const setActiveTab = (tab: TabId) => {
    setActiveTabInternal(tab);
    setSearchParams(tab === 'property' ? {} : { tab }, { replace: true });
  };

  useEffect(() => {
    if (tabFromUrl && TABS.some(t => t.key === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTabInternal(tabFromUrl);
    }
  }, [tabFromUrl]);

  const {
    activeLocationId, locations, updateLocationSettings, addLocation,
    deleteLocation, setActiveLocationId, subscriptionStatus, subscribe,
  } = useReviewSail();
  const { user: currentUser } = useAuth();

  const activeLoc = locations.find(l => l.id === activeLocationId);

  // Form state
  const [name, setName] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [preferredHour, setPreferredHour] = useState(10);
  const [enableEmail, setEnableEmail] = useState(true);
  const [enableSms, setEnableSms] = useState(true);
  const [midstayEnabled, setMidstayEnabled] = useState(true);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [smsTemplate, setSmsTemplate] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationUrl, setNewLocationUrl] = useState('');

  // Team state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Account deletion state
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // General UI state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  // Account state
  const [displayName, setDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Template editor refs
  const emailRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);

  const EMAIL_DEFAULT = 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}';
  const SMS_DEFAULT = 'Hi {firstName}, please share your experience with us at {reviewLink}';

  const insertPlaceholder = (placeholder: string, ref: React.RefObject<HTMLTextAreaElement | null>) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const updated = text.substring(0, start) + placeholder + text.substring(end);
    if (ref === emailRef) setEmailTemplate(updated);
    else setSmsTemplate(updated);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + placeholder.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const resetEmail = () => setEmailTemplate(EMAIL_DEFAULT);
  const resetSms = () => setSmsTemplate(SMS_DEFAULT);

  const renderPreview = (template: string): string => {
    return template
      .replace(/\{firstName\}/g, 'John')
      .replace(/\{lastName\}/g, 'Doe')
      .replace(/\{reviewLink\}/g, 'reviewsail.app/review/abc123')
      .replace(/\{propertyName\}/g, activeLoc?.name || 'Your Property');
  };

  const loadActiveLocation = () => {
    if (activeLoc) {
      setName(activeLoc.name);
      setGoogleUrl(activeLoc.googlePlaceUrl || '');
      setRecoveryEmail(activeLoc.recoveryEmail || '');
      setTimezone(activeLoc.timezone || 'UTC');
      setPreferredHour(activeLoc.preferredSendHour ?? 10);
      setEnableEmail(activeLoc.enableEmail);
      setEnableSms(activeLoc.enableSms);
      setMidstayEnabled(activeLoc.midstayEnabled);
      setEmailTemplate(activeLoc.templateText || EMAIL_DEFAULT);
      setSmsTemplate(activeLoc.smsTemplateText || SMS_DEFAULT);
    }
  };

  useEffect(() => {
    if (currentUser?.user_metadata?.full_name) {
      setDisplayName(currentUser.user_metadata.full_name);
    }
  }, [currentUser]);

  useEffect(() => {
    loadActiveLocation();
  }, [activeLoc?.id]);

  const handleSaveProperty = async () => {
    if (!activeLoc) return;
    setSaving(true); setError('');
    try {
      await updateLocationSettings(activeLoc.id, { name, googlePlaceUrl: googleUrl, recoveryEmail, timezone, preferredSendHour: preferredHour, enableEmail, enableSms, midstayEnabled });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) { setError(err.message || 'Failed to save settings'); }
    finally { setSaving(false); }
  };

  const handleSaveTemplates = async () => {
    if (!activeLoc) return;
    setSaving(true); setError('');
    try {
      await updateLocationSettings(activeLoc.id, { templateText: emailTemplate, smsTemplateText: smsTemplate });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) { setError(err.message || 'Failed to save templates'); }
    finally { setSaving(false); }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;
    setSaving(true);
    try {
      await addLocation(newLocationName.trim(), newLocationUrl.trim() || undefined);
      setNewLocationName(''); setNewLocationUrl('');
    } catch (err: any) { setError(err.message || 'Failed to add location'); }
    finally { setSaving(false); }
  };

  const handleDeleteLocation = async (id: string) => {
    if (locations.length <= 1) { setError('You must have at least one property.'); return; }
    if (!window.confirm('Are you sure you want to delete this property? This action cannot be undone.')) return;
    try { await deleteLocation(id); } catch (err: any) { setError(err.message || 'Failed to delete location'); }
  };

  const handleInviteTeamMember = async () => {
    if (!inviteEmail.trim()) return;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', currentUser?.id).single();
    const accountId = userData?.account_id;
    if (!accountId) { setInviteError('Could not resolve account'); return; }
    setInviting(true); setInviteError(''); setInviteSuccess(false);
    try {
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: { email: inviteEmail.trim(), role: inviteRole, accountId, propertyName: activeLoc?.name || 'My Account' }
      });
      if (error) throw error;
      setInviteSuccess(true); setInviteEmail('');
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: any) { setInviteError(err.message || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true); setError('');
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } });
      if (error) throw error;
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) { setError(err.message || 'Failed to update profile'); }
    finally { setProfileSaving(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters'); return; }
    setPasswordSaving(true); setPasswordError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) { setPasswordError(err.message || 'Failed to change password'); }
    finally { setPasswordSaving(false); }
  };

  const handleSubscribe = async () => {
    const result = await subscribe();
    if (result.url) { window.location.href = result.url; }
    else { setError(result.error || 'Failed to start subscription'); }
  };

  const handleDeleteAccount = () => {
    setError('');
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true); setError('');
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-account');
      if (fnError) throw fnError;
      // Sign out on success
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err: any) {
      setError(err.message || 'Failed to delete account. Please try again or contact support.');
      setDeletingAccount(false);
    }
  };

  const subLabel = subscriptionStatus === 'active' ? 'Active'
    : subscriptionStatus === 'trialing' ? 'Trial'
    : subscriptionStatus === 'canceled' ? 'Canceled' : 'Inactive';

  const subColor = subscriptionStatus === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : subscriptionStatus === 'trialing' ? 'bg-blue-100 text-blue-800 border-blue-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">{TABS.find(t => t.key === activeTab)?.description}</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 flex items-start space-x-2.5">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {saveSuccess && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-200 flex items-center space-x-2.5">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">Settings saved successfully!</span>
        </div>
      )}

      {(activeTab === 'property' || activeTab === 'messaging') && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setActiveLocationId(loc.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                activeLoc?.id === loc.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      <div className="border-b border-slate-200">
        <nav className="flex space-x-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); if (key === 'property') loadActiveLocation(); }}
              className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* ===== Property Tab ===== */}
        {activeTab === 'property' && (
          <div className="space-y-8">
            {/* Properties Management */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Properties</h3>
                  <p className="text-sm text-slate-500">Add, switch between, and manage your properties.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div key={loc.id} className={`flex items-center justify-between bg-white p-3 rounded-xl border transition-colors ${
                      activeLoc?.id === loc.id ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'
                    }`}>
                      <button
                        onClick={() => setActiveLocationId(loc.id)}
                        className="flex items-center space-x-3 flex-1 text-left"
                      >
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{loc.name}</span>
                        {activeLoc?.id === loc.id && (
                          <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Active</span>
                        )}
                      </button>
                      <button onClick={() => handleDeleteLocation(loc.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete property">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl p-4 border border-dashed border-slate-200 space-y-3">
                  <input id="new-location-input" type="text" value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)} placeholder="New property name"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white" />
                  <input type="text" value={newLocationUrl} onChange={(e) => setNewLocationUrl(e.target.value)}
                    placeholder="Google Maps URL (optional)"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white" />
                  <button onClick={handleAddLocation} disabled={saving || !newLocationName.trim()}
                    className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
                    <Plus className="h-4 w-4" /> <span>{saving ? 'Adding...' : 'Add Property'}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Property Settings */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Settings2 className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Current Property Settings</h3>
                  <p className="text-sm text-slate-500">Configure how <span className="font-semibold text-slate-700">{activeLoc?.name || 'this property'}</span> operates.</p>
                </div>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Property Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Google Maps URL</label>
                <input type="text" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guest Recovery Email</label>
                <input type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="recovery@yourhotel.com"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
                <p className="text-xs text-slate-400 mt-1">A dedicated email for guests with complaints to contact you directly.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern (US)</option>
                  <option value="America/Chicago">Central (US)</option>
                  <option value="America/Denver">Mountain (US)</option>
                  <option value="America/Los_Angeles">Pacific (US)</option>
                  <option value="Europe/London">London (UK)</option>
                  <option value="Europe/Paris">Paris (EU)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Send Hour (UTC)</label>
                <select value={preferredHour} onChange={(e) => setPreferredHour(Number(e.target.value))}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white">
                  {Array.from({ length: 24 }, (_, i) => (<option key={i} value={i}>{i}:00 UTC</option>))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Review invites and reminders will only be sent during this hour.</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-700">Communication Channels</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">Email Invites</span>
                  </div>
                  <Toggle checked={enableEmail} onChange={setEnableEmail} />
                </div>
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Smartphone className="h-5 w-5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">SMS Invites</span>
                  </div>
                  <Toggle checked={enableSms} onChange={setEnableSms} />
                </div>
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <BedDouble className="h-5 w-5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">Mid-Stay Check-In</span>
                  </div>
                  <Toggle checked={midstayEnabled} onChange={setMidstayEnabled} />
                </div>
              </div>
            </div>

            <button onClick={handleSaveProperty} disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Property Settings'}</span>
            </button>
            </section>
          </div>
        )}

        {/* ===== Messaging Tab ===== */}
        {activeTab === 'messaging' && (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Message Templates</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Customize the messages sent to guests. Click a <span className="font-mono text-indigo-600 bg-indigo-50 px-1 rounded">{'{placeholder}'}</span> to insert it — it will be replaced with real data when sent.
              </p>
            </div>

            {/* Email Template Card */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Mail className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Email Template</h4>
                    <p className="text-xs text-slate-400">Sent when a review invite is triggered via email</p>
                  </div>
                </div>
                <button onClick={resetEmail}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Reset to default">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
              <div className="p-5 space-y-3">
                {/* Placeholder chips */}
                <div className="flex flex-wrap gap-1.5">
                  {['{firstName}', '{lastName}', '{reviewLink}', '{propertyName}'].map((p) => (
                    <button key={p} onClick={() => insertPlaceholder(p, emailRef)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
                      <Code className="h-3 w-3" />{p}
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-400 self-center ml-1">Click to insert</span>
                </div>
                <textarea ref={emailRef} rows={5} value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y font-mono leading-relaxed" />
                {/* Live preview */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preview</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{renderPreview(emailTemplate) || <span className="italic text-slate-300">Empty template</span>}</p>
                </div>
              </div>
            </div>

            {/* SMS Template Card */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">SMS Template</h4>
                    <p className="text-xs text-slate-400">Sent when a review invite is triggered via text message</p>
                  </div>
                </div>
                <button onClick={resetSms}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Reset to default">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
              <div className="p-5 space-y-3">
                {/* Placeholder chips */}
                <div className="flex flex-wrap gap-1.5">
                  {['{firstName}', '{reviewLink}', '{propertyName}'].map((p) => (
                    <button key={p} onClick={() => insertPlaceholder(p, smsRef)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <Code className="h-3 w-3" />{p}
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-400 self-center ml-1">Click to insert</span>
                </div>
                <textarea ref={smsRef} rows={4} value={smsTemplate}
                  onChange={(e) => setSmsTemplate(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y font-mono leading-relaxed" />
                {/* Character counter */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          smsTemplate.length > 160 ? 'bg-red-500' : smsTemplate.length > 120 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min((smsTemplate.length / 160) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${
                      smsTemplate.length > 160 ? 'text-red-600' : smsTemplate.length > 120 ? 'text-amber-600' : 'text-slate-500'
                    }`}>
                      {smsTemplate.length}/160
                    </span>
                  </div>
                  {smsTemplate.length > 160 && (
                    <span className="text-[11px] text-red-600 ml-3">Message exceeds limit</span>
                  )}
                </div>
                {/* Live preview */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preview</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{renderPreview(smsTemplate) || <span className="italic text-slate-300">Empty template</span>}</p>
                </div>
              </div>
            </div>

            <button onClick={handleSaveTemplates} disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Templates'}</span>
            </button>
          </div>
        )}

        {/* ===== Staff Tab ===== */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Team Management</h3>
              <p className="text-sm text-slate-500 mt-0.5">Invite team members to manage review requests. Staff members have limited access.</p>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <UserPlus className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-700">Invite Team Member</span>
                  <p className="text-xs text-slate-500">Send an invitation to join your account.</p>
                </div>
              </div>

              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />

              <div className="flex items-center space-x-3">
                <label className="text-xs font-semibold text-slate-600">Role:</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
                  className="rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5 px-3 border bg-white">
                  <option value="staff">Staff (Limited Access)</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>

              {inviteError && (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> <span>{inviteError}</span>
                </div>
              )}
              {inviteSuccess && (
                <div className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" /> <span>Invitation sent successfully!</span>
                </div>
              )}

              <button onClick={handleInviteTeamMember} disabled={inviting || !inviteEmail.trim()}
                className="w-full bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
                {inviting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                <span>{inviting ? 'Sending...' : 'Send Invitation'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ===== Account Tab ===== */}
        {activeTab === 'account' && (
          <div className="space-y-8">
            {/* Profile */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Profile</h3>
                  <p className="text-sm text-slate-500">Your personal account details.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input type="email" value={currentUser?.email || ''} disabled
                    className="w-full rounded-xl border-slate-200 text-sm py-2.5 px-3 border bg-slate-100 text-slate-500 cursor-not-allowed" />
                  <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact support for help.</p>
                </div>
                {profileSuccess && (
                  <div className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" /> <span>Profile updated successfully!</span>
                  </div>
                )}
                <button onClick={handleSaveProfile} disabled={profileSaving}
                  className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
                  {profileSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>{profileSaving ? 'Saving...' : 'Update Profile'}</span>
                </button>
              </div>
            </section>

            {/* Security */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Security</h3>
                  <p className="text-sm text-slate-500">Update your password.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white" />
                </div>
                {passwordError && (
                  <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> <span>{passwordError}</span>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-lg flex items-center space-x-1.5">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" /> <span>Password updated successfully!</span>
                  </div>
                )}
                <button onClick={handleChangePassword} disabled={passwordSaving || !newPassword || !confirmPassword}
                  className="w-full bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
                  {passwordSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  <span>{passwordSaving ? 'Updating...' : 'Change Password'}</span>
                </button>
              </div>
            </section>

            {/* Danger Zone */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Danger Zone</h3>
                  <p className="text-sm text-slate-500">Irreversible account actions.</p>
                </div>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-200 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-red-800">Delete Account</p>
                    <p className="text-xs text-red-600">Permanently delete your account and all associated data. This action cannot be undone.</p>
                  </div>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                    className="shrink-0 bg-red-600 text-white font-semibold py-2 px-4 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center space-x-2 text-sm"
                  >
                    {deletingAccount ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span>{deletingAccount ? 'Deleting...' : 'Delete Account'}</span>
                  </button>
                </div>

                {showDeleteConfirm && (
                  <div className="bg-white rounded-xl p-4 border border-red-200 space-y-3">
                    <p className="text-sm font-semibold text-red-800">Are you absolutely sure?</p>
                    <p className="text-xs text-slate-600">
                      This will permanently delete your account, all properties, guest data, review requests,
                      and settings. Type <span className="font-bold text-red-700">DELETE</span> below to confirm.
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="w-full rounded-xl border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm py-2 px-3 border bg-white"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                        className="flex-1 bg-white text-slate-700 font-semibold py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmDeleteAccount}
                        disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                        className="flex-1 bg-red-600 text-white font-semibold py-2 px-4 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
                      >
                        {deletingAccount ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        <span>{deletingAccount ? 'Deleting...' : 'Yes, Delete Everything'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ===== Subscription Tab ===== */}
        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Subscription</h3>
              <p className="text-sm text-slate-500 mt-0.5">Your current plan and billing status.</p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">Current Plan</p>
                    <p className="text-sm text-slate-500">ReviewSail subscription</p>
                  </div>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${subColor}`}>{subLabel}</span>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500">Status</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 capitalize">{subscriptionStatus || 'Inactive'}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500">Billing</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {subscriptionStatus === 'active' ? 'Active' : subscriptionStatus === 'trialing' ? 'Trial Period' : 'No Active Plan'}
                    </p>
                  </div>
                </div>
              </div>

              {(subscriptionStatus === 'inactive' || subscriptionStatus === 'canceled') && (
                <button onClick={handleSubscribe}
                  className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 text-base">
                  <CreditCard className="h-5 w-5" /> <span>Subscribe Now</span>
                </button>
              )}

              {subscriptionStatus === 'active' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-800">Your subscription is active. All features are available.</p>
                </div>
              )}

              {subscriptionStatus === 'trialing' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center space-x-3">
                  <Clock className="h-5 w-5 text-blue-600 shrink-0" />
                  <p className="text-sm text-blue-800">You're on a free trial. Subscribe to continue after the trial ends.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== Digest Tab ===== */}
        {activeTab === 'digest' && (
          <DigestSettings />
        )}

        {/* ===== Team Recognition Tab ===== */}
        {activeTab === 'recognition' && (
          <TeamRecognitionSettings />
        )}
      </div>
    </div>
  );
}

function TeamRecognitionSettings() {
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('host');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { session } = useAuth();

  const fetchTeamMembers = async () => {
    if (!session?.user) return;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', session.user.id).single();
    if (!userData?.account_id) return;
    const { data, error: fetchError } = await supabase
      .from('team_members')
      .select('*')
      .eq('account_id', userData.account_id)
      .order('created_at', { ascending: false });
    if (fetchError) throw fetchError;
    setTeamMembers(data || []);
  };

  useEffect(() => {
    fetchTeamMembers().catch(console.error);
  }, [session]);

  const handleAdd = async () => {
    if (!newRole) return;
    setLoading(true);
    setError('');
    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session!.user.id).single();
      if (!userData?.account_id) throw new Error('Account not found');
      await supabase.from('team_members').insert({
        account_id: userData.account_id,
        name: newName.trim() || null,
        role: newRole,
      });
      setNewName('');
      setNewRole('host');
      await fetchTeamMembers();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await supabase.from('team_members').delete().eq('id', id);
      await fetchTeamMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete team member');
    }
  };

  const roles = [
    { value: 'host', label: 'Host' },
    { value: 'cohost', label: 'Co-Host' },
    { value: 'cleaner', label: 'Cleaner' },
    { value: 'property_manager', label: 'Property Manager' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'front_desk', label: 'Front Desk' },
    { value: 'housekeeping', label: 'Housekeeping' },
    { value: 'concierge', label: 'Concierge' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Team Recognition Setup</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Add team members here so ReviewSail can spot positive mentions in guest feedback. Leave names optional for contractors like cleaners — role-based matching will still work.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-200 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200 flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Team member added successfully!</span>
        </div>
      )}

      {/* Add form */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Maria"
              className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
            >
              {roles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>{loading ? 'Adding...' : 'Add Team Member'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Team member list */}
      <div>
        <h4 className="text-sm font-bold text-slate-700 mb-3">Current Team</h4>
        {teamMembers.length === 0 ? (
          <div className="bg-white rounded-xl p-8 border border-dashed border-slate-200 text-center space-y-2">
            <UserCheck className="h-6 w-6 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-500">No team members added yet. Recognition will still work via role-based phrase matching.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                    {member.name ? member.name[0].toUpperCase() : roles.find(r => r.value === member.role)?.label[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {member.name || 'Unnamed Member'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {roles.find(r => r.value === member.role)?.label || member.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(member.id)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const { digestSetting, updateDigestSetting } = useReviewSail();
=======

function DigestSettings() {
const { digestSetting, updateDigestSetting } = useReviewSail();
=======
  const { digestSetting, updateDigestSetting } = useReviewSail();
  const { user: currentUser } = useAuth();
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (digestSetting) {
      setFrequency(digestSetting.frequency);
      setEnabled(digestSetting.enabled);
    }
  }, [digestSetting]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateDigestSetting(frequency, enabled);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save digest settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Owner Digest Emails</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Receive regular performance summaries for all your properties. These are sent to the account owner (admin users) and include key metrics at a glance — no need to log into the dashboard.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-200 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200 flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Digest preferences saved!</span>
        </div>
      )}

      <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Bell className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Digest Notifications</p>
              <p className="text-xs text-slate-500">Receive automated summary emails</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Frequency Selection */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <p className="text-sm font-bold text-slate-700 mb-3">Email Frequency</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFrequency('weekly')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                frequency === 'weekly'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-100'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              } ${!enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!enabled}
            >
              <div className="flex items-center space-x-3">
                <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                  frequency === 'weekly' ? 'border-indigo-500' : 'border-slate-300'
                }`}>
                  {frequency === 'weekly' && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Weekly</p>
                  <p className="text-xs text-slate-500">Every 7 days</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setFrequency('monthly')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                frequency === 'monthly'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-100'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              } ${!enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!enabled}
            >
              <div className="flex items-center space-x-3">
                <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                  frequency === 'monthly' ? 'border-indigo-500' : 'border-slate-300'
                }`}>
                  {frequency === 'monthly' && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Monthly</p>
                  <p className="text-xs text-slate-500">Every 30 days</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* What's Included */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <p className="text-sm font-bold text-slate-700 mb-3">What's Included</p>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Reviews Received</p>
                <p className="text-xs text-slate-500">Total number of guests who submitted feedback during the period.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Average Rating</p>
                <p className="text-xs text-slate-500">Combined average star rating across all feedback received.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Private Feedback Caught</p>
                <p className="text-xs text-slate-500">Issues and comments captured privately before they reach public review sites.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="h-6 w-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Mid-Stay Saves</p>
                <p className="text-xs text-slate-500">Proactive mid-stay check-ins sent to guests during their stay.</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{saving ? 'Saving...' : 'Save Digest Preferences'}</span>
        </button>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 leading-relaxed">
            <strong>Note:</strong> Digest emails are sent to all admin users on your account.
            If the digest is enabled, you'll receive an email at <strong>{currentUser?.email || 'your email'}</strong>
            with a summary of all your properties. You can change your preferences or unsubscribe at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
