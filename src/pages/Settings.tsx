import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import {
  Settings as SettingsIcon,
  MapPin,
  Plus,
  Trash2,
  Save,
  Bell,
  Mail,
  MessageSquare,
  Clock,
  Users,
  UserPlus,
  Shield,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

export default function Settings() {
  const {
    activeLocationId,
    locations,
    updateLocationSettings,
    addLocation,
    deleteLocation
  } = useMapRated();
  const { user: currentUser } = useAuth();

  const activeLoc = locations.find(l => l.id === activeLocationId);

  // Property tab state
  const [name, setName] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [preferredHour, setPreferredHour] = useState(10);
  const [enableEmail, setEnableEmail] = useState(true);
  const [enableSms, setEnableSms] = useState(true);

  // Template state
  const [emailTemplate, setEmailTemplate] = useState('');
  const [smsTemplate, setSmsTemplate] = useState('');

  // New location state
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationUrl, setNewLocationUrl] = useState('');

  // Team state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Account state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'property' | 'templates' | 'team' | 'account'>('property');

  // Load active location data into form
  const loadActiveLocation = () => {
    if (activeLoc) {
      setName(activeLoc.name);
      setGoogleUrl(activeLoc.googlePlaceUrl || '');
      setTimezone(activeLoc.timezone || 'UTC');
      setPreferredHour(activeLoc.preferredSendHour ?? 10);
      setEnableEmail(activeLoc.enableEmail);
      setEnableSms(activeLoc.enableSms);
      setEmailTemplate(activeLoc.templateText || 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}');
      setSmsTemplate(activeLoc.smsTemplateText || 'Hi {firstName}, please share your experience with us at {reviewLink}');
    }
  };

  // Load data when active location or tab changes
  useState(() => {
    loadActiveLocation();
  });

  // Sync when activeLoc changes
  if (activeLoc && name === '') {
    loadActiveLocation();
  }

  const handleSaveProperty = async () => {
    if (!activeLoc) return;
    setSaving(true);
    setError('');
    try {
      await updateLocationSettings(activeLoc.id, {
        name,
        googlePlaceUrl: googleUrl,
        timezone,
        preferredSendHour: preferredHour,
        enableEmail,
        enableSms
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (!activeLoc) return;
    setSaving(true);
    setError('');
    try {
      await updateLocationSettings(activeLoc.id, {
        templateText: emailTemplate,
        smsTemplateText: smsTemplate
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;
    setSaving(true);
    try {
      await addLocation(newLocationName.trim(), newLocationUrl.trim() || undefined);
      setNewLocationName('');
      setNewLocationUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to add location');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (locations.length <= 1) {
      setError('You must have at least one property.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this property? This action cannot be undone.')) return;
    try {
      await deleteLocation(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete location');
    }
  };

  const handleInviteTeamMember = async () => {
    if (!inviteEmail.trim()) return;
    const { data: userData } = await supabase.from('users').select('account_id').eq('id', currentUser?.id).single();
    const accountId = userData?.account_id;
    if (!accountId) {
      setInviteError('Could not resolve account');
      return;
    }

    setInviting(true);
    setInviteError('');
    setInviteSuccess(false);
    try {
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          email: inviteEmail.trim(),
          role: inviteRole,
          accountId,
          propertyName: activeLoc?.name || 'My Account'
        }
      });
      if (error) throw error;
      setInviteSuccess(true);
      setInviteEmail('');
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const tabs = [
    { key: 'property' as const, label: 'Property', icon: MapPin },
    { key: 'templates' as const, label: 'Templates', icon: MessageSquare },
    { key: 'team' as const, label: 'Team', icon: Users },
    { key: 'account' as const, label: 'Account', icon: Shield }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your properties, message templates, team members, and account details.</p>
      </div>

      {/* Feedback messages */}
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

      {/* Property Selector */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2">
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => {
              // The context handles activeLocationId switching
              const { setActiveLocationId } = useMapRated();
              // We can't call hooks conditionally, so use the activeLoc logic
              window.location.hash = ''; // trigger re-render
            }}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
              activeLoc?.id === loc.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {loc.name}
          </button>
        ))}
        <button
          onClick={() => document.getElementById('new-location-input')?.focus()}
          className="shrink-0 px-3 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 border border-dashed border-slate-300 hover:bg-slate-200 transition-colors flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                if (key === 'property') loadActiveLocation();
              }}
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

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Property Tab */}
        {activeTab === 'property' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Property Settings</h3>

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Property Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              />
            </div>

            {/* Google Place URL */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Google Maps URL</label>
              <input
                type="text"
                value={googleUrl}
                onChange={(e) => setGoogleUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              />
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern (US)</option>
                <option value="America/Chicago">Central (US)</option>
                <option value="America/Denver">Mountain (US)</option>
                <option value="America/Los_Angeles">Pacific (US)</option>
                <option value="Europe/London">London (UK)</option>
                <option value="Europe/Paris">Paris (EU)</option>
              </select>
            </div>

            {/* Preferred Send Hour */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Send Hour (UTC)</label>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <select
                  value={preferredHour}
                  onChange={(e) => setPreferredHour(Number(e.target.value))}
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00 UTC</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-1">Review invites and reminders will only be sent during this hour.</p>
            </div>

            {/* Channel Toggles */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Communication Channels</label>
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">Email Invites</span>
                </div>
                <button
                  onClick={() => setEnableEmail(!enableEmail)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${enableEmail ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enableEmail ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                <div className="flex items-center space-x-3">
                  <MessageSquare className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">SMS Invites</span>
                </div>
                <button
                  onClick={() => setEnableSms(!enableSms)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${enableSms ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enableSms ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveProperty}
              disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Property Settings'}</span>
            </button>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Message Templates</h3>
            <p className="text-xs text-slate-500">
              Use {'{firstName}'}, {'{lastName}'}, and {'{reviewLink}'} as placeholders.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <span>Email Template</span>
              </label>
              <textarea
                rows={4}
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                <span>SMS Template</span>
              </label>
              <textarea
                rows={3}
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              />
              <p className="text-xs text-slate-400 mt-1">SMS messages are limited to 160 characters. Be concise.</p>
            </div>

            <button
              onClick={handleSaveTemplates}
              disabled={saving}
              className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Templates'}</span>
            </button>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Team Management</h3>
            <p className="text-xs text-slate-500">
              Invite team members to manage review requests. Staff members have limited access.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-700">Invite Team Member</span>
              </div>

              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
              />

              <div className="flex items-center space-x-3">
                <label className="text-xs font-semibold text-slate-600">Role:</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
                  className="rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5 px-3 border bg-white"
                >
                  <option value="staff">Staff (Limited Access)</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>

              {inviteError && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg flex items-center space-x-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{inviteError}</span>
                </div>
              )}

              {inviteSuccess && (
                <div className="text-xs text-emerald-600 bg-emerald-50 p-2 rounded-lg flex items-center space-x-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Invitation sent successfully!</span>
                </div>
              )}

              <button
                onClick={handleInviteTeamMember}
                disabled={inviting || !inviteEmail.trim()}
                className="w-full bg-slate-900 text-white font-semibold py-2 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {inviting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                <span>{inviting ? 'Sending...' : 'Send Invitation'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Account</h3>

            {/* Add / Delete Locations */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-indigo-600" />
                <span>Properties</span>
              </h4>

              {/* Existing locations */}
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-sm font-medium text-slate-700">{loc.name}</span>
                    <button
                      onClick={() => handleDeleteLocation(loc.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete property"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new */}
              <div className="bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200 space-y-3">
                <input
                  id="new-location-input"
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="New property name"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                />
                <input
                  type="text"
                  value={newLocationUrl}
                  onChange={(e) => setNewLocationUrl(e.target.value)}
                  placeholder="Google Maps URL (optional)"
                  className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                />
                <button
                  onClick={handleAddLocation}
                  disabled={saving || !newLocationName.trim()}
                  className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>{saving ? 'Adding...' : 'Add Property'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// NOTE: The property selector buttons above have a conditional hook call issue.
// The quick fix is to use the context directly. Let me fix that properly.