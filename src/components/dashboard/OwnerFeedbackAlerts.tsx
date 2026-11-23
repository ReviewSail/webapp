import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../integrations/supabase/client';
import { Button } from '../ui/Button';
import { ownerAlertLabels, ownerAlertReasons, readOwnerAlerts, type OwnerAlertSnapshot } from '../../lib/ownerAlerts';

export function OwnerFeedbackAlerts() {
  const { session, role } = useAuth();
  // A new owner must never inherit the previous owner's status/draft mutation.
  if (!session?.user.id || role !== 'admin') return null;
  return <OwnerAlertsForUser key={session.user.id} userId={session.user.id} />;
}

function OwnerAlertsForUser({ userId }: { userId: string }) {
  const client = useQueryClient();
  const key = ['owner-alerts', userId] as const;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const query = useQuery({
    queryKey: key, staleTime: 0, gcTime: 0, retry: false,
    refetchInterval: 30_000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
    queryFn: async ({ signal }): Promise<OwnerAlertSnapshot | null> => {
      const previous = client.getQueryData<OwnerAlertSnapshot | null>(key) ?? undefined;
      // EGRESS-COST: low — conditional route-local check; 10 small job metadata
      // rows maximum, no feedback text/history. Explicit 30s cache-floor exception.
      const { data, error } = await supabase.rpc('get_owner_alert_status_v1', { p_known_version: previous?.version ?? null }).abortSignal(signal);
      if (['42501','PGRST301','PGRST303'].includes(error?.code ?? '')) return null;
      if (error) throw new Error('Could not check owner alerts');
      return readOwnerAlerts(data, previous);
    },
  });
  const state = query.data;
  async function toggle() {
    if (!state || busy.current) return;
    busy.current = true; setSaving(true); setSaveError(''); setNotice('');
    const enabled = !state.enabled;
    try {
      await client.cancelQueries({ queryKey: key });
      // EGRESS-COST: one small verified preference acknowledgement. No email is
      // sent by this button and old feedback is never backfilled.
      const { data, error } = await supabase.rpc('set_owner_alert_preference_v1', { p_enabled: enabled, p_account_id: state.accountId });
      // A late response after logout/user switch must not recreate cleared PII
      // in the shared query cache. The already-started server write may finish.
      if (!active.current) return;
      if (error || data?.enabled !== enabled || data?.accountId !== state.accountId) throw new Error('Preference not confirmed');
      client.setQueryData(key, { ...state, enabled, version: '' });
      setNotice(enabled ? 'Preference saved. Only new feedback can create alerts; email delivery still depends on the worker.' : 'Owner alerts turned off. An email already in flight may still arrive.');
      await client.invalidateQueries({ queryKey: key });
    } catch { if (active.current) setSaveError('The change could not be confirmed. Refresh status before trying again.'); }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }
  const workerStale = !state?.worker || state.worker.state !== 'ready' || Date.now() - Date.parse(state.worker.checkedAt) > 10 * 60_000;
  const deliveryProblem = query.isError || (state?.enabled && (workerStale || state.attentionCount > 0));
  return <details className="rounded-xl border border-line bg-card p-4">
    <summary className="cursor-pointer font-medium">Alert settings
      {deliveryProblem && <span className="ml-2 text-sm text-caution">Check email delivery</span>}
      {state && !state.enabled && <span className="ml-2 text-sm text-ink-muted">Email alerts off</span>}
    </summary>
    <section aria-label="Owner email alerts" className="rounded-xl border border-line bg-card p-4 sm:p-5 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-ink">Owner email alerts</h2>
        <p className="mt-1 text-sm text-ink-muted">An email when a guest reports an issue, sends a follow-up, or leaves 1–3 star feedback, even when ReviewSail is closed.</p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => { void query.refetch(); }} disabled={saving || query.isFetching}>Refresh alert status</Button>
    </div>
    {query.fetchStatus === 'paused' ? <p role="alert" className="text-sm text-critical">You are offline. Alert status cannot be checked.</p> : null}
    {query.isPending ? <p role="status" className="text-sm text-ink-muted">Loading owner alert settings…</p> : null}
    {query.isError ? <p role="alert" className="text-sm text-critical">Could not check owner alerts. Any displayed status is from the last successful check.</p> : null}
    {state === null ? <p role="alert" className="text-sm text-critical">Owner account access is unavailable.</p> : null}
    {state ? <>
      <p className="text-sm text-ink-muted">{state.email ? <>Recipient: <span className="break-all text-ink">{state.email}</span> (your verified sign-in email).</> : 'Verify your sign-in email before enabling alerts.'}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Preference: {state.enabled ? 'On' : 'Off'}</span>
        <Button variant="secondary" size="sm" loading={saving} disabled={query.isError || (!state.enabled && !state.email)} onClick={() => { void toggle(); }}>{state.enabled ? 'Turn off my alerts' : 'Enable my alerts'}</Button>
      </div>
      {workerStale ? <p role="alert" className="text-sm text-critical">Email worker is not confirmed active. Alerts may not send; keep checking your inbox here.</p> : <p className="text-xs text-ink-muted">Worker recently checked in. This does not confirm individual email delivery.</p>}
      {state.attentionCount > 0 ? <p role="alert" className="text-sm text-critical">{state.attentionCount} alert(s) failed, are uncertain, or have waited over 10 minutes. Check the guest feedback here and ask support to inspect the alert queue. Failed or uncertain attempts are not automatically resent.</p> : null}
      {state.recent.length ? <details>
        <summary className="cursor-pointer text-sm font-medium">Latest {state.recent.length} alert attempts</summary>
        <ul className="mt-3 space-y-3 text-sm">{state.recent.map(job => <li key={job.id} className="border-t border-line pt-2">
          <p className="font-medium">{job.property} · <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time></p>
          <p>{ownerAlertLabels[job.status]}</p>
          {job.reason && ownerAlertReasons[job.reason] ? <p className="text-xs text-ink-muted">{ownerAlertReasons[job.reason]}</p> : null}
        </li>)}</ul>
      </details> : <p className="text-xs text-ink-muted">No alert attempts yet. Enabling alerts does not send emails for older feedback.</p>}
    </> : null}
    {saveError ? <p role="alert" className="text-sm text-critical">{saveError}</p> : null}
    {notice ? <p role="status" className="text-sm text-ink-muted">{notice}</p> : null}
    <p className="text-xs text-ink-muted">These emails notify you, not the guest. Reply separately through Booking.com or your usual channel. Public review options are unchanged.</p>
  </section></details>;
}
