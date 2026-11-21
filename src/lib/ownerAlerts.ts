export const OWNER_ALERT_STATES = ['queued', 'processing', 'accepted', 'failed', 'uncertain', 'cancelled'] as const;
export type OwnerAlertState = typeof OWNER_ALERT_STATES[number];
export type OwnerAlertSnapshot = {
  version: string;
  accountId: string;
  email: string | null;
  enabled: boolean;
  worker: { state: 'ready' | 'disabled' | 'configuration_missing'; checkedAt: string } | null;
  attentionCount: number;
  recent: Array<{ id: string; property: string; status: OwnerAlertState; reason: string | null; createdAt: string }>;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function readOwnerAlerts(value: unknown, previous?: OwnerAlertSnapshot): OwnerAlertSnapshot {
  if (!object(value) || typeof value.version !== 'string' || !value.version) throw new Error('Invalid alert status');
  if (value.data === null) {
    if (!previous || previous.version !== value.version) throw new Error('Unmatched alert status');
    return previous;
  }
  const d = value.data;
  if (!object(d) || typeof d.accountId !== 'string' || !d.accountId || typeof d.enabled !== 'boolean' ||
    !(d.email === null || typeof d.email === 'string') || !Number.isSafeInteger(d.attentionCount) || (d.attentionCount as number) < 0 ||
    !(d.worker === null || (object(d.worker) && ['ready','disabled','configuration_missing'].includes(d.worker.state as string) && date(d.worker.checkedAt))) ||
    !Array.isArray(d.recent) || d.recent.length > 10 || d.recent.some(r => !object(r) || typeof r.id !== 'string' || typeof r.property !== 'string' ||
      !OWNER_ALERT_STATES.includes(r.status as OwnerAlertState) || !(r.reason === null || typeof r.reason === 'string') || !date(r.createdAt))) {
    throw new Error('Invalid alert status');
  }
  return { ...d, version: value.version } as OwnerAlertSnapshot;
}

export const ownerAlertLabels: Record<OwnerAlertState, string> = {
  queued: 'Queued — not sent', processing: 'Sending — not yet confirmed',
  accepted: 'Accepted by email provider — delivery unverified',
  failed: 'Failed — needs attention', uncertain: 'Uncertain — held to prevent duplicate email',
  cancelled: 'Cancelled — not sent',
};
export const ownerAlertReasons: Record<string, string> = {
  daily_limit: 'The limit of 50 attempts per owner in 24 hours was reached.',
  expired: 'The alert waited more than 24 hours and will not be sent late.',
  provider_rejected: 'The email provider rejected this attempt.',
  provider_ambiguous: 'The provider did not return a usable acknowledgement.',
  transport_interrupted: 'The email connection was interrupted.',
  worker_interrupted: 'The worker stopped before confirming the outcome.',
  recipient_ineligible: 'The recipient is no longer an eligible, opted-in owner.',
  preference_changed: 'Owner alert preferences changed.',
};
