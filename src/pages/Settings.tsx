import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import {
  MapPin, Plus, Trash2, Save, Mail, MessageSquare, Users,
  UserPlus, RefreshCw, AlertCircle, CheckCircle, BedDouble,
  User, Lock, CreditCard, Building2, Smartphone
} from 'lucide-react';

type TabId = 'property' | 'messaging' | 'team' | 'account';

const TABS: { key: TabId; label: string; icon: typeof MapPin; description: string }[] = [
  { key: 'property', label: 'Property', icon: Building2, description: 'Manage your property details, timezone, and communication channels.' },
  { key: 'messaging', label: 'Messaging', icon: Mail, description: 'Customize your email and SMS message templates.' },
  { key: 'team', label: 'Team', icon: Users, description: 'Invite and manage team members.' },
  { key: 'account', label: 'Account', icon: User, description: 'Manage your profile, security, and subscription.' },
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
      setEmailTemplate(activeLoc.templateText || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}');
      setSmsTemplate(activeLoc.smsTemplateText || 'Hi {firstName}, please share your experience with us at {reviewLink}');
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
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Property Settings</h3>
              <p className="text-sm text-slate-500 mt-0.5">Configure how this property operates.</p>
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
          </div>
        )}

        {/* ===== Messaging Tab ===== */}
        {activeTab === 'messaging' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Message Templates</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Customize the messages sent to guests. Use placeholders like {'{firstName}'}, {'{lastName}'}, and {'{reviewLink}'}.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-slate-400" /> <span>Email Template</span>
                </label>
                <textarea rows={6} value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y" />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-slate-400" /> <span>SMS Template</span>
                </label>
                <textarea rows={6} value={smsTemplate} onChange={(e) => setSmsTemplate(e.target.value)}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y" />
                <p className="text-xs text-slate-400">SMS messages are limited to 160 characters. Be concise.</p>
              </div>
            </div>

            <button onClick={handleSaveTemplates} disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Templates'}</span>
            </button>
          </div>
        )}

        {/* ===== Team Tab ===== */}
        {activeTab === 'team' && (
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

            {/* Subscription */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Subscription</h3>
                  <p className="text-sm text-slate-500">Your current plan and billing status.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Status</p>
                    <p className="text-xs text-slate-500 mt-0.5">Your subscription plan</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${subColor}`}>{subLabel}</span>
                </div>
                {(subscriptionStatus === 'inactive' || subscriptionStatus === 'canceled') && (
                  <button onClick={handleSubscribe}
                    className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2">
                    <CreditCard className="h-4 w-4" /> <span>Subscribe Now</span>
                  </button>
                )}
              </div>
            </section>

            {/* Properties */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Properties</h3>
                  <p className="text-sm text-slate-500">Manage your properties.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex items-center space-x-3">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{loc.name}</span>
                      </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
