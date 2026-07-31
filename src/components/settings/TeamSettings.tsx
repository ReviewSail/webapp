import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Users, UserPlus, Mail, Trash2, RefreshCw, Send, X } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/Toast';

interface Member {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'admin' | 'staff';
  created_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  expires_at: string;
  created_at: string;
}

const roleLabel = (role: string) => (role === 'admin' ? 'Admin' : 'Staff');

const rolePill = (role: string) =>
  role === 'admin'
    ? 'bg-brand-50 text-brand-700 border-brand-200'
    : 'bg-canvas text-ink-muted border-line';

const formatDate = (iso: string | null) => (iso ? format(new Date(iso), 'MMM d, yyyy') : '—');

export function TeamSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Both reads are already scoped to the caller's account by RLS.
      const [membersRes, invitesRes] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role, created_at').order('created_at'),
        supabase
          .from('invitations')
          .select('id, email, role, expires_at, created_at')
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      ]);

      if (membersRes.error) throw membersRes.error;
      setMembers((membersRes.data || []) as Member[]);
      setInvitations((invitesRes.data || []) as Invitation[]);
    } catch (err: any) {
      console.error('[TeamSettings] load failed', err);
      toast.error("Couldn't load your team. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const adminCount = members.filter((m) => m.role === 'admin').length;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-team-member', {
        body: { email, role: inviteRole },
      });
      // A non-2xx response arrives as an error whose body holds our message.
      if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail);
      }
      setInviteEmail('');
      setInviteRole('staff');
      toast.success(
        data?.emailed === false
          ? `Invite created for ${email}. Email sending is not configured, so share the link from the function logs.`
          : `Invite sent to ${email}.`
      );
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't send the invite. Try again.");
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', invitation.id);
      if (error) throw error;
      toast.success(`Invite to ${invitation.email} revoked.`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't revoke the invite. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: { email: invitation.email, role: invitation.role },
      });
      if (error) throw new Error(await readFunctionError(error));
      toast.success(`Invite resent to ${invitation.email}.`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't resend the invite. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = async (member: Member, role: 'admin' | 'staff') => {
    if (role === member.role) return;
    setBusyId(member.id);
    try {
      const { error } = await supabase.from('users').update({ role }).eq('id', member.id);
      if (error) throw error;
      toast.success(`${member.full_name || member.email} is now ${roleLabel(role).toLowerCase()}.`);
      await load();
    } catch (err: any) {
      toast.error(
        // Raised by the users_prevent_last_admin_removal trigger.
        (err.message || '').includes('last_admin')
          ? 'Every account needs at least one admin. Promote someone else first.'
          : err.message || "Couldn't change that role. Try again."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (member: Member) => {
    setBusyId(member.id);
    try {
      const { error } = await supabase.from('users').delete().eq('id', member.id);
      if (error) throw error;
      toast.success(`${member.full_name || member.email} no longer has access.`);
      setConfirmRemove(null);
      await load();
    } catch (err: any) {
      toast.error(
        (err.message || '').includes('last_admin')
          ? 'Every account needs at least one admin. Promote someone else first.'
          : err.message || "Couldn't remove that person. Try again."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Members */}
      <Card className="overflow-hidden">
        <div className="p-6 pb-4">
          <CardHeader
            icon={Users}
            title="Team members"
            description="Everyone who can sign in to this account."
          />
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-ink-faint" />
          </div>
        ) : members.length <= 1 ? (
          <EmptyState
            icon={Users}
            size="sm"
            bare
            title="You're the only person here"
            description="Invite a teammate below to share the feedback inbox."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-canvas">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Member</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-ink-muted uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-ink-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((member) => {
                  const isSelf = member.id === user?.id;
                  const isBusy = busyId === member.id;
                  // The trigger enforces this server-side too; disabling here
                  // just avoids offering an action that will always fail.
                  const isLastAdmin = member.role === 'admin' && adminCount === 1;

                  return (
                    <tr key={member.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-brand-50 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {(member.full_name || member.email || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">
                              {member.full_name || member.email}
                              {isSelf && <span className="ml-2 text-xs font-normal text-ink-faint">You</span>}
                            </p>
                            {member.full_name && member.email && (
                              <p className="text-xs text-ink-faint truncate">{member.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isLastAdmin ? (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${rolePill(member.role)}`}>
                            {roleLabel(member.role)}
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            disabled={isBusy}
                            onChange={(e) => handleRoleChange(member, e.target.value as 'admin' | 'staff')}
                            className="rounded-lg border border-line bg-card py-1 pl-2 pr-7 text-xs font-semibold text-ink focus:border-brand-500 focus:ring-brand-500 disabled:opacity-50"
                            aria-label={`Role for ${member.full_name || member.email}`}
                          >
                            <option value="admin">Admin</option>
                            <option value="staff">Staff</option>
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-muted">
                        {formatDate(member.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {!isSelf && !isLastAdmin && (
                          <button
                            onClick={() => setConfirmRemove(member)}
                            disabled={isBusy}
                            className="p-1.5 hover:bg-critical-soft rounded-lg text-ink-faint hover:text-critical transition-colors disabled:opacity-50"
                            title={`Remove ${member.full_name || member.email}`}
                          >
                            {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pending invites */}
      {invitations.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-6 pb-4">
            <CardHeader
              icon={Mail}
              title="Pending invites"
              description="Sent, but not accepted yet."
            />
          </div>
          <div className="divide-y divide-line border-t border-line">
            {invitations.map((invite) => {
              const isBusy = busyId === invite.id;
              return (
                <div
                  key={invite.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{invite.email}</p>
                    <p className="text-xs text-ink-faint">
                      {roleLabel(invite.role)} · sent {formatDate(invite.created_at)} · expires{' '}
                      {formatDate(invite.expires_at)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => handleResend(invite)}
                      disabled={isBusy}
                      className="text-xs font-semibold text-ink-muted hover:text-ink bg-muted hover:bg-line py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Resend'}
                    </button>
                    <button
                      onClick={() => handleRevoke(invite)}
                      disabled={isBusy}
                      className="text-xs font-semibold text-critical hover:text-critical hover:bg-critical-soft py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Invite form */}
      <Card className="p-6 space-y-4">
        <CardHeader
          icon={UserPlus}
          title="Invite a team member"
          description="They'll get an email with a link that expires in 7 days."
        />
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-xl border border-line py-2.5 px-3 text-sm focus:border-brand-500 focus:ring-brand-500"
              aria-label="Email address"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
              className="rounded-xl border border-line py-2.5 px-3 text-sm focus:border-brand-500 focus:ring-brand-500"
              aria-label="Role"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={sending || !inviteEmail.trim()}
            className="inline-flex items-center space-x-2 bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>{sending ? 'Sending…' : 'Send invite'}</span>
          </button>
        </form>
        <p className="text-xs text-ink-muted">
          Staff can see guests, feedback, and analytics. Admins can also change settings, billing,
          and the team.
        </p>
      </Card>

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl border border-line p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink">
                Remove {confirmRemove.full_name || confirmRemove.email}?
              </h2>
              <button
                onClick={() => setConfirmRemove(null)}
                className="p-1 hover:bg-muted rounded-lg text-ink-faint"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-ink-muted">
              They lose access to this account immediately. Their sign-in still exists, but it will
              show them nothing until someone invites them again.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="bg-muted text-ink font-semibold py-2.5 px-4 rounded-xl hover:bg-line transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                disabled={busyId === confirmRemove.id}
                className="bg-critical text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-critical transition-colors disabled:opacity-50"
              >
                {busyId === confirmRemove.id ? 'Removing…' : 'Remove access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * supabase.functions.invoke surfaces a non-2xx response as a FunctionsHttpError
 * whose real message is in the response body, not err.message.
 */
async function readFunctionError(error: any): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // Fall through to the generic message below.
  }
  return error?.message || "Couldn't send the invite. Try again.";
}
